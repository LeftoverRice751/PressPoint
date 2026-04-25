from masonite.controllers import Controller
from masonite.response import Response
from masonite.views import View
from masonite.facades import Broadcast
from masonite.configuration import config


def _pusher_configured():
    broadcasts = config("broadcast.broadcasts", {}) or {}
    return bool(
        broadcasts.get("pusher.client")
        and broadcasts.get("pusher.app_id")
        and broadcasts.get("pusher.secret")
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
