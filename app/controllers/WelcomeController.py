"""A WelcomeController Module."""

import json

from masonite.views import View
from masonite.controllers import Controller
from masonite.configuration import config
from app.models.Archives import Archives


class WelcomeController(Controller):
    """WelcomeController Controller Class."""

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
            },
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
