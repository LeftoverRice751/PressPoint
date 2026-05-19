
from masonite.middleware import Middleware


class ChiefEditorMiddleware(Middleware):
    """Allow only authenticated users with role=chief_editor to proceed.

    Redirect unauthenticated users and non-chief-editors to the chief editor login page.
    """

    def before(self, request, response):
        user = request.user()
        if not user:
            return response.redirect(name="auth.chief-editor.login")
        role = (getattr(user, "role", "") or "").strip().lower()
        if role != "chief_editor":
            return response.redirect(name="auth.chief-editor.login")
        return request

    def after(self, request, response):
        return request
