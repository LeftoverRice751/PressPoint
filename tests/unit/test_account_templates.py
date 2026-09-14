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

from unittest.mock import patch, Mock

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
        "layout_type": "brief",
        "status": "review",
        "description": "<p>The body of the story.</p>",
        "excerpt": "",
        "dek": "",
    }
    fields.update(overrides)
    return Mock(**fields)


class ReviewQueueTemplateTestCase(TestCase):
    """The queue shows the ISSUE an editor submitted, as one card.

    It used to render one card per story. An editor composes an issue as a
    unit and submits it in one click; twelve cards for a full issue meant
    twelve Approve clicks, each previewing its story as if it were the lead.
    Now: one card, one preview of the whole issue, one Approve, one Send back.
    """

    def _render(self, stories=(), authors=None):
        from app.services.ReviewQueue import pending_issue

        stories = list(stories)
        names = authors if authors is not None else {}
        with patch("app.services.ReviewQueue.author_names", return_value=names):
            issue = pending_issue(stories)
        return View.render(
            "gears/partials/review-queue",
            {
                "review_stories": stories,
                "review_authors": names,
                "review_count": len(stories),
                "review_issue": issue,
                # One entry per pending issue; a bare story list is one issue.
                "review_issues": [dict(issue, id=1, number=1, title="")] if issue else [],
            },
        ).rendered_template

    def test_renders_one_card_for_the_whole_issue(self):
        """Two submitted stories are two blocks of ONE issue, not two cards."""
        html = self._render([_story(1), _story(2)])
        # The card class, not the hook: `data-review-issue-id` contains
        # `data-review-issue` as a substring and would count twice.
        self.assertEqual(html.count("review-card--issue"), 1)
        self.assertNotIn("data-review-item", html)

    def test_card_carries_the_hooks_the_queue_js_reads(self):
        html = self._render([_story(7)])
        for hook in (
            "data-review-issue",
            "data-review-preview",
            "data-review-approve",
            "data-review-reject",
            "data-review-reason",
        ):
            self.assertIn(hook, html)

    def test_card_says_how_many_blocks_the_issue_holds(self):
        html = self._render([_story(1), _story(2), _story(3)])
        self.assertIn("3 blocks", html)

    def test_manifest_lists_each_filled_block_by_name(self):
        """An admin should see that the lead is there and the notice is not
        before opening the full preview."""
        html = self._render([
            _story(1, layout_type="lead"),
            _story(2, layout_type="brief"),
            _story(3, layout_type="brief"),
        ])
        self.assertIn("Lead story", html)
        self.assertIn("Side stories", html)
        self.assertNotIn("Notice</span>", html)

    def test_shows_who_submitted_the_issue(self):
        """The byline is the whole point of the attribution work — an admin
        approving an issue has to know whose it is."""
        html = self._render([_story(1, author_id=5)], authors={5: "Maria Santos"})
        self.assertIn("Maria Santos", html)

    def test_names_each_author_once_when_several_wrote_the_issue(self):
        html = self._render(
            [_story(1, author_id=5), _story(2, author_id=5), _story(3, author_id=6)],
            authors={5: "Maria Santos", 6: "Jose Cruz"},
        )
        self.assertEqual(html.count("Maria Santos"), 1)
        self.assertIn("Jose Cruz", html)

    def test_survives_an_author_whose_account_was_deleted(self):
        """author_id is ON DELETE SET NULL, so this row genuinely occurs."""
        html = self._render([_story(1, author_id=None)])
        self.assertIn("an unknown account", html)

    def test_empty_queue_says_so(self):
        html = self._render([])
        self.assertIn("Nothing is waiting for review", html)
        self.assertNotIn("data-review-issue", html)

    def test_reject_reason_box_exists(self):
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

    def test_the_news_panel_emits_its_composer_controls(self):
        """The server half of the dead-button bug.

        A composer control that stops being RENDERED produces exactly the same
        report from an editor as one whose listener never attached: "the button
        does nothing". tests/js/news-toolbar-scope.test.mjs pins the scoping
        half (every composer-scoped lookup resolves inside the composer); this
        pins that the markup is there to find at all.

        It used to assert `data-news-prev` / `data-news-next` / `data-news-bench`
        as well. Those are kiosk carousel hooks and a bench that this panel has
        never rendered, so the assertions could only ever fail -- and did. They
        are replaced here by the controls the composer genuinely depends on.
        """
        html = self._render_dashboard()

        for hook in (
            # The publish path. A missing one of these is an editor who cannot
            # file a story at all.
            "data-news-canvas-save",
            "data-news-save-draft",
            "data-news-form",
            # The editing surface the JS hard-returns without.
            "data-news-composer",
            "data-news-editor",
            # Adding and placing stories.
            "data-news-add-main",
            "data-news-add-secondary",
            "data-news-add-widget",
            "data-news-library-open",
        ):
            self.assertIn(hook, html, f"the news panel must render {hook}")

    def test_the_composer_canvas_renders_the_real_kiosk_issue(self):
        """The composer edits kiosk/_issue.html -- the SAME partial the kiosk
        page renders -- so an editor cannot arrange a layout the terminal does
        not print. That drift is what this rebuild existed to end, and a
        fallback to some other markup here would reintroduce it silently."""
        html = self._render_dashboard()

        # Chrome unique to the issue partial.
        self.assertIn("issue-masthead", html)
        self.assertIn("issue-colophon", html)
        # Editor hooks the canvas is inert without.
        for block in ("lead", "brief", "photo_essay", "editorial", "quote", "notice"):
            self.assertIn(f'data-news-slot-list="{block}"', html)
        # Every block renders its unfilled positions as typeable cards, so an
        # editor can write a newsletter with no stories in the library at all.
        self.assertNotIn("data-news-assign-slot", html)

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
