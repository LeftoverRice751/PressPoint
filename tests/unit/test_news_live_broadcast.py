"""Every write that forgets the kiosk news cache also tells the kiosk.

The cache-forget and the broadcast are the same fact ("what the kiosk shows
is stale") delivered to two consumers. A site that forgets but does not
broadcast leaves the terminal correct only after its next manual reload,
which is the exact bug this feature exists to remove.

The request/response helpers are borrowed from the suites that already drive
these endpoints, so a change to how they are mocked lands in one place.
"""

import pytest
from unittest import TestCase
from unittest.mock import Mock, patch

from app.controllers.gears.NewsController import NewsController
from app.controllers.gears.ReviewController import ReviewController
from tests.unit.news_doubles import _mock_request, _mock_response, _where_side_effect
from tests.unit.test_review_workflow import _request, _response

pytestmark = pytest.mark.usefixtures("actor_may_change_any_story", "preview_already_read")


class ReviewBroadcastTestCase(TestCase):
    def _story(self, status="review"):
        record = Mock(id=11, status=status, title="Campus story", author_id=5)
        record.rejection_reason = None
        record.save = Mock()
        return record

    def _run(self, method, record, request):
        response = _response()
        with patch(
            "app.controllers.gears.ReviewController.News.where"
        ) as where_mock, patch("app.controllers.gears.ReviewController.Cache"), patch(
            "app.controllers.gears.ReviewController.Notifications"
        ), patch(
            "app.controllers.gears.ReviewController.KioskBroadcast.section_changed"
        ) as changed:
            where_mock.return_value.first.return_value = record
            getattr(ReviewController(), method)(request, response)
        return changed

    def test_approve_broadcasts_latest_news(self):
        # Approval is the moment a story becomes publicly visible, so this is
        # the single most consequential site in the feature.
        changed = self._run("approve", self._story(), _request(role="admin", params={"id": "11"}))
        changed.assert_called_once_with("latest-news")

    def test_reject_broadcasts_latest_news(self):
        changed = self._run(
            "reject",
            self._story(),
            _request(role="admin", params={"id": "11"}, inputs={"reason": "Needs a source."}),
        )
        changed.assert_called_once_with("latest-news")

    def test_a_refused_decision_broadcasts_nothing(self):
        # Already decided by somebody else: nothing changed, so the kiosk is
        # not told to re-fetch.
        changed = self._run(
            "approve", self._story(status="published"), _request(role="admin", params={"id": "11"})
        )
        changed.assert_not_called()


class NewsControllerBroadcastTestCase(TestCase):
    def test_destroy_broadcasts_latest_news(self):
        record = Mock(id=42, image=None)
        request = _mock_request(params={"id": "42"})
        response = _mock_response()
        queries = []

        def where(field, value):
            query = _where_side_effect({42: record})(field, value)
            queries.append(query)
            return query

        with patch("app.controllers.gears.NewsController.News.where", side_effect=where), patch(
            "app.controllers.gears.NewsController.Cache"
        ), patch(
            "app.controllers.gears.NewsController.KioskBroadcast.section_changed"
        ) as changed:
            NewsController().destroy(request, response)

        # Posts are hard-deleted, so the row goes through force_delete on the query.
        self.assertTrue(any(q.force_delete.called for q in queries))
        changed.assert_called_once_with("latest-news")
