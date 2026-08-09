from masonite.controllers import Controller
from masonite.views import View
from masonite.request import Request
from masonite.response import Response
from masonite.facades import Hash
from app.mailables.AccountCredentials import AccountCredentials
from app.models.User import User
from app.services import DashboardContext
from masonite.facades import Mail
import secrets


def _role_of(user):
    return (getattr(user, "role", "") or "").strip().lower()


class SuperAdminController(Controller):
    def show(self, view: View, request: Request):
        # Super admins are deliberately absent from this list: one super admin
        # should neither see nor be able to act on another's account. The
        # delete button is rendered per row, so filtering here is also what
        # keeps that button from ever pointing at a peer.
        manageable_users = [
            user for user in (User.all() or []) if _role_of(user) != "superadmin"
        ]

        context = {
            "users": manageable_users,
            "current_admin": request.user(),
        }
        context.update(DashboardContext.super_admin_stats())

        return view.render("auth.super_admin", context)


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

        # show() already hides super admins, so the UI never offers this. The
        # check is repeated here because the route accepts any id — a crafted
        # DELETE must not be able to remove a super admin either.
        if user and _role_of(user) == "superadmin":
            return response.redirect(name="auth.super_admin").with_errors([
                "Super admin accounts cannot be deleted from this dashboard.",
            ])

        if user:
            user.delete()

        return response.redirect(name="auth.super_admin")
