"""Account credential generation and delivery.

Both account-creation surfaces -- UserController (editors) and
SuperAdminController (admins) -- minted a password inline and then repeated
the same Mail.mailable(...) block verbatim. They had drifted apart: editors
got secrets.token_urlsafe(8) while admins got (16), so the account with the
*lower* privilege had the weaker password. One helper, one strength.

send_credentials() deliberately returns a bool instead of swallowing the
failure, because the two callers need opposite behaviour on a mail outage:
creating an account keeps the row and warns, while resetting a password must
roll back -- a saved password whose email never arrived locks the owner out
with no recovery path.
"""

import secrets

from masonite.facades import Mail

from app.mailables.AccountCredentials import AccountCredentials
from app.mailables.EmailChanged import EmailChanged

# token_urlsafe(n) yields ~1.3n characters of base64url, so 16 bytes is a
# 22-character password. These are machine-generated and delivered by email,
# never typed from memory, so there is no reason to go shorter.
PASSWORD_BYTES = 16


def generate_password():
    """A fresh URL-safe temporary password."""
    return secrets.token_urlsafe(PASSWORD_BYTES)


def send_credentials(email, username, password):
    """Email a username/temporary-password pair. True if it went out."""
    if not email:
        return False

    try:
        Mail.mailable(
            AccountCredentials(username=username, password=password).to(email)
        ).send()
        return True
    except Exception:
        return False


def send_email_change_notice(recipient, username, old_email, new_email):
    """Tell one address that the account's email moved.

    Sent to *both* the old and the new address: the new one confirms the
    change landed, and the old one is the only channel left that a hijacked
    or mistyped change can be noticed on.
    """
    if not recipient:
        return False

    try:
        Mail.mailable(
            EmailChanged(
                username=username,
                old_email=old_email,
                new_email=new_email,
            ).to(recipient)
        ).send()
        return True
    except Exception:
        return False
