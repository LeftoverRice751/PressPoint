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
        try:
            nonce = getattr(request, "csp_nonce", "") or ""
            response.header(CSP_HEADER, policy_for(nonce))
        except Exception:
            pass
        return request
