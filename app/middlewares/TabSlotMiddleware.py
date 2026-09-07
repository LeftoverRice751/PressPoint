from urllib.parse import urlsplit

from masonite.middleware import Middleware

from app.tab_slots import request_slot, stamp_url

#: Location prefixes that never get a `u=` stamp. The kiosk and the phone
#: wayfinding handoff are unauthenticated, and the sign-in pages allocate their
#: own slot in LoginController -- stamping one here would pin a fresh login to
#: whichever slot happened to be signing out.
UNSLOTTED_PREFIXES = ("/kiosk", "/m/", "/login", "/forgot-password", "/change-password")


class TabSlotMiddleware(Middleware):
    """Resolve which sign-in slot this request belongs to.

    Runs as HTTP middleware (Kernel.http_middleware) because two route
    middlewares need the answer before they run: SessionMiddleware, which
    starts the slot-aware session driver, and LoadSlotUserMiddleware, which
    reads the slot's token cookie. It must also sit *after* EncryptCookies so
    the cookie jar is already decrypted. See app/tab_slots.py for the design.

    This replaced a cookie-based "tab id" that could not work: a cookie is sent
    by every tab of an origin, so it cannot tell two tabs apart in the first
    place.
    """

    def before(self, request, response):
        request.tab_slot = request_slot(request)
        return request

    def after(self, request, response):
        # Carry the slot across redirects centrally. There are ~103
        # `.back()` / `redirect(name=...)` call sites in app/controllers, and
        # a redirect that dropped `u=` would silently drop the tab back onto
        # slot 0's identity -- i.e. exactly the bug this feature fixes.
        slot = getattr(request, "tab_slot", 0)
        if not slot:
            return request

        location = response.header("Location")
        if not location:
            return request

        path = urlsplit(location).path or ""
        if path.startswith(UNSLOTTED_PREFIXES):
            return request

        response.header("Location", stamp_url(location, slot))
        return request
