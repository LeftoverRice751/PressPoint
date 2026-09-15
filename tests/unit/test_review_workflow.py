"""The editorial approval gate.

Before this, "Publish" was one click by one person straight onto a public campus
terminal. Now an editor's publish intent becomes `review` and stays invisible
until an admin acts on it.

The tests that matter most here are the privilege ones: the gate has to hold
against a hand-crafted POST, not just against the composer's buttons. A UI that
only *offers* "Submit for review" is not a gate — the form is just a form, and
anyone signed in can post `status=published` to the same endpoint.
"""

from unittest import TestCase
from datetime import datetime, timezone
from unittest.mock import Mock, patch

from app.controllers.gears.NewsController import (
    NewsController,
    _actor_is_admin,
    _normalize_news_status,
    _resolve_status_for_actor,
)
from app.controllers.gears.ReviewController import ReviewController
from app.services.ReviewQueue import pending_stories


def _request(role=None, user_id=7, inputs=None, params=None, ajax=True):
    inputs = inputs or {}
    params = params or {}
    request = Mock()
    request.input.side_effect = lambda key, default="": inputs.get(key, default)
    request.param.side_effect = lambda key, default="": params.get(key, default)
    request.header.side_effect = (
        (lambda name: "XMLHttpRequest" if name == "X-Requested-With" else None)
        if ajax
        else (lambda name: None)
    )
    request.user.return_value = Mock(id=user_id, role=role) if role else None
    return request


def _response():
    response = Mock()
    redirect = Mock()
    redirect.with_success.return_value = "redirected"
    redirect.with_errors.return_value = "redirected-with-errors"
    response.redirect.return_value = redirect
    response.back.return_value = redirect
    return response


def _body(response):
    return response.json.call_args[0][0]


def _status(response):
    return response.json.call_args[1]["status"]


class FailClosedStatusTestCase(TestCase):
    def test_missing_status_resolves_to_draft_not_approved(self):
        """The old default was "approved", which is publicly visible — so a
        request that simply omitted `status` published to the kiosk."""
        self.assertEqual(_normalize_news_status(None), "draft")
        self.assertEqual(_normalize_news_status(""), "draft")

    def test_unrecognised_status_resolves_to_draft(self):
        self.assertEqual(_normalize_news_status("banana"), "draft")

    def test_known_statuses_still_resolve_normally(self):
        self.assertEqual(_normalize_news_status("published"), "published")
        self.assertEqual(_normalize_news_status("pending"), "review")


class PrivilegeTestCase(TestCase):
    def setUp(self):
        super().setUp()
        # store() now requires a category and validates it against a LIVE row.
        # Patched rather than seeded because these tests never touch the
        # database — the real find_live swallows the connection error and
        # returns None, which would fail the request before store() runs.
        patcher = patch(
            "app.controllers.gears.NewsController.NewsCategories.find_live",
            return_value=Mock(id=1, name="Campus News"),
        )
        self.addCleanup(patcher.stop)
        patcher.start()

    def test_editor_publish_intent_is_downgraded_to_review(self):
        """The gate, stated directly."""
        request = _request(role="editor")
        self.assertEqual(_resolve_status_for_actor("published", request), "review")
        self.assertEqual(_resolve_status_for_actor("approved", request), "review")
        self.assertEqual(_resolve_status_for_actor("scheduled", request), "review")

    def test_admin_may_publish_directly(self):
        request = _request(role="admin")
        self.assertEqual(_resolve_status_for_actor("published", request), "published")

    def test_superadmin_is_not_an_editorial_approver(self):
        """Superadmin manages accounts, not the front page. Their publish is
        downgraded like anyone else's."""
        request = _request(role="superadmin")
        self.assertEqual(_resolve_status_for_actor("published", request), "review")

    def test_role_matching_tolerates_the_casing_in_the_live_column(self):
        """The live `role` column holds values with stray casing — every other
        role check in the app normalises, so this one must too."""
        self.assertTrue(_actor_is_admin(_request(role="  Admin ")))
        self.assertTrue(_actor_is_admin(_request(role="ADMIN")))

    def test_anonymous_request_cannot_publish(self):
        self.assertEqual(_resolve_status_for_actor("published", _request()), "review")

    def test_draft_is_not_promoted_to_review(self):
        """Saving a draft is not submitting it. Silently promoting every save
        would fill the admin's queue with half-written stories."""
        self.assertEqual(_resolve_status_for_actor("draft", _request(role="editor")), "draft")

    def test_editor_posting_published_by_hand_still_lands_in_review(self):
        """End-to-end through store(): the gate is server-side, so bypassing
        the UI does not bypass it."""
        controller = NewsController()
        inputs = {
            "title": "Sneaky",
            "description": "<p>Body</p>",
            "layout_type": "brief",
            "status": "published",
            "priority": "3",
            "article_id": "",
            "category_id": "1",
            "image": None,
            "published_at": "",
        }
        request = Mock()
        request.input.side_effect = lambda key, default="": inputs.get(key, default)
        request.header.return_value = None
        request.user.return_value = Mock(id=9, role="editor")

        with patch(
            "app.controllers.gears.NewsController.News.create",
            return_value=Mock(id=1, image=None),
        ) as create_mock, patch(
            "app.controllers.gears.NewsController.NewNews"
        ), patch("app.controllers.gears.NewsController.Cache"):
            controller.store(request, Mock(), _response())

        self.assertEqual(create_mock.call_args.kwargs["status"], "review")

    def test_store_records_the_author(self):
        controller = NewsController()
        inputs = {
            "title": "Attributed",
            "description": "<p>Body</p>",
            "layout_type": "brief",
            "status": "draft",
            "priority": "1",
            "article_id": "",
            "category_id": "1",
            "image": None,
            "published_at": "",
        }
        request = Mock()
        request.input.side_effect = lambda key, default="": inputs.get(key, default)
        request.header.return_value = None
        request.user.return_value = Mock(id=33, role="editor")

        with patch(
            "app.controllers.gears.NewsController.News.create",
            return_value=Mock(id=1, image=None),
        ) as create_mock, patch(
            "app.controllers.gears.NewsController.NewNews"
        ), patch("app.controllers.gears.NewsController.Cache"):
            controller.store(request, Mock(), _response())

        self.assertEqual(create_mock.call_args.kwargs["author_id"], 33)
        self.assertEqual(create_mock.call_args.kwargs["updated_by_id"], 33)


