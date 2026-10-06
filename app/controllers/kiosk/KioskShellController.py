"""The kiosk shell (templates/welcome.html), served at /kiosk and every section path.

The section is resolved from the request path so deep links paint with content
already framed. The frame loads `embed_path`, not the section's own path, or
the shell would load inside itself. See app/services/KioskSections.py.
"""

from masonite.configuration import config
from masonite.controllers import Controller
from masonite.request import Request
from masonite.views import View

from app.services import KioskSections


class KioskShellController(Controller):
    """Renders the shell with one of the six sections pre-selected."""

    def show(self, request: Request, view: View):
        section = KioskSections.resolve(request.get_path())
        return view.render("welcome", self.shell_context(section))

    @staticmethod
    def shell_context(section):
        """Everything welcome.html needs. Deliberately does no ORM work: the ticker
        fetches itself after paint."""
        broadcasts = (
            config("broadcast.broadcasts", {}) or config("broadcast.BROADCASTS", {}) or {}
        )
        pusher_settings = broadcasts.get("pusher") or {}

        return {
            "pusher_key": pusher_settings.get("client") or pusher_settings.get("key") or "",
            "pusher_cluster": pusher_settings.get("cluster") or "mt1",
            # Empty on hosted pusher.com; set PUSHER_HOST/PUSHER_PORT for self-hosted Soketi.
            "pusher_host": pusher_settings.get("host") or "",
            "pusher_port": str(pusher_settings.get("port") or ""),
            "kiosk_sections": KioskSections.all_sections(),
            "active_section": section,
            "active_index": KioskSections.index_of(section["id"]),
        }
