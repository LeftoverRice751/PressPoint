"""Markup contracts for the review queue and the account chrome.

Two things are pinned here.

First, that the templates actually render — templates/gears/dashboard.html is a
single 1800-line file, and a Jinja error in it takes the entire editor dashboard
down with a 500, not just the panel that broke.

Second, the two role contracts that are easy to regress into a security bug:
the Review nav must not be offered to a non-admin, and the logout control must
be reachable (it moved out of the sidebar, and an unreachable logout on a shared
newsroom terminal is a real problem).

Rendering goes through the View facade so the real Jinja environment is in play,
including the display_name/avatar_url/user_initials globals AppProvider shares.
"""

from unittest.mock import Mock

from masonite.facades import View

from app.services import DashboardContext
from tests import TestCase


class _EmptyBag:
    """Stand-in for Masonite's session error bag.

    `bag` is bound per request, so rendering the dashboard outside one leaves
    it undefined. A real object rather than a Mock because the template branches
    on `bag().any()`, and a Mock's truthy return would take the error branch.
    """

    def any(self):
        return False

    def messages(self, *args, **kwargs):
        return []


def _story(story_id=1, title="Campus story", author_id=5, **overrides):
    fields = {
        "id": story_id,
        "title": title,
        "author_id": author_id,
        "layout_type": "secondary",
        "status": "review",
        "description": "<p>The body of the story.</p>",
        "excerpt": "",
        "dek": "",
    }
    fields.update(overrides)
    return Mock(**fields)


class ReviewQueueTemplateTestCase(TestCase):
    def _render(self, stories=(), authors=None):
        return View.render(
            "gears/partials/review-queue",
            {
                "review_stories": list(stories),
                "review_authors": authors if authors is not None else {},
                "review_count": len(list(stories)),
            },
        ).rendered_template

    def test_renders_a_card_per_submission(self):
        html = self._render([_story(1), _story(2)])
        self.assertEqual(html.count("data-review-item"), 2)

    def test_card_carries_the_hooks_the_queue_js_reads(self):
        html = self._render([_story(7)])
        for hook in (
            'data-review-id="7"',
            "data-review-preview",
            "data-review-approve",
            "data-review-reject",
            "data-review-reason",
        ):
            self.assertIn(hook, html)

    def test_shows_who_submitted_the_story(self):
        """The byline is the whole point of the attribution work — an admin
        approving a story has to know whose it is."""
        html = self._render([_story(1, author_id=5)], authors={5: "Maria Santos"})
        self.assertIn("Maria Santos", html)

    def test_survives_an_author_whose_account_was_deleted(self):
        """author_id is ON DELETE SET NULL, so this row genuinely occurs."""
        html = self._render([_story(1, author_id=None)])
        self.assertIn("an unknown account", html)

    def test_empty_queue_says_so(self):
        html = self._render([])
        self.assertIn("Nothing is waiting for review", html)
        self.assertNotIn("data-review-item", html)

    def test_reject_reason_box_exists_for_every_card(self):
        """A reason is required server-side; the UI has to be able to collect
        one or the reject path is unusable."""
        html = self._render([_story(1)])
        self.assertIn("data-review-reject-form", html)
        self.assertIn("data-review-reject-confirm", html)


