"""A newsletter's calendar is the events its editor chose for it.

It used to be one global "next three events" query, so nothing an editor
answered could be stored and every issue printed the same dates. These run the
real IssueCalendar rules over an in-memory link table: `.env` is the production
database, so the seams that read and write `issue_events` are the only stubs.
"""

from contextlib import nullcontext
from datetime import datetime, timedelta
from unittest.mock import Mock, patch

from tests import TestCase

from app.services import IssueCalendar as IC

NOW = datetime(2026, 11, 6, 15, 30)


def _event(event_id, day_offset=1, is_archive=0, hour=0):
    at = NOW.replace(hour=hour, minute=0) + timedelta(days=day_offset)
    return Mock(id=event_id, title=f"Event {event_id}", event_date=at, is_archive=is_archive)


class _Store:
    """The link table plus the events table, in memory."""

    def __init__(self, events=(), links=()):
        self.events = {e.id: e for e in events}
        self.links = set(links)

    def attached_ids(self, issue_ids):
        return [link for link in sorted(self.links) if link[0] in issue_ids]

    def load_events(self, event_ids):
        rows = [self.events[i] for i in event_ids if i in self.events]
        rows = [r for r in rows if not r.is_archive]
        return sorted(rows, key=lambda r: r.event_date)

    def insert(self, issue_id, event_id):
        self.links.add((issue_id, event_id))

    def delete(self, issue_id, event_id):
        self.links.discard((issue_id, event_id))


class _Case(TestCase):
    OPEN = Mock(id=3, number=12)

    def _run(self, store, call, status="draft", current=OPEN, created=None):
        with patch.object(IC, "_attached", store.attached_ids), patch.object(
            IC, "_load_events", store.load_events
        ), patch.object(IC, "_insert_link", store.insert), patch.object(
            IC, "_delete_link", store.delete
        ), patch.object(
            IC, "_find_event", store.events.get
        ), patch.object(
            IC, "_transaction", lambda: nullcontext()
        ), patch.object(
            IC.Issues, "campus_now", return_value=NOW
        ), patch.object(
            IC.Issues, "current_for", return_value=current
        ) as current_for, patch.object(
            IC.Issues, "ensure_current_for", return_value=current or created
        ) as ensure, patch.object(
            IC.Issues, "status_of", return_value=status
        ):
            self.current_for = current_for
            self.ensure_current_for = ensure
            return call()


class AttachTestCase(_Case):
    def test_attach_stores_the_link_on_the_callers_own_issue(self):
        store = _Store(events=[_event(5)])
        self._run(store, lambda: IC.attach(7, 5))
        self.ensure_current_for.assert_called_once_with(7)
        self.assertEqual(store.links, {(3, 5)})

    def test_attaching_twice_is_a_no_op_not_a_capacity_hit(self):
        store = _Store(events=[_event(5)], links=[(3, 5), (3, 6), (3, 7)])
        summary = self._run(store, lambda: IC.attach(7, 5))
        self.assertEqual(summary["count"], 3)
        self.assertEqual(len(store.links), 3)

    def test_a_full_calendar_refuses_with_409(self):
        store = _Store(events=[_event(9)], links=[(3, 1), (3, 2), (3, 3)])
        with self.assertRaises(IC.CalendarRefused) as caught:
            self._run(store, lambda: IC.attach(7, 9))
        self.assertEqual(caught.exception.status, 409)
        self.assertNotIn((3, 9), store.links)

    def test_another_issues_links_do_not_count_toward_capacity(self):
        store = _Store(events=[_event(9)], links=[(4, 1), (4, 2), (4, 3)])
        self._run(store, lambda: IC.attach(7, 9))
        self.assertIn((3, 9), store.links)

    def test_an_issue_in_review_refuses_with_409(self):
        # The admin approves what they read; the review stamp does not cover
        # the calendar because this refusal makes that unnecessary.
        store = _Store(events=[_event(5)])
        with self.assertRaises(IC.CalendarRefused) as caught:
            self._run(store, lambda: IC.attach(7, 5), status="review")
        self.assertEqual(caught.exception.status, 409)
        self.assertEqual(store.links, set())

    def test_an_unknown_event_refuses_with_404_and_creates_no_issue(self):
        with self.assertRaises(IC.CalendarRefused) as caught:
            self._run(_Store(), lambda: IC.attach(7, 99), current=None)
        self.assertEqual(caught.exception.status, 404)
        self.ensure_current_for.assert_not_called()

    def test_an_archived_event_is_refused(self):
        store = _Store(events=[_event(5, is_archive=1)])
        with self.assertRaises(IC.CalendarRefused):
            self._run(store, lambda: IC.attach(7, 5))

    def test_a_past_event_is_refused(self):
        store = _Store(events=[_event(5, day_offset=-1)])
        with self.assertRaises(IC.CalendarRefused):
            self._run(store, lambda: IC.attach(7, 5))

    def test_an_event_dated_today_is_allowed_though_stored_at_midnight(self):
        # The Add Event form sends a date only, so "today" is 00:00 and earlier
        # than now. Comparing to the clock is what hid today's events.
        store = _Store(events=[_event(5, day_offset=0)])
        self._run(store, lambda: IC.attach(7, 5))
        self.assertEqual(store.links, {(3, 5)})

    def test_no_open_issue_creates_one_only_on_attach(self):
        store = _Store(events=[_event(5)])
        self._run(store, lambda: IC.attach(7, 5), current=None, created=Mock(id=8, number=13))
        self.assertEqual(store.links, {(8, 5)})


