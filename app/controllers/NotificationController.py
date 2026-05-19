from datetime import datetime

from masonite.controllers import Controller
from masonite.request import Request
from masonite.response import Response

from app.models.Notification import Notification


class NotificationController(Controller):
    def mark_read(self, request: Request, response: Response):
        user = request.user()
        username = getattr(user, "username", None) if user else None
        notification = Notification.find(request.param("id"))
        if notification and username and notification.user_id == username and not notification.read_at:
            notification.read_at = datetime.now()
            notification.save()
        return response.redirect(name="news_editor.dashboard")

    def mark_all_read(self, request: Request, response: Response):
        user = request.user()
        username = getattr(user, "username", None) if user else None
        if username:
            unread = Notification.where("user_id", username).where_null("read_at").get() or []
            now = datetime.now()
            for notification in unread:
                notification.read_at = now
                notification.save()
        return response.redirect(name="news_editor.dashboard")
