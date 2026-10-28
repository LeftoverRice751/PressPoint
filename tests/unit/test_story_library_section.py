"""The Published tab is its own live section: news_stamp is per OPEN issue
and never moves when an admin approves one of this editor's older issues."""

from datetime import datetime, timezone
from unittest.mock import Mock, patch

from tests import TestCase

from app.controllers.gears import DashboardController as DC
from app.services import DashboardContext, IssueLibrary


class LibraryRowsTestCase(TestCase):
    def test_rows_describe_each_issue(self):
        lead = Mock(layout_type="lead", title="<b>Big</b> news")
        issue = Mock(id=3, number=12, title="", published_at=datetime(2026, 7, 1, 1, tzinfo=timezone.utc),
                     created_at=None, stories=[lead, Mock(layout_type="brief", title="x")])
        with patch.object(IssueLibrary.Issues, "published_by", return_value=[issue]):
            rows = IssueLibrary.library_rows(7)
        self.assertEqual(rows, [{
            "id": 3, "number": 12, "vol": 1, "title": "", "headline": "Big news",
            "published_label": "Jul 01, 2026", "story_count": 2,
        }])

    def test_headline_decodes_entities(self):
        lead = Mock(layout_type="lead", title="<b>Q&amp;A</b>")
        issue = Mock(id=3, number=1, title="", published_at=None, created_at=None, stories=[lead])
        with patch.object(IssueLibrary.Issues, "published_by", return_value=[issue]):
            rows = IssueLibrary.library_rows(7)
        self.assertEqual(rows[0]["headline"], "Q&A")


class SectionRegistrationTestCase(TestCase):
    def test_registered_everywhere_a_section_must_be(self):
        self.assertIn("story-library", DC.FRAGMENTS)
        self.assertIn("story-library", DC.STAMP_MODELS)
        self.assertIn("story-library", DC._USER_SCOPED_SECTIONS)

    def test_stamp_is_the_library_stamp(self):
        # _stamp_for imports Issues lazily, so patch it where it lives.
        with patch("app.services.Issues.library_stamp", return_value="4:x") as stamp:
            self.assertEqual(DC.DashboardController._stamp_for("story-library", 7), "4:x")
        stamp.assert_called_once_with(7)

    def test_stamp_for_no_user_is_zero(self):
        self.assertEqual(DC.DashboardController._stamp_for("story-library", None), "0:")

    def test_fragment_builds_context_for_the_requesting_user(self):
        builder = Mock(return_value={"library_issues": ["row"]})
        template = "gears/partials/story-library-issues"
        request = Mock()
        request.user.return_value = Mock(id=7)
        view = Mock()
        view.render.return_value.rendered_template = "<p>html</p>"
        with patch.dict(DC.FRAGMENTS, {"story-library": (builder, template, "library_issues")}), \
                patch("app.services.Issues.library_stamp", return_value="1:x"), \
                patch.object(DC, "json_success") as ok:
            DC.DashboardController().fragment("story-library", view, request, Mock())
        builder.assert_called_once_with(7)
        view.render.assert_called_once_with(template, {"library_issues": ["row"]})
        self.assertEqual(ok.call_args.kwargs["payload"]["stamp"], "1:x")
        self.assertEqual(ok.call_args.kwargs["payload"]["count"], 1)

    def test_stamps_poll_asks_for_the_requesting_users_library(self):
        request = Mock()
        request.user.return_value = Mock(id=7)
        seen = []

        def fake(name, user_id):
            seen.append((name, user_id))
            return "s"

        with patch.object(DC.DashboardController, "_stamp_for", side_effect=fake), \
                patch.object(DC.Notifications, "unread_count", return_value=0), \
                patch.object(DC, "json_success"):
            DC.DashboardController().stamps(request, Mock())
        self.assertIn(("story-library", 7), seen)

    def test_stamps_poll_calls_library_stamp_with_user_id(self):
        request = Mock()
        request.user.return_value = Mock(id=7)
        with patch("app.services.Issues.library_stamp", return_value="4:x") as stamp, \
                patch.object(DC, "_section_stamp", return_value="0:"), \
                patch("app.services.Issues.current_for", return_value=None), \
                patch.object(DC.Notifications, "unread_count", return_value=0), \
                patch.object(DC, "json_success"):
            DC.DashboardController().stamps(request, Mock())
        stamp.assert_called_once_with(7)

    def test_full_context_carries_library_issues(self):
        with patch.object(DashboardContext, "story_library_context",
                          return_value={"library_issues": ["row"]}):
            ctx = DashboardContext.full_context(user_id=None)
        self.assertEqual(ctx["library_issues"], ["row"])


class PartialTestCase(TestCase):
    def _render(self, rows):
        from wsgi import application

        return application.make("view").render(
            "gears.partials.story-library-issues", {"library_issues": rows}
        ).rendered_template

    def test_row_escapes_title(self):
        html = self._render([{
            "id": 3, "number": 12, "vol": 1, "title": 'Week "<1>"', "headline": "",
            "published_label": "Jul 01, 2026", "story_count": 2,
        }])
        self.assertIn("Week &#34;&lt;1&gt;&#34;", html)
        self.assertIn("/gears/issues/3/print", html)
        self.assertIn("/gears/issues/3/duplicate", html)

    def test_empty_state(self):
        self.assertIn("haven't published a newsletter yet", self._render([]))