class ReviewQueueTestCase(TestCase):
    def test_queue_holds_only_submitted_stories(self):
        rows = [
            Mock(id=1, status="draft"),
            Mock(id=2, status="review"),
            Mock(id=3, status="published"),
            Mock(id=4, status="review"),
        ]
        with patch("app.services.ReviewQueue.News") as news_mock:
            news_mock.all.return_value = rows
            self.assertEqual([s.id for s in pending_stories()], [2, 4])

    def test_queue_is_oldest_first(self):
        """A work queue, not a feed: the story waiting longest comes first."""
        rows = [Mock(id=9, status="review"), Mock(id=2, status="review")]
        with patch("app.services.ReviewQueue.News") as news_mock:
            news_mock.all.return_value = rows
            self.assertEqual([s.id for s in pending_stories()], [2, 9])


class ApproveRejectTestCase(TestCase):
    def _story(self, status="review", author_id=5):
        record = Mock(id=11, status=status, title="Campus story", author_id=author_id)
        record.rejection_reason = "old reason"
        record.save = Mock()
        return record

    def _run(self, method, record, request):
        response = _response()
        with patch(
            "app.controllers.gears.ReviewController.News.where"
        ) as where_mock, patch(
            "app.controllers.gears.ReviewController.Cache"
        ) as cache_mock, patch(
            "app.controllers.gears.ReviewController.Notifications"
        ) as notify_mock:
            where_mock.return_value.first.return_value = record
            getattr(ReviewController(), method)(request, response)
        return response, cache_mock, notify_mock

    def test_approve_publishes_and_clears_any_previous_reason(self):
        record = self._story()
        request = _request(role="admin", params={"id": "11"})
        response, cache_mock, notify_mock = self._run("approve", record, request)

        self.assertEqual(record.status, "published")
        self.assertIsNone(record.rejection_reason)
        record.save.assert_called_once()
        cache_mock.forget.assert_called_once()
        self.assertTrue(_body(response)["ok"])

    def test_approve_notifies_the_author(self):
        record = self._story(author_id=77)
        request = _request(role="admin", params={"id": "11"})
        _, _, notify_mock = self._run("approve", record, request)

        notify_mock.notify.assert_called_once()
        self.assertEqual(notify_mock.notify.call_args[0][0], 77)
        self.assertEqual(notify_mock.notify.call_args[0][1], "news.approved")

    def test_reject_requires_a_reason(self):
        """An editor told only "rejected" has nothing to act on."""
        record = self._story()
        request = _request(role="admin", params={"id": "11"}, inputs={"reason": "   "})
        response, cache_mock, _ = self._run("reject", record, request)

        record.save.assert_not_called()
        cache_mock.forget.assert_not_called()
        self.assertFalse(_body(response)["ok"])

    def test_reject_sends_the_story_back_to_draft_with_the_reason(self):
        record = self._story()
        request = _request(
            role="admin", params={"id": "11"}, inputs={"reason": "Needs a source."}
        )
        response, _, notify_mock = self._run("reject", record, request)

        self.assertEqual(record.status, "draft")
        self.assertEqual(record.rejection_reason, "Needs a source.")
        self.assertTrue(_body(response)["ok"])
        # The reason has to reach the editor, not just the database.
        self.assertEqual(notify_mock.notify.call_args[0][3], "Needs a source.")

    def test_editor_cannot_approve(self):
        """Defence in depth: the route carries the admin middleware, but the
        cost of that being dropped in a refactor is an editor publishing to a
        public screen."""
        record = self._story()
        request = _request(role="editor", params={"id": "11"})
        response, _, _ = self._run("approve", record, request)

        record.save.assert_not_called()
        self.assertEqual(_status(response), 403)

    def test_already_decided_story_is_refused(self):
        """Two admins with the queue open must not both decide. The second one
        is told, rather than silently overwriting the first one's rejection."""
        record = self._story(status="published")
        request = _request(role="admin", params={"id": "11"})
        response, _, _ = self._run("approve", record, request)

        record.save.assert_not_called()
        self.assertEqual(_status(response), 409)

    def test_missing_story_is_404(self):
        request = _request(role="admin", params={"id": "999"})
        response, _, _ = self._run("approve", None, request)
        self.assertEqual(_status(response), 404)


