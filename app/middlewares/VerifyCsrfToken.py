from masonite.middleware import VerifyCsrfToken as Middleware


class VerifyCsrfToken(Middleware):

    # The phone scanning the QR code does not share a session with the
    # kiosk, so it can't carry a CSRF cookie. Auth on this endpoint is
    # the unguessable hex token in the URL itself.
    exempt = [
        "/api/route-sessions/*/finish",
        # Logout. The token is the SESSID cookie itself, so anything that
        # rotates SESSID while a dashboard tab sits open (a CSRF failure in
        # any other tab of the origin clears it for all of them) left that
        # tab's logout form stale. InvalidCSRFTokenHandler then bounced the
        # POST back to the same dashboard URL, which renders no flash bag, so
        # "Log out" visibly did nothing. Safe to exempt: the session cookies
        # are SameSite=Lax (config/session.py), so a cross-site POST carries
        # no sign-in cookie and SessionTokens.revoke() has nobody to revoke.
        # `$` because request.contains() is an unanchored re.match.
        "/logout$",
        "/users/logout$",
        "/auth/super_admin/logout$",
    ]
