"""The admin console at /users: its counts, and the markup contracts it needs.

/users was a bare create-an-editor form on the auth shell. It is now the
admin's whole surface -- counts, the approval queue, editor accounts -- wearing
the same shell as the editors' dashboard.

Two classes of thing are pinned here. The counting, because four numbers that
quietly disagree with the queue beside them are worse than no numbers. And the
DOM hooks, because every failure mode of this page is SILENT: review-queue.js
and dashboard-live.js both return early when a hook is missing, and
gears-dashboard.js hides every panel when data-default-page names one that does
not exist. None of those raise; they just leave an admin looking at a page that
does nothing.
"""

from unittest.mock import Mock, patch

from masonite.facades import View

from app.services import AdminConsole
from tests import TestCase
from tests.unit.test_account_templates import _EmptyBag, _story


def _user(user_id=1, role="editor", **overrides):
    fields = {
        "id": user_id,
        "username": "jdelacruz",
        "email": "jdelacruz@lspu.edu.ph",
        "full_name": "Juan Dela Cruz",
        "avatar_path": None,
        "role": role,
    }
    fields.update(overrides)
    return Mock(**fields)


class StatsContextTestCase(TestCase):
    def _stats(self, users=(), news=(), pending=None):
        with patch("app.services.AdminConsole.User") as user_model, \
             patch("app.services.AdminConsole.News") as news_model, \
             patch("app.services.AdminConsole.pending_stories") as pending_stories:
            user_model.all.return_value = list(users)
            news_model.all.return_value = list(news)
            pending_stories.return_value = list(
                pending if pending is not None
                else [row for row in news if getattr(row, "status", "") == "review"]
            )
            return AdminConsole.stats_context()

    def test_counts_only_editor_accounts(self):
        """Admins and the superadmin are not editors, and the table below this
        figure only ever lists editors -- a count that disagreed with the list
        it labels would be worse than no count."""
        stats = self._stats(users=[
            _user(1, role="editor"),
            _user(2, role="editor"),
            _user(3, role="admin"),
            _user(4, role="superadmin"),
        ])
        self.assertEqual(stats["editor_count"], 2)

    def test_role_casing_drift_still_counts(self):
        """The live users.role column holds values with stray casing."""
        stats = self._stats(users=[_user(1, role=" Editor "), _user(2, role="EDITOR")])
        self.assertEqual(stats["editor_count"], 2)

    def test_counts_news_by_status(self):
        stats = self._stats(news=[
            _story(1, status="review"),
            _story(2, status="review"),
            _story(3, status="published"),
            _story(4, status="draft"),
        ])
        self.assertEqual(stats["awaiting_review"], 2)
        self.assertEqual(stats["published_count"], 1)
        self.assertEqual(stats["draft_count"], 1)

    def test_unknown_status_counts_as_draft_not_published(self):
        """normalize_news_status fails closed. A row with a junk status must
        not inflate the "live on the kiosk" figure."""
        stats = self._stats(news=[_story(1, status="banana")], pending=[])
        self.assertEqual(stats["draft_count"], 1)
        self.assertEqual(stats["published_count"], 0)

    def test_empty_queue_reports_no_age(self):
        stats = self._stats(pending=[])
        self.assertEqual(stats["awaiting_review"], 0)
        self.assertIsNone(stats["oldest_pending_days"])

    def test_unparseable_created_at_does_not_break_the_page(self):
        """created_at is nullable on rows predating the column, and comes back
        as a string from a raw row. Neither should cost an admin the console."""
        stats = self._stats(pending=[_story(1, created_at=None)])
        self.assertIsNone(stats["oldest_pending_days"])
        self.assertEqual(stats["awaiting_review"], 1)

    def test_review_stories_rides_along_for_the_fragment_rows_key(self):
        """DashboardController.FRAGMENTS names review_stories as this
        section's rows_key; without it the fragment payload counts nothing."""
        stats = self._stats(pending=[_story(1), _story(2)])
        self.assertEqual(len(stats["review_stories"]), 2)


