"""Where each role lands, and that an admin cannot end up in the composer.

Editors cannot publish. Every submission waits at `status = "review"` until an
admin approves it (`app/services/ReviewQueue.py`), and that approval queue used
to live on the *editor* dashboard -- a surface admins never open, because
sign-in sends them to /users. The queue existed and was unreachable.

The queue now lives on the admin console at /users, so these two things have to
stay true together: an admin lands there, and an admin who types the editor
dashboard's URL is sent back. If either regresses, the approval flow goes
missing again exactly the way it did before.

`fragment`/`stamps` deliberately do NOT redirect -- the admin console polls
them for its own live refresh.
"""

from unittest.mock import Mock, patch

from app.controllers.auth.LoginController import LoginController
from app.controllers.gears.DashboardController import DashboardController
from tests import TestCase


class LoginLandingTestCase(TestCase):
    def _sign_in_as(self, role):
        user = Mock(id=1, username="someone", role=role, remember_token="tok")
        request, response = Mock(), Mock()
        request.input.side_effect = lambda key: {
            "username": "someone",
            "password": "secret",
        }.get(key, "")

        with patch("app.controllers.auth.LoginController.User") as user_model:
            user_model.return_value.attempt.return_value = user
            user_model.where.return_value.first.return_value = user
            LoginController().store(request, response)

        return response

    def test_admin_lands_on_the_admin_console(self):
        self._sign_in_as("admin").redirect.assert_called_once_with(name="users.view")

    def test_editor_lands_on_the_composer(self):
        self._sign_in_as("editor").redirect.assert_called_once_with(name="gears.dashboard")

    def test_super_admin_lands_on_its_own_console(self):
        self._sign_in_as("superadmin").redirect.assert_called_once_with(
            name="auth.super_admin"
        )

    def test_unknown_role_is_told_what_is_actually_wrong(self):
        """An account whose role is empty or misspelled matches no branch and
        falls through. Reporting that as a bad password sends whoever hits it
        chasing the wrong problem -- their credentials were correct, which is
        why they got this far."""
        response = self._sign_in_as("")
        response.redirect.assert_called_once_with(name="auth.login")

        (messages,), _ = response.redirect.return_value.with_errors.call_args
        self.assertEqual(len(messages), 1)
        self.assertNotIn("password", messages[0].lower())
        self.assertIn("role", messages[0].lower())

    def test_casing_drift_does_not_strand_an_admin(self):
        """The live `users.role` column holds values with stray casing, which
        is why every role comparison in this codebase is `.strip().lower()`."""
        self._sign_in_as("  Admin ").redirect.assert_called_once_with(name="users.view")


class DashboardRedirectsAdminsTestCase(TestCase):
    def _show_as(self, role):
        request, response, views = Mock(), Mock(), Mock()
        request.user.return_value = Mock(id=2, role=role)
        request.input.return_value = ""
        DashboardController().show(views, request, response)
        return response, views

    def test_admin_is_sent_to_their_own_console(self):
        response, views = self._show_as("admin")
        response.redirect.assert_called_once_with(name="users.view")
        # Not merely redirected after the fact: the page must not be built at
        # all, or the redirect pays for a full_context() nobody renders.
        views.render.assert_not_called()

    def test_editor_still_gets_the_composer(self):
        response, views = self._show_as("editor")
        response.redirect.assert_not_called()
        self.assertEqual(views.render.call_args[0][0], "gears/dashboard")

    def test_stamps_does_not_redirect_an_admin(self):
        """The admin console polls this endpoint every 20s for its own queue
        and tiles. Bouncing it would silently freeze both."""
        request, response = Mock(), Mock()
        request.user.return_value = Mock(id=2, role="admin")
        DashboardController().stamps(request, response)
        response.redirect.assert_not_called()
