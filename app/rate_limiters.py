"""Rate limiters for the app's throttled routes.

Registered by name in AppProvider.boot() and referenced from routes as
`.middleware("throttle:<name>")`.
"""

from masonite.rates.Limit import Limit
from masonite.rates.limiters import Limiter


class GuestAuthLimiter(Limiter):
    """Per-client throttle for guest auth endpoints (login, OTP).

    Keyed by the real client IP so a burst of bad attempts only limits that one
    client — never everyone (a bare "throttle:5/minute" keys the counter globally
    and would let anyone lock the whole site out of logging in).

    This deployment sits behind Cloudflare -> nginx -> gunicorn's unix socket, so
    REMOTE_ADDR is empty, not the visitor. The visitor's address arrives in
    X-Real-IP, which nginx's proxy_params *overwrites* with $remote_addr after
    the realip module has resolved CF-Connecting-IP -- and only for connections
    from the local tunnel. That makes X-Real-IP the one header a client cannot
    choose, so it is the only one read, and only when the connection itself came
    from the proxy (TRUSTED_PROXY_ADDRS).

    CF-Connecting-IP and X-Forwarded-For used to be read here directly. nginx
    passes the former through untouched and appends to the latter, so a client
    reaching the origin without Cloudflare could rotate either per request and
    never be throttled (SECURITY.md W2, tests/unit/test_rate_limit_client_ip.py).
    The key falls back to a constant so it is never empty/None, which would
    crash the limiter.
    """

    # The addresses nginx reaches the app from. "" is gunicorn on a unix socket
    # (it reports the peer of an AF_UNIX connection as an empty string).
    TRUSTED_PROXY_ADDRS = frozenset({"", "127.0.0.1", "::1"})

    def __init__(self, limit: str = "5/minute"):
        self.limit = limit

    def _client_ip(self, request) -> str:
        remote = (request.environ.get("REMOTE_ADDR") or "").strip()
        if remote in self.TRUSTED_PROXY_ADDRS:
            real_ip = (request.header("X-Real-IP") or "").strip()
            if real_ip:
                return real_ip
        return remote or "unknown"

    def allow(self, request):
        # Authenticated users aren't the brute-force surface here.
        if request.user():
            return Limit.unlimited()
        return Limit.from_str(self.limit).by(self._client_ip(request))


def expire_stale_attempts(rate_limiter, key) -> bool:
    """Drop an attempt counter whose window has already closed.

    Masonite stores the counter and its window as two separate cache entries,
    and only the `<key>-timer` one carries the real TTL: `RateLimiter.hit()`
    increments through `FileDriver.increment()`, which re-`put`s the counter
    with `seconds=None` — and `get_expiration_time(None)` is ten years. The
    only code that ever zeroes it lives inside `too_many_attempts()`'s
    `attempts >= max_attempts` branch, so a counter that stopped one short of
    the limit is carried, verbatim, into every later window.

    That is how a first-time password reset hit the rate-limit modal: four
    stale attempts from days earlier plus "send me a code" reached the limit,
    and the OTP post right after it was refused. (All of the guest auth routes
    share one bucket per IP — the middleware keys on `limit_string + ip` — so a
    single reset flow legitimately spends three attempts of the five.)

    Returns True when a stale counter was cleared.
    """
    if not rate_limiter.attempts(key):
        return False

    # Reading the timer is what evicts it once its TTL has passed; `has()`
    # alone only checks that the file exists.
    rate_limiter.cache.get(f"{key}-timer")
    if rate_limiter.cache.has(f"{key}-timer"):
        return False

    rate_limiter.clear(key)
    return True