class StatsPartialTestCase(TestCase):
    def _render(self, **overrides):
        context = {
            "editor_count": 4,
            "awaiting_review": 3,
            "published_count": 12,
            "draft_count": 5,
            "oldest_pending_days": 2,
        }
        context.update(overrides)
        return View.render("gears/partials/admin-stats", context).rendered_template

    def test_shows_every_figure(self):
        html = self._render()
        for figure in (">3<", ">4<", ">12<", ">5<"):
            self.assertIn(figure, html)

    def test_review_action_reuses_the_shell_tab_handler(self):
        """A data-page-link button, so switching panels needs no JS of this
        page's own."""
        self.assertIn('data-page-link="review"', self._render())

    def test_age_line_is_not_pluralised_wrongly(self):
        one_day = self._render(oldest_pending_days=1)
        self.assertIn("Oldest waiting 1 day", one_day)
        self.assertNotIn("1 days", one_day)
        self.assertIn("Oldest waiting 2 days", self._render(oldest_pending_days=2))
        # 0 is "today", not "waiting 0 days".
        self.assertIn("Oldest submitted today", self._render(oldest_pending_days=0))

    def test_empty_queue_reads_as_done_not_as_a_zero(self):
        html = self._render(awaiting_review=0, oldest_pending_days=None)
        self.assertIn("Nothing waiting", html)
        self.assertIn("admin-lead--clear", html)
        self.assertNotIn('data-page-link="review"', html)


def _issue_from(stories):
    """review_context() derives this from the pending rows; mirror it here so
    the template test does not need a database behind author_names()."""
    from unittest.mock import patch

    from app.services.ReviewQueue import pending_issue

    with patch("app.services.ReviewQueue.author_names", return_value={}):
        return pending_issue(stories)


class ConsoleTemplateTestCase(TestCase):
    def _render(self, users=(), stories=(), **overrides):
        context = {
            "bag": _EmptyBag,
            "csrf_field": '<input type="hidden" name="__token" value="test">',
            "current_user": _user(9, role="admin", full_name="Ada Reyes"),
            "users": list(users),
            "default_page": "dashboard",
            "is_admin": True,
            "unread_notifications": 0,
            "editor_count": len(list(users)),
            "awaiting_review": len(list(stories)),
            "published_count": 0,
            "draft_count": 0,
            "oldest_pending_days": None,
            "review_stories": list(stories),
            "review_authors": {},
            "review_count": len(list(stories)),
            # The queue renders the ISSUE the pending stories make up, so the
            # console needs the same key review_context() supplies.
            "review_issue": _issue_from(list(stories)),
        }
        context.update(overrides)
        return View.render("gears/admin-console", context).rendered_template

    def test_renders_at_all(self):
        """A Jinja error here is a 500 on the admin's only page."""
        self.assertIn("data-dashboard-shell", self._render())

    def test_default_page_names_a_panel_that_exists(self):
        """switchPage() hides EVERY panel when data-default-page matches none,
        which is a blank screen with a clean console -- no error anywhere."""
        html = self._render()
        self.assertIn('data-default-page="dashboard"', html)
        self.assertIn('data-page-panel="dashboard"', html)

    def test_offers_the_three_sections(self):
        html = self._render()
        for panel in ("dashboard", "review", "editors"):
            self.assertIn('data-page-link="%s"' % panel, html)
            self.assertIn('data-page-panel="%s"' % panel, html)

    def test_carries_the_profile_panel_the_dropdown_points_at(self):
        """The shell's profile menu offers data-page-link="profile" on every
        page. Without the panel, clicking it blanks the console."""
        html = self._render()
        self.assertIn('data-page-link="profile"', html)
        self.assertIn('data-page-panel="profile"', html)

    def test_review_panel_carries_the_live_hooks(self):
        html = self._render(stories=[_story(1)])
        self.assertIn('data-live-section="review"', html)
        self.assertIn('data-live-target="[data-review-queue-host]"', html)
        self.assertIn("data-review-queue-host", html)

    def test_stats_panel_carries_the_live_hooks(self):
        html = self._render()
        self.assertIn('data-live-section="admin-stats"', html)
        self.assertIn("data-admin-stats-host", html)

    def test_shows_the_queue_and_its_badge(self):
        html = self._render(stories=[_story(1, author_id=None)])
        # One card for the submitted issue, not one per story.
        self.assertIn("data-review-issue", html)
        self.assertIn("data-review-count", html)
        self.assertIn("data-review-approve", html)
        self.assertIn("data-review-reject", html)

    def test_editor_accounts_are_listed_with_a_remove_control(self):
        html = self._render(users=[_user(3, full_name="Maria Santos")])
        self.assertIn("Maria Santos", html)
        self.assertIn("__method", html)

    def test_editors_empty_state_invites_an_action(self):
        self.assertIn("No editor accounts yet", self._render())

    def test_account_forms_avoid_the_document_level_ajax_hijack(self):
        """gears-dashboard.js binds data-section-form / data-upload-form at
        document level and rewrites those submits into AJAX calls expecting a
        dashboard-shaped response. These two forms post and redirect."""
        html = self._render(users=[_user(3)])
        self.assertNotIn("data-section-form", html)
        self.assertNotIn("data-upload-form", html)
