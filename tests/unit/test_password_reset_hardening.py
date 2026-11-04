"""Three holes in the OTP flow that the throttle could not close on its own.

1. The named limiters returned Limit.unlimited() for any signed-in user, and
   the auth routes are public, so a signed-in session walked past `otp`.
2. `expires_at` is written in local time and was parsed back as UTC, so on this
   Asia/Manila host a 15-minute code lived for 8 hours 15 minutes.
3. Nothing counted wrong codes against the account, so the only brake on a
   six-digit code was a per-IP limit.

/forgot-password also answered differently for an unknown address, which told
anyone which addresses have accounts.
"""

import os
import shutil
import tempfile
import time
from unittest import TestCase
from unittest.mock import Mock, patch

import pendulum
from masonite.cache.drivers.FileDriver import FileDriver
from masonite.facades import RateLimiter as RateLimiterFacade
from masonite.rates.RateLimiter import RateLimiter

from app.providers.AppProvider import AppProvider
from app.rate_limiters import GuestAuthLimiter
from app.services import OtpAttempts, SessionTokens
from test_password_reset_binding import (
    FakeBuilder,
    FakeSession,
    _request,
    _response,
)
from wsgi import application

CONTROLLER = "app.controllers.auth.PasswordResetController"
VICTIM = "victim@lspu.edu.ph"
OTHER = "other@lspu.edu.ph"

_KEY_PATCH = patch.object(SessionTokens, "_key", lambda: b"reset-test-key")


def setUpModule():
    _KEY_PATCH.start()


def tearDownModule():
    _KEY_PATCH.stop()


def _row(email, code, expires_at="2099-01-01 00:00:00"):
    return {
        "email": email,
        "token": SessionTokens.otp_digest(email, code),
        "expires_at": expires_at,
    }


def _verify(builder, otp, session):
    from app.controllers.auth.PasswordResetController import PasswordResetController

    request = _request({"otp": otp}, session=session)
    with patch(f"{CONTROLLER}.application") as app_mock:
        app_mock.make.return_value = builder
        return PasswordResetController().verify_otp(request, _response())


class _SignedInRequest:
    environ = {"REMOTE_ADDR": "198.51.100.7"}

    def user(self):
        return Mock(id=1)

    def header(self, _name):
        return None


class SignedInUsersAreThrottledTestCase(TestCase):
    @classmethod
    def setUpClass(cls):
        AppProvider(application).boot()

    def test_credential_buckets_limit_a_signed_in_user(self):
        for bucket in ("auth", "password-reset", "otp", "password-change"):
            limit = RateLimiterFacade.get_limiter(bucket).allow(_SignedInRequest())
            self.assertFalse(limit.is_unlimited(), bucket)
            self.assertEqual(limit.key, "198.51.100.7", bucket)

    def test_kiosk_buckets_still_skip_a_signed_in_editor(self):
        """These cap public load, and an editor previews archives page by page."""
        for bucket in ("route-sessions", "archive-pages"):
            limit = RateLimiterFacade.get_limiter(bucket).allow(_SignedInRequest())
            self.assertTrue(limit.is_unlimited(), bucket)

    def test_limiter_limits_signed_in_users_by_default(self):
        self.assertFalse(GuestAuthLimiter("5/minute").allow(_SignedInRequest()).is_unlimited())


class ExpiryTimezoneTestCase(TestCase):
    """Local wall-clock in, local wall-clock out, whatever the host's zone."""

    def tearDown(self):
        pendulum.set_local_timezone()

    def _accepted(self, zone, minutes_from_now):
        pendulum.set_local_timezone(pendulum.timezone(zone))
        # A naive datetime, which is what the MySQL driver hands back.
        expires = pendulum.now().add(minutes=minutes_from_now).naive()
        session = FakeSession({"pending_reset_email": VICTIM})
        _verify(FakeBuilder([_row(VICTIM, "123456", expires)]), "123456", session)
        return session.get("reset_email") == VICTIM

    def test_code_past_expiry_is_refused_east_of_utc(self):
        self.assertFalse(self._accepted("Asia/Manila", -1))

    def test_code_inside_expiry_is_accepted_east_of_utc(self):
        self.assertTrue(self._accepted("Asia/Manila", 1))

    def test_code_inside_expiry_is_accepted_west_of_utc(self):
        self.assertTrue(self._accepted("America/New_York", 1))

    def test_code_past_expiry_is_refused_west_of_utc(self):
        self.assertFalse(self._accepted("America/New_York", -1))


