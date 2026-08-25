"""The kiosk flash ticker must honour the same visibility gate as the front page.

`/kiosk/flash-updates` is public and unauthenticated, and it emits the story's
headline AND its full body. Before this gate it iterated `News.all()` filtered
only by recency, so anything saved in the last 24 hours — a half-written draft,
a story sitting in an admin's review queue — broadcast itself to the campus
terminal. That made the review workflow decorative: a story could reach the
screen through the ticker without ever having been approved.
"""

from datetime import datetime, timedelta
from unittest import TestCase
from unittest.mock import Mock, patch

from app.controllers.kiosk.WelcomeController import WelcomeController


def _story(title, status, **extra):
    """A News row recent enough to clear the ticker's 24-hour window, so that
    status is the only thing that can keep it out."""
    return Mock(
        title=title,
        status=status,
        description=f"<p>Body of {title}</p>",
        published_at=None,
        created_at=datetime.now() - timedelta(hours=1),
        **extra,
    )


class FlashTickerStatusFilterTestCase(TestCase):
    def _headlines(self, stories):
        controller = WelcomeController()
        with patch(
            "app.controllers.kiosk.WelcomeController.News"
        ) as news_mock, patch(
            "app.controllers.kiosk.WelcomeController.Events"
        ) as events_mock:
            news_mock.all.return_value = stories
            events_mock.all.return_value = []
            return [item["headline"] for item in controller._build_flash_articles()]

    def test_draft_story_never_reaches_the_public_ticker(self):
        self.assertEqual(self._headlines([_story("Half written", "draft")]), [])

    def test_story_awaiting_review_never_reaches_the_public_ticker(self):
        """The whole point of the approval gate: an editor's submission is not
        public until an admin says so."""
        self.assertEqual(self._headlines([_story("Awaiting approval", "review")]), [])

    def test_archived_story_never_reaches_the_public_ticker(self):
        self.assertEqual(self._headlines([_story("Old news", "archived")]), [])

    def test_published_story_still_reaches_the_ticker(self):
        """The gate must not empty the ticker — approved work still shows."""
        self.assertEqual(
            self._headlines([_story("Real headline", "published")]),
            ["Real headline"],
        )

    def test_approved_story_still_reaches_the_ticker(self):
        self.assertEqual(
            self._headlines([_story("Approved headline", "approved")]),
            ["Approved headline"],
        )

    def test_mixed_batch_lets_only_the_public_ones_through(self):
        headlines = self._headlines([
            _story("Draft", "draft"),
            _story("Published", "published"),
            _story("In review", "review"),
        ])
        self.assertEqual(headlines, ["Published"])

    def test_future_scheduled_story_is_withheld_until_its_date(self):
        """`scheduled` is a visible status only once published_at has passed —
        the ticker must respect that, not just the status name."""
        story = _story("Embargoed", "scheduled")
        story.published_at = datetime.now() + timedelta(days=2)
        self.assertEqual(self._headlines([story]), [])
