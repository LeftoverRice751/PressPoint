"""A WelcomeController Module."""

import os
from datetime import datetime, timedelta

from masonite.configuration import config
from masonite.controllers import Controller
from masonite.response import Response
from masonite.views import View

from app.models.Events import Events
from app.models.News import News
from app.services.DashboardContext import group_news_slots
from app.services.TourScenesCatalog import TourScenesCatalog


class WelcomeController(Controller):
    """WelcomeController Controller Class."""

    def _is_recent(self, created_at):
        if not created_at:
            return False
        try:
            from datetime import date as _date
            if isinstance(created_at, _date) and not isinstance(created_at, datetime):
                created_at = datetime.combine(created_at, datetime.min.time())
            now = datetime.now(created_at.tzinfo) if getattr(created_at, "tzinfo", None) else datetime.now()
            age = now - created_at
            return timedelta(0) <= age <= timedelta(days=1)
        except (TypeError, AttributeError):
            return False

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
        # Imported here, not at module scope, for the same reason show() does:
        # NewsController imports DashboardContext, which imports the models this
        # module also pulls in, and a top-level import closes the cycle.
        from app.controllers.gears.NewsController import _news_is_public

        flash_articles = []

        for news_item in list(News.all() or []):
            try:
                # The ticker is served publicly and unauthenticated at
                # /kiosk/flash-updates, and it emits the headline AND the full
                # body. Without this gate every draft and every story awaiting
                # an admin's review broadcast themselves to the campus terminal
                # for 24 hours after being touched — which would make the
                # review workflow decorative, since a story could reach the
                # screen here without ever being approved.
                #
                # Same gate as the front page and the lead teaser use, so all
                # three agree on what "public" means.
                if not _news_is_public(news_item):
                    continue

                reference_at = getattr(news_item, "published_at", None) or getattr(news_item, "created_at", None)
                self._append_flash_article(
                    flash_articles,
                    news_item,
                    getattr(news_item, "title", None) or "News update",
                    reference_at,
                    "news",
                )
            except Exception:
                pass

        for event_item in list(Events.all() or []):
            try:
                reference_at = getattr(event_item, "event_date", None) or getattr(event_item, "created_at", None)
                self._append_flash_article(
                    flash_articles,
                    event_item,
                    getattr(event_item, "title", None) or "Event update",
                    reference_at,
                    "event",
                )
            except Exception:
                pass

        try:
            flash_articles.sort(key=lambda item: item["_created_at"], reverse=True)
        except TypeError:
            pass
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

        # Same lead-story selection NewsController.show uses (group_news_slots
        # is the single source of truth for "main" per CLAUDE.md) — imported
        # locally to avoid a module-load cycle with NewsController.
        from app.controllers.gears.NewsController import _news_is_public

        news_items = [item for item in News.order_by("id", "desc").get() if _news_is_public(item)]
        main_news = group_news_slots(news_items)["main_news"]

        return view.render(
            "welcome",
            {
                "pusher_key": pusher_settings.get("client") or pusher_settings.get("key") or "",
                "pusher_cluster": pusher_settings.get("cluster") or "mt1",
                "main_news": main_news,
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

    def ai_assistant(self, view: View):
        return self.coming_soon(view, "AI Assistant")

    def virtual_tour(self, view: View):
        # The scene-list drawer is rendered from the catalog rather than
        # hardcoded in the template, so a tour re-export only means dropping a
        # new resources/js/data.js in place. all_scenes() returns [] instead of
        # raising if that file is missing, so a broken catalog still renders a
        # page (empty drawer) rather than a 500.
        return view.render(
            "kiosk/kiosk-tour",
            {
                "active_nav": "tour",
                "tour_scenes": TourScenesCatalog.all_scenes(),
            },
        )

    def org_chart(self, response: Response):
        return response.redirect(name="kiosk.org-board")

    def serve_sw(self, response: Response):
        """Serve the kiosk service worker from the site root.

        Same reasoning as VideoController.serve_sw (sw-archives.js) and
        MapController.serve_sw (sw-mobile-route.js): the file is compiled to
        storage/compiled/js/ and would normally be served from /assets/, but a
        worker's scope is capped at the directory it is served from, so from
        there it could only control /assets/. Serving it from the root and
        declaring Service-Worker-Allowed: / is what lets it control /kiosk.
        no-store keeps browsers re-checking the script itself, so a new worker
        rolls out on the next navigation instead of up to a week later
        (nginx puts `expires 7d` on /assets/).
        """
        sw_path = os.path.realpath(
            os.path.join(
                os.path.dirname(os.path.abspath(__file__)),
                "../../../storage/compiled/js/sw-kiosk.js",  # app/controllers/kiosk/ -> repo root
            )
        )
        if not os.path.isfile(sw_path):
            return "Not found", 404
        response.header("Content-Type", "application/javascript; charset=utf-8")
        response.header("Service-Worker-Allowed", "/")
        response.header("Cache-Control", "no-store")
        return response.download("sw-kiosk.js", sw_path, force=False)
