from masonite.controllers import Controller
from masonite.facades import Hash
from masonite.views import View
from masonite.request import Request
from masonite.response import Response
from app.models.User import User
from app.models.AdminGears import AdminGears


class LoginController(Controller):
    def show(self, view: View):
        return view.render("auth.login")

    def _sync_admin_user(self, admin_record, password: str):
        username = (getattr(admin_record, "admin_username", "") or "").strip()
        if not username:
            return None

        role = (getattr(admin_record, "role", "") or "admin").strip().lower() or "admin"
        email = f"{username}@presspoint.local"
        user = User.where("username", username).first()

        if user:
            user.username = username
            user.email = getattr(user, "email", None) or email
            user.password = Hash.make(password)
            user.role = role
            user.save()
            return user

        return User.create(
            {
                "username": username,
                "email": email,
                "password": Hash.make(password),
                "role": role,
            }
        )

    def store(self, request: Request, response: Response):
        username = (request.input("username") or "").strip()
        password = request.input("password") or ""

        login = User().attempt(username, password)

        if not login:
            admin_record = AdminGears.where("admin_username", username).first()

            if admin_record and Hash.check(password, getattr(admin_record, "admin_password", "")):
                login = User().attempt(username, password)

                if not login:
                    synced_user = self._sync_admin_user(admin_record, password)
                    if synced_user:
                        login = User().attempt(synced_user.username, password)

        if login:
            request.set_user(login)
            response.cookie("token", getattr(login, "remember_token", ""))
            role = (getattr(login, "role", "") or "").strip().lower()

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