class IssueLevelReviewTestCase(TestCase):
    """The admin reviews an ISSUE, not twelve stories.

    An editor composes an issue as one unit and submits it in one click. It
    used to arrive at the admin as N unrelated submissions -- one queue row and
    one Approve per block, with each preview shoving the story into the lead
    slot regardless of what it was. A fully-filled issue is twelve blocks, so
    that was twelve clicks and twelve misleading previews.

    All-or-nothing by decision: one Approve publishes every pending block, one
    Reject sends every pending block back with one reason.
    """

    def _pending(self, n=3):
        rows = []
        for i in range(n):
            r = Mock(id=100 + i, status="review", title=f"Block {i}", author_id=5,
                     layout_type=["lead", "brief", "quote"][i % 3])
            r.rejection_reason = "old"
            r.save = Mock()
            rows.append(r)
        return rows

    def _run(self, method, rows, request):
        response = _response()
        with patch(
            "app.controllers.gears.ReviewController.pending_stories", return_value=rows
        ), patch(
            "app.controllers.gears.ReviewController.Cache"
        ) as cache_mock, patch(
            "app.controllers.gears.ReviewController.Notifications"
        ) as notify_mock:
            getattr(ReviewController(), method)(request, response)
        return response, cache_mock, notify_mock

    def test_approve_issue_publishes_every_pending_block(self):
        rows = self._pending(3)
        request = _request(role="admin")
        response, cache_mock, _ = self._run("approve_issue", rows, request)

        for r in rows:
            self.assertEqual(r.status, "published")
            self.assertIsNone(r.rejection_reason)
            r.save.assert_called_once()
        self.assertTrue(_body(response)["ok"])
        # Once, not once per block: the kiosk cache is one thing.
        cache_mock.forget.assert_called_once()

    def test_approve_stamps_the_issue_published_now_in_utc(self):
        """Approval IS publication for a daily paper, so the stamp is taken
        on every approve -- a resubmitted issue is today's paper, not the
        paper of the day it was first approved. UTC-aware, because the ORM
        tags a naive datetime as UTC without shifting it (created_at is true
        UTC from pendulum) and Issues.expires_at() converts from UTC."""
        rows = self._pending(2)
        for r in rows:
            r.issue_id = 5
        issue = Mock(id=5, published_at=datetime(2026, 9, 1, 0, 0))
        issue.save = Mock()
        request = _request(role="admin", params={"id": "5"})
        response = _response()
        before = datetime.now(timezone.utc)
        with patch(
            "app.controllers.gears.ReviewController.review_stories_of", return_value=rows
        ), patch("app.models.Issue.Issue.where") as where, patch(
            "app.controllers.gears.ReviewController.Cache"
        ), patch("app.controllers.gears.ReviewController.Notifications"):
            where.return_value.first.return_value = issue
            ReviewController().approve_issue(request, response)
        self.assertTrue(_body(response)["ok"])
        stamped = issue.published_at
        self.assertIsNotNone(stamped.tzinfo, "must be timezone-aware")
        self.assertEqual(stamped.utcoffset().total_seconds(), 0)
        self.assertGreaterEqual(stamped, before)
        issue.save.assert_called_once()

    def test_approve_issue_notifies_each_author_once(self):
        """Three blocks by the same editor is one issue and one notification,
        not three bell entries saying the same thing."""
        rows = self._pending(3)
        request = _request(role="admin")
        _, _, notify_mock = self._run("approve_issue", rows, request)

        self.assertEqual(notify_mock.notify.call_count, 1)
        self.assertEqual(notify_mock.notify.call_args[0][0], 5)
        self.assertEqual(notify_mock.notify.call_args[0][1], "news.approved")

    def test_reject_issue_requires_a_reason(self):
        rows = self._pending(2)
        request = _request(role="admin", inputs={"reason": "  "})
        response, cache_mock, _ = self._run("reject_issue", rows, request)

        for r in rows:
            r.save.assert_not_called()
        cache_mock.forget.assert_not_called()
        self.assertFalse(_body(response)["ok"])

    def test_reject_issue_sends_every_block_back_with_the_one_reason(self):
        rows = self._pending(2)
        request = _request(role="admin", inputs={"reason": "Headlines need work."})
        response, _, notify_mock = self._run("reject_issue", rows, request)

        for r in rows:
            self.assertEqual(r.status, "draft")
            self.assertEqual(r.rejection_reason, "Headlines need work.")
        self.assertTrue(_body(response)["ok"])
        self.assertEqual(notify_mock.notify.call_args[0][3], "Headlines need work.")

    def test_editor_cannot_approve_an_issue(self):
        rows = self._pending(1)
        request = _request(role="editor")
        response, cache_mock, _ = self._run("approve_issue", rows, request)

        rows[0].save.assert_not_called()
        cache_mock.forget.assert_not_called()
        self.assertFalse(_body(response)["ok"])

    def test_nothing_pending_is_refused_not_a_silent_success(self):
        request = _request(role="admin")
        response, cache_mock, _ = self._run("approve_issue", [], request)

        self.assertFalse(_body(response)["ok"])
        cache_mock.forget.assert_not_called()


