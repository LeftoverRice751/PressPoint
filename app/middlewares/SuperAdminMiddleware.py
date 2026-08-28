from masonite.middleware import Middleware


class SuperAdminMiddleware(Middleware):

    def before(self, request, response):
        user = request.user()
        role = (getattr(user, "role", "") or "").strip().lower() if user else ""
        if role != "superadmin":
            return response.redirect(name="gears.dashboard")
        return request

    def after(self, request, response):
        return request
