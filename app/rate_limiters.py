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

    This deployment sits behind Cloudflare -> nginx, so REMOTE_ADDR is the local
    socket, not the visitor. We prefer CF-Connecting-IP (set by Cloudflare and the
    hardest to spoof), then fall back through the forwarded headers, and finally to
    a constant so the key is never empty/None (which would crash the limiter).
    """

    def __init__(self, limit: str = "5/minute"):
        self.limit = limit

    def _client_ip(self, request) -> str:
        forwarded = (request.header("X-Forwarded-For") or "").split(",")[0].strip()
        return (
            request.header("CF-Connecting-IP")
            or forwarded
            or request.environ.get("REMOTE_ADDR")
            or "unknown"
        )

    def allow(self, request):
        # Authenticated users aren't the brute-force surface here.
        if request.user():
            return Limit.unlimited()
        return Limit.from_str(self.limit).by(self._client_ip(request))
