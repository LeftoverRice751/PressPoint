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


# How long a QR-shared route stays valid on the phone after the kiosk
# generates it. The kiosk itself resets after 60s, but the phone keeps
# working for the full window below.
ROUTE_SESSION_TTL_MINUTES = 30

# The kiosk currently lives at SSB. Single source of truth for "where
# routes start"; if a second kiosk gets installed, this is the line to
# replace with a per-kiosk lookup.
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
        """Kiosk hits this when the user taps 'Show Route'.

        Generates a one-time token, persists it, and returns the public
        URL the kiosk will encode into the QR code.
        """
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
        """Mobile JS calls this on load to draw the route.

        Returns the route geometry plus a status flag so the client can
        render an 'expired' or 'finished' state without a separate request.
        """
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

        # The session's own start, not KIOSK_START_LOCATION_NAME: the phone is
        # replaying a route that was minted at a particular kiosk.
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
                # WGS84->pixel, for the phone to place its own GPS reading
                # against the route polyline (same space as `route`/`map_x`/
                # `map_y`). Only mobile-route.js consumes this today.
                "geo_transform": CampusGeoTransform.wgs84_to_pixel_matrix(),
                # ISO 8601, not bare str(): once a service worker can serve a
                # stale cached copy of this response while the phone is
                # offline, the client needs to parse this itself (`new
                # Date(...)`) to know the session has actually expired rather
                # than trusting a cache-served "active" forever. A bare
                # "YYYY-MM-DD HH:MM:SS" string isn't reliably parsed by every
                # browser's Date constructor; ISO 8601 is.
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
        """The mobile-route offline service worker, at root scope.

        Same reasoning as VideoController.serve_sw (sw-archives.js): the file
        physically lives under /assets/js/ with the rest of the compiled
        bundles, but a service worker can only control paths at or below the
        scope it's registered with, so it needs Service-Worker-Allowed to
        claim "/" from a script served outside that tree.
        """
        sw_path = os.path.realpath(
            os.path.join(
                os.path.dirname(os.path.abspath(__file__)),
                "../../../storage/compiled/js/sw-mobile-route.js",  # app/controllers/kiosk/ -> repo root
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
        """The one shape every client gets, for both the kiosk and the phone.

        `map_x` / `map_y` are what a client draws with: pixel positions in the
        2.5D layer's space (x right, y negative running down from the top of
        the campus). Anything placed on the map — markers, route lines, camera
        moves — must use this pair, never the raw columns below.

        `latitude` and `longitude` are the values as stored, kept for the
        building pane's readout. They are pixels too, but in the older y-up
        space the deleted flat imageOverlay used; drawing with them puts a
        feature one image height off the map. See Campus25dMapping.

        `route` is the polyline ([y, x] pairs, already in layer space) walked
        from the start to this building, routed over the QGIS walkway network
        by MapWayfinderService. It is None for the three locations no walkway
        reaches yet, and for the start itself; the JS falls back to a straight
        start->destination line in that case.
        """
        name = getattr(location, "name", "") or ""
        location_id = getattr(location, "id", None)
        layer_point = Campus25dMapping.layer_point(location) or (0.0, 0.0)

        return {
            "id": location_id,
            "name": name,
            "type": getattr(location, "type", "") or "",
            "latitude": float(getattr(location, "latitude", 0) or 0),
            "longitude": float(getattr(location, "longitude", 0) or 0),
            "map_x": layer_point[0],
            "map_y": layer_point[1],
            "is_routable": bool(getattr(location, "is_routable", False)),
            "is_start": name.strip().lower() == KIOSK_START_LOCATION_NAME,
            "route": (route_map or {}).get(location_id),
            "feature_id": Campus25dMapping.feature_id_for(location_id),
        }

    def _destination_wgs84(self, destination_payload):
        """[lat, lng] for the destination, derived from its own map_x/map_y.

        This is for the mobile route page's arrival check ONLY -- a
        haversine distance against the phone's live GPS reading. It must
        never be drawn with (fed into a Leaflet CRS.Simple call): that is
        the same one-image-height-off mistake `Campus25dMapping.py` exists
        to prevent, just arriving through a new field instead of the old
        `latitude`/`longitude` columns.
        """
        x, y = destination_payload["map_x"], destination_payload["map_y"]
        lat, lng = CampusGeoTransform.layer_point_to_wgs84(x, y)
        return [lat, lng]

    def _route_wgs84(self, destination_payload):
        """`route` (pixel [y, x] pairs), converted point-for-point to WGS84.

        Same "never draw with it" rule as `_destination_wgs84` -- this exists
        so the phone can sum real-world segment lengths (haversine) for a
        remaining-distance/ETA readout, not to place anything on the map.
        None when there's no walkway-routed polyline to convert (see
        `_serialize_location`'s note on `route`).
        """
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
        # The mobile page must be reachable from the phone, which means
        # the URL has to use the public host (the cloudflared tunnel),
        # not whatever internal host the kiosk was browsed through. The
        # APP_URL config is set to the public domain in production.
        from masonite.configuration import config

        base = (config("application.app_url") or request.get_host() or "").rstrip("/")
        if not base.startswith("http"):
            base = f"https://{base}"
        return f"{base}/m/route/{token}"
