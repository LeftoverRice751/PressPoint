from masonite.controllers import Controller
from masonite.facades import Hash
from masonite.views import View
from masonite.request import Request
from masonite.response import Response
from app.models.User import User


class LoginController(Controller):
    def show(self, view: View):
        return view.render("auth.login")

    def _fresh_login_record(self, login, username: str):
        persisted_login = User.where("username", username).first()
        return persisted_login or login

    def store(self, request: Request, response: Response):
        username = (request.input("username") or "").strip()
        password = request.input("password") or ""

        login = User().attempt(username, password)

        if login:
            login = self._fresh_login_record(login, username)
            request.set_user(login)
            response.cookie("token", getattr(login, "remember_token", "") or "")
            role = (getattr(login, "role", "") or "").strip().lower()

            # "gears.dashboard" is the route's registered name
            # (routes/dashboard.py). redirect(name=...) resolves a NAME, not a
            # path -- an unregistered one raises RouteNotFoundException and the
            # sign-in dies on the error page instead of landing anywhere.
            if role == "editor":
                return response.redirect(name="gears.dashboard")

            if role == "superadmin":
                return response.redirect(name="auth.super_admin")

            # /users is the admin console -- counts, the review queue, and
            # editor accounts. Admins never land on the editor dashboard;
            # DashboardController.show() bounces them back here if they try.
            if role == "admin":
                return response.redirect(name="users.view")

            # Every branch above matched a known role, so getting here means
            # the credentials were CORRECT and the account's role is empty or
            # misspelled -- the live users.role column has drifted before.
            # Reporting that as a bad password sends whoever hits it chasing a
            # problem they do not have.
            return response.redirect(name="auth.login").with_errors(
                ["This account has no role assigned. An admin needs to set one "
                 "before you can sign in."]
            )

        # Go back to login page
        return response.redirect(name="auth.login").with_errors(
            ["The email or password is incorrect"]
        )

    def logout(self, request: Request, response: Response):
        request.remove_user()
        response.delete_cookie("token")
        return response.redirect(name="auth.login")
