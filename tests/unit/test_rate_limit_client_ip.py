"""The throttle key must be an address the client cannot choose.

`GuestAuthLimiter` used to key on `CF-Connecting-IP`, then the first entry of
`X-Forwarded-For`, both read straight off the request. nginx's `proxy_params`
forwards a client's own `CF-Connecting-IP` untouched, and its
`$proxy_add_x_forwarded_for` *appends* to whatever the client sent, so anyone
reaching the origin without going through Cloudflare (the LAN on :80) could
send a fresh address per request and never be throttled -- measured on a dev
server: 8 of 8 failed logins accepted with a rotating header, against 429 from
the 6th with a fixed one (SECURITY.md, W2).

The only header nginx *replaces* rather than passes through is `X-Real-IP`
(`proxy_set_header X-Real-IP $remote_addr`, after the realip module has
resolved Cloudflare's visitor address). So it is trusted, and only when the
connection itself came from that proxy: gunicorn's unix socket (REMOTE_ADDR is
empty) or loopback. A direct connection from anywhere else is keyed by its own
socket address and every header is ignored.
"""

from unittest import TestCase

from app.rate_limiters import GuestAuthLimiter


class FakeRequest:
    def __init__(self, remote_addr, **headers):
        self.environ = {} if remote_addr is None else {"REMOTE_ADDR": remote_addr}
        self._headers = {k.replace("_", "-").lower(): v for k, v in headers.items()}

    def header(self, name):
        return self._headers.get(name.lower())


class RateLimitClientIpTest(TestCase):
    def setUp(self):
        self.limiter = GuestAuthLimiter("5/minute")

    def ip(self, remote_addr, **headers):
        return self.limiter._client_ip(FakeRequest(remote_addr, **headers))

    def test_spoofed_cf_connecting_ip_is_ignored_behind_nginx(self):
        # nginx sets X-Real-IP itself; the client's CF header must not win.
        self.assertEqual(
            self.ip("", X_Real_IP="198.51.100.7", CF_Connecting_IP="203.0.113.9"),
            "198.51.100.7",
        )

    def test_spoofed_x_forwarded_for_is_ignored_behind_nginx(self):
        self.assertEqual(
            self.ip("", X_Real_IP="198.51.100.7", X_Forwarded_For="203.0.113.9, 198.51.100.7"),
            "198.51.100.7",
        )

    def test_x_real_ip_trusted_from_loopback_proxy(self):
        self.assertEqual(self.ip("127.0.0.1", X_Real_IP="198.51.100.7"), "198.51.100.7")
        self.assertEqual(self.ip("::1", X_Real_IP="198.51.100.7"), "198.51.100.7")

    def test_direct_client_headers_are_all_ignored(self):
        # Not the proxy: a LAN host talking to the app server directly.
        self.assertEqual(
            self.ip(
                "10.0.0.42",
                X_Real_IP="192.0.2.1",
                CF_Connecting_IP="203.0.113.9",
                X_Forwarded_For="198.51.100.1",
            ),
            "10.0.0.42",
        )

    def test_rotating_headers_from_loopback_without_x_real_ip_share_one_key(self):
        # `craft serve` with no nginx in front: the CF header no longer splits the bucket.
        keys = {self.ip("127.0.0.1", CF_Connecting_IP=f"203.0.113.{n}") for n in range(1, 9)}
        self.assertEqual(keys, {"127.0.0.1"})

    def test_key_is_never_empty(self):
        self.assertEqual(self.ip(""), "unknown")
        self.assertEqual(self.ip(None), "unknown")
        self.assertEqual(self.ip("", X_Real_IP="   "), "unknown")
