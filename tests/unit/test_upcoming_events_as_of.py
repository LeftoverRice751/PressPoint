"""A reprint of an old issue must carry the calendar the issue carried, not
today's -- upcoming_events() used to measure only from now."""

from datetime import datetime
from unittest.mock import Mock, patch

from tests import TestCase

from app.services import DashboardContext


class UpcomingEventsAsOfTestCase(TestCase):
    def _cutoff(self, **kwargs):
        chain = Mock()
        chain.where.return_value = chain
        chain.order_by.return_value = chain
        chain.limit.return_value = chain
        chain.get.return_value = []
        with patch.object(DashboardContext.Events, "where", return_value=chain):
            DashboardContext.upcoming_events(**kwargs)
        return chain.where.call_args.args

    def test_as_of_sets_the_cutoff(self):
        self.assertEqual(
            self._cutoff(as_of=datetime(2026, 7, 1, 8, 30)),
            ("event_date", ">=", "2026-07-01 08:30:00"),
        )

    def test_default_is_now(self):
        field, op, value = self._cutoff()
        self.assertEqual((field, op), ("event_date", ">="))
        self.assertEqual(value[:10], datetime.now().strftime("%Y-%m-%d"))
