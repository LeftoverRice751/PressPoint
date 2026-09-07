from masonite.middleware import Middleware

from app.models.User import User
from app.tab_slots import slot_cookie


class LoadSlotUserMiddleware(Middleware):
    """Resolve the signed-in user from *this tab's* token cookie.

    Replaces Masonite's LoadUserMiddleware, which calls WebGuard.user():

        token = request.cookie("token")
        User.where("remember_token", token).first()

    That is the same lookup this does -- the only difference is the cookie
    name, which here is the current slot's (see app/tab_slots.py). The guard
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
            user = User.where("remember_token", token).first() or False
        request.set_user(user)
        return request

    def after(self, request, response):
        return request
