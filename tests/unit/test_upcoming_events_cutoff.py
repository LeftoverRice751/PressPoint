"""The picker's list starts at the beginning of today, not at the current time.

The Add Event form sends a date only, so an event today is stored at 00:00.
Measuring from the clock dropped it the moment it was saved.
"""

from datetime import datetime
from unittest.mock import Mock, patch

from tests import TestCase

from app.services import DashboardContext, Issues


class UpcomingEventsCutoffTestCase(TestCase):
    def test_cutoff_is_the_start_of_today_on_campus(self):
        chain = Mock()
        chain.where.return_value = chain
        chain.order_by.return_value = chain
        chain.limit.return_value = chain
        chain.get.return_value = []
        with patch.object(DashboardContext.Events, "where", return_value=chain), patch.object(
            Issues, "campus_now", return_value=datetime(2026, 11, 6, 15, 30)
        ):
            DashboardContext.upcoming_events()
        self.assertEqual(chain.where.call_args.args, ("event_date", ">=", "2026-11-06 00:00:00"))

    def test_the_picker_is_not_cut_to_the_calendars_three_rows(self):
        self.assertGreater(DashboardContext.CALENDAR_CHOICES_LIMIT, 3)
