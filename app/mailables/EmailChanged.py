from masonite.mail import Mailable
from masonite.configuration import config


class EmailChanged(Mailable):
    """Notice that a super admin moved an account's email address.

    The recipient is set by the caller's .to(...), because this same message
    goes to two places: the new address (confirmation) and the old one, which
    is the only channel a mistyped or unwanted change can be caught on.
    """

    def __init__(self, username=None, old_email=None, new_email=None):
        super().__init__()
        self.username = username
        self.old_email = old_email
        self.new_email = new_email

    def build(self):
        return (
            self.subject("Your Presspoint Sign-in Email Changed")
            .from_(config("mail.drivers.smtp.from"))
            .view(
                "auth.mailables.email_changed",
                {
                    "username": self.username,
                    "old_email": self.old_email,
                    "new_email": self.new_email,
                },
            )
        )
