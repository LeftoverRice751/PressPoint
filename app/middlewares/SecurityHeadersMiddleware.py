from masonite.middleware import Middleware

from app.security_headers import CSP_HEADER, new_nonce, policy_for


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
        try:
            nonce = getattr(request, "csp_nonce", "") or ""
            response.header(CSP_HEADER, policy_for(nonce))
        except Exception:
            pass
        return request
