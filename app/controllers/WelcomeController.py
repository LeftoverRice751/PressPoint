"""A WelcomeController Module."""

from masonite.views import View
from masonite.controllers import Controller
from masonite.configuration import config


class WelcomeController(Controller):
    """WelcomeController Controller Class."""

    def show(self, view: View):
        broadcasts = config("broadcast.broadcasts", {}) or {}
        return view.render(
            "welcome",
            {
                "pusher_key": broadcasts.get("pusher.client") or "",
                "pusher_cluster": broadcasts.get("pusher.cluster") or "mt1",
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
