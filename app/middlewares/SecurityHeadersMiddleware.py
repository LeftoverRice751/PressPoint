from masonite.middleware import Middleware

from app.security_headers import CSP_HEADER, new_nonce, policy_for


class SecurityHeadersMiddleware(Middleware):
    """Attach the Content-Security-Policy (see app/security_headers.py).

    HTTP middleware rather than an nginx add_header on purpose:
    deploy/nginx-presspoint.conf sets add_header inside several location
    blocks, and nginx *discards* every inherited add_header in any block that
    declares one of its own. A server-level CSP would therefore vanish from
    exactly the static locations, silently. Setting it here also means the
    policy ships with the code and is covered by the test suite instead of
    depending on a root nginx deploy staying in step.

    The nonce is minted in before() so templates can read it mid-render
    (app.security_headers.csp_nonce, shared into views by AppProvider), and
    the header is written in after() so it lands on the finished response.

    Listed FIRST in Kernel.http_middleware, and after() returns the *request*,
    both for the same reason: masonite's Pipeline.through() compares each
    middleware's return value against the payload it was given (the request)
    and treats anything else as "stop the pipeline". So a middleware that
    returns the response silently cancels every after() hook listed below it
    -- which is exactly what DatabaseReconnectMiddleware does today. Running
    first keeps this header out of reach of that, whoever is added later.

    Nothing here is allowed to break a request: a missing header is a lost
    defence-in-depth layer, while an exception is a 500 on a public kiosk.
    """

    def before(self, request, response):
        try:
            request.csp_nonce = new_nonce()
        except Exception:
            pass
        return request

    def after(self, request, response):
        try:
            nonce = getattr(request, "csp_nonce", "") or ""
            response.header(CSP_HEADER, policy_for(nonce))
        except Exception:
            pass
        return request
