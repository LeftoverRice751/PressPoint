from masonite.controllers import Controller
from masonite.request import Request
from masonite.response import Response
from masonite.views import View
from masonite.facades import Broadcast
from masonite.configuration import config

from app.events.PlayVideo import PlayVideo


def _pusher_configured():
    broadcasts = config("broadcast.broadcasts", {}) or {}
    return bool(
        broadcasts.get("pusher.client")
        and broadcasts.get("pusher.app_id")
        and broadcasts.get("pusher.secret")
    )


class EditorialController(Controller):
    def show(self, view: View):
        return view.render("welcome")

    def play_video(self, request: Request, response: Response):
        src = (request.input("src") or "").strip()
        if not src:
            return response.json({"ok": False, "error": "src is required"}, status=422)

        data = {"src": src, "title": (request.input("title") or "").strip()}
        event = PlayVideo(data)
        broadcast_sent = False
        if _pusher_configured():
            try:
                Broadcast.channel(["editorial"], "play-video", event.payload)
                broadcast_sent = True
            except Exception:
                pass

        return response.json({"ok": True, "broadcast": broadcast_sent})
