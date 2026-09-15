"""The kiosk prints today's paper, not the whole back catalogue.

NewsController._build_news_payload() used to page through EVERY issue that
had a public story -- Issue 03, Issue 02, Issue 01, forever. Latest News is a
daily, so the payload now comes from Issues.current_issues(), which drops an
issue at 08:00 the morning after it was approved (tests/unit/
test_issues_service.py pins the clock rules). This file pins only the wiring:
that the controller reads the expiring cut, not the archive.
"""

from datetime import datetime
from unittest.mock import Mock, patch

from tests import TestCase

from app.controllers.gears.NewsController import NewsController
from app.services import Issues


def _issue(issue_id, published_at, *stories):
    issue = Mock(id=issue_id, number=issue_id, title="", published_at=published_at)
    issue.stories = list(stories)
    return issue


def _story(story_id, issue_id):
    return Mock(
        id=story_id,
        issue_id=issue_id,
        status="published",
        published_at=None,
        title="T",
        description="<p>b</p>",
        layout_type="brief",
        priority=1,
        image_path=None,
        category_id=None,
        created_at=datetime(2026, 9, 15, 10, 0),
        updated_at=None,
    )


class KioskPayloadExpiryTestCase(TestCase):
    def test_payload_is_built_from_the_expiring_cut_not_the_archive(self):
        today = _issue(2, datetime(2026, 9, 15, 10, 0), _story(20, 2))
        last_week = _issue(1, datetime(2026, 9, 8, 10, 0), _story(10, 1))
        with patch.object(
            Issues, "published_issues", return_value=[today, last_week]
        ), patch.object(Issues, "campus_now", return_value=datetime(2026, 9, 15, 12, 0)), patch(
            "app.controllers.gears.NewsController.issue_identity_of",
            return_value={"issue_vol": None, "issue_no": None},
        ):
            payload = NewsController()._build_news_payload()
        self.assertEqual([i["id"] for i in payload["issues"]], [2])
