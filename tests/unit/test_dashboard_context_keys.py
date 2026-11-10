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
        with patch.object(
            DashboardContext,
            "events_context",
            return_value={"events": rows, "location_lookup": {}},
        ):
            return DashboardContext.full_context(), rows

    def test_events_panel_rows_survive_the_merge(self):
        context, rows = self._full_context()
        self.assertIs(context["events"], rows)

    def test_the_news_panel_keys_do_not_collide(self):
        context, _ = self._full_context()
        self.assertEqual(context["post_library"], [])
        self.assertIn("post_editor_card", context)
        # The newsletter composer's keys are gone with it.
        for gone in ("calendar_events", "blocks", "news_stamp", "news_issue"):
            self.assertNotIn(gone, context)
