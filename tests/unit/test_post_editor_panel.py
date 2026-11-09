"""The dashboard's News panel: one photo-post editor plus the editor's own library.

The full-page render goes through the real full_context() (it reads tables, not
rows, so an empty database is enough). Everything that would read the new news
columns is a double: those columns do not exist on the live database until ship.
"""

import json
from datetime import datetime, timezone
from types import SimpleNamespace
from unittest.mock import MagicMock, Mock, patch

from masonite.facades import View

from app.controllers.gears import DashboardController as DC
from app.services import DashboardContext, PostLibrary
from tests import TestCase
from tests.unit.test_account_templates import _EmptyBag


def _render_dashboard(**overrides):
    context = DashboardContext.full_context("news")
    context.update(
        {
            "bag": _EmptyBag,
            "csrf_field": '<input type="hidden" name="__token" value="test">',
            "current_user": Mock(
                id=3, username="ed", full_name="Ed Itor", avatar_path=None, role="editor"
            ),
            "is_admin": False,
            "unread_notifications": 0,
            "review_count": 0,
        }
    )
    context.update(overrides)
    return View.render("gears/dashboard", context).rendered_template


def _row(**kw):
    base = {
        "id": 4,
        "kicker": "",
        "headline": "Fair day",
        "body": "Come by.",
        "image_large": "news/a.large.webp",
        "image_thumb": "news/a.thumb.webp",
        "crop_style": "object-position:50% 50%;transform:scale(1);transform-origin:50% 50%",
        "logo_url": "/storage/Branding/logo.png",
        "source_lines": [],
        "status": "draft",
        "expires_label": None,
        "published_label": "Nov 09, 2026",
        "state": "draft",
        "crop": {"x": 0.5, "y": 0.5, "zoom": 1.0},
        "expires_input": "",
        "custom_logo": False,
        "rejection_reason": "",
    }
    base.update(kw)
    return base


class EditorRenderTestCase(TestCase):
    def test_the_panel_renders_the_card_template_in_editor_mode(self):
        html = _render_dashboard()
        self.assertRegex(html, r'<article class="post-card"[^>]*data-post-editor')
        for hook in (
            'data-field="kicker"',
            'data-field="headline"',
            'data-field="body"',
            "data-post-expiry-open",
            "data-post-expiry-modal",
            'type="datetime-local"',
            "data-post-save-draft",
            "data-post-submit",
            "data-post-new",
            "data-post-photo-input",
            "data-post-logo-input",
            "data-post-sources",
            "data-post-zoom",
            'data-live-section="post-library"',
        ):
            self.assertIn(hook, html, hook)

    def test_placeholders_are_the_editor_copy(self):
        html = _render_dashboard()
        for text in ("Event title (optional)", "Headline", "Write the story…"):
            self.assertIn(f'data-placeholder="{text}"', html)

    def test_the_newsletter_composer_is_gone(self):
        html = _render_dashboard()
        for gone in (
            "data-news-slot",
            "issue-calendar",
            "data-news-composer",
            "data-news-category-modal",
            "news-dashboard.js",
            "story-library.js",
        ):
            self.assertNotIn(gone, html, gone)

    def test_the_new_stylesheets_and_script_are_linked(self):
        html = _render_dashboard()
        for asset in ("css/post-card.css", "css/post-editor.css", "js/post-editor.js"):
            self.assertIn(asset, html, asset)
        self.assertNotIn("css/news-dashboard.css", html)

    def test_the_editor_carries_its_defaults_and_endpoints(self):
        html = _render_dashboard()
        self.assertIn('data-store-url="/news/dashboard"', html)
        self.assertIn("data-site-logo=", html)
        # The empty template starts with the Gears' two default source lines.
        self.assertIn("/TheGearsOfficial", html)
        self.assertIn("/thegearspublication@gmail.com", html)
        # One icon template per allowed icon, so the JS never builds SVG itself.
        for icon in ("facebook", "email", "instagram", "website", "link"):
            self.assertIn(f'data-post-icon="{icon}"', html)

    def test_editor_context_is_an_empty_post(self):
        context = DashboardContext.post_editor_context(None)
        card = context["post_editor_card"]
        self.assertIsNone(card["id"])
        self.assertEqual(card["headline"], "")
        self.assertEqual([line["icon"] for line in card["source_lines"]], ["facebook", "email"])
        self.assertEqual(
            context["post_source_icons"], ("facebook", "email", "instagram", "website", "link")
        )


class LibraryPartialTestCase(TestCase):
    def _render(self, rows):
        return View.render(
            "gears/partials/post-library",
            {
                "post_library": rows,
                "csrf_field": '<input type="hidden" name="__token" value="test">',
            },
        ).rendered_template

    def test_each_row_is_loadable_and_names_its_state(self):
        html = self._render([_row(), _row(id=5, headline="", state="live")])
        self.assertIn("Fair day", html)
        self.assertIn("Untitled post", html)
        self.assertIn('data-post-state="live"', html)
        self.assertEqual(html.count("data-post-load"), 2)
        self.assertIn("/news/dashboard/4/duplicate", html)
        self.assertIn('data-live-delete="post-library"', html)

    def test_the_row_json_round_trips_and_is_attribute_safe(self):
        html = self._render([_row(headline='It\'s <b>&</b> "done"')])
        self.assertNotIn("<b>", html)
        start = html.index("data-post-row='") + len("data-post-row='")
        raw = html[start : html.index("'", start)]
        import html as htmllib

        self.assertEqual(json.loads(htmllib.unescape(raw))["headline"], 'It\'s <b>&</b> "done"')

    def test_a_rejected_row_shows_its_reason(self):
        html = self._render([_row(state="rejected", rejection_reason="Blurry photo")])
        self.assertIn("Blurry photo", html)

    def test_an_empty_library_says_so(self):
        self.assertIn("No posts yet", self._render([]))


