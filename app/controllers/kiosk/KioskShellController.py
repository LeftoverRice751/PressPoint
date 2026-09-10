"""The kiosk shell — the one document the terminal ever loads.

Serves templates/welcome.html for `/kiosk` and for all six section paths. The
section is resolved server-side from the request path, so a deep link (a typed
URL, a QR scan, a browser reload) paints with its content already in the frame
rather than flashing an empty shell and filling it from JS.

The frame does not load the section's own path — that would load this shell
inside itself, forever. It loads `embed_path`, which routes/public.py points at
the same unchanged controller that used to serve the section directly. See
app/services/KioskSections.py.
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
        """Everything welcome.html needs, for whichever section is active.

        Deliberately cheap. This runs on seven URLs now rather than one, so it
        does no ORM work at all: the carousel is a static table, and the flash
        ticker fetches itself from /kiosk/flash-updates after paint.

        (It used to load every public News row and run group_news_slots() to
        derive `main_news`. That value was never referenced anywhere in
        welcome.html — the lead story is rendered by the framed news page, not
        the shell — so it was a full table scan per menu load, and would have
        become one per section.)
        """
        broadcasts = (
            config("broadcast.broadcasts", {}) or config("broadcast.BROADCASTS", {}) or {}
        )
        pusher_settings = broadcasts.get("pusher") or {}

        return {
            "pusher_key": pusher_settings.get("client") or pusher_settings.get("key") or "",
            "pusher_cluster": pusher_settings.get("cluster") or "mt1",
            "kiosk_sections": KioskSections.all_sections(),
            "active_section": section,
            "active_index": KioskSections.index_of(section["id"]),
        }
