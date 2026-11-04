"""Session tokens and reset codes, stored as keyed hashes.

A session on this app *is* `users.remember_token`: the tab's slot cookie
carries it and LoadSlotUserMiddleware resolves the user by it. It used to be
stored verbatim (Masonite's `set_remember_token` writes a bare uuid4), so any
read of the users table -- a dump, a backup, a read-only SQL injection -- was a
live session for every account. The OTP codes in `password_resets.token` had
the same problem (SECURITY.md W3).

The column now holds `h1:` + HMAC-SHA256(APP_KEY, token); only the cookie
holds the plaintext. HMAC rather than a bare SHA-256 because the OTP space is
10^6: a plain hash of a 6-digit code is reversed by trying all of them, while a
keyed one needs APP_KEY too, which lives in .env and not in the database.
Rotating APP_KEY therefore signs everyone out -- it already did, since it also
encrypts every cookie.

Rows still holding plaintext no longer sign anyone in;
scripts/purge_legacy_session_tokens.py clears them from the table.

A token works for SESSION_LIFETIME_SECONDS from login, however active its owner
is. Tokens minted before that limit carry no issue time, so they were all
refused once it shipped: everyone signed in again, one time.
"""

import hashlib
import hmac
import secrets
import time
import traceback

from app.models.User import User

PREFIX = "h1:"

# token_urlsafe(32) is 256 bits -- the uuid4 it replaces carried 122.
TOKEN_BYTES = 32

# A working day: long enough not to interrupt an editor, short enough that a
# stolen cookie doesn't stay useful indefinitely.
SESSION_LIFETIME_SECONDS = 12 * 60 * 60

_PLAIN_ATTR = "_plain_remember_token"


def _key() -> bytes:
    from masonite.configuration import config

    return str(config("application.key") or "").encode()


def _hmac(message: str) -> str:
    return PREFIX + hmac.new(_key(), message.encode(), hashlib.sha256).hexdigest()


def digest(token: str) -> str:
    """What the users table stores for a session token."""
    return _hmac(f"session:{token}")


def otp_digest(email: str, code: str) -> str:
    """What password_resets stores for a reset code.

    Bound to the email so the same code issued to two accounts never shares a
    stored value, and domain-separated from session digests.
    """
    return _hmac(f"otp:{(email or '').strip().lower()}:{code}")


def new_token() -> str:
    # The issue time travels inside the token rather than in a column: the digest
    # covers the whole value, so changing the time stops it matching its row.
    return f"{int(time.time())}.{secrets.token_urlsafe(TOKEN_BYTES)}"


def _within_lifetime(token: str) -> bool:
    issued, separator, _ = token.partition(".")
    if not separator or not issued.isdigit():
        return False
    return time.time() - int(issued) < SESSION_LIFETIME_SECONDS


def revoke(user) -> None:
    """End every session for `user`. Best-effort, so logout always completes."""
    if not user:
        return
    try:
        user.set_remember_token()
        user.save()
    except Exception as exception:
        traceback.print_exception(type(exception), exception, exception.__traceback__)


def remember(user, token: str) -> None:
    """Point `user` at a fresh session token: hash to the column, plaintext to
    the instance (an underscore attribute, which the ORM never persists)."""
    user.remember_token = digest(token)
    setattr(user, _PLAIN_ATTR, token)


def plain_token(user) -> str:
    """The plaintext of the token minted on this instance, for the cookie.

    Empty when this instance never minted one -- a user re-read from the
    database only knows the hash, by design.
    """
    return user.__dict__.get(_PLAIN_ATTR, "") or ""


def find_user(token):
    """The user this cookie value signs in, or None."""
    if not token or not _within_lifetime(token):
        return None

    # Only ever the digest of the cookie, never the cookie compared to the column.
    # A plaintext fallback for pre-hash rows used to sit here, and because the
    # column's collation ignores case, it could match a copied hash in another case.
    return User.where("remember_token", digest(token)).first()
