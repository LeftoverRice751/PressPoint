"""The editorial approval gate.

Before this, "Publish" was one click by one person straight onto a public campus
terminal. Now an editor's publish intent becomes `review` and stays invisible
until an admin acts on it.

The tests that matter most here are the privilege ones: the gate has to hold
against a hand-crafted POST, not just against the composer's buttons. A UI that
only *offers* "Submit for review" is not a gate — the form is just a form, and
anyone signed in can post `status=published` to the same endpoint.
"""

import pytest
from unittest import TestCase
from datetime import datetime, timedelta, timezone
from unittest.mock import Mock, patch

from app.controllers.gears.NewsController import (
    NewsController,
    _actor_is_admin,
    _normalize_news_status,
    _resolve_status_for_actor,
)
from app.controllers.gears.ReviewController import ReviewController
from app.services.Posts import CAMPUS_TZ
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
            "headline": "Sneaky",
            "body": "Body",
            "status": "published",
            "id": "",
            # A submission needs a photo, or it is refused before the gate matters.
            "image": Mock(extension=lambda: ".jpg", get_content=lambda: b"x"),
        }
        request = Mock()
        request.input.side_effect = lambda key, default="": inputs.get(key, default)
        request.header.return_value = None
        request.user.return_value = Mock(id=9, role="editor")
        storage = Mock()
        storage.disk.return_value.put_file.return_value = "news/x.jpg"

        with patch(
            "app.controllers.gears.NewsController.News.create",
            return_value=Mock(id=1, image=None),
        ) as create_mock, patch("app.controllers.gears.NewsController.Cache"), patch(
            "app.controllers.gears.NewsController.FileVerificationService.verify_buffer",
            return_value=True,
        ), patch("app.controllers.gears.NewsController.generate_variants"):
            controller.store(request, storage, _response())

        self.assertEqual(create_mock.call_args.kwargs["status"], "review")

    def test_store_records_the_author(self):
        controller = NewsController()
        inputs = {"headline": "Attributed", "body": "Body", "status": "draft", "id": "", "image": None}
        request = Mock()
        request.input.side_effect = lambda key, default="": inputs.get(key, default)
        request.header.return_value = None
        request.user.return_value = Mock(id=33, role="editor")

        with patch(
            "app.controllers.gears.NewsController.News.create",
            return_value=Mock(id=1, image=None),
        ) as create_mock, patch("app.controllers.gears.NewsController.Cache"):
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


class ApproveExpiryTestCase(TestCase):
    """Approval is the moment a post gets its kiosk lifetime."""

    def _story(self, expires_at=None):
        record = Mock(id=11, status="review", title="Campus story", author_id=5)
        record.rejection_reason = None
        record.expires_at = expires_at
        record.published_at = None
        record.save = Mock()
        return record

    def _approve(self, record, inputs=None):
        request = _request(role="admin", params={"id": "11"}, inputs=inputs or {})
        response = _response()
        with patch("app.controllers.gears.ReviewController.News.where") as where_mock, patch(
            "app.controllers.gears.ReviewController.Cache"
        ), patch("app.controllers.gears.ReviewController.Notifications"):
            where_mock.return_value.first.return_value = record
            ReviewController().approve(request, response)
        return response

    def test_no_expiry_anywhere_stores_published_at_plus_seven_days(self):
        record = self._story()
        response = self._approve(record)

        self.assertTrue(_body(response)["ok"])
        self.assertIsNotNone(record.published_at.tzinfo, "published_at must be aware-UTC")
        self.assertEqual(record.expires_at, record.published_at + timedelta(days=7))

    def test_a_future_stored_expiry_is_kept(self):
        kept = datetime.now(timezone.utc) + timedelta(days=2)
        record = self._story(expires_at=kept)
        self._approve(record)

        self.assertEqual(record.status, "published")
        self.assertEqual(record.expires_at, kept)

    def test_a_past_stored_expiry_without_an_override_is_refused(self):
        record = self._story(expires_at=datetime.now(timezone.utc) - timedelta(hours=1))
        response = self._approve(record)

        self.assertEqual(_status(response), 422)
        self.assertIn(
            "This post's expiry has passed. Set a new expiry to approve it.",
            _body(response)["errors"],
        )
        record.save.assert_not_called()
        self.assertEqual(record.status, "review")

    def test_an_override_replaces_a_past_stored_expiry(self):
        record = self._story(expires_at=datetime.now(timezone.utc) - timedelta(hours=1))
        future = datetime.now(CAMPUS_TZ) + timedelta(days=3)
        response = self._approve(record, {"expires_at": future.strftime("%Y-%m-%dT%H:%M")})

        self.assertTrue(_body(response)["ok"])
        self.assertEqual(record.status, "published")
        self.assertEqual(record.expires_at.strftime("%Y-%m-%dT%H:%M"),
                         future.astimezone(timezone.utc).strftime("%Y-%m-%dT%H:%M"))

    def test_an_unparseable_override_is_a_422_with_the_reason(self):
        record = self._story()
        response = self._approve(record, {"expires_at": "tomorrow"})

        self.assertEqual(_status(response), 422)
        self.assertIn("Pick a valid expiry date and time", _body(response)["errors"])
        record.save.assert_not_called()

    def test_a_past_override_is_a_422(self):
        record = self._story()
        response = self._approve(record, {"expires_at": "2020-01-01T00:00"})

        self.assertEqual(_status(response), 422)
        self.assertIn("Pick an expiry in the future", _body(response)["errors"])

    def test_the_stored_expiry_is_never_assigned_none(self):
        """masonite-orm turns None on a __dates__ column into now(), which would
        expire the post the instant it is approved."""
        writes = []

        class Record:
            id = 11
            status = "review"
            title = "Campus story"
            author_id = 5
            rejection_reason = None
            published_at = None

            def __setattr__(self, name, value):
                if name == "expires_at":
                    writes.append(value)
                object.__setattr__(self, name, value)

            def save(self):
                pass

        record = Record()
        self._approve(record)
        self.assertEqual(len(writes), 1)
        self.assertIsInstance(writes[0], datetime)


