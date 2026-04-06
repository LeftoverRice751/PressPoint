from masonite.mail import Mailable
from masonite.configuration import config


class ResetPassword(Mailable):
    def __init__(self, token=None):
        super().__init__()
        self.token = token

    def build(self):
        return (
            self.subject("Your Presspoint OTP Code")
            .from_(config("mail.drivers.smtp.from"))
            .view("auth.mailables.reset_password", {"token": self.token})
        )
