from masonite.mail import Mailable
from masonite.configuration import config


class PasswordChanged(Mailable):
    """Notice that the account's own password was changed from the dashboard.

    Sent to the account's email only. It carries nothing secret — no password,
    no token — its whole job is to be noticed by the real owner if it was not
    them at the keyboard.
    """

    def __init__(self, username=None):
        super().__init__()
        self.username = username

    def build(self):
        return (
            self.subject("Your Presspoint Password Was Changed")
            .from_(config("mail.drivers.smtp.from"))
            .view("auth.mailables.password_changed", {"username": self.username})
        )
