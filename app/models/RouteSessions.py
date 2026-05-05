"""RouteSessions Model."""

from masoniteorm.models import Model


class RouteSessions(Model):
    """One row per QR-route handoff from the kiosk to a phone."""

    __fillable__ = [
        "token",
        "destination_location_id",
        "start_location_id",
        "kiosk_id",
        "expires_at",
        "finished_at",
    ]
