from masonite.middleware import VerifyCsrfToken as Middleware


class VerifyCsrfToken(Middleware):

    # The phone scanning the QR code does not share a session with the
    # kiosk, so it can't carry a CSRF cookie. Auth on this endpoint is
    # the unguessable hex token in the URL itself.
    exempt = [
        "/api/route-sessions/*/finish",
    ]
