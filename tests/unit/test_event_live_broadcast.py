"""A new event tells the kiosk, because the calendar lives in the news embed.

`NewsController.show` -- the kiosk's /kiosk/embed/latest-news document --
renders `calendar_events` from `DashboardContext.upcoming_events()`. That
list is deliberately kept out of NewsCache, so there was nothing server-side
to invalidate; but the *terminal* still held the embed in sw-kiosk.js's
stale-while-revalidate cache. With no broadcast, nothing evicted it, and an
editor's new event first appeared on the visit after next.
"""

from unittest.mock import Mock, patch

from tests import TestCase
from tests.unit.test_news_endpoints import _mock_request, _mock_response

from app.controllers.gears.EventController import EventController


_VALID = {
    "title": "Foundation Day",
    "description": "Programme at the gym.",
    "event_date": "2026-10-20T09:00",
}


class EventLiveBroadcastTestCase(TestCase):
    def _store(self, inputs):
        with patch(
            "app.controllers.gears.EventController.Events.create",
            return_value=Mock(id=7),
        ), patch("app.controllers.gears.EventController.NewEvent"), patch(
            "app.services.KioskBroadcast.section_changed"
        ) as changed:
            EventController().store(_mock_request(inputs=inputs), _mock_response())
        return changed

    def test_store_broadcasts_latest_news(self):
        self._store(_VALID).assert_called_once_with("latest-news")

    def test_a_rejected_event_broadcasts_nothing(self):
        # Validation failed, nothing was written, so the kiosk has nothing to
        # re-fetch.
        self._store({**_VALID, "event_date": "not a date"}).assert_not_called()
