"""The per-newsletter calendar, as each surface reaches it.

test_issue_calendar.py covers the rules. These cover the joins that used to read
the global list: the endpoints, the event save, the kiosk's slides, the review
preview, the manager partials, and the backfill's selection.
No test writes to `.env`'s production database.
"""

import importlib.util
from datetime import datetime
from pathlib import Path
from unittest.mock import Mock, patch

from tests import TestCase
from tests.unit.news_doubles import _mock_request, _mock_response

from app.controllers.gears.EventController import EventController
from app.controllers.gears.IssueCalendarController import IssueCalendarController
from app.services import IssueCalendar as IC
from app.services import SessionTokens

REPO = Path(__file__).resolve().parents[2]
ATTACH_URL = "/gears/issues/current/events/5"
REMOVE_URL = "/gears/issues/current/events/5/remove"
ROW = {"id": 1, "title": "Parade", "chip": "SEP 15", "iso": "2026-09-15"}


class _Pipeline(TestCase):
    def setUp(self):
        super().setUp()
        self.user = Mock(id=7, role="editor")
        self.user.get_primary_key_value.return_value = 7

    def _signed_in(self):
        """Resolve the slot-0 token cookie to self.user without the users table.
        Patched at SessionTokens.find_user, the one seam LoadSlotUserMiddleware
        resolves a cookie through, so no hashed-token lookup hits the live database."""
        patcher = patch.object(SessionTokens, "find_user", return_value=self.user)
        patcher.start()
        self.addCleanup(patcher.stop)
        return self.withCookies({"token": "test-token"})


SUMMARY = {"issue_no": 12, "count": 1, "capacity": 3, "full": False}


def _body(response):
    return response.json.call_args


def _controller_request(event_id="5", user_id=7, inputs=None):
    request = _mock_request(inputs=inputs, params={"event_id": event_id}, ajax=True)
    request.user.return_value = Mock(id=user_id)
    return request


class EndpointTestCase(TestCase):
    def test_attach_uses_the_signed_in_editor_and_reports_the_new_count(self):
        response = _mock_response()
        with patch.object(IC, "attach", return_value=SUMMARY) as attach:
            IssueCalendarController().attach(_controller_request(), response)
        attach.assert_called_once_with(7, 5)
        payload = _body(response).args[0]
        self.assertTrue(payload["ok"])
        self.assertEqual(payload["calendar"], SUMMARY)

    def test_the_request_cannot_name_another_issue(self):
        request = _controller_request(inputs={"issue_id": "99", "user_id": "99"})
        with patch.object(IC, "attach", return_value=SUMMARY) as attach:
            IssueCalendarController().attach(request, _mock_response())
        attach.assert_called_once_with(7, 5)

    def test_a_refusal_keeps_its_status_and_reason(self):
        response = _mock_response()
        with patch.object(IC, "attach", side_effect=IC.CalendarRefused("Full.", status=409)):
            IssueCalendarController().attach(_controller_request(), response)
        self.assertEqual(_body(response).args[0], {"ok": False, "errors": ["Full."]})
        self.assertEqual(_body(response).kwargs["status"], 409)

    def test_remove_uses_the_signed_in_editor(self):
        response = _mock_response()
        with patch.object(IC, "detach", return_value=SUMMARY) as detach:
            IssueCalendarController().remove(_controller_request(), response)
        detach.assert_called_once_with(7, 5)
        self.assertTrue(_body(response).args[0]["ok"])

    def test_remove_refusal_keeps_its_status(self):
        response = _mock_response()
        with patch.object(IC, "detach", side_effect=IC.CalendarRefused("Locked.")):
            IssueCalendarController().remove(_controller_request(), response)
        self.assertEqual(_body(response).kwargs["status"], 409)


class RoutingTestCase(_Pipeline):
    def test_a_guest_is_sent_to_login_and_nothing_attaches(self):
        with patch.object(IC, "attach") as attach:
            self.post(ATTACH_URL).assertRedirect(name="auth.login")
        attach.assert_not_called()

    def test_a_guest_cannot_remove(self):
        with patch.object(IC, "detach") as detach:
            self.post(REMOVE_URL).assertRedirect(name="auth.login")
        detach.assert_not_called()

    def test_routes_reach_the_controller_for_an_editor(self):
        with patch.object(IC, "attach", return_value=SUMMARY) as attach:
            self._signed_in().post(ATTACH_URL).assertOk()
        attach.assert_called_once_with(7, 5)

    def test_a_non_numeric_event_matches_no_route(self):
        router = self.application.make("router")
        self.assertIsNone(router.find("/gears/issues/current/events/abc", "POST"))


class EventSaveOfferTestCase(TestCase):
    VALID = {"title": "Fair", "description": "At the gym.", "event_date": "2026-11-06"}

    def _store(self, offer=None, offer_error=None):
        request = _mock_request(inputs=self.VALID, ajax=True)
        request.user.return_value = Mock(id=7)
        response = _mock_response()
        with patch(
            "app.controllers.gears.EventController.Events.create", return_value=Mock(id=5)
        ), patch("app.controllers.gears.EventController.NewEvent"), patch.object(
            IC, "offer_for", return_value=offer, side_effect=offer_error
        ) as offer_for:
            EventController().store(request, response)
        return _body(response).args[0], offer_for

    def test_the_save_carries_the_offer_for_that_events_date(self):
        payload, offer_for = self._store(offer=SUMMARY)
        self.assertEqual(payload["calendar_offer"], SUMMARY)
        offer_for.assert_called_once_with(7, datetime(2026, 11, 6))

    def test_no_offer_is_null_not_missing(self):
        payload, _ = self._store(offer=None)
        self.assertIsNone(payload["calendar_offer"])

    def test_a_failed_offer_does_not_fail_the_save(self):
        # The event is already written; losing the question is the lesser harm.
        payload, _ = self._store(offer_error=RuntimeError("db"))
        self.assertTrue(payload["ok"])
        self.assertIsNone(payload["calendar_offer"])


