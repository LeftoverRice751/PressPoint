"""The throttle counter must expire with its own window.

Reported symptom: a user starting a password reset hit the rate-limit modal on
their *first* OTP submission, minutes after any previous activity.

Cause, upstream in Masonite: `RateLimiter.hit()` stores the attempt counter via
`FileDriver.increment()` -> `put(key, value)` with `seconds=None`, and
`FileDriver.get_expiration_time(None)` is *ten years*. Only the companion
`<key>-timer` entry carries the real window (60s). `too_many_attempts()` zeroes
the counter when the timer is gone, but only inside its `attempts >= max`
branch — so a counter that stopped one short of the limit is never reset and
carries over, forever, into every later window.

On top of that, `throttle:auth` is one shared bucket per IP across login,
forgot-password, OTP verify and change-password (the middleware keys on
`limit_string + client ip`), so a single legitimate reset flow spends three of
the five attempts. A leftover count of four therefore blocks the OTP post that
follows the very first "send me a code".
"""

import os
import shutil
import tempfile
import time
from unittest import TestCase

from masonite.rates.RateLimiter import RateLimiter
from masonite.cache.drivers.FileDriver import FileDriver

from app.rate_limiters import expire_stale_attempts

MAX_ATTEMPTS = 5
WINDOW = 60
KEY = "auth-198.51.100.7"


class _Store:
    def __init__(self, driver):
        self._driver = driver

    def store(self):
        return self._driver


class _App:
    def __init__(self, store):
        self._store = store

    def make(self, name):
        assert name == "cache"
        return self._store


class AuthRateLimitWindowTest(TestCase):
    def setUp(self):
        self.location = tempfile.mkdtemp()
        driver = FileDriver(None).set_options({"location": self.location})
        self.limiter = RateLimiter(_App(_Store(driver)))

    def tearDown(self):
        shutil.rmtree(self.location, ignore_errors=True)

    def _attempt(self, key=KEY):
        """One request through the throttle middleware's decision path."""
        expire_stale_attempts(self.limiter, key)
        if self.limiter.too_many_attempts(key, MAX_ATTEMPTS):
            return False
        self.limiter.hit(key, WINDOW)
        return True

    def _close_window(self, key=KEY):
        """Age every cache entry for this key past the window, as the clock does."""
        stale = time.time() - (WINDOW * 5)
        for name in (key, f"{key}-timer"):
            path = os.path.join(self.location, name)
            if os.path.exists(path):
                os.utime(path, (stale, stale))

    def test_counter_does_not_survive_its_window(self):
        """A closed window hands the next one a full allowance, not a remainder."""
        for _ in range(4):
            self.assertTrue(self._attempt())

        self._close_window()

        for index in range(MAX_ATTEMPTS):
            self.assertTrue(
                self._attempt(),
                f"attempt {index + 1} of the new window was charged to the old one",
            )

    def test_password_reset_flow_is_not_blocked_by_a_previous_window(self):
        # Yesterday: four attempts, one short of the limit, so the only branch
        # that ever zeroes the counter never ran.
        for _ in range(4):
            self.assertTrue(self._attempt())
        self._close_window()

        # Today, a fresh reset: request the code, submit the OTP, set the
        # password. All three share the `throttle:auth` bucket.
        self.assertTrue(self._attempt(), "POST /forgot-password was throttled")
        self.assertTrue(self._attempt(), "POST /forgot-password/otp was throttled")
        self.assertTrue(self._attempt(), "POST /change-password was throttled")

    def test_still_throttles_a_burst_inside_one_window(self):
        for _ in range(MAX_ATTEMPTS):
            self.assertTrue(self._attempt())
        self.assertFalse(self._attempt(), "the limit stopped being enforced")
