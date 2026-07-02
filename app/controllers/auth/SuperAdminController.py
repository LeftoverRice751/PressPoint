from masonite.controllers import Controller
from masonite.views import View
from masonite.request import Request
from masonite.response import Response
from masonite.facades import Hash
from app.mailables.AccountCredentials import AccountCredentials
from app.models.User import User
from masonite.facades import Mail
import secrets


class SuperAdminController(Controller):
    def show(self, view: View, request: Request):
        admins = User.all()
        return view.render("auth.super_admin", {
            "users": admins,
            "current_admin": request.super_admin(),
        })
    
    def store(self, request: Request, response: Response):
        username = (request.input("username") or "").strip()
        email = (request.input("email") or "").strip().lower()

        if not username or not email:
            return response.back().with_errors(["Username and email are required."])

        existing_user = next(
            (
                admin
                for admin in User.all()
                if (getattr(admin, "email", "") or "").strip().lower() == email
            ),
            None,
        )

        if existing_user:
            return response.back().with_errors(["That email is already in use."])

        password = secrets.token_urlsafe(16)

        created_user = User.create(
            username = username,
            email = email,
            password = Hash.make(password),
            role="admin"
        )

        try:
            Mail.mailable(
                AccountCredentials(username=username, password=password).to(email)
            ).send()
        except Exception:
            return response.redirect(name="auth.super_admin").with_errors([
                "Admin was created, but the credentials email could not be sent.",
            ])

        return response.redirect(name="auth.super_admin").with_success([
            "Admin created and credentials emailed successfully.",
        ])

    def destroy(self, request: Request, response: Response):
        user = User.find(request.param("id"))

        if user:
            user.delete()

        return response.redirect(name="auth.super_admin")
