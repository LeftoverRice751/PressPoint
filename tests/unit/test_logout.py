from unittest.mock import Mock

from app.controllers.auth.SuperAdminController import SuperAdminController
from app.controllers.gears.UserController import UserController
from tests import TestCase


class LogoutTestCase(TestCase):
    """Guards the dashboard logout buttons.

    Both of these methods shipped broken, in ways a page-level smoke test
    would not have caught, so each regression gets its own assertion:

      * `response.redirect("auth.login")` passes a route *name* into
        redirect()'s first positional parameter, which is a literal URL --
        the browser gets `Location: auth.login` and never reaches the login
        page. Only `name=` resolves the route.
      * `request.delete_cookie()` raises TypeError (the name argument is
        required) and, even called correctly, clears the cookie off the
        *inbound* request rather than sending a deletion to the browser.
        Dropping the `token` cookie on the response is what actually ends
        the session -- `remove_user()` alone only clears the user resolved
        for the current request, so the next one signs straight back in.
    """

    def _logout(self, controller):
        request, response = Mock(), Mock()
        controller.logout(request, response)
        return request, response

    def _assert_ends_session(self, controller):
        request, response = self._logout(controller)

        request.remove_user.assert_called_once_with()
        # On the response, and named: anything else leaves the sign-in cookie
        # sitting in the browser.
        response.delete_cookie.assert_called_once_with("token")
        request.delete_cookie.assert_not_called()

    def _assert_redirects_to_login(self, controller):
        _, response = self._logout(controller)

        response.redirect.assert_called_once_with(name="auth.login")
        # Belt and braces: a positional call would still satisfy a loose
        # assertion on the value alone.
        args, kwargs = response.redirect.call_args
        self.assertEqual(args, ())
        self.assertEqual(kwargs, {"name": "auth.login"})

    def test_admin_logout_ends_session(self):
        self._assert_ends_session(UserController())

    def test_admin_logout_redirects_to_login_route(self):
        self._assert_redirects_to_login(UserController())

    def test_super_admin_logout_ends_session(self):
        self._assert_ends_session(SuperAdminController())

    def test_super_admin_logout_redirects_to_login_route(self):
        self._assert_redirects_to_login(SuperAdminController())
