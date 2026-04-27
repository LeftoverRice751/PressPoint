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

    def _format_date(self, value):
        return value.strftime("%b %d, %Y") if hasattr(value, "strftime") else ""

    def _append_flash_article(self, flash_articles, item, headline, reference_at, kind):
        if not self._is_recent(reference_at):
            return

        flash_articles.append(
            {
                "headline": headline,
                "date": self._format_date(reference_at),
                "copy": getattr(item, "description", None) or "",
                "kind": kind,
                "_created_at": reference_at,
            }
        )

    def _build_flash_articles(self):
        flash_articles = []

        for news_item in list(News.all() or []):
            reference_at = getattr(news_item, "published_at", None) or getattr(news_item, "created_at", None)
            self._append_flash_article(
                flash_articles,
                news_item,
                getattr(news_item, "title", None) or "News update",
                reference_at,
                "news",
            )

        for event_item in list(Events.all() or []):
            reference_at = getattr(event_item, "event_date", None) or getattr(event_item, "created_at", None)
            self._append_flash_article(
                flash_articles,
                event_item,
                getattr(event_item, "title", None) or "Event update",
                reference_at,
                "event",
            )

        flash_articles.sort(key=lambda item: item["_created_at"], reverse=True)
        return [
            {
                "headline": item["headline"],
                "date": item["date"],
                "copy": item["copy"],
                "kind": item["kind"],
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
