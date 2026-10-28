from masonite.middleware import Middleware

from app.services import SessionTokens
from app.tab_slots import slot_cookie


class LoadSlotUserMiddleware(Middleware):
    """Resolve the signed-in user from *this tab's* token cookie.

    Replaces Masonite's LoadUserMiddleware, whose WebGuard.user() reads the
    "token" cookie and selects the user whose remember_token column equals it.

    This differs in two ways: the cookie name is the current slot's (see
    app/tab_slots.py), and the column holds a keyed hash of the token rather
    than the token, so the lookup goes through SessionTokens.find_user. The guard
    has no seam for that: config/auth.py only carries the model, and the
    cookie name is hardcoded in WebGuard, so subclassing the middleware is the
    smallest honest override. Matches how ThrottleRequestsMiddleware and
    LockingFileDriver stand in for their upstream versions.

    Kept fail-safe: a missing or unknown token sets the user to False, which is
    what AuthenticationMiddleware checks to redirect to the login page.
    """

    def before(self, request, response):
        token = request.cookie(slot_cookie("token", getattr(request, "tab_slot", 0)))
        user = False
        if token:
            user = SessionTokens.find_user(token) or False
        request.set_user(user)
        return request

    def after(self, request, response):
        return request
