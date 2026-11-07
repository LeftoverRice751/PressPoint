"""The per-newsletter calendar, as each surface reaches it.

test_issue_calendar.py covers the rules. These cover the joins that used to read
the global list: the endpoints, the event save, the kiosk's slides, the review
preview, the print view, the composer's refresh, and the backfill's selection.
No test writes to `.env`'s production database.
"""

import importlib.util
from datetime import datetime
from pathlib import Path
from unittest.mock import Mock, patch

from tests import TestCase
from tests.unit.test_issue_composer import _render, _Story
from tests.unit.test_issue_library_http import _Pipeline
from tests.unit.test_kiosk_single_issue import _render_page
from tests.unit.test_news_endpoints import _mock_request, _mock_response

from app.controllers.gears import DashboardController as Dash
from app.controllers.gears.EventController import EventController
from app.controllers.gears.IssueCalendarController import IssueCalendarController
from app.services import IssueCalendar as IC
from app.services import IssueLibrary as L
from app.services.ReviewQueue import issue_preview_context

REPO = Path(__file__).resolve().parents[2]
ATTACH_URL = "/gears/issues/current/events/5"
REMOVE_URL = "/gears/issues/current/events/5/remove"
ROW = {"id": 1, "title": "Parade", "chip": "SEP 15", "iso": "2026-09-15"}
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


class ReadSurfacesTestCase(TestCase):
    def test_print_shows_what_the_issue_chose(self):
        issue = Mock(
            id=3,
            number=12,
            title="T",
            published_at=datetime(2026, 7, 1),
            created_at=datetime(2026, 7, 1),
        )
        with patch.object(L.Issues, "stories_of", return_value=[]), patch.object(
            IC, "events_for", return_value=[ROW]
        ) as events_for:
            context = L.print_context(issue)
        events_for.assert_called_once_with(issue)
        self.assertEqual(context["calendar_events"], [ROW])

    def test_review_preview_shows_the_issues_calendar(self):
        with patch.object(IC, "events_for", return_value=[ROW]) as events_for:
            context = issue_preview_context([], issue=3)
        events_for.assert_called_once_with(3)
        self.assertEqual(context["calendar_events"], [ROW])

    def test_review_preview_without_an_issue_has_no_calendar(self):
        self.assertEqual(issue_preview_context([])["calendar_events"], [])

    def test_the_kiosk_never_shows_editor_controls(self):
        html = _render(lead=_Story(1, layout_type="lead"), calendar_events=[ROW], editor=False)
        self.assertIn("Parade", html)
        self.assertNotIn("data-issue-calendar-manage", html)

    def test_the_canvas_button_opens_the_manager_not_the_events_panel(self):
        html = _render(lead=_Story(1, layout_type="lead"), calendar_events=[ROW], editor=True)
        self.assertIn("data-issue-calendar-manage", html)
        self.assertNotIn('data-page-link="events"', html)

    def test_each_kiosk_slide_shows_its_own_calendar(self):
        def issue(issue_id):
            blocks = {b: [] for b in ("brief", "photo_essay", "editorial", "quote", "notice")}
            blocks["lead"] = [_Story(issue_id, layout_type="lead")]
            return {
                "id": issue_id,
                "number": issue_id,
                "title": "",
                "published_label": None,
                "blocks": blocks,
                "issue_vol": 1,
                "issue_no": issue_id,
                "news_items": [],
            }

        html = _render_page(
            issues=[issue(3), issue(4)],
            calendars={
                3: [dict(ROW, title="Only on three")],
                4: [dict(ROW, title="Only on four")],
            },
        )
        three, four = html.split('data-issue-id="3"')[1].split('data-issue-id="4"')
        self.assertIn("Only on three", three)
        self.assertNotIn("Only on four", three)
        self.assertIn("Only on four", four)
        self.assertNotIn("Only on three", four)


class KioskShowTestCase(TestCase):
    def test_show_builds_calendars_from_the_cached_issue_ids(self):
        from app.controllers.gears import NewsController as N

        view = Mock()
        payload = {"issues": [{"id": 3}, {"id": 4}], "news_items": [], "blocks": {}}
        with patch.object(N.Cache, "remember", return_value=payload), patch.object(
            IC, "upcoming_by_issue", return_value={3: [ROW], 4: []}
        ) as upcoming:
            N.NewsController().show(view)
        upcoming.assert_called_once_with([3, 4])
        context = view.render.call_args.args[1]
        self.assertEqual(context["calendars"], {3: [ROW], 4: []})
        # The empty-state slide has no issue to read one from.
        self.assertEqual(context["calendar_events"], [])


class FragmentTestCase(TestCase):
    def test_the_fragment_is_registered_and_user_scoped(self):
        self.assertIn("issue-calendar", Dash.FRAGMENTS)
        self.assertIn("issue-calendar", Dash.STAMP_MODELS)
        self.assertIn("issue-calendar", Dash._USER_SCOPED_SECTIONS)

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