class IssuePreviewTestCase(TestCase):
    """The preview shows the issue as the kiosk will print it, every block in
    its own place -- not one story forced into the lead slot."""

    def test_preview_puts_each_pending_block_where_it_belongs(self):
        from app.services.ReviewQueue import issue_preview_context

        lead = Mock(id=1, layout_type="lead", status="review", priority=0)
        brief = Mock(id=2, layout_type="brief", status="review", priority=1)
        quote = Mock(id=3, layout_type="quote", status="review", priority=2)

        ctx = issue_preview_context([lead, brief, quote])

        self.assertIs(ctx["blocks"]["lead"][0], lead)
        self.assertIs(ctx["blocks"]["brief"][0], brief)
        self.assertIs(ctx["blocks"]["quote"][0], quote)
        self.assertFalse(ctx["news_editor"])

    def test_queue_context_describes_the_issue_not_the_rows(self):
        from app.services.ReviewQueue import review_context

        rows = [
            Mock(id=1, status="review", layout_type="lead", author_id=5),
            Mock(id=2, status="review", layout_type="brief", author_id=5),
            Mock(id=3, status="review", layout_type="brief", author_id=5),
        ]
        pending = Mock(id=1, number=3, title="")
        pending.stories = rows
        with patch("app.services.ReviewQueue.News") as news_mock, patch(
            "app.services.ReviewQueue.author_names", return_value={5: "John"}
        ), patch("app.services.ReviewQueue.Issues.pending_issues", return_value=[pending]):
            news_mock.all.return_value = rows
            ctx = review_context()

        self.assertEqual(len(ctx["review_issues"]), 1)
        issue = ctx["review_issues"][0]
        self.assertEqual(issue["number"], 3)
        self.assertEqual(issue["block_count"], 3)
        self.assertEqual(issue["blocks"]["brief"], 2)
        self.assertEqual(issue["blocks"]["lead"], 1)
        self.assertEqual(issue["authors"], ["John"])


from tests import TestCase as _AppTestCase  # noqa: E402  (needs the container; the rest of this file does not)


class IssueRoutesResolveTestCase(_AppTestCase):
    """`@id` matches any segment, so the issue routes have to be declared
    BEFORE the per-story ones or "/gears/review/issue/approve" resolves to
    approve(id="issue"). This resolves through the real router, which is the
    only place that ordering is visible -- calling the controller directly, as
    the tests above do, can never catch it."""

    def test_issue_urls_reach_the_issue_actions_not_the_story_ones(self):
        router = self.application.make("router")
        for url, method, expected in (
            ("/gears/review/issue/5/preview", "GET", "preview_issue"),
            ("/gears/review/issue/5/approve", "POST", "approve_issue"),
            ("/gears/review/issue/5/reject", "POST", "reject_issue"),
        ):
            route = router.find(url, method)
            self.assertIsNotNone(route, url)
            self.assertIn(expected, str(route.controller), f"{url} resolved to {route.controller}")

    def test_story_urls_still_reach_the_story_actions(self):
        router = self.application.make("router")
        route = router.find("/gears/review/42/approve", "POST")
        self.assertIn("ReviewController@approve", str(route.controller))
        self.assertNotIn("approve_issue", str(route.controller))
