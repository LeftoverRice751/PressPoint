from masonite.middleware import Middleware


class AdminMiddleware(Middleware):
    """Allow only authenticated users with role=admin to proceed.

    Pair this with the `auth` middleware on a route — `auth` handles
    the "is anyone logged in?" question and bounces guests to login,
    then this middleware checks the role on the loaded user. A non-admin
    editor who somehow lands on an admin URL gets sent to their own
    dashboard instead of seeing or interacting with admin pages.
    """

    def before(self, request, response):
        user = request.user()
        role = (getattr(user, "role", "") or "").strip().lower() if user else ""
        if role != "admin":
            return response.redirect(name="gears.dashboard")
        return request

    def after(self, request, response):
        return request
