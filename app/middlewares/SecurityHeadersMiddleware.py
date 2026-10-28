from masonite.middleware import Middleware

from app.security_headers import CSP_HEADER, new_nonce, policy_for

STATIC_HEADERS = (
    # One year, deliberately without includeSubDomains/preload: nothing in this
    # repo knows what else lives under the zone, and preload cannot be undone
    # quickly. Browsers ignore HSTS over plain http, so `craft serve` is
    # unaffected; in production Cloudflare carries it to the browser over TLS.
    ("Strict-Transport-Security", "max-age=31536000"),
    # Route-session and password-reset URLs carry tokens in the path, so a
    # cross-origin Referer gets the origin only.
    ("Referrer-Policy", "strict-origin-when-cross-origin"),
    # Deny what the site never uses. Keep geolocation and screen-wake-lock for
    # mobile-route's GPS voice (route-voice.mjs) and fullscreen for the tour.
    (
        "Permissions-Policy",
        "camera=(), microphone=(), payment=(), usb=(), "
        "geolocation=(self), screen-wake-lock=(self), fullscreen=(self)",
    ),
)


class SecurityHeadersMiddleware(Middleware):

    def before(self, request, response):
        try:
            request.csp_nonce = new_nonce()
        except Exception:
            pass
        return request

    def after(self, request, response):
        # nosniff stops a browser reading an upload's bytes and rendering it as
        # HTML on our origin (the stored-XSS case in app/services/ImageUploads.py).
        # Its own try, separate from the CSP's, so one header failing never
        # costs the other -- and after() must never raise: a lost header is a
        # lost defence-in-depth layer, an exception is a 500 on the kiosk.
        try:
            response.header("X-Content-Type-Options", "nosniff")
        except Exception:
            pass
        # Belt to the CSP's frame-ancestors braces, for browsers that predate
        # it. SAMEORIGIN, not DENY: the kiosk hub frames its own /kiosk/embed/*.
        try:
            response.header("X-Frame-Options", "SAMEORIGIN")
        except Exception:
            pass
        # The rest of SECURITY.md W4, one try each for the same reason as above.
        for name, value in STATIC_HEADERS:
            try:
                response.header(name, value)
            except Exception:
                pass
        try:
            nonce = getattr(request, "csp_nonce", "") or ""
            response.header(CSP_HEADER, policy_for(nonce))
        except Exception:
            pass
        return request
