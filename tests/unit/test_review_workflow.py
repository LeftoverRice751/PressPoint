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
            "layout_type": "secondary",
            "status": "published",
            "priority": "3",
            "article_id": "",
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
            "layout_type": "secondary",
            "status": "draft",
            "priority": "1",
            "article_id": "",
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
