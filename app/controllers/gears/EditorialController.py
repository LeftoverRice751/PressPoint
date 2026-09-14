from masonite.controllers import Controller
from masonite.request import Request
from masonite.response import Response
from masonite.facades import Broadcast
import posixpath
from urllib.parse import urlparse

from app.events.PlayVideo import PlayVideo
from app.services.KioskBroadcast import pusher_configured as _pusher_configured


def _sanitize_video_src(value):
    src = (value or "").strip()
    if not src:
        return ""

    parsed = urlparse(src)
    if parsed.scheme or parsed.netloc:
        return ""

    normalized = posixpath.normpath(src.replace("\\", "/"))
    if not normalized.startswith("/storage/"):
        return ""

    return normalized


class EditorialController(Controller):
    def play_video(self, request: Request, response: Response):
        src = _sanitize_video_src(request.input("src"))
        if not src:
            return response.json({"ok": False, "error": "src must be a local /storage path"}, status=422)

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
