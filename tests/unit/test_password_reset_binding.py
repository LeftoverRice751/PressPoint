"""The password-reset flow must prove *which account* it is resetting.

Two bugs lived here, and they chained into full account takeover.

1. The OTP was looked up by token alone -- `WHERE token = %s` -- so a code was
   never tied to the address that asked for it. Every outstanding reset row in
   the table was simultaneously a valid answer for anybody: submit six digits,
   and whichever account happened to own that code became yours. The email the
   user typed at /forgot-password was collected, validated, and then dropped on
   the floor. With a 24-hour expiry, live rows for many accounts piled up at
   once, and matching *any* of them was enough (CWE-640).

2. `request.validate()` returns a MessageBag of ERRORS, and MessageBag defines
   only `__len__` -- so an error-free bag is FALSY. `if not is_valid:` therefore
   ran the failure branch on a *good* password and fell through to the write on
   a bad one. A compliant password was refused; a one-character password, or a
   request with no `password` field at all, was hashed and stored. Since
   `request.input()` defaults to "", the field-omitted case stored a hash of the
   empty string, after which login succeeded with a blank password.

These tests drive the controller against a fake query builder and assert on the
SQL it issues, because the binding is the fix -- a test that only checked "reset
succeeded" would pass against the vulnerable code.
"""

from unittest import TestCase
from unittest.mock import Mock, patch


class FakeBuilder:
    """Records every statement the controller issues and replays canned rows.

    `statement()` is the controller's only read path, so returning rows keyed by
    the SQL prefix lets a test say "the password_resets table contains this row"
    without a database.
    """

    def __init__(self, rows=None):
        self.rows = rows if rows is not None else []
        self.statements = []
        self.created = []

    def new(self):
        return self

    def table(self, name):
        self._table = name
        return self

    def create(self, payload):
        self.created.append(payload)
        return payload

    def statement(self, sql, bindings=None):
        self.statements.append((" ".join(sql.split()), list(bindings or [])))
        if sql.strip().upper().startswith("SELECT"):
            return self._matching_rows(bindings or [])
        return []

    def _matching_rows(self, bindings):
        """Emulate the WHERE clause: a row is returned only if every binding
        matches one of its values. That is what makes the vulnerable
        token-only query and the fixed token+email query behave differently."""
        out = []
        for row in self.rows:
            if all(b in row.values() for b in bindings):
                out.append(row)
        return out[:1]

    def selects(self):
        return [(s, b) for s, b in self.statements if s.upper().startswith("SELECT")]

    def updates(self):
        return [(s, b) for s, b in self.statements if s.upper().startswith("UPDATE")]


class FakeSession(dict):
    def set(self, key, value):
        self[key] = value

    def get(self, key, default=None):
        return dict.get(self, key, default)

    def delete(self, key):
        self.pop(key, None)


def _request(inputs=None, session=None):
    request = Mock()
    inputs = inputs or {}
    # Masonite's Request.input() defaults to "" -- the reason an omitted
    # password field reached Hash.make() rather than raising.
    request.input.side_effect = lambda key, default="": inputs.get(key, default)
    request.validate.side_effect = lambda *a, **k: _real_validate(inputs, *a)
    request.session = session if session is not None else FakeSession()
    return request


def _real_validate(inputs, rules=None, *rest):
    """Use Masonite's actual validator, so the MessageBag truthiness that caused
    bug #2 is exercised rather than mocked away."""
    from masonite.validation import Validator

    if not rules:
        return Validator().validate(dict(inputs), {})
    return Validator().validate(dict(inputs), rules)


def _response():
    response = Mock()
    terminal = Mock()
    terminal.with_errors.return_value = "errors"
    terminal.with_success.return_value = "success"
    response.back.return_value = terminal
    response.redirect.return_value = terminal
    return response


def _row(email, token, expires_at="2099-01-01 00:00:00"):
    return {"email": email, "token": token, "expires_at": expires_at}


class OtpAccountBindingTestCase(TestCase):
    """Bug #1: the OTP must only unlock the account that requested it."""

    def _verify(self, builder, otp, session):
        from app.controllers.auth.PasswordResetController import PasswordResetController

        request = _request({"otp": otp}, session=session)
        with patch(
            "app.controllers.auth.PasswordResetController.application"
        ) as app_mock:
            app_mock.make.return_value = builder
            return PasswordResetController().verify_otp(request, _response())

    def test_otp_lookup_is_scoped_to_the_requesting_email(self):
        """The SELECT must bind the email, not just the token.

        This is the whole vulnerability: with `WHERE token = %s` the query
        cannot distinguish the victim's code from anyone else's.
        """
        builder = FakeBuilder([_row("victim@lspu.edu.ph", "123456")])
        session = FakeSession({"pending_reset_email": "victim@lspu.edu.ph"})

        self._verify(builder, "123456", session)

        selects = builder.selects()
        self.assertTrue(selects, "verify_otp issued no SELECT")
        sql, bindings = selects[0]
        self.assertIn("email = %s", sql.lower())
        self.assertIn("victim@lspu.edu.ph", bindings)

    def test_another_accounts_live_code_does_not_unlock_this_flow(self):
        """The attack: seed a reset for the admin, then submit that code from a
        session that asked to reset a different address."""
        builder = FakeBuilder([_row("admin@lspu.edu.ph", "654321")])
        session = FakeSession({"pending_reset_email": "attacker@lspu.edu.ph"})

        self._verify(builder, "654321", session)

        self.assertIsNone(
            session.get("reset_email"),
            "a code belonging to another account authorised this flow",
        )
        self.assertIsNone(session.get("reset_token"))

    def test_correct_code_for_the_requesting_email_is_accepted(self):
        """The fix must not break the honest path."""
        builder = FakeBuilder([_row("victim@lspu.edu.ph", "123456")])
        session = FakeSession({"pending_reset_email": "victim@lspu.edu.ph"})

        self._verify(builder, "123456", session)

        self.assertEqual(session.get("reset_email"), "victim@lspu.edu.ph")
        self.assertEqual(session.get("reset_token"), "123456")

    def test_flow_without_a_pending_email_is_rejected(self):
        """No session context means we cannot prove ownership, so there is
        nothing to verify against -- start over rather than trust the token."""
        builder = FakeBuilder([_row("victim@lspu.edu.ph", "123456")])
        session = FakeSession()

        self._verify(builder, "123456", session)

        self.assertIsNone(session.get("reset_email"))

    def test_store_records_the_requested_email_for_later_binding(self):
        """`store()` is where the address is known; it has to survive into
        verify_otp or there is nothing to bind against."""
        from app.controllers.auth.PasswordResetController import PasswordResetController

        builder = FakeBuilder()
        session = FakeSession()
        request = _request({"email": "Victim@LSPU.edu.ph"}, session=session)

        with patch(
            "app.controllers.auth.PasswordResetController.application"
        ) as app_mock, patch(
            "app.controllers.auth.PasswordResetController.User"
        ) as user_mock, patch(
            "app.controllers.auth.PasswordResetController.Mail"
        ):
            app_mock.make.return_value = builder
            user_mock.all.return_value = [Mock(email="victim@lspu.edu.ph")]
            PasswordResetController().store(Mock(), request, _response())

        self.assertEqual(session.get("pending_reset_email"), "victim@lspu.edu.ph")


