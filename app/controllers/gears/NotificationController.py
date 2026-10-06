"""The dashboard bell. Every endpoint is scoped to the signed-in account."""

from masonite.controllers import Controller
from masonite.request import Request
from masonite.response import Response

from app.services import Notifications
from app.services.AjaxResponses import json_success, json_errors


def _actor_id(request):
    try:
        user = request.user() if callable(getattr(request, "user", None)) else None
    except Exception:
        return None
    return getattr(user, "id", None) or None


def _to_dict(row):
    """JSON projection for the bell dropdown."""
    created_at = getattr(row, "created_at", None)
    return {
        "id": getattr(row, "id", None),
        "type": getattr(row, "type", None) or "",
        "title": getattr(row, "title", None) or "",
        "message": getattr(row, "message", None) or "",
        "link": getattr(row, "link", None) or "",
        "read": getattr(row, "read_at", None) is not None,
        "date": (
            created_at.strftime("%b %d, %Y %I:%M %p")
            if hasattr(created_at, "strftime")
            else ""
        ),
    }


class NotificationController(Controller):
    def index(self, request: Request, response: Response):
        actor_id = _actor_id(request)
        if not actor_id:
            return json_errors(response, ["Not signed in."], status=401)

        rows = Notifications.recent_for(actor_id)
        return json_success(response, payload={
            "notifications": [_to_dict(row) for row in rows],
            "unread": Notifications.unread_count(actor_id),
        })

    def read(self, request: Request, response: Response):
        actor_id = _actor_id(request)
        if not actor_id:
            return json_errors(response, ["Not signed in."], status=401)

        if not Notifications.mark_read(actor_id, request.param("id")):
            # 404, not 403: don't disclose that someone else's notification exists.
            return json_errors(response, ["Notification not found."], status=404)

        return json_success(response, payload={"unread": Notifications.unread_count(actor_id)})

    def read_all(self, request: Request, response: Response):
        actor_id = _actor_id(request)
        if not actor_id:
            return json_errors(response, ["Not signed in."], status=401)

        cleared = Notifications.mark_all_read(actor_id)
        return json_success(
            response,
            payload={"cleared": cleared, "unread": 0},
            messages=["All notifications marked as read."],
        )
