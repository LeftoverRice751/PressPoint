from masonite.mail import Mailable
from masonite.configuration import config


class AccountCredentials(Mailable):
    def __init__(self, username=None, password=None):
        super().__init__()
        self.username = username
        self.password = password

    def build(self):
        return (
            self.subject("Your Presspoint Account")
            .from_(config("mail.drivers.smtp.from"))
            .view(
                "auth.mailables.account_credentials",
                {
                    "username": self.username,
                    "password": self.password,
                },
            )
        )
