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
