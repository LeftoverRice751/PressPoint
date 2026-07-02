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

            if role == "superadmin":
                return response.redirect(name="auth.super_admin")

            if role == "admin":
                return response.redirect(name="users.view")

            return response.redirect(name="gears.dashboard")

        # Go back to login page
        return response.redirect(name="auth.login").with_errors(
            ["The email or password is incorrect"]
        )

    def logout(self, request: Request, response: Response):
        request.remove_user()
        response.delete_cookie("token")
        return response.redirect(name="auth.login")
