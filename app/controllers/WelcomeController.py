"""A WelcomeController Module."""

from datetime import datetime, timedelta

from masonite.configuration import config
from masonite.controllers import Controller
from masonite.response import Response
from masonite.views import View

from app.models.Events import Events
from app.models.News import News


class WelcomeController(Controller):
    """WelcomeController Controller Class."""

    def _is_recent(self, created_at):
        if not created_at:
            return False

        now = datetime.now(created_at.tzinfo) if getattr(created_at, "tzinfo", None) else datetime.now()
        age = now - created_at
        return timedelta(0) <= age <= timedelta(days=1)

    def _build_flash_articles(self):
        flash_articles = []

        for news_item in list(News.all() or []):
            reference_at = getattr(news_item, "published_at", None) or getattr(news_item, "created_at", None)
            if not self._is_recent(reference_at):
                continue

            flash_articles.append(
                {
                    "headline": getattr(news_item, "title", None) or "News update",
                    "date": reference_at.strftime("%b %d, %Y") if hasattr(reference_at, "strftime") else "",
                    "copy": getattr(news_item, "description", None) or "",
                    "_created_at": reference_at,
                }
            )

        for event_item in list(Events.all() or []):
            created_at = getattr(event_item, "created_at", None)
            if not self._is_recent(created_at):
                continue

            flash_articles.append(
                {
                    "headline": getattr(event_item, "title", None) or "Event update",
                    "date": created_at.strftime("%b %d, %Y") if hasattr(created_at, "strftime") else "",
                    "copy": getattr(event_item, "description", None) or "",
                    "_created_at": created_at,
                }
            )

        flash_articles.sort(key=lambda item: item["_created_at"], reverse=True)
        return [
            {
                "headline": item["headline"],
                "date": item["date"],
                "copy": item["copy"],
            }
            for item in flash_articles
        ]

    def show(self, view: View):
        broadcasts = config("broadcast.broadcasts", {}) or config("broadcast.BROADCASTS", {}) or {}
        pusher_settings = broadcasts.get("pusher") or {}
        return view.render(
            "welcome",
            {
                "pusher_key": pusher_settings.get("client") or pusher_settings.get("key") or "",
                "pusher_cluster": pusher_settings.get("cluster") or "mt1",
            },
        )

    def flash_updates(self, response: Response):
        return response.json({
            "flash_articles": self._build_flash_articles(),
        })

    def coming_soon(self, view: View, label: str):
        return view.render(
            "kiosk/coming_soon",
            {
                "label": label,
            },
        )

    def latest_news(self, view: View):
        return self.coming_soon(view, "Latest News")

    def campus_map(self, view: View):
        return self.coming_soon(view, "Campus Map")

    def ai_assistant(self, view: View):
        return self.coming_soon(view, "AI Assistant")

    def virtual_tour(self, view: View):
        return self.coming_soon(view, "Virtual Tour")
