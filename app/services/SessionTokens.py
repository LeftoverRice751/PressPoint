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

Rows written before this module are upgraded on use: find_user() falls back
to a plaintext match, then re-stores that row hashed, so the deploy signed no
one out. scripts/purge_legacy_session_tokens.py clears the leftovers of users
who never came back.
"""

import hashlib
import hmac
import secrets

from app.models.User import User

PREFIX = "h1:"

# token_urlsafe(32) is 256 bits -- the uuid4 it replaces carried 122.
TOKEN_BYTES = 32

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
    return secrets.token_urlsafe(TOKEN_BYTES)


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
    if not token:
        return None

    user = User.where("remember_token", digest(token)).first()
    if user:
        return user

    # Never fall back for a value that is itself a digest: that is exactly a
    # row copied out of the column, and accepting it would undo the point.
    if token.startswith(PREFIX):
        return None

    legacy = User.where("remember_token", token).first()
    if not legacy:
        return None
    legacy.remember_token = digest(token)
    try:
        legacy.save()
    except Exception:
        # Still a valid session this request; it upgrades on the next one.
        pass
    return legacy
