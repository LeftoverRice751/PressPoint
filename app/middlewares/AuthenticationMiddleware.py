from masonite.middleware import Middleware


class AuthenticationMiddleware(Middleware):
    """Middleware to check if the user is logged in."""

    def before(self, request, response):
        if not request.user():
            return response.redirect(name="auth.login")
        return request

    def after(self, request, response):
        # Every authenticated page embeds a live CSRF token tied to the
        # visitor's own SESSID. If Cloudflare (or a browser bfcache) ever
        # serves a cached copy of one of these pages to a different session,
        # that stale token fails VerifyCsrfToken on the next POST (e.g.
        # logout), and InvalidCSRFTokenHandler quietly bounces back to the
        # referring page instead of completing the action — looking like
        # "logout just refreshes the dashboard." no-store keeps this HTML
        # out of any cache so the token is always the live one.
        response.header("Cache-Control", "no-store, private")
        return request
