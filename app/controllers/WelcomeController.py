"""A WelcomeController Module."""

import json
from datetime import date, datetime, timezone
try:
    from zoneinfo import ZoneInfo
except ImportError:
    ZoneInfo = None

from masonite.views import View
from masonite.controllers import Controller
from masonite.configuration import config
from masonite.response import Response
from app.models.Archives import Archives
from app.models.Events import Events
from app.models.News import News


class WelcomeController(Controller):
    """WelcomeController Controller Class."""

    def _timezone_name(self):
        return config("application.timezone") or "Asia/Manila"

    def _timezone(self):
        if ZoneInfo is None:
            return timezone.utc

        try:
            return ZoneInfo(self._timezone_name())
        except Exception:
            return timezone.utc

    def _server_today_key(self):
        return datetime.now(self._timezone()).date().isoformat()

    def _date_key(self, value):
        app_timezone = self._timezone()

        if isinstance(value, datetime):
            if value.tzinfo is None:
                return value.replace(tzinfo=app_timezone).date().isoformat()
            return value.astimezone(app_timezone).date().isoformat()

        if isinstance(value, date):
            return value.isoformat()

        if value is None:
            return ""

        text = str(value).strip()
        if not text:
            return ""

        normalized_text = text.replace("Z", "+00:00")
        try:
            parsed = datetime.fromisoformat(normalized_text)
            if parsed.tzinfo is None:
                parsed = parsed.replace(tzinfo=app_timezone)
            else:
                parsed = parsed.astimezone(app_timezone)
            return parsed.date().isoformat()
        except ValueError:
            if len(text) >= 10:
                return text[:10]

        return ""

    def _collect_today_flash_updates(self):
        today_key = self._server_today_key()
        updates = []

        try:
            news_items = list(News.all() or [])
        except Exception:
            news_items = []

        for item in news_items:
            occurred_on = self._date_key(getattr(item, "published_at", None) or getattr(item, "created_at", None))
            if occurred_on != today_key:
                continue

            updates.append({
                "headline": getattr(item, "title", ""),
                "copy": getattr(item, "description", ""),
                "kind": "news",
                "occurred_on": occurred_on,
                "today_key": today_key,
            })

        try:
            event_items = list(Events.all() or [])
        except Exception:
            event_items = []

        for item in event_items:
            if getattr(item, "is_archive", False):
                continue

            occurred_on = self._date_key(getattr(item, "event_date", None))
            if occurred_on != today_key:
                continue

            updates.append({
                "headline": getattr(item, "title", ""),
                "copy": getattr(item, "description", ""),
                "kind": "event",
                "occurred_on": occurred_on,
                "today_key": today_key,
            })

        return sorted(updates, key=lambda entry: (entry.get("occurred_on") or "", entry.get("headline") or ""), reverse=True)

    def show(self, view: View):
        broadcasts = config("broadcast.broadcasts", {}) or {}
        try:
            archives = sorted(list(Archives.all() or []), key=lambda item: getattr(item, "id", 0), reverse=True)
        except Exception:
            archives = []

        archive_cards = []
        for archive in archives[:8]:
            file_path = (getattr(archive, "file_path", "") or "").replace("\\", "/")
            archive_cards.append({
                "title": getattr(archive, "name", "Untitled Archive") or "Untitled Archive",
                "type": getattr(archive, "type", "Archive") or "Archive",
                "filePath": f"/storage/{file_path}" if file_path else "",
                "coverLabel": (getattr(archive, "name", "") or "UA")[:24],
            })

        if not archive_cards:
            archive_cards = [
                {"title": "Campus Review 2026", "type": "Magazine", "filePath": "", "coverLabel": "CR"},
                {"title": "Special Bulletin", "type": "Bulletin", "filePath": "", "coverLabel": "SB"},
                {"title": "Research Digest", "type": "Digest", "filePath": "", "coverLabel": "RD"},
            ]

        return view.render(
            "welcome",
            {
                "pusher_key": broadcasts.get("pusher.client") or "",
                "pusher_cluster": broadcasts.get("pusher.cluster") or "mt1",
                "archives_json": json.dumps(archive_cards),
                "archive_count": len(archive_cards),
                "flash_updates_json": json.dumps(self._collect_today_flash_updates()),
            },
        )

    def flash_updates_today(self, response: Response):
        return response.json(
            {
                "items": self._collect_today_flash_updates(),
                "today_key": self._server_today_key(),
                "timezone": self._timezone_name(),
            }
        )

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
