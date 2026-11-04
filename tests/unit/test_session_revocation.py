"""A session ends when its owner ends it, and on its own after a working day.

Sessions are `users.remember_token`, so deleting the browser's cookie ended
nothing: a copy of that cookie kept working until the next login. The same was
true after a password reset, which is exactly when someone suspects a copy
exists.

Also here: cookies the app did not encrypt. Masonite's EncryptCookies keeps a
value it cannot decrypt and hands it on as plaintext, and sessions live in cookies
(app/session_drivers.py), so the app could not tell what it had written from what
a client had.
"""

from unittest import TestCase
from unittest.mock import Mock, patch

from cryptography.fernet import Fernet
from masonite.auth import Sign
from masonite.cookies import CookieJar

from app.controllers.auth.LoginController import LoginController
from app.controllers.auth.SuperAdminController import SuperAdminController
from app.controllers.gears.UserController import UserController
from app.middlewares.EncryptCookies import EncryptCookies
from app.models.User import User
from app.services import SessionTokens
from Kernel import Kernel
from test_password_reset_binding import FakeBuilder, FakeSession, _request, _response

CONTROLLER = "app.controllers.auth.PasswordResetController"
_KEY_PATCH = patch.object(SessionTokens, "_key", lambda: b"revocation-test-key")


def setUpModule():
    _KEY_PATCH.start()


def tearDownModule():
    _KEY_PATCH.stop()


def _signed_in_user():
    user = User()
    user.set_remember_token()
    return user


class LogoutRevokesTheTokenTestCase(TestCase):
    def _logout(self, controller, user):
        request, response = Mock(), Mock()
        request.tab_slot = 0
        request.user.return_value = user
        request.cookie_jar.to_dict.return_value = {}
        with patch.object(User, "save") as save:
            controller.logout(request, response)
        return save

    def test_each_logout_replaces_the_stored_token(self):
        for controller in (LoginController(), UserController(), SuperAdminController()):
            user = _signed_in_user()
            before = user.remember_token

            save = self._logout(controller, user)

            self.assertNotEqual(user.remember_token, before, type(controller).__name__)
            save.assert_called_once()

    def test_logout_without_a_user_still_clears_the_cookie(self):
        request, response = Mock(), Mock()
        request.tab_slot = 0
        request.user.return_value = None
        request.cookie_jar.to_dict.return_value = {}

        LoginController().logout(request, response)

        response.delete_cookie.assert_called_once_with("token")

    def test_a_database_failure_does_not_block_logout(self):
        user = _signed_in_user()
        request, response = Mock(), Mock()
        request.tab_slot = 0
        request.user.return_value = user
        request.cookie_jar.to_dict.return_value = {}

        with patch.object(User, "save", side_effect=RuntimeError("db down")):
            LoginController().logout(request, response)

        response.delete_cookie.assert_called_once_with("token")


class PasswordResetRevokesSessionsTestCase(TestCase):
    def test_otp_reset_clears_the_stored_token_for_that_account(self):
        from app.controllers.auth.PasswordResetController import PasswordResetController

        email = "victim@lspu.edu.ph"
        token = SessionTokens.otp_digest(email, "123456")
        builder = FakeBuilder(
            [{"email": email, "token": token, "expires_at": "2099-01-01 00:00:00"}]
        )
        session = FakeSession({"reset_token": token, "reset_email": email})
        request = _request(
            {"password": "AAbb12!!xyz", "password_confirmation": "AAbb12!!xyz"},
            session=session,
        )
        with patch(f"{CONTROLLER}.application") as app_mock, patch(f"{CONTROLLER}.Hash"):
            app_mock.make.return_value = builder
            PasswordResetController().store_changed_password(Mock(), request, _response())

        sql, bindings = builder.updates()[0]
        self.assertIn("remember_token = null", sql.lower())
        self.assertIn(email, bindings)

    def test_superadmin_reset_replaces_the_stored_token(self):
        target = _signed_in_user()
        target.id = 2
        target.role = "admin"
        target.email = "ann@example.com"
        before = target.remember_token
        request = Mock()
        request.param.return_value = 2
        response = Mock()
        module = "app.controllers.auth.SuperAdminController"
        with patch(f"{module}.User") as user_mock, patch(
            f"{module}.Credentials"
        ) as credentials, patch(f"{module}.Hash") as hash_mock, patch.object(User, "save"):
            user_mock.find.return_value = target
            credentials.send_credentials.return_value = True
            credentials.generate_password.return_value = "generated"
            hash_mock.make.return_value = "new-hash"
            SuperAdminController().reset_password(request, response)

        self.assertEqual(target.password, "new-hash")
        self.assertNotEqual(target.remember_token, before)


class ForgedCookieTestCase(TestCase):
    def setUp(self):
        self.key = Fernet.generate_key().decode()
        self.sign = Sign(self.key)

    def _run(self, **cookies):
        jar = CookieJar()
        for name, value in cookies.items():
            jar.load_cookie(name, value)
        request = Mock()
        request.cookie_jar = jar
        request.app.make.return_value = self.sign
        EncryptCookies().before(request, Mock())
        return jar

    def test_a_cookie_this_app_encrypted_is_decrypted(self):
        jar = self._run(token=self.sign.sign("real-value"))
        self.assertEqual(jar.get("token").value, "real-value")

    def test_a_plaintext_session_value_never_reaches_the_app(self):
        jar = self._run(s_reset_email="someone@lspu.edu.ph", token="chosen-by-the-client")
        self.assertEqual(jar.to_dict(), {})

    def test_a_value_encrypted_under_another_key_is_dropped(self):
        other = Sign(Fernet.generate_key().decode())
        jar = self._run(token=other.sign("real-value"))
        self.assertIsNone(jar.get("token"))

    def test_good_cookies_survive_a_bad_one_beside_them(self):
        jar = self._run(token=self.sign.sign("real-value"), __cf_bm="set-by-cloudflare")
        self.assertEqual(jar.to_dict(), {"token": "real-value"})

    def test_cookies_the_app_does_not_own_are_not_cleared_in_the_browser(self):
        jar = self._run(__cf_bm="set-by-cloudflare")
        self.assertEqual(jar.deleted_cookies, {})

    def test_the_kernel_runs_this_middleware(self):
        self.assertIn(EncryptCookies, Kernel.http_middleware)
