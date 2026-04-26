from masonite.controllers import Controller
from masonite.response import Response
from masonite.views import View
from masonite.facades import Broadcast
from masonite.configuration import config


def _pusher_configured():
    broadcasts = config("broadcast.broadcasts", {}) or config("broadcast.BROADCASTS", {}) or {}
    pusher_settings = broadcasts.get("pusher") or {}
    return bool(
        (pusher_settings.get("client") or pusher_settings.get("key"))
        and pusher_settings.get("app_id")
        and pusher_settings.get("secret")
    )


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

        return response.json({"ok": True, "status": "unlock", "broadcast": broadcast_sent})
