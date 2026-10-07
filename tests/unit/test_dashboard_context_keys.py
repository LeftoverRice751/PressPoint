"""full_context() merges every section's context into ONE dict, last write wins.

news_context() used to return the issue calendar under `events` -- the key the
Events panel's table reads. It ran after events_context(), so the full page
rendered the panel from at most three `{title, chip, iso}` dicts (no dates, no
locations, no past events) and the real list only appeared once a live
fragment refresh rendered events_context() on its own, i.e. after an editor
added an event.

These run the real full_context() with only the two producers stubbed, so a
section builder reintroducing the key fails here rather than on the dashboard.
Reads go to the configured database; only the tables are needed, not rows.
"""

from unittest.mock import patch

from app.services import DashboardContext
from tests import TestCase


class DashboardContextKeysTestCase(TestCase):
    def _full_context(self):
        rows = [object(), object()]
        calendar = [{"title": "Parade", "chip": "SEP 15", "iso": "2026-09-15"}]
        with patch.object(
            DashboardContext,
            "events_context",
            return_value={"events": rows, "location_lookup": {}},
        ), patch.object(DashboardContext, "upcoming_events", return_value=calendar):
            return DashboardContext.full_context(), rows, calendar

    def test_events_panel_rows_survive_the_merge(self):
        context, rows, _ = self._full_context()
        self.assertIs(context["events"], rows)

    def test_issue_calendar_has_its_own_key(self):
        context, _, calendar = self._full_context()
        self.assertIs(context["calendar_events"], calendar)

    def test_canvas_fragment_carries_the_calendar(self):
        calendar = [{"title": "Parade", "chip": "SEP 15", "iso": "2026-09-15"}]
        with patch.object(DashboardContext, "upcoming_events", return_value=calendar):
            context = DashboardContext.news_canvas_context()
        self.assertIs(context["calendar_events"], calendar)
        self.assertNotIn("events", context)
