"""Two tabs, two accounts, one browser.

Reported symptom: sign in as an editor in one tab and as an admin in another,
refresh the editor's tab, and it lands on the admin console.

Cause: authentication is one cookie. LoginController wrote
`token = users.remember_token` and Masonite's WebGuard resolved the user with
`User.where("remember_token", cookie("token"))`. Cookies are per-origin, never
per-tab, so the second sign-in overwrote the first, and
DashboardController.show() bounces the resulting admin to /users.

These tests pin the slot mechanism that replaced it (app/tab_slots.py): several
token cookies at once, selected by a `u=<slot>` parameter the tab carries in
its own URL. Slot 0 must keep the old, bare cookie names so deploying this does
not sign out anyone already logged in.
"""

from unittest import TestCase

from app.session_drivers import SlotCookieSessionDriver
from app.tab_slots import (
    MAX_SLOTS,
    clear_slot_session,
    normalize_slot,
    request_slot,
    slot_cookie,
    stamp_url,
)


class _CookieJar:
    def __init__(self, cookies):
        self._cookies = dict(cookies)

    def to_dict(self):
        return dict(self._cookies)


class _Request:
    def __init__(self, query="", headers=None, cookies=None, slot=0):
        self.environ = {"QUERY_STRING": query}
        self._headers = headers or {}
        self._cookies = cookies or {}
        self.cookie_jar = _CookieJar(self._cookies)
        self.tab_slot = slot

    def header(self, name):
        return self._headers.get(name)

    def cookie(self, name):
        return self._cookies.get(name)


class _Response:
    def __init__(self):
        self.cookies = {}
        self.deleted = []

    def cookie(self, name, value):
        self.cookies[name] = value

    def delete_cookie(self, name):
        self.deleted.append(name)


class SlotCookieNamingTest(TestCase):
    def test_slot_zero_keeps_the_original_cookie_names(self):
        # The back-compat guarantee: an editor already signed in when this
        # ships must stay signed in.
        self.assertEqual(slot_cookie("token", 0), "token")

    def test_other_slots_are_suffixed(self):
        self.assertEqual(slot_cookie("token", 2), "token_2")

    def test_out_of_range_and_garbage_fail_closed_to_slot_zero(self):
        for value in (MAX_SLOTS, -1, "nine", None, "", "1; DROP"):
            self.assertEqual(normalize_slot(value), 0, value)


class RequestSlotTest(TestCase):
    def test_query_parameter_wins_over_the_header(self):
        # The parameter is what survives a reload, so it must not be
        # overridable by a header a stale AJAX call carried.
        request = _Request(query="page=news&u=2", headers={"X-Tab-Slot": "3"})
        self.assertEqual(request_slot(request), 2)

    def test_header_carries_ajax_that_has_no_query_parameter(self):
        request = _Request(headers={"X-Tab-Slot": "1"})
        self.assertEqual(request_slot(request), 1)

    def test_no_selector_is_slot_zero(self):
        self.assertEqual(request_slot(_Request()), 0)


class StampUrlTest(TestCase):
    def test_appends_to_a_bare_path(self):
        self.assertEqual(stamp_url("/gears/dashboard", 1), "/gears/dashboard?u=1")

    def test_appends_to_an_existing_query(self):
        self.assertEqual(
            stamp_url("/gears/dashboard?page=news", 1), "/gears/dashboard?page=news&u=1"
        )

    def test_never_double_stamps(self):
        self.assertEqual(stamp_url("/gears/dashboard?u=2", 1), "/gears/dashboard?u=2")

    def test_slot_zero_leaves_urls_clean(self):
        self.assertEqual(stamp_url("/gears/dashboard", 0), "/gears/dashboard")


class _App:
    def __init__(self, request, response):
        self._objects = {"request": request, "response": response}

    def make(self, name):
        return self._objects[name]


def _driver(request, response):
    driver = SlotCookieSessionDriver(_App(request, response))
    driver.set_options({})
    return driver