class AccountChromeTestCase(TestCase):
    """The hero's bell and profile border, rendered as part of the full
    dashboard shell."""

    def _render_dashboard(self, role="editor", **overrides):
        user = Mock(
            id=3,
            username="jdelacruz",
            full_name=overrides.pop("full_name", "Juan Dela Cruz"),
            avatar_path=overrides.pop("avatar_path", None),
            role=role,
        )
        # The real builder, not a hand-written dict: this template reads dozens
        # of context keys, and a stub would drift from full_context() silently —
        # which is exactly the class of bug these tests exist to catch. It also
        # means the assertions below run against the context the controller
        # genuinely passes.
        context = DashboardContext.full_context("dashboard")
        context.update({
            "bag": _EmptyBag,
            "csrf_field": '<input type="hidden" name="__token" value="test">',
            "current_user": user,
            "is_admin": role == "admin",
            "unread_notifications": overrides.pop("unread", 0),
            "review_count": overrides.pop("review_count", 0),
        })
        context.update(overrides)
        return View.render("gears/dashboard", context).rendered_template

    def test_dashboard_renders_at_all(self):
        """A Jinja error here is a 500 on the whole editor dashboard."""
        html = self._render_dashboard()
        self.assertIn("data-dashboard-shell", html)

    def test_the_news_panel_emits_its_toolbar_controls(self):
        """The server half of the dead-button bug.

        "Add New News" did nothing when clicked because the JS looked for it
        inside [data-news-composer] while it renders in .news-toolbar, a
        SIBLING of that element (see tests/js/news-toolbar-scope.test.mjs for
        the scoping half). Nothing was wrong with the markup — but if the
        button ever stops being RENDERED, the symptom an editor reports is
        identical, so pin the server side too.
        """
        html = self._render_dashboard()

        self.assertIn("data-news-add", html)
        self.assertIn("data-news-prev", html)
        self.assertIn("data-news-next", html)
        self.assertIn("data-news-bench", html)

    def test_the_category_modal_renders_with_its_category_list(self):
        """The modal is included in the full page render, not fetched — so a
        missing context key here is a 500 on the whole dashboard, not a
        degraded modal. `news_categories_json` in particular is produced by
        news_categories_context() and has to reach the partial through
        news_context()."""
        html = self._render_dashboard()

        self.assertIn("data-news-category-modal", html)
        self.assertIn("data-news-categories-json", html)
        # The confirm action starts disabled: a category is required, and the
        # button must not be pressable before one is chosen.
        self.assertIn("data-news-category-confirm", html)

    def test_profile_border_shows_the_display_name(self):
        html = self._render_dashboard()
        self.assertIn("Juan Dela Cruz", html)
        self.assertIn("data-profile-menu", html)

    def test_initials_stand_in_when_there_is_no_avatar(self):
        """First and last initial — "Juan Dela Cruz" is JC, not JD. Taking the
        first two words would read as "Juan Dela", which is a given name plus
        half a surname."""
        html = self._render_dashboard()
        self.assertIn("gears-profile__avatar--initials", html)
        self.assertIn(">JC</span>", html)

    def test_single_word_name_falls_back_to_one_initial(self):
        html = self._render_dashboard(full_name="", avatar_path=None)
        # No full_name, so display_name falls back to the username.
        self.assertIn(">J</span>", html)

    def test_logout_moved_into_the_profile_dropdown(self):
        """It must still exist and still carry the confirm-modal hooks — an
        unreachable logout on a shared newsroom terminal is a real problem."""
        html = self._render_dashboard()
        self.assertIn("gears-profile__logout-form", html)
        self.assertIn('data-confirm-title="Log out?"', html)

    def test_logout_is_gone_from_the_sidebar(self):
        html = self._render_dashboard()
        self.assertNotIn("gears-sidebar__logout", html)

    def test_bell_renders_with_no_badge_when_nothing_is_unread(self):
        html = self._render_dashboard(unread=0)
        self.assertIn("data-bell-toggle", html)
        self.assertIn("data-bell-count", html)

    def test_bell_badge_is_server_rendered_so_it_is_right_on_first_paint(self):
        html = self._render_dashboard(unread=4)
        self.assertIn("data-bell-count", html)
        self.assertIn(">4</span>", html)

    def test_stat_cards_count_the_news_table_not_the_legacy_posts_one(self):
        """total_articles/published_articles count `Posts`, which nothing in
        the composer or the kiosk front page writes any more -- so the cards
        reported numbers unrelated to the stories rendered below them."""
        html = self._render_dashboard()
        self.assertNotIn("total_articles", html)
        self.assertIn("Total News", html)
        self.assertIn("Published News", html)

    def test_the_review_queue_is_no_longer_on_this_surface(self):
        """It moved to the admin console at /users
        (tests/unit/test_admin_console.py). Approving stories is admin work,
        and it does not belong in the editors' composer -- an admin is now
        redirected off this page entirely, so a review panel here would be
        dead markup nobody could reach.

        Asserted for the admin role too, not just the editor: an is_admin
        branch creeping back is exactly how this regresses."""
        for role in ("editor", "admin"):
            html = self._render_dashboard(role=role, review_count=3)
            self.assertNotIn('data-page-link="review"', html)
            self.assertNotIn('data-page-panel="review"', html)
            self.assertNotIn("data-review-count", html)

    def test_publish_capability_is_advertised_only_to_admins(self):
        """The composer button reads "Submit for review" off this flag."""
        self.assertIn('data-can-publish="true"', self._render_dashboard(role="admin"))
        self.assertIn('data-can-publish="false"', self._render_dashboard(role="editor"))

    def test_composer_status_field_defaults_to_draft(self):
        """An unset status must not be a publicly visible one."""
        html = self._render_dashboard()
        self.assertIn('name="status"       value="draft"', html)
