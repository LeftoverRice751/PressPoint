"""Changing your own password from the profile panel.

The service is the whole security story: the caller must hold the current
password, the new one must meet the same `strong` policy the reset flow uses,
and a success rotates `remember_token` so every other tab and device is signed
out on its next request. Refusals share ONE message on purpose — a form that
said "current password wrong" separately from "new password weak" would let a
hijacked session confirm the current password one guess at a time.

Real bcrypt through the Hash facade (needs the container, hence `wsgi`);
the user row and the two side effects (reset-row cleanup, email) are mocked.
"""

from unittest import TestCase
from unittest.mock import Mock, patch

from masonite.facades import Hash

from app.services import PasswordChange
from wsgi import application  # noqa: F401  (binds the Hash facade)

CURRENT = "OldPass!!22Aa"
STRONG = "NewPass!!33Bb"


def _user(**overrides):
    fields = {
        "id": 3,
        "username": "jdelacruz",
        "email": "j@example.com",
        "role": "editor",
        "password": Hash.make(CURRENT),
        "remember_token": "token-before",
    }
    fields.update(overrides)
    user = Mock(**fields)
    user.save = Mock()

    def _mint(token=None):
        user.remember_token = "token-after"
        return user

    user.set_remember_token = Mock(side_effect=_mint)
    return user


class PolicyTestCase(TestCase):
    def test_accepts_the_strong_shape(self):
        self.assertEqual(PasswordChange.policy_errors(STRONG), [])

    def test_rejects_short(self):
        self.assertTrue(PasswordChange.policy_errors("Aa!1Aa!"))

    def test_rejects_one_of_a_class(self):
        # Masonite's `strong` wants TWO of each class; one uppercase is not enough.
        self.assertTrue(PasswordChange.policy_errors("newpass!!33bA"))

    def test_rejects_no_symbol(self):
        self.assertTrue(PasswordChange.policy_errors("NewPass3344Bb"))


@patch("app.services.PasswordChange.send_notice", return_value=True)
@patch("app.services.PasswordChange.forget_pending_resets")
class ApplyTestCase(TestCase):
    def test_wrong_current_password_is_refused(self, forget, notice):
        user = _user()
        before = user.password
        result = PasswordChange.apply(user, "nope", STRONG, STRONG)
        self.assertFalse(result.ok)
        self.assertEqual(result.errors, [PasswordChange.GENERIC_ERROR])
        self.assertEqual(user.password, before)
        self.assertEqual(user.remember_token, "token-before")
        user.save.assert_not_called()
        forget.assert_not_called()
        notice.assert_not_called()

    def test_weak_new_password_is_refused(self, forget, notice):
        user = _user()
        result = PasswordChange.apply(user, CURRENT, "weak", "weak")
        self.assertFalse(result.ok)
        self.assertEqual(result.errors, [PasswordChange.GENERIC_ERROR])
        user.save.assert_not_called()

    def test_mismatched_confirmation_is_refused(self, forget, notice):
        user = _user()
        result = PasswordChange.apply(user, CURRENT, STRONG, STRONG + "x")
        self.assertFalse(result.ok)
        user.save.assert_not_called()

    def test_same_as_current_is_refused(self, forget, notice):
        user = _user()
        result = PasswordChange.apply(user, CURRENT, CURRENT, CURRENT)
        self.assertFalse(result.ok)
        user.save.assert_not_called()

    def test_success_rehashes_rotates_token_and_cleans_up(self, forget, notice):
        user = _user()
        result = PasswordChange.apply(user, CURRENT, STRONG, STRONG)
        self.assertTrue(result.ok)
        self.assertTrue(result.emailed)
        self.assertTrue(Hash.check(STRONG, user.password))
        self.assertFalse(Hash.check(CURRENT, user.password))
        self.assertEqual(user.remember_token, "token-after")
        user.save.assert_called_once()
        forget.assert_called_once_with("j@example.com")
        notice.assert_called_once_with(user)

    def test_mail_failure_does_not_fail_the_change(self, forget, notice):
        notice.return_value = False
        user = _user()
        result = PasswordChange.apply(user, CURRENT, STRONG, STRONG)
        self.assertTrue(result.ok)
        self.assertFalse(result.emailed)
        self.assertTrue(Hash.check(STRONG, user.password))

    def test_account_without_email_skips_cleanup_and_notice(self, forget, notice):
        user = _user(email=None)
        result = PasswordChange.apply(user, CURRENT, STRONG, STRONG)
        self.assertTrue(result.ok)
        self.assertFalse(result.emailed)
        forget.assert_not_called()
        notice.assert_not_called()

    def test_missing_fields_are_refused_without_touching_the_row(self, forget, notice):
        # request.input() defaults to "" — Hash.make("") must never be reached.
        user = _user()
        result = PasswordChange.apply(user, "", "", "")
        self.assertFalse(result.ok)
        user.save.assert_not_called()