class PostReviewPreviewTestCase(TestCase):
    def test_preview_context_is_the_post_card_projection(self):
        from app.services.ReviewQueue import preview_context

        story = Mock(id=3, title="Headline", description="Body", image=None, kicker="K",
                     logo_path=None, image_crop=None, source_lines=None, status="review",
                     expires_at=None, published_at=None, created_at=None)
        with patch("app.services.ReviewQueue.Posts.card_context",
                   return_value={"headline": "Headline"}) as card:
            context = preview_context(story)
        card.assert_called_once()
        self.assertEqual(context["card"], {"headline": "Headline"})
        self.assertFalse(context["post_editor"])

    def test_expiry_input_is_campus_local_and_empty_when_unset(self):
        from app.services.ReviewQueue import expiry_input

        self.assertEqual(expiry_input(Mock(expires_at=None)), "")
        utc = datetime(2026, 12, 1, 4, 30, tzinfo=timezone.utc)
        self.assertEqual(expiry_input(Mock(expires_at=utc)), "2026-12-01T12:30")

    def test_queue_context_lists_one_row_per_pending_post(self):
        from app.services.ReviewQueue import review_context

        rows = [
            Mock(id=1, status="review", title="One", author_id=5, kicker="", expires_at=None),
            Mock(id=2, status="review", title="Two", author_id=6, kicker="", expires_at=None),
            Mock(id=3, status="draft", title="Three", author_id=6),
        ]
        with patch("app.services.ReviewQueue.News") as news_mock, patch(
            "app.services.ReviewQueue.author_names", return_value={5: "John", 6: "Ana"}
        ):
            news_mock.all.return_value = rows
            ctx = review_context()

        self.assertEqual([p["id"] for p in ctx["review_posts"]], [1, 2])
        self.assertEqual(ctx["review_posts"][0]["author"], "John")
        self.assertEqual(ctx["review_count"], 2)
        self.assertNotIn("review_issues", ctx)


class PublicGateFailsClosedTestCase(TestCase):
    def test_a_row_with_no_status_is_not_public(self):
        from app.controllers.gears.NewsController import _news_is_public

        self.assertFalse(_news_is_public(Mock(status=None, expires_at=None)))

    def test_a_row_with_an_unknown_status_is_not_public(self):
        from app.controllers.gears.NewsController import _news_is_public

        self.assertFalse(_news_is_public(Mock(status="weird", expires_at=None)))

    def test_a_published_row_still_is(self):
        from app.controllers.gears.NewsController import _news_is_public

        self.assertTrue(_news_is_public(Mock(status="published", expires_at=None)))


from tests import TestCase as _AppTestCase  # noqa: E402  (needs the container; the rest of this file does not)

pytestmark = pytest.mark.usefixtures("actor_may_change_any_story", "preview_already_read")


class ReviewRoutesResolveTestCase(_AppTestCase):
    """The newsletter's issue-level review is gone; only per-post routes remain.
    Resolved through the real router, which is the only place route order and
    existence are visible."""

    def test_issue_urls_no_longer_resolve(self):
        router = self.application.make("router")
        for url, method in (
            ("/gears/review/issue/5/preview", "GET"),
            ("/gears/review/issue/5/approve", "POST"),
            ("/gears/review/issue/5/reject", "POST"),
        ):
            self.assertIsNone(router.find(url, method), url)

    def test_post_urls_reach_the_post_actions(self):
        router = self.application.make("router")
        route = router.find("/gears/review/42/approve", "POST")
        self.assertIn("ReviewController@approve", str(route.controller))
