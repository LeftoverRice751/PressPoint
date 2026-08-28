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
        """Drive the ticker through the windowed query it actually issues.

        `_recent_rows()` narrows the scan to roughly the last day before the
        status gate runs, so the stub has to answer `where_raw(...).get()`
        rather than `all()`. Note that a bare MagicMock *is* iterable and
        yields nothing, so forgetting to set this returns an empty ticker that
        looks like a passing status filter -- which is why every "still reaches
        the ticker" case below matters.
        """
        controller = WelcomeController()
        with patch(
            "app.controllers.kiosk.WelcomeController.News"
        ) as news_mock, patch(
            "app.controllers.kiosk.WelcomeController.Events"
        ) as events_mock:
            news_mock.where_raw.return_value.get.return_value = stories
            events_mock.where_raw.return_value.get.return_value = []
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


class FlashTickerQueryWindowTestCase(TestCase):
    """The 24h window is now partly pushed into SQL; it must stay a pure
    optimisation. `/kiosk/flash-updates` is public and polled by the kiosk, and
    it used to load every story ever written -- full HTML body included -- to
    keep the few from yesterday."""

    def test_it_does_not_load_the_whole_table(self):
        controller = WelcomeController()
        with patch(
            "app.controllers.kiosk.WelcomeController.News"
        ) as news_mock, patch(
            "app.controllers.kiosk.WelcomeController.Events"
        ) as events_mock:
            news_mock.where_raw.return_value.get.return_value = []
            events_mock.where_raw.return_value.get.return_value = []
            controller._build_flash_articles()

            news_mock.all.assert_not_called()
            events_mock.all.assert_not_called()

    def test_the_window_brackets_the_tickers_own_recency_gate(self):
        # The SQL bounds must be a strict superset of what _is_recent() keeps,
        # or a story the ticker should show gets filtered out before the gate
        # ever sees it. The two columns disagree on timezone -- created_at is
        # UTC-aware, events.event_date is a naive local date -- hence a margin.
        controller = WelcomeController()
        start, end = controller._recent_window()

        now = datetime.utcnow()
        self.assertLess(
            datetime.strptime(start, "%Y-%m-%d %H:%M:%S"),
            now - timedelta(days=1),
            "window starts after the oldest article _is_recent() accepts",
        )
        self.assertGreater(
            datetime.strptime(end, "%Y-%m-%d %H:%M:%S"),
            now,
            "window ends before now, so a just-published story would be missed",
        )

    def test_a_rejected_predicate_falls_back_to_the_full_read(self):
        # A ticker that renders nothing is indistinguishable from a quiet news
        # day, so a driver that refuses the COALESCE must degrade loudly-ish
        # rather than silently return an empty list.
        controller = WelcomeController()
        story = _story("Real headline", "published")

        with patch(
            "app.controllers.kiosk.WelcomeController.News"
        ) as news_mock, patch(
            "app.controllers.kiosk.WelcomeController.Events"
        ) as events_mock:
            news_mock.where_raw.side_effect = Exception("unsupported predicate")
            news_mock.all.return_value = [story]
            events_mock.where_raw.return_value.get.return_value = []

            headlines = [
                item["headline"] for item in controller._build_flash_articles()
            ]

        self.assertEqual(headlines, ["Real headline"])
