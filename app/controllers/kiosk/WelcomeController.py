"""Kiosk JSON and asset endpoints (flash ticker, CSRF, tour, service worker)."""

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
from app.services.TourScenesCatalog import TourScenesCatalog


class WelcomeController(Controller):
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

    def _append_flash_article(self, flash_articles, copy, headline, reference_at, kind):
        if not self._is_recent(reference_at):
            return

        flash_articles.append(
            {
                "headline": headline,
                "date": self._format_date(reference_at),
                "copy": copy,
                "kind": kind,
                "_created_at": reference_at,
            }
        )

    # Slack around the 24h SQL pre-filter; `_is_recent()` is the real gate. Wide
    # because created_at is UTC-aware while event_date is a naive local date.
    _FLASH_WINDOW_MARGIN = timedelta(days=2)

    def _recent_window(self):
        now = datetime.utcnow()
        return (
            (now - timedelta(days=1) - self._FLASH_WINDOW_MARGIN).strftime("%Y-%m-%d %H:%M:%S"),
            (now + self._FLASH_WINDOW_MARGIN).strftime("%Y-%m-%d %H:%M:%S"),
        )

    def _recent_rows(self, model, date_column):
        """Rows whose ticker date plausibly falls in the last 24 hours.

        Falls back to an unfiltered read if the driver rejects the predicate,
        since an empty ticker looks identical to a quiet news day.
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
        # Local import: a module-level one closes an import cycle through DashboardContext.
        from app.controllers.gears.NewsController import _flash_text, _news_is_public

        flash_articles = []

        for news_item in self._recent_rows(News, "published_at"):
            try:
                # This endpoint is public and emits the full body, so drafts and
                # pending stories must not reach it. Same gate as the front page.
                if not _news_is_public(news_item):
                    continue

                reference_at = getattr(news_item, "published_at", None) or getattr(news_item, "created_at", None)
                # Plain text: welcome-screen.js escapes these, so HTML would show literally.
                self._append_flash_article(
                    flash_articles,
                    _flash_text(getattr(news_item, "description", None)),
                    _flash_text(getattr(news_item, "title", None)) or "News update",
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
                    _flash_text(getattr(event_item, "description", None)),
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

    # The kiosk shell itself is rendered by KioskShellController.

    def flash_updates(self, response: Response):
        return response.json({
            "flash_articles": self._build_flash_articles(),
        })

    def csrf(self, request: Request, response: Response):
        token = request.cookie("SESSID") or ""
        # Headers before json(): Response.json() is not chainable.
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

    def virtual_tour(self, view: View):
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
        sw_path = os.path.realpath(
            os.path.join(
                os.path.dirname(os.path.abspath(__file__)),
                "../../../storage/compiled/js/sw-kiosk.js",  # three levels up to the repo root
            )
        )
        if not os.path.isfile(sw_path):
            return "Not found", 404
        response.header("Content-Type", "application/javascript; charset=utf-8")
        response.header("Service-Worker-Allowed", "/")
        response.header("Cache-Control", "no-store")
        return response.download("sw-kiosk.js", sw_path, force=False)
