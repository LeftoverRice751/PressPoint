"""Wrong password-reset codes, counted against the account.

The `otp` throttle is per client address, so it cannot stop guesses spread across
many addresses, and a six-digit code has only a million values. This counts per
account instead.

The count survives a new code on purpose: if requesting a code reset it, asking
for a fresh one every few guesses would make the limit meaningless. The cost is
that someone hammering an address can hold up that person's reset until the
window closes, which is an inconvenience rather than a takeover.

Built on RateLimiter because its counters already get the locked file driver
(app/cache_drivers.py), and expire_stale_attempts because Masonite's counter
otherwise outlives its window by ten years (app/rate_limiters.py).
"""

import hashlib

from masonite.facades import RateLimiter

from app.rate_limiters import expire_stale_attempts

MAX_FAILURES = 5
WINDOW_SECONDS = 15 * 60


def _limiter():
    return RateLimiter


def _key(email):
    # A hash because the key names a cache file; it protects nothing itself.
    digest = hashlib.sha256(email.encode(), usedforsecurity=False).hexdigest()
    return f"otp-failures-{digest}"


def is_locked(email):
    limiter = _limiter()
    key = _key(email)
    expire_stale_attempts(limiter, key)
    return limiter.too_many_attempts(key, MAX_FAILURES)


def record_failure(email):
    """Count one wrong code and return the total for this window."""
    limiter = _limiter()
    key = _key(email)
    expire_stale_attempts(limiter, key)
    # int() because the file driver's increment() hands back the stored string.
    return int(limiter.hit(key, WINDOW_SECONDS))


def clear(email):
    _limiter().clear(_key(email))
