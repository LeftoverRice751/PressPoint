"""Masonite's throttle middleware, with the attempt counter tied to its window.

Upstream keeps two cache entries per throttled client: `<key>` (the count) and
`<key>-timer` (when the window closes). Only the timer carries a real TTL —
`RateLimiter.hit()` increments the counter through `FileDriver.increment()`,
which re-`put`s it with `seconds=None`, i.e. an expiry ten years out. The
counter is zeroed in exactly one place, inside `too_many_attempts()`'s
`attempts >= max_attempts` branch, so any count that stopped short of the limit
is carried into every later window and the limit is reached earlier and
earlier until it finally trips and self-heals.

That is what put the rate-limit modal in front of a first-time password reset:
leftover attempts from days before plus "send me a code" reached five, and the
OTP post immediately after it was refused. All the guest auth routes share one
bucket per IP (the key is `limit_string + client ip`), so one reset flow spends
three of the five attempts on its own and had very little headroom to give.

The fix is to evict a counter whose window has already closed, before the base
class reads it. See `expire_stale_attempts` in app/rate_limiters.py.
"""

import hashlib

from masonite.facades import RateLimiter
from masonite.middleware import ThrottleRequestsMiddleware as BaseThrottleMiddleware
from masonite.rates.Limit import Limit

from app.rate_limiters import expire_stale_attempts


class ThrottleRequestsMiddleware(BaseThrottleMiddleware):
    def before(self, request, response, limit_string):
        limit = self._resolve_limit(request, limit_string)
        if limit is not None and not limit.is_unlimited():
            expire_stale_attempts(RateLimiter, self._cache_key(limit_string, limit))

        return super().before(request, response, limit_string)

    def _resolve_limit(self, request, limit_string):
        """Mirror how the base class turns the middleware argument into a Limit.

        Resolving it twice per request is cheap — a named limiter's `allow()`
        only reads headers — and it keeps the key derivation here identical to
        the one the base class is about to perform.
        """
        try:
            if "/" in limit_string:
                return Limit.from_str(limit_string)
            return RateLimiter.get_limiter(limit_string).allow(request)
        except Exception:
            # Never let the cleanup break a request the base class would have
            # served; a missed eviction just means the old behaviour.
            return None

    def _cache_key(self, limit_string, limit):
        return hashlib.md5(str(limit_string + limit.key).encode()).hexdigest()