class SlotSessionDriverTest(TestCase):
    def test_a_slot_reads_only_its_own_keys(self):
        # The flash-leak half of the bug: an admin's success banner appearing
        # in the editor's tab.
        request = _Request(
            cookies={"f_success": "slot zero", "f_u1_success": "slot one"}, slot=1
        )
        started = _driver(request, _Response()).start()
        self.assertEqual(started["flashed"], {"success": "slot one"})

    def test_slot_zero_does_not_read_another_slots_keys(self):
        request = _Request(
            cookies={"s_errors": "mine", "s_u1_errors": "theirs"}, slot=0
        )
        started = _driver(request, _Response()).start()
        self.assertEqual(started["data"], {"errors": "mine"})

    def test_writes_are_prefixed_by_slot(self):
        response = _Response()
        _driver(_Request(slot=1), response).save(
            added={"reset_email": "a@b.c"}, flashed={"success": "saved"}
        )
        self.assertEqual(
            response.cookies, {"s_u1_reset_email": "a@b.c", "f_u1_success": "saved"}
        )

    def test_slot_zero_writes_the_original_names(self):
        response = _Response()
        _driver(_Request(slot=0), response).save(flashed={"success": "saved"})
        self.assertEqual(response.cookies, {"f_success": "saved"})

    def test_a_key_containing_s_underscore_is_not_mangled(self):
        # Upstream CookieDriver.start() uses key.replace("s_", ""), which
        # strips that substring anywhere in the name. Ours matches a prefix.
        request = _Request(cookies={"s_reports_state": "x"}, slot=0)
        started = _driver(request, _Response()).start()
        self.assertEqual(started["data"], {"reports_state": "x"})


class ClearSlotSessionTest(TestCase):
    def test_logout_drops_only_this_slots_session_cookies(self):
        request = _Request(
            cookies={
                "f_success": "slot zero",
                "s_reset_email": "zero@x",
                "f_u1_success": "slot one",
                "token": "a",
                "token_1": "b",
            }
        )
        response = _Response()
        clear_slot_session(request, response, 1)
        self.assertEqual(response.deleted, ["f_u1_success"])

    def test_slot_zero_logout_leaves_other_slots_alone(self):
        request = _Request(cookies={"f_success": "zero", "f_u1_success": "one"})
        response = _Response()
        clear_slot_session(request, response, 0)
        self.assertEqual(response.deleted, ["f_success"])


class _RedirectResponse:
    def __init__(self, location=None):
        self._headers = {"Location": location} if location else {}

    def header(self, name, value=None):
        if value is None:
            return self._headers.get(name)
        self._headers[name] = value
        return None


class RedirectStampingTest(TestCase):
    """TabSlotMiddleware.after() is what carries the slot across redirects.

    There are ~103 `.back()` / `redirect(name=...)` call sites in
    app/controllers; a redirect that lost `u=` would drop the tab onto slot 0's
    account, which is the bug itself. Stamping centrally means new controllers
    get it for free.
    """

    def _after(self, slot, location):
        from app.middlewares.TabSlotMiddleware import TabSlotMiddleware

        response = _RedirectResponse(location)
        TabSlotMiddleware().after(_Request(slot=slot), response)
        return response.header("Location")

    def test_a_redirect_keeps_the_slot(self):
        self.assertEqual(self._after(1, "/gears/dashboard"), "/gears/dashboard?u=1")

    def test_slot_zero_is_untouched(self):
        self.assertEqual(self._after(0, "/gears/dashboard"), "/gears/dashboard")

    def test_a_non_redirect_has_no_location_to_stamp(self):
        self.assertIsNone(self._after(1, None))

    def test_unauthenticated_surfaces_are_never_stamped(self):
        # The kiosk is public, and /login allocates its own slot in
        # LoginController -- pinning it here would tie a fresh sign-in to
        # whichever slot happened to be signing out.
        for location in ("/login", "/kiosk/news", "/m/route/abc"):
            self.assertEqual(self._after(1, location), location)
