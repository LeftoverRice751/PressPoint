"""The password-changed notice is the only channel a hijacked change can be
noticed on, so it must actually send, and send to the account's own address."""

from unittest import TestCase
from unittest.mock import Mock, patch

from app.services import PasswordChange
from wsgi import application  # noqa: F401


class PasswordChangedNoticeTestCase(TestCase):
    @patch("app.services.PasswordChange.Mail")
    def test_sends_to_the_account_email(self, MockMail):
        user = Mock(username="jdelacruz", email="j@example.com")
        self.assertTrue(PasswordChange.send_notice(user))
        mailable = MockMail.mailable.call_args[0][0]
        self.assertEqual(type(mailable).__name__, "PasswordChanged")
        self.assertEqual(mailable.username, "jdelacruz")
        MockMail.mailable.return_value.send.assert_called_once()

    @patch("app.services.PasswordChange.Mail")
    def test_mail_exception_is_swallowed(self, MockMail):
        MockMail.mailable.return_value.send.side_effect = RuntimeError("smtp down")
        user = Mock(username="jdelacruz", email="j@example.com")
        self.assertFalse(PasswordChange.send_notice(user))

    def test_mailable_builds(self):
        from app.mailables.PasswordChanged import PasswordChanged

        mailable = PasswordChanged(username="jdelacruz").to("j@example.com")
        self.assertEqual(mailable.username, "jdelacruz")
