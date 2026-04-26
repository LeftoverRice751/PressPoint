from masonite.controllers import Controller
from masonite.environment import env
from masonite.facades import Hash
from masonite.views import View
from masonite.request import Request
from masonite.response import Response
from masonite.authentication import Auth
from app.models.User import User


class LoginController(Controller):
    def show(self, view: View):
        return view.render("auth.login")

    def store(self, request: Request, auth: Auth, response: Response):
        username = (request.input("username") or "").strip()
        password = request.input("password") or ""

        admin_username = (env("ADMIN_USERNAME", "") or "").strip()
        admin_password = (env("ADMIN_PASSWORD", "") or "").strip()

        if admin_username and admin_password:
            password_matches = password == admin_password

            if not password_matches:
                try:
                    password_matches = Hash.check(password, admin_password)
                except ValueError:
                    password_matches = False

            if username == admin_username and password_matches:
                admin_user = User.where("username", admin_username).first()

                if admin_user:
                    auth.attempt_by_id(admin_user.id)
                    return response.redirect(name="users.view")

        login = auth.attempt(username, password)

        if login:
            authenticated_user = User.find(getattr(login, "id", None)) or login
            role = (getattr(authenticated_user, "role", "") or "").strip().lower()

            if role == "admin":
                return response.redirect(name="users.view")

            return response.redirect(name="gears.dashboard")

        # Go back to login page
        return response.redirect(name="auth.login").with_errors(
            ["The email or password is incorrect"]
        )

    def logout(self, auth: Auth, response: Response):
        auth.logout()
        return response.redirect(name="auth.login")