class SectionsTestCase(TestCase):
    def test_only_post_library_replaces_the_newsletter_sections(self):
        for gone in ("news", "news-canvas", "story-library", "issue-calendar", "news-categories"):
            self.assertNotIn(gone, DC.FRAGMENTS)
            self.assertNotIn(gone, DC.STAMP_MODELS)
        self.assertIn("post-library", DC.FRAGMENTS)
        self.assertIn("post-library", DC.STAMP_MODELS)
        self.assertEqual(DC._USER_SCOPED_SECTIONS, {"post-library"})
        self.assertEqual(set(DC.FRAGMENTS), set(DC.STAMP_MODELS))

    def test_fragment_returns_only_the_callers_posts(self):
        request = Mock()
        request.user.return_value = Mock(id=7, role="editor")
        view = Mock()
        view.render.return_value.rendered_template = "<li>row</li>"
        with patch.object(
            PostLibrary, "library_rows", return_value=[_row()]
        ) as rows, patch.object(
            PostLibrary, "library_stamp", return_value="1:x"
        ) as stamp, patch.object(
            DC, "json_success"
        ) as ok:
            DC.DashboardController().fragment("post-library", view, request, Mock())
        rows.assert_called_once_with(7)
        stamp.assert_called_once_with(7)
        template, context = view.render.call_args.args
        self.assertEqual(template, "gears/partials/post-library")
        self.assertEqual(context["post_library"], [_row()])
        payload = ok.call_args.kwargs["payload"]
        self.assertEqual((payload["count"], payload["stamp"]), (1, "1:x"))

    def test_no_user_gets_an_empty_library_without_a_query(self):
        with patch.object(PostLibrary.News, "where") as where:
            self.assertEqual(DashboardContext.post_library_context(None), {"post_library": []})
            self.assertEqual(PostLibrary.library_stamp(None), "0:")
        where.assert_not_called()


class LibraryStampTestCase(TestCase):
    def test_the_stamp_counts_only_the_callers_rows(self):
        query = MagicMock()
        query.count.return_value = 3
        query.max.return_value.first.return_value = SimpleNamespace(
            updated_at="2026-11-09 10:00:00"
        )
        with patch.object(PostLibrary.News, "where", return_value=query) as where:
            self.assertEqual(PostLibrary.library_stamp(7), "3:2026-11-09 10:00:00")
        where.assert_called_with("author_id", 7)

    def test_a_failed_stamp_query_is_zero_not_a_500(self):
        with patch.object(PostLibrary.News, "where", side_effect=RuntimeError("db")):
            self.assertEqual(PostLibrary.library_stamp(7), "0:")


class LibraryRowsEditorFieldsTestCase(TestCase):
    def _rows(self, post):
        query = MagicMock()
        query.order_by.return_value = query
        query.get.return_value = [post]
        with patch.object(PostLibrary.News, "where", return_value=query), patch.object(
            PostLibrary, "_disk", return_value=None
        ):
            return PostLibrary.library_rows(7)

    def _post(self, **kw):
        base = dict(
            id=4,
            title="Fair",
            description="Body",
            kicker=None,
            image="news/a.jpg",
            logo_path="Branding/posts/logo.png",
            status="draft",
            rejection_reason=None,
            image_crop='{"x": 0.2, "y": 0.4, "zoom": 2}',
            source_lines=None,
            expires_at=datetime(2026, 11, 20, 9, 30, tzinfo=timezone.utc),
            published_at=None,
            created_at=None,
            author_id=7,
        )
        base.update(kw)
        return SimpleNamespace(**base)

    def test_rows_carry_what_the_editor_needs_to_reload_a_post(self):
        [row] = self._rows(self._post())
        self.assertEqual(row["crop"], {"x": 0.2, "y": 0.4, "zoom": 2.0})
        # 09:30 UTC is 17:30 in Manila: the value a datetime-local input takes.
        self.assertEqual(row["expires_input"], "2026-11-20T17:30")
        self.assertTrue(row["custom_logo"])
        self.assertEqual(row["rejection_reason"], "")

    def test_a_rejected_row_carries_its_reason(self):
        [row] = self._rows(self._post(rejection_reason="Blurry photo"))
        self.assertEqual(row["state"], "rejected")
        self.assertEqual(row["rejection_reason"], "Blurry photo")

    def test_no_expiry_and_no_logo(self):
        [row] = self._rows(self._post(expires_at=None, logo_path=None))
        self.assertEqual(row["expires_input"], "")
        self.assertFalse(row["custom_logo"])

    def test_rows_are_json_safe(self):
        json.dumps(self._rows(self._post()))