class WrongCodeLockoutTestCase(TestCase):
    def _guess(self, builder, email=VICTIM, code="000000"):
        session = FakeSession({"pending_reset_email": email})
        _verify(builder, code, session)
        return session

    def _deletes(self, builder):
        return [s for s, _ in builder.statements if s.upper().startswith("DELETE")]

    def test_four_wrong_codes_leave_the_real_code_working(self):
        builder = FakeBuilder([_row(VICTIM, "123456")])
        for _ in range(4):
            self._guess(builder)

        session = self._guess(builder, code="123456")

        self.assertEqual(session.get("reset_email"), VICTIM)

    def test_fifth_wrong_code_deletes_the_reset_row_for_that_account(self):
        builder = FakeBuilder([_row(VICTIM, "123456")])
        for _ in range(4):
            self._guess(builder)
        self.assertEqual(self._deletes(builder), [])

        self._guess(builder)

        deletes = [(s, b) for s, b in builder.statements if s.upper().startswith("DELETE")]
        self.assertEqual(len(deletes), 1)
        self.assertEqual(deletes[0][1], [VICTIM])

    def test_real_code_is_refused_after_the_lockout(self):
        # The row is left in place here, so only the counter can refuse it.
        builder = FakeBuilder([_row(VICTIM, "123456")])
        for _ in range(5):
            self._guess(builder)

        session = self._guess(builder, code="123456")

        self.assertIsNone(session.get("reset_email"))

    def test_lockout_applies_to_one_account_only(self):
        builder = FakeBuilder([_row(VICTIM, "123456"), _row(OTHER, "654321")])
        for _ in range(5):
            self._guess(builder)

        session = self._guess(builder, email=OTHER, code="654321")

        self.assertEqual(session.get("reset_email"), OTHER)

    def test_a_new_code_does_not_buy_more_guesses(self):
        """Otherwise asking for a fresh code every five guesses defeats the count."""
        from app.controllers.auth.PasswordResetController import PasswordResetController

        builder = FakeBuilder([_row(VICTIM, "123456")])
        for _ in range(5):
            self._guess(builder)

        request = _request({"email": VICTIM}, session=FakeSession())
        with patch(f"{CONTROLLER}.application") as app_mock, patch(
            f"{CONTROLLER}.User"
        ) as user_mock, patch(f"{CONTROLLER}.Mail"):
            app_mock.make.return_value = builder
            user_mock.all.return_value = [Mock(email=VICTIM)]
            PasswordResetController().store(Mock(), request, _response())

        session = self._guess(builder, code="123456")

        self.assertIsNone(session.get("reset_email"))

    def test_correct_code_clears_earlier_wrong_guesses(self):
        builder = FakeBuilder([_row(VICTIM, "123456")])
        for _ in range(4):
            self._guess(builder)
        self._guess(builder, code="123456")
        for _ in range(4):
            self._guess(builder)

        session = self._guess(builder, code="123456")

        self.assertEqual(session.get("reset_email"), VICTIM)


class LockoutWindowTestCase(TestCase):
    """Masonite's counter outlives its window (app/rate_limiters.py), so a
    lockout must end when the window does rather than stay for ten years."""

    def setUp(self):
        self.location = tempfile.mkdtemp()
        self.addCleanup(shutil.rmtree, self.location, ignore_errors=True)
        driver = FileDriver(None).set_options({"location": self.location})
        store = Mock()
        store.store.return_value = driver
        app = Mock()
        app.make.return_value = store
        patcher = patch.object(OtpAttempts, "_limiter", lambda: RateLimiter(app))
        patcher.start()
        self.addCleanup(patcher.stop)

    def _age_entries(self):
        stale = time.time() - (OtpAttempts.WINDOW_SECONDS * 5)
        for name in os.listdir(self.location):
            os.utime(os.path.join(self.location, name), (stale, stale))

    def test_lockout_ends_when_the_window_closes(self):
        for _ in range(OtpAttempts.MAX_FAILURES):
            OtpAttempts.record_failure(VICTIM)
        self.assertTrue(OtpAttempts.is_locked(VICTIM))

        self._age_entries()

        self.assertFalse(OtpAttempts.is_locked(VICTIM))

    def test_one_failure_short_of_the_limit_is_not_a_lockout(self):
        for _ in range(OtpAttempts.MAX_FAILURES - 1):
            OtpAttempts.record_failure(VICTIM)
        self.assertFalse(OtpAttempts.is_locked(VICTIM))


class AccountEnumerationTestCase(TestCase):
    def _post(self, email, users):
        from app.controllers.auth.PasswordResetController import PasswordResetController

        builder = FakeBuilder()
        session = FakeSession()
        response = _response()
        request = _request({"email": email}, session=session)
        with patch(f"{CONTROLLER}.application") as app_mock, patch(
            f"{CONTROLLER}.User"
        ) as user_mock, patch(f"{CONTROLLER}.Mail") as mail_mock:
            app_mock.make.return_value = builder
            user_mock.all.return_value = users
            PasswordResetController().store(Mock(), request, response)
        return builder, session, response, mail_mock

    def test_unknown_and_known_addresses_get_the_same_redirect(self):
        _, _, known, _ = self._post(VICTIM, [Mock(email=VICTIM)])
        _, _, unknown, _ = self._post("nobody@lspu.edu.ph", [Mock(email=VICTIM)])

        known_call = known.redirect.call_args
        unknown_call = unknown.redirect.call_args

        self.assertEqual(unknown_call.kwargs["name"], "auth.forgot-password.otp")
        self.assertEqual(unknown_call.kwargs["name"], known_call.kwargs["name"])
        self.assertEqual(unknown_call.kwargs["query_params"], {"email": "nobody@lspu.edu.ph"})
        unknown.back.assert_not_called()

    def test_unknown_address_creates_no_row_and_sends_no_mail(self):
        builder, _, _, mail_mock = self._post("nobody@lspu.edu.ph", [])

        self.assertEqual(builder.created, [])
        mail_mock.mailable.assert_not_called()

    def test_unknown_address_lands_in_the_same_session_state(self):
        _, session, _, _ = self._post("nobody@lspu.edu.ph", [])

        self.assertEqual(session.get("pending_reset_email"), "nobody@lspu.edu.ph")
