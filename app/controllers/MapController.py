import secrets

import pendulum
from masonite.controllers import Controller
from masonite.request import Request
from masonite.response import Response
from masonite.views import View

from app.models.Locations import Locations
from app.models.RouteSessions import RouteSessions


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

        payload = [self._serialize_location(location) for location in locations]

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

        return response.json(
            {
                "status": "active",
                "start": self._serialize_location(start),
                "destination": self._serialize_location(destination),
                "expires_at": str(session.expires_at),
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

    # --- helpers --------------------------------------------------------

    def _serialize_location(self, location):
        name = getattr(location, "name", "") or ""
        return {
            "id": getattr(location, "id", None),
            "name": name,
            "type": getattr(location, "type", "") or "",
            "latitude": float(getattr(location, "latitude", 0) or 0),
            "longitude": float(getattr(location, "longitude", 0) or 0),
            "is_routable": bool(getattr(location, "is_routable", False)),
            "is_start": name.strip().lower() == KIOSK_START_LOCATION_NAME,
        }

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