class DetachTestCase(_Case):
    def test_detach_removes_only_from_the_callers_issue(self):
        store = _Store(links=[(3, 5), (4, 5)])
        self._run(store, lambda: IC.detach(7, 5))
        self.current_for.assert_called_once_with(7)
        self.assertEqual(store.links, {(4, 5)})

    def test_detach_refuses_while_in_review(self):
        store = _Store(links=[(3, 5)])
        with self.assertRaises(IC.CalendarRefused):
            self._run(store, lambda: IC.detach(7, 5), status="review")
        self.assertEqual(store.links, {(3, 5)})

    def test_detach_with_no_open_issue_is_a_no_op(self):
        store = _Store(links=[(4, 5)])
        self._run(store, lambda: IC.detach(7, 5), current=None)
        self.assertEqual(store.links, {(4, 5)})


class CopyUpcomingTestCase(_Case):
    def test_a_duplicate_carries_only_dates_still_ahead(self):
        store = _Store(
            events=[_event(1, -2), _event(2, 0), _event(3, 4)], links=[(3, 1), (3, 2), (3, 3)]
        )
        self._run(store, lambda: IC.copy_upcoming(3, 8))
        self.assertEqual({e for i, e in store.links if i == 8}, {2, 3})

    def test_a_reused_draft_takes_the_copied_calendar_instead_of_its_own(self):
        store = _Store(events=[_event(2)], links=[(3, 2), (8, 7)])
        self._run(store, lambda: IC.copy_upcoming(3, 8))
        self.assertEqual({e for i, e in store.links if i == 8}, {2})

    def test_a_failure_raises_so_the_duplicate_rolls_back(self):
        with patch.object(IC, "_attached", side_effect=RuntimeError("db")):
            with self.assertRaises(RuntimeError):
                IC.copy_upcoming(3, 8)


class OfferTestCase(_Case):
    def test_offer_reports_room(self):
        store = _Store(links=[(3, 1)])
        offer = self._run(store, lambda: IC.offer_for(7, NOW))
        self.assertEqual(offer, {"issue_no": 12, "count": 1, "capacity": 3, "full": False})

    def test_offer_reports_full(self):
        store = _Store(links=[(3, 1), (3, 2), (3, 3)])
        self.assertTrue(self._run(store, lambda: IC.offer_for(7, NOW))["full"])

    def test_no_offer_while_in_review(self):
        self.assertIsNone(self._run(_Store(), lambda: IC.offer_for(7, NOW), status="review"))

    def test_no_open_issue_still_offers_and_creates_nothing(self):
        # Adding an event before writing the first story is the common case.
        offer = self._run(_Store(), lambda: IC.offer_for(7, NOW), current=None)
        self.assertEqual(offer, {"issue_no": None, "count": 0, "capacity": 3, "full": False})
        self.ensure_current_for.assert_not_called()

    def test_no_offer_for_an_event_already_past(self):
        # attach() would refuse it, so asking would only lead to an error.
        offer = self._run(_Store(), lambda: IC.offer_for(7, NOW - timedelta(days=1)))
        self.assertIsNone(offer)

    def test_no_offer_without_a_user(self):
        self.assertIsNone(self._run(_Store(), lambda: IC.offer_for(None, NOW)))


class ReadTestCase(_Case):
    def test_events_for_is_only_this_issue_in_date_order(self):
        store = _Store(
            events=[_event(1, 9), _event(2, 3), _event(3, 5)], links=[(3, 1), (3, 2), (4, 3)]
        )
        rows = self._run(store, lambda: IC.events_for(Mock(id=3)))
        self.assertEqual([r["id"] for r in rows], [2, 1])
        self.assertEqual(rows[0]["chip"], "NOV 09")
        self.assertEqual(rows[0]["iso"], "2026-11-09")
        self.assertEqual(rows[0]["title"], "Event 2")

    def test_events_for_keeps_past_dates_for_the_printed_record(self):
        store = _Store(events=[_event(1, -30)], links=[(3, 1)])
        rows = self._run(store, lambda: IC.events_for(Mock(id=3)))
        self.assertEqual([r["id"] for r in rows], [1])

    def test_events_for_no_issue_is_empty(self):
        self.assertEqual(self._run(_Store(), lambda: IC.events_for(None)), [])

    def test_kiosk_drops_past_dates_and_keeps_today(self):
        store = _Store(
            events=[_event(1, -1), _event(2, 0), _event(3, 2)], links=[(3, 1), (3, 2), (3, 3)]
        )
        rows = self._run(store, lambda: IC.upcoming_by_issue([3]))
        self.assertEqual([r["id"] for r in rows[3]], [2, 3])

    def test_kiosk_keeps_each_issue_to_its_own_events(self):
        store = _Store(events=[_event(1), _event(2)], links=[(3, 1), (4, 2)])
        rows = self._run(store, lambda: IC.upcoming_by_issue([3, 4, 5]))
        self.assertEqual([r["id"] for r in rows[3]], [1])
        self.assertEqual([r["id"] for r in rows[4]], [2])
        self.assertEqual(rows[5], [])

    def test_a_database_failure_leaves_the_calendar_empty_not_the_page_down(self):
        # One block on a public screen must not take the whole issue down.
        with patch.object(IC, "_attached", side_effect=RuntimeError("no table")):
            self.assertEqual(IC.events_for(Mock(id=3)), [])
            self.assertEqual(IC.upcoming_by_issue([3]), {3: []})
