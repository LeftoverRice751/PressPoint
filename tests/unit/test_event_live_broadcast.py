"""Saving an event no longer tells the kiosk to reload Latest News.

The calendar used to ride in the news embed (a newsletter chose its dates), so a
new event had to evict the terminal's stale-while-revalidate copy of it. Posts
carry no calendar, so the broadcast would only reload a page that cannot have
changed.
"""

from unittest.mock import Mock, patch

from tests import TestCase
from tests.unit.news_doubles import _mock_request, _mock_response

from app.controllers.gears.EventController import EventController


_VALID = {
    "title": "Foundation Day",
    "description": "Programme at the gym.",
    "event_date": "2026-10-20T09:00",
}


class EventNoBroadcastTestCase(TestCase):
    def _store(self, inputs):
        with patch(
            "app.controllers.gears.EventController.Events.create",
            return_value=Mock(id=7),
        ) as create, patch("app.controllers.gears.EventController.NewEvent"), patch(
            "app.services.KioskBroadcast.section_changed"
        ) as changed:
            EventController().store(_mock_request(inputs=inputs), _mock_response())
        return create, changed

    def test_store_saves_without_reloading_latest_news(self):
        create, changed = self._store(_VALID)
        create.assert_called_once()
        changed.assert_not_called()

    def test_the_json_response_carries_no_calendar_offer(self):
        source = open("app/controllers/gears/EventController.py").read()
        self.assertNotIn("calendar_offer", source)
