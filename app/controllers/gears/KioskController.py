from masonite.controllers import Controller
from masonite.response import Response
from masonite.views import View
from masonite.facades import Broadcast
from app.models.User import User
from app.services import AuditLog, Notifications
from app.services.AuditLog import _current_request
from app.services.KioskBroadcast import pusher_configured as _pusher_configured  # tests patch this alias

_ADMIN_LINK = "/users"


def _alert_admins(kind, verb):
    """Put a lock/unlock in every admin's bell (SECURITY.md W11).

    Kiosk Lock stays an editor control -- editors are the ones at the terminal
    -- but it blanks a public screen, so it must not go unnoticed. Admins are
    found by role in Python, not SQL: the live `role` column has stray casing
    and padding. Best-effort like the broadcast above; a failure here must never
    turn the lock itself into an error.
    """
    try:
        request = _current_request()
        actor = request.user() if request is not None else None
        name = (
            (getattr(actor, "full_name", None) or getattr(actor, "username", None) or "Someone")
            if actor else "Someone"
        )
        actor_id = getattr(actor, "id", None) if actor else None
        for user in User.all() or []:
            role = (getattr(user, "role", "") or "").strip().lower()
            if role != "admin" or user.id == actor_id:
                continue
            Notifications.notify(user.id, kind, f"{name} {verb} the kiosk", None, _ADMIN_LINK)
    except Exception:
        pass


class KioskController(Controller):
    def lock(self, response: Response):
        broadcast_sent = False
        if _pusher_configured():
            try:
                Broadcast.channel(
                    ["kiosk-channel"],
                    "app.events.LockKioskEvent",
                    {"status": "lock"},
                )
                broadcast_sent = True
            except Exception:
                pass
        AuditLog.record("kiosk.locked", details={"broadcast": broadcast_sent})
        _alert_admins("kiosk.locked", "locked")
        return response.json({"ok": True, "status": "lock", "broadcast": broadcast_sent})

    def unlock(self, response: Response):
        broadcast_sent = False
        if _pusher_configured():
            try:
                Broadcast.channel(
                    ["kiosk-channel"],
                    "app.events.LockKioskEvent",
                    {"status": "unlock"},
                )
                broadcast_sent = True
            except Exception:
                pass

        AuditLog.record("kiosk.unlocked", details={"broadcast": broadcast_sent})
        _alert_admins("kiosk.unlocked", "unlocked")
        return response.json({"ok": True, "status": "unlock", "broadcast": broadcast_sent})
