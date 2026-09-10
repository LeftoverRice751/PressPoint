"""A WelcomeController Module."""

import os
from datetime import datetime, timedelta

from masonite.configuration import config
from masonite.controllers import Controller
from masonite.request import Request
from masonite.response import Response
from masonite.views import View

from app.models.Events import Events
from app.models.News import News
from app.services.CharterArchive import (
    CHARTER_MODEL_URL,
    CHARTER_PITCH,
    CHARTER_SCENE_ID,
    CHARTER_YAW,
    latest_charter_entry,
)
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

    #: How far either side of the 24h ticker window the SQL pre-filter reaches.
    #: `_is_recent()` remains the authoritative gate; this only bounds how many
    #: rows it has to look at. The margin exists because the two columns the
    #: window is measured against do not agree on a timezone -- `created_at`
    #: comes back UTC-aware from pendulum while `events.event_date` is a naive
    #: local date -- so a tight SQL window could drop a row the Python gate
    #: would have kept. Two days comfortably covers the +08:00 campus offset.
    _FLASH_WINDOW_MARGIN = timedelta(days=2)

    def _recent_window(self):
        now = datetime.utcnow()
        return (
            (now - timedelta(days=1) - self._FLASH_WINDOW_MARGIN).strftime("%Y-%m-%d %H:%M:%S"),
            (now + self._FLASH_WINDOW_MARGIN).strftime("%Y-%m-%d %H:%M:%S"),
        )

    def _recent_rows(self, model, date_column):
        """Rows whose ticker date plausibly falls in the last 24 hours.

        This endpoint is public, unauthenticated, and polled by the kiosk, and
        it used to run `Model.all()` -- pulling every story ever written, full
        HTML body and all, to keep the handful published yesterday. The window
        is a strict superset of what `_is_recent()` accepts, so narrowing here
        cannot change which articles appear.

        Falls back to the unfiltered read if the driver rejects the predicate,
        because a ticker that renders nothing looks identical to a quiet news
        day and would hide the failure.
        """
        start, end = self._recent_window()
        try:
            return list(
                model.where_raw(
                    f"COALESCE({date_column}, created_at) BETWEEN '{start}' AND '{end}'"
                ).get()
                or []
            )
        except Exception:
            return list(model.all() or [])

    def _build_flash_articles(self):
        # Imported here, not at module scope, for the same reason show() does:
        # NewsController imports DashboardContext, which imports the models this
        # module also pulls in, and a top-level import closes the cycle.
        from app.controllers.gears.NewsController import _html_to_text, _news_is_public

        flash_articles = []

        for news_item in self._recent_rows(News, "published_at"):
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
                    # Plain text: news.title is an HTML column now (the
                    # headline is authored in Quill), and welcome-screen.js
                    # renders this through escapeHtml(), so the formatting
                    # spans would show as literal markup in the ticker.
                    _html_to_text(getattr(news_item, "title", None) or "") or "News update",
                    reference_at,
                    "news",
                )
            except Exception:
                pass

        for event_item in self._recent_rows(Events, "event_date"):
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

    # The kiosk menu used to be rendered from here, by a show() that also
    # loaded every public News row to derive a `main_news` value welcome.html
    # never referenced. Rendering the shell now lives in KioskShellController,
    # because the shell is served at seven URLs rather than one and has to
    # resolve which section a request path selects. This controller keeps the
    # kiosk's JSON and asset endpoints.

    def flash_updates(self, response: Response):
        return response.json({
            "flash_articles": self._build_flash_articles(),
        })

    def csrf(self, request: Request, response: Response):
        """Hand the current CSRF token to a kiosk page whose HTML came from cache.

        This exists to get the token OUT of the document, which is what lets
        sw-kiosk.js serve kiosk pages from cache instead of network-first.
        Every kiosk page used to be fetched from the network on every entry for
        one reason: the markup carries a per-session token that the campus
        map's QR handoff (POST /api/route-sessions) needs, and a cached
        document would carry a stale one. With the token available separately,
        the documents are static and can be served instantly.

        Masonite's VerifyCsrfToken.create_token() returns request.cookie(
        "SESSID") verbatim, so the token IS the session id: stable for the life
        of the session rather than rotated per request, which is what makes
        this safe to fetch once at page init and hold. It cannot simply be read
        from document.cookie instead — config/session.py leaves http_only at
        its True default (masonite/cookies/Cookie.py), and the cookie is
        encrypted on the way out.

        A same-origin GET that returns the CSRF token is the standard shape for
        this (Laravel's /sanctum/csrf-cookie, Django's ensure_csrf_cookie): CORS
        stops a cross-origin page reading the response, so the only actor this
        helps is one who can already run same-origin script — at which point
        CSRF was bypassed anyway. It is not a hole to be closed later.

        no-store, and listed in sw-kiosk.js's BYPASS_PREFIXES, because a cached
        token is the exact failure this endpoint exists to prevent.
        """
        token = request.cookie("SESSID") or ""
        # Headers before json(): Response.json() returns the serialized body
        # rather than the response, so it is not chainable.
        response.header("Cache-Control", "no-store")
        return response.json({"token": token})

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
        # The charter is resolved server-side rather than fetched by the tour
        # bundle so that "no charter uploaded yet" is a non-event: the template
        # simply omits the 3D hotspot and the tour is what it was before.
        return view.render(
            "kiosk/kiosk-tour",
            {
                "active_nav": "tour",
                "tour_scenes": TourScenesCatalog.all_scenes(),
                "charter": latest_charter_entry(),
                "charter_model_url": CHARTER_MODEL_URL,
                "charter_scene_id": CHARTER_SCENE_ID,
                "charter_yaw": CHARTER_YAW,
                "charter_pitch": CHARTER_PITCH,
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
