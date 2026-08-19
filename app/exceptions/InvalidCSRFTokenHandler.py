"""Graceful handling for a mismatched CSRF token.

Bound in AppProvider.register() as "InvalidCSRFTokenHandler" — Masonite's
ExceptionHandler.handle() dispatches to any container binding named exactly
f"{exception.__class__.__name__}Handler" before falling back to its generic
path (see masonite/exceptions/ExceptionHandler.py), so this is the correct
place to intercept InvalidCSRFToken specifically rather than letting it fall
through to the generic 500 page.

VerifyCsrfToken.verify_token() requires the submitted __token to match both
the `csrf_token` cookie and the live `SESSID` cookie (masonite/middleware/
route/VerifyCsrfToken.py). Whenever those diverge — most often because the
browser's SESSID cookie didn't round-trip between the GET that rendered the
form and the POST that submits it — every retry with the same stale page
fails the same way. Clearing both cookies here forces a fresh SESSID (and a
freshly matching csrf_token) on the very next request, so redirecting back
actually gives the visitor a form that will work instead of repeating the
same dead end.
"""


class InvalidCSRFTokenHandler:
    def __init__(self, application):
        self.application = application

    def handle(self, exception):
        request = self.application.make("request")
        response = self.application.make("response")

        response.delete_cookie("SESSID")
        response.delete_cookie("csrf_token")

        response.with_errors(["Your session expired — please try again."])

        return response.redirect(url=self._safe_referer(request) or "/login")

    def _safe_referer(self, request):
        referer = request.header("Referer") or ""
        host = request.header("Host") or ""
        if not referer or not host:
            return None

        from urllib.parse import urlparse

        parsed = urlparse(referer)
        if parsed.netloc != host:
            return None

        # Never bounce back to the logout endpoint itself — there is no
        # GET /logout route, so that would just trade one dead end for a 404.
        if parsed.path.rstrip("/") == "/logout":
            return None

        path = parsed.path or "/"
        return f"{path}?{parsed.query}" if parsed.query else path
