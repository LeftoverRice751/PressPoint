from masonite.controllers import Controller
from masonite.response import Response
from masonite.views import View
from masonite.facades import Broadcast
from app.services.KioskBroadcast import pusher_configured as _pusher_configured

# The predicate used to be copy-pasted into four controllers; it lives in the
# service now and is aliased so the tests that patch `_pusher_configured`
# here keep working.


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