class PasswordWriteBindingTestCase(TestCase):
    """Bug #1 again, at the write: the UPDATE must target the verified account."""

    def _store_password(self, builder, session, inputs):
        from app.controllers.auth.PasswordResetController import PasswordResetController

        request = _request(inputs, session=session)
        with patch(
            "app.controllers.auth.PasswordResetController.application"
        ) as app_mock, patch(
            "app.controllers.auth.PasswordResetController.Hash"
        ) as hash_mock:
            app_mock.make.return_value = builder
            hash_mock.make.side_effect = lambda raw: f"hashed:{raw}"
            result = PasswordResetController().store_changed_password(
                Mock(), request, _response()
            )
        return result

    def test_reset_row_lookup_is_scoped_to_the_verified_email(self):
        builder = FakeBuilder([_row("victim@lspu.edu.ph", "123456")])
        session = FakeSession(
            {"reset_token": "123456", "reset_email": "victim@lspu.edu.ph"}
        )

        self._store_password(
            builder,
            session,
            {"password": "AAbb12!!xyz", "password_confirmation": "AAbb12!!xyz"},
        )

        sql, bindings = builder.selects()[0]
        self.assertIn("email = %s", sql.lower())
        self.assertIn("victim@lspu.edu.ph", bindings)

    def test_password_is_written_to_the_verified_account(self):
        builder = FakeBuilder([_row("victim@lspu.edu.ph", "123456")])
        session = FakeSession(
            {"reset_token": "123456", "reset_email": "victim@lspu.edu.ph"}
        )

        self._store_password(
            builder,
            session,
            {"password": "AAbb12!!xyz", "password_confirmation": "AAbb12!!xyz"},
        )

        updates = builder.updates()
        self.assertTrue(updates, "no password was written")
        self.assertIn("victim@lspu.edu.ph", updates[0][1])


class PasswordPolicyBranchTestCase(TestCase):
    """Bug #2: the validation branch was inverted."""

    def _attempt(self, inputs):
        from app.controllers.auth.PasswordResetController import PasswordResetController

        builder = FakeBuilder([_row("victim@lspu.edu.ph", "123456")])
        session = FakeSession(
            {"reset_token": "123456", "reset_email": "victim@lspu.edu.ph"}
        )
        request = _request(inputs, session=session)
        with patch(
            "app.controllers.auth.PasswordResetController.application"
        ) as app_mock, patch(
            "app.controllers.auth.PasswordResetController.Hash"
        ) as hash_mock:
            app_mock.make.return_value = builder
            hash_mock.make.side_effect = lambda raw: f"hashed:{raw}"
            PasswordResetController().store_changed_password(
                Mock(), request, _response()
            )
        return builder

    def test_compliant_password_is_actually_saved(self):
        """The inverted branch refused every password that PASSED the policy,
        so the reset feature could not accept a good password at all."""
        builder = self._attempt(
            {"password": "AAbb12!!xyz", "password_confirmation": "AAbb12!!xyz"}
        )
        self.assertTrue(builder.updates(), "a compliant password was rejected")

    def test_weak_password_is_not_saved(self):
        builder = self._attempt({"password": "a", "password_confirmation": "a"})
        self.assertFalse(builder.updates(), "a one-character password was stored")

    def test_unconfirmed_password_is_not_saved(self):
        builder = self._attempt(
            {"password": "AAbb12!!xyz", "password_confirmation": "different"}
        )
        self.assertFalse(builder.updates(), "a mismatched confirmation was stored")

    def test_missing_password_field_is_not_saved_as_empty_string(self):
        """The worst case: no `password` key at all. input() returns "", which
        hashed cleanly and left the account open to a blank-password login."""
        builder = self._attempt({})
        self.assertFalse(builder.updates(), "an empty password was stored")


class ResetWindowTestCase(TestCase):
    """A 24-hour window kept a large pool of live codes valid at once, which is
    what made guessing across accounts practical."""

    def test_reset_expiration_is_short(self):
        # config() needs the app booted; read the module directly instead.
        from config import auth as auth_config

        self.assertLessEqual(
            auth_config.GUARDS["password_reset_expiration"],
            60,
            "reset codes stay valid far longer than a reset takes",
        )
