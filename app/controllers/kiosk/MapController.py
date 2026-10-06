import os
import secrets

import pendulum
from masonite.controllers import Controller
from masonite.request import Request
from masonite.response import Response
from masonite.views import View

from app.models.Locations import Locations
from app.models.RouteSessions import RouteSessions
from app.services import Campus25dMapping, CampusGeoTransform, MapWayfinderService


# How long a QR-shared route stays valid on the phone (the kiosk resets after 60s).
ROUTE_SESSION_TTL_MINUTES = 30

# Where routes start. Replace with a per-kiosk lookup if a second kiosk is installed.
KIOSK_START_LOCATION_NAME = "student services building"


class MapController(Controller):
    def show(self, view: View):
        return view.render("kiosk/campus-map", {"active_nav": "map"})

    def get_locations(self, response: Response):
        locations = Locations.all()
        start = self._find_start_location()
        route_map = MapWayfinderService.build_location_route_map(
            locations, getattr(start, "id", None)
        )

        payload = [self._serialize_location(location, route_map) for location in locations]

        return response.json(payload)

    def create_route_session(self, request: Request, response: Response):
        """Mint a one-time route token and return the public URL for the QR code."""
        try:
            destination_id = int(request.input("destination_id") or 0)
        except (TypeError, ValueError):
            destination_id = 0

        destination = Locations.find(destination_id) if destination_id else None
        start = self._find_start_location()

        if not destination or not start:
            return response.json({"error": "Unknown destination."}, status=400)

        token = secrets.token_hex(24)
        expires_at = pendulum.now().add(minutes=ROUTE_SESSION_TTL_MINUTES)

        RouteSessions.create(
            {
                "token": token,
                "destination_location_id": destination.id,
                "start_location_id": start.id,
                "expires_at": expires_at.to_datetime_string(),
            }
        )

        return response.json(
            {
                "token": token,
                "qr_url": self._mobile_url(request, token),
                "expires_at": expires_at.to_iso8601_string(),
            }
        )

    def mobile_route(self, view: View, request: Request):
        """Public page the phone lands on after scanning the QR."""
        token = request.param("token")
        session = self._find_active_session(token)

        return view.render(
            "kiosk/mobile-route",
            {
                "token": token,
                "expired": session is None,
            },
        )

    def route_session_data(self, request: Request, response: Response):
        """Route geometry plus a status flag, for the phone page to draw from."""
        token = request.param("token")
        session = RouteSessions.where("token", token).first()

        if not session:
            return response.json({"status": "expired"}, status=404)

        status = self._session_status(session)
        if status != "active":
            return response.json({"status": status})

        start = Locations.find(session.start_location_id)
        destination = Locations.find(session.destination_location_id)

        if not start or not destination:
            return response.json({"status": "expired"}, status=404)

        # The session's own start: the phone replays a route minted at a particular kiosk.
        route_map = MapWayfinderService.build_location_route_map(
            Locations.all(), session.start_location_id
        )

        destination_payload = self._serialize_location(destination, route_map)
        destination_payload["wgs84"] = self._destination_wgs84(destination_payload)
        destination_payload["route_wgs84"] = self._route_wgs84(destination_payload)

        return response.json(
            {
                "status": "active",
                "start": self._serialize_location(start, route_map),
                "destination": destination_payload,
                # WGS84->pixel, so the phone can place its GPS reading against the route.
                "geo_transform": CampusGeoTransform.wgs84_to_pixel_matrix(),
                # ISO 8601 so every browser's Date constructor can parse it offline.
                "expires_at": pendulum.parse(str(session.expires_at)).to_iso8601_string(),
            }
        )

    def finish_route_session(self, request: Request, response: Response):
        """Phone hits this when the user taps 'Finish Route'."""
        token = request.param("token")
        session = RouteSessions.where("token", token).first()

        if not session:
            return response.json({"status": "expired"}, status=404)

        if not session.finished_at:
            session.finished_at = pendulum.now().to_datetime_string()
            session.save()

        return response.json({"status": "finished"})

    def serve_sw(self, response: Response):
        """The mobile-route service worker; Service-Worker-Allowed lets it claim "/"."""
        sw_path = os.path.realpath(
            os.path.join(
                os.path.dirname(os.path.abspath(__file__)),
                "../../../storage/compiled/js/sw-mobile-route.js",  # three levels up to the repo root
            )
        )
        if not os.path.isfile(sw_path):
            return "Not found", 404
        response.header("Content-Type", "application/javascript; charset=utf-8")
        response.header("Service-Worker-Allowed", "/")
        response.header("Cache-Control", "no-store")
        return response.download("sw-mobile-route.js", sw_path, force=False)

    # --- helpers --------------------------------------------------------

    def _serialize_location(self, location, route_map=None):
        """The one location shape every client gets.

        Draw with `map_x`/`map_y` (2.5D layer space). `latitude`/`longitude`
        are the raw columns in the old y-up space, for the readout only.
        `route` is a [y, x] polyline from the start, or None if unreachable.
        """
        name = getattr(location, "name", "") or ""
        location_id = getattr(location, "id", None)
        # None for missing coordinates; a (0, 0) fallback would look like a real corner point.
        layer_point = Campus25dMapping.layer_point(location)

        return {
            "id": location_id,
            "name": name,
            "type": getattr(location, "type", "") or "",
            "latitude": float(getattr(location, "latitude", 0) or 0),
            "longitude": float(getattr(location, "longitude", 0) or 0),
            "map_x": layer_point[0] if layer_point else None,
            "map_y": layer_point[1] if layer_point else None,
            "is_routable": bool(getattr(location, "is_routable", False)),
            "is_start": name.strip().lower() == KIOSK_START_LOCATION_NAME,
            "route": (route_map or {}).get(location_id),
            "feature_id": Campus25dMapping.feature_id_for(location_id),
        }

    def _destination_wgs84(self, destination_payload):
        """[lat, lng] of the destination, for the phone's GPS arrival check only. Never draw with it."""
        x, y = destination_payload["map_x"], destination_payload["map_y"]
        if x is None or y is None:
            return None
        lat, lng = CampusGeoTransform.layer_point_to_wgs84(x, y)
        return [lat, lng]

    def _route_wgs84(self, destination_payload):
        """`route` converted to WGS84, for the phone's distance/ETA readout only. Never draw with it."""
        route = destination_payload.get("route")
        if not route:
            return None
        return [list(CampusGeoTransform.layer_point_to_wgs84(x, y)) for y, x in route]

    def _find_start_location(self):
        for location in Locations.all():
            if (getattr(location, "name", "") or "").strip().lower() == KIOSK_START_LOCATION_NAME:
                return location
        return None

    def _find_active_session(self, token):
        if not token:
            return None
        session = RouteSessions.where("token", token).first()
        if not session:
            return None
        return session if self._session_status(session) == "active" else None

    def _session_status(self, session):
        if session.finished_at:
            return "finished"
        try:
            expires_at = pendulum.parse(str(session.expires_at))
        except Exception:
            return "expired"
        if pendulum.now() > expires_at:
            return "expired"
        return "active"

    def _mobile_url(self, request: Request, token: str):
        # Public host (APP_URL), not the kiosk's internal one: the phone must reach it.
        from masonite.configuration import config

        base = (config("application.app_url") or request.get_host() or "").rstrip("/")
        if not base.startswith("http"):
            base = f"https://{base}"
        return f"{base}/m/route/{token}"
