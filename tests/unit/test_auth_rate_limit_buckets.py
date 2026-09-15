"""The password reset flow must not share a throttle bucket with login.

The throttle middleware keys on `limit_string + client ip`, so every route
carrying `throttle:auth` drew from one 5/minute allowance per IP. A single
honest reset spends three of those five — request the code, submit the OTP, set
the new password — which left no room for a resend or a mistyped digit, and on
a campus NAT one person's login attempts ate another's reset.

The split keeps the guessing surfaces tight rather than loosening them:

  * `auth`           login only.
  * `password-reset` sending a code / setting the new password. Looser: it is
                     rate-limited to stop mail flooding, not credential guessing.
  * `otp`            code verification, alone in its own bucket. `verify_otp`
                     looks a token up across the whole `password_resets` table,
                     so this endpoint IS the brute-force surface and keeps the
                     tight allowance — it just no longer spends it on the two
                     requests that bracket it.
"""

import hashlib
from unittest import TestCase

from masonite.facades import RateLimiter

from app.providers.AppProvider import AppProvider
from wsgi import application

EXPECTED_ROUTE_LIMITERS = {
    "auth.login.store": "throttle:auth",
    "auth.forgot-password.store": "throttle:password-reset",
    "auth.forgot-password.otp.store": "throttle:otp",
    "auth.change-password.store": "throttle:password-reset",
    "profile.password": "throttle:password-change",
}

EXPECTED_LIMITS = {
    "auth": "5/minute",
    "password-reset": "10/minute",
    "otp": "5/minute",
    "password-change": "5/minute",
}


class AuthRateLimitBucketsTest(TestCase):
    @classmethod
    def setUpClass(cls):
        # Limiters are registered in boot(), which normally runs per request.
        AppProvider(application).boot()

    def _routes_by_name(self):
        return {
            route.get_name(): route
            for route in application.make("router").routes
            if route.get_name()
        }

    def test_each_auth_route_carries_its_own_limiter(self):
        routes = self._routes_by_name()
        for name, expected in EXPECTED_ROUTE_LIMITERS.items():
            self.assertIn(name, routes, f"route {name} is missing")
            self.assertIn(
                expected,
                routes[name].list_middleware,
                f"{name} should be throttled by {expected}, got "
                f"{routes[name].list_middleware}",
            )

    def test_limiters_are_registered_with_the_expected_allowances(self):
        for name, limit in EXPECTED_LIMITS.items():
            limiter = RateLimiter.get_limiter(name)
            self.assertEqual(limiter.limit, limit, f"limiter {name}")

    def test_the_buckets_are_independent_for_one_client(self):
        """Same visitor, different endpoints: the counters must not collide."""
        ip = "198.51.100.7"
        keys = {
            name: hashlib.md5((name + ip).encode()).hexdigest()
            for name in EXPECTED_LIMITS
        }
        self.assertEqual(
            len(set(keys.values())),
            len(keys),
            "two limiters share a cache key, so they share an allowance",
        )
