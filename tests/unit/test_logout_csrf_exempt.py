from unittest.mock import Mock

from app.middlewares.VerifyCsrfToken import VerifyCsrfToken
from tests import TestCase

LOGOUT_PATHS = ("/logout", "/users/logout", "/auth/super_admin/logout")


class LogoutCsrfExemptTestCase(TestCase):
    """Logout must never be refused for a stale CSRF token.

    Masonite's token is the SESSID cookie itself, so anything that rotates
    SESSID while a dashboard tab sits open (a CSRF failure in another tab of
    the origin clears it for all of them) leaves that tab's logout form stale.
    InvalidCSRFTokenHandler then bounced the POST back to the Referer -- the
    same dashboard URL -- and the dashboard renders no flash bag, so clicking
    "Log out" looked like it did nothing at all.

    Exempting it is safe because the session cookies are SameSite=Lax: a
    cross-site POST arrives without them, request.user() is False, and
    SessionTokens.revoke() returns early. Nobody can be signed out from
    another origin; the only thing CSRF was guarding here was that.
    """

    def _request(self, path, method="POST"):
        request = Mock()
        request.get_path.return_value = path
        request.is_not_safe.return_value = method != "GET"
        request.cookie.return_value = None
        # Bind the real matcher so the test exercises Masonite's regex, not a mock.
        from masonite.request.request import Request

        request.contains = lambda route: Request.contains(request, route)
        return request

    def test_every_logout_route_skips_the_token_check(self):
        middleware = VerifyCsrfToken()
        for path in LOGOUT_PATHS:
            with self.subTest(path=path):
                # No token at all: would raise InvalidCSRFToken if not exempt.
                self.assertTrue(middleware.verify_token(self._request(path), None))

    def test_exemption_is_anchored(self):
        # request.contains() is an unanchored re.match, so "/logout" alone
        # would also have exempted /logout-anything.
        middleware = VerifyCsrfToken()
        from masonite.exceptions import InvalidCSRFToken

        for path in ("/logoutx", "/users/logout/extra", "/users"):
            with self.subTest(path=path):
                with self.assertRaises(InvalidCSRFToken):
                    middleware.verify_token(self._request(path), None)

    def test_exempt_paths_match_the_declared_logout_routes(self):
        # If a logout route is renamed, the exemption must follow it.
        # Imported here, not at module level: importing a routes module while
        # pytest collects re-enters routes.web mid-import (circular).
        from routes.auth import ROUTES as AUTH_ROUTES
        from routes.super_admin import ROUTES as SUPER_ADMIN_ROUTES

        declared = {
            "/" + route.url.strip("/")
            for route in AUTH_ROUTES + SUPER_ADMIN_ROUTES
            if route.url.rstrip("/").endswith("logout")
        }
        self.assertEqual(declared, set(LOGOUT_PATHS))
