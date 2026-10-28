"""The print view renders a past issue through the kiosk's own template, with
the calendar as the issue carried it."""

from datetime import datetime, timezone
from unittest.mock import Mock, patch

from tests import TestCase

from app.services import IssueLibrary as L


def _story(id, status, layout_type="brief"):
    return Mock(id=id, status=status, layout_type=layout_type, priority=id, image=None,
                published_at=None, created_at=None, category_id=None, title=f"T{id}",
                description="<p>body</p>", excerpt="", dek="", source="", location="",
                image_caption="", image_credit="", headline_font=None)


class PrintContextTestCase(TestCase):
    def _context(self, stories, published_at=datetime(2026, 7, 1, 1, 0, tzinfo=timezone.utc)):
        issue = Mock(id=3, number=12, title="Week <1>", published_at=published_at,
                     created_at=published_at)
        with patch.object(L.Issues, "stories_of", return_value=stories), \
                patch.object(L, "upcoming_events", return_value=[]) as ev:
            ctx = L.print_context(issue)
        return ctx, ev

    def test_only_visible_stories_are_printed(self):
        ctx, _ = self._context([_story(1, "published", "lead"), _story(2, "draft")])
        ids = [row["id"] for rows in ctx["blocks"].values() for row in rows]
        self.assertEqual(ids, [1])

    def test_calendar_is_as_of_publication(self):
        _, ev = self._context([_story(1, "published", "lead")])
        # 01:00 UTC is 09:00 in Manila.
        ev.assert_called_once_with(as_of=datetime(2026, 7, 1, 9, 0))

    def test_identity_and_label(self):
        ctx, _ = self._context([_story(1, "published", "lead")])
        self.assertEqual(ctx["issue_no"], 12)
        self.assertEqual(ctx["issue_title"], "Week <1>")
        self.assertEqual(ctx["issue_published_label"], "Jul 01, 2026")
        self.assertFalse(ctx["news_editor"])

    def test_print_turns_on_full_text(self):
        ctx, _ = self._context([_story(1, "published", "lead")])
        self.assertTrue(ctx["print_full_text"])


class PrintTemplateTestCase(TestCase):
    def _render(self, **extra):
        from wsgi import application

        ctx = {
            "blocks": {}, "news_editor": False, "calendar_events": [],
            "issue_vol": 1, "issue_no": 12, "issue_title": "Week <1>",
            "issue_published_label": "Jul 01, 2026", "autoprint": False,
        }
        ctx.update(extra)
        return application.make("view").render("gears.issue-print", ctx).rendered_template

    def _brief(self, body):
        return {"id": 2, "title": "Side", "description": body, "excerpt": "", "image": None,
                "headline_font": None, "layout_type": "brief"}

    def test_links_the_print_stylesheet_and_escapes_title(self):
        html = self._render()
        self.assertIn("css/issue-print.css", html)
        self.assertIn("Week &lt;1&gt;", html)
        self.assertNotIn("Week <1>", html)

    def test_autoprint_flag_reaches_the_page(self):
        self.assertIn('data-autoprint="1"', self._render(autoprint=True))
        self.assertIn('data-autoprint="0"', self._render(autoprint=False))

    def test_side_story_prints_its_whole_body(self):
        long_body = "<p>" + ("word " * 80) + "THE-END</p>"
        html = self._render(blocks={"brief": [self._brief(long_body)]}, print_full_text=True)
        self.assertIn("THE-END", html)

    def test_kiosk_still_shows_the_summary(self):
        from wsgi import application

        long_body = "<p>" + ("word " * 80) + "THE-END</p>"
        html = application.make("view").render("kiosk._issue", {
            "blocks": {"brief": [self._brief(long_body)]}, "news_editor": False,
            "calendar_events": [], "issue_vol": 1, "issue_no": 1,
        }).rendered_template
        self.assertNotIn("THE-END", html)

    def _block_story(self, layout_type, body):
        return {"id": 5, "title": "Piece", "description": body, "excerpt": "", "image": None,
                "headline_font": None, "layout_type": layout_type}

    def _render_kiosk(self, block, body):
        from wsgi import application

        return application.make("view").render("kiosk._issue", {
            "blocks": {block: [self._block_story(block, body)]}, "news_editor": False,
            "calendar_events": [], "issue_vol": 1, "issue_no": 1,
        }).rendered_template

    def test_editorial_prints_its_whole_body(self):
        # The kiosk truncates an editorial at 320 characters.
        body = "<p>" + ("word " * 120) + "EDITORIAL-END</p>"
        html = self._render(blocks={"editorial": [self._block_story("editorial", body)]},
                            print_full_text=True)
        self.assertIn("EDITORIAL-END", html)

    def test_kiosk_editorial_still_shows_the_summary(self):
        body = "<p>" + ("word " * 120) + "EDITORIAL-END</p>"
        self.assertNotIn("EDITORIAL-END", self._render_kiosk("editorial", body))

    def test_notice_prints_its_whole_body(self):
        # The kiosk truncates a notice at 200 characters.
        body = "<p>" + ("word " * 120) + "NOTICE-END</p>"
        html = self._render(blocks={"notice": [self._block_story("notice", body)]},
                            print_full_text=True)
        self.assertIn("NOTICE-END", html)

    def test_kiosk_notice_still_shows_the_summary(self):
        body = "<p>" + ("word " * 120) + "NOTICE-END</p>"
        self.assertNotIn("NOTICE-END", self._render_kiosk("notice", body))
