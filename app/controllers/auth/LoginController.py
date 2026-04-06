from masonite.controllers import Controller
from masonite.views import View
from masonite.request import Request
from masonite.response import Response
from masonite.authentication import Auth
from app.models.User import User


class LoginController(Controller):
    def show(self, view: View):
        return view.render("auth.login")

    def store(self, request: Request, auth: Auth, response: Response):
        login = auth.attempt(request.input("username"), request.input("password"))

        if login:
            if getattr(login, "role", "") == "admin":
                return response.redirect(name="users.view")

            return response.redirect(name="gears.dashboard")

        # Go back to login page
        return response.redirect(name="auth.login").with_errors(
            ["The email or password is incorrect"]
        )

    def logout(self, auth: Auth, response: Response):
        auth.logout()
        return response.redirect(name="auth.login")
