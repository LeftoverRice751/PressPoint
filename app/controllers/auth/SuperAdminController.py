from masonite.controllers import Controller
from masonite.views import View
from masonite.request import Request
from masonite.response import Response
from masonite.facades import Hash
from app.mailables.AccountCredentials import AccountCredentials
from app.models.AdminGears import AdminGears
from masonite.facades import Mail
import secrets


class SuperAdminController(Controller):
    def show(self, view: View, request: Request):
        admins = AdminGears.all()
        return view.render("auth.super_admin", {
            "users": admins,
            "current_admin": request.super_admin(),
        })
    
    def store(self, request: Request, response: Response):
        admin_username = (request.input("admin_username") or "").strip()
        admin_email = (request.input("admin_email") or "").strip().lower()

        if not admin_username or not admin_email:
            return response.back().with_errors(["Username and email are required."])

        existing_user = next(
            (
                admin
                for admin in AdminGears.all()
                if (getattr(admin, "admin_email", "") or "").strip().lower() == admin_email
            ),
            None,
        )

        if existing_user:
            return response.back().with_errors(["That email is already in use."])

        password = secrets.token_urlsafe(8)

        created_user = AdminGears.create(
            admin_username=admin_username,
            admin_email=admin_email,
            admin_password=Hash.make(password),
            role="admin"
        )

        try:
            Mail.mailable(
                AccountCredentials(username=admin_username, password=password).to(admin_email)
            ).send()
        except Exception:
            return response.redirect(name="auth.super_admin").with_errors([
                "Admin was created, but the credentials email could not be sent.",
            ])

        return response.redirect(name="auth.super_admin").with_success([
            "Admin created and credentials emailed successfully.",
        ])

    def destroy(self, request: Request, response: Response):
        user = AdminGears.find(request.param("id"))

        if user:
            user.delete()

        return response.redirect(name="auth.super_admin")