class FragmentTestCase(TestCase):
    # The issue-calendar fragment is no longer registered (the News panel is the
    # photo-post editor now); its partials stay on disk until the newsletter
    # code is deleted, so their rendering contracts are still pinned here.
    def test_the_fragment_renders_the_dates_and_the_manager(self):
        view = self.application.make("view")
        html = view.render(
            "gears/partials/issue-calendar-fragment",
            {
                "news_editor": True,
                "calendar_events": [ROW],
                "calendar_choices": [
                    {"id": 2, "title": "Fair", "chip": "NOV 06", "iso": "2026-11-06"}
                ],
                "calendar_capacity": 3,
                "calendar_locked": False,
            },
        ).rendered_template
        self.assertIn("data-issue-calendar-dates", html)
        self.assertIn("data-issue-calendar-manager", html)
        self.assertIn('data-calendar-remove="1"', html)
        self.assertIn('value="2"', html)
        self.assertIn("1 of 3", html)

    def test_a_locked_manager_offers_no_changes(self):
        view = self.application.make("view")
        html = view.render(
            "gears/partials/issue-calendar-manager",
            {
                "calendar_events": [ROW],
                "calendar_choices": [],
                "calendar_capacity": 3,
                "calendar_locked": True,
            },
        ).rendered_template
        self.assertNotIn("data-calendar-remove", html)
        self.assertNotIn("data-calendar-add", html)
        self.assertIn("in review", html)

    def test_a_full_manager_offers_removal_but_no_add(self):
        view = self.application.make("view")
        rows = [dict(ROW, id=i) for i in (1, 2, 3)]
        html = view.render(
            "gears/partials/issue-calendar-manager",
            {
                "calendar_events": rows,
                "calendar_choices": [dict(ROW, id=9)],
                "calendar_capacity": 3,
                "calendar_locked": False,
            },
        ).rendered_template
        self.assertIn("data-calendar-remove", html)
        self.assertNotIn("data-calendar-add", html)

    def test_an_untouched_picker_does_not_read_as_mid_edit(self):
        # isBusy() in dashboard-live.js compares each option's selected state to
        # the markup's. With no `selected` attribute the browser's default first
        # option reads as a change, and the news panel never live-refreshes.
        view = self.application.make("view")
        html = view.render(
            "gears/partials/issue-calendar-manager",
            {
                "calendar_events": [],
                "calendar_choices": [dict(ROW, id=2), dict(ROW, id=3)],
                "calendar_capacity": 3,
                "calendar_locked": False,
            },
        ).rendered_template
        self.assertRegex(html, r'value="2"\s+selected')
        self.assertNotRegex(html, r'value="3"\s+selected')

    def test_the_manager_stays_out_of_the_news_panels_refresh_target(self):
        # dashboard-live.js takes a panel's FIRST [data-live-target]. The
        # inspector comes before the news panel's real one, so a target here
        # would have every news refresh overwrite the manager.
        partial = (REPO / "templates/gears/partials/issue-calendar-manager.html").read_text()
        self.assertNotIn("data-live-target", partial.split("#}")[-1])


class BackfillTestCase(TestCase):
    """The selection is pure so it can be tested without running the migration
    against the production database."""

    def _module(self):
        path = next((REPO / "databases/migrations").glob("*_create_issue_events_table.py"))
        spec = importlib.util.spec_from_file_location("issue_events_migration", path)
        module = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(module)
        return module

    def _events(self):
        return [
            {"id": 1, "event_date": "2026-06-30 00:00:00"},
            {"id": 2, "event_date": "2026-07-01 00:00:00"},
            {"id": 3, "event_date": "2026-07-02 09:00:00"},
            {"id": 4, "event_date": "2026-07-03 00:00:00"},
            {"id": 5, "event_date": "2026-07-04 00:00:00"},
        ]

    def test_takes_three_from_the_publish_day_on(self):
        picked = self._module().pick_calendar(self._events(), "2026-07-01 08:30:00")
        self.assertEqual(picked, [2, 3, 4])

    def test_accepts_datetime_values(self):
        events = [{"id": 2, "event_date": datetime(2026, 7, 1)}]
        picked = self._module().pick_calendar(events, datetime(2026, 7, 1, 8, 30))
        self.assertEqual(picked, [2])

    def test_nothing_later_than_publication_means_an_empty_calendar(self):
        self.assertEqual(self._module().pick_calendar(self._events(), "2027-01-01"), [])

    def test_an_issue_with_no_publish_time_falls_back_to_its_creation(self):
        # The September migration filed old issues with published_at NULL. One
        # of them can be the kiosk's fallback slide, and it can no longer be
        # edited to add dates. Same fallback as Issues.expires_at().
        day = self._module().publish_day({"published_at": None, "created_at": "2026-07-01"})
        self.assertEqual(day, "2026-07-01")
        day = self._module().publish_day(
            {"published_at": "2026-08-01", "created_at": "2026-07-01"}
        )
        self.assertEqual(day, "2026-08-01")

    def test_only_issues_with_a_visible_story_are_backfilled(self):
        rows = [
            {"issue_id": 1, "status": "live"},
            {"issue_id": 2, "status": "draft"},
            {"issue_id": 2, "status": "review"},
            {"issue_id": 3, "status": "Published "},
            {"issue_id": None, "status": "published"},
        ]
        self.assertEqual(self._module().published_issue_ids(rows), {1, 3})
