from masonite.controllers import Controller
from masonite.views import View
from masonite.request import Request
from masonite.response import Response
from masonite.facades import Hash
from app.models.User import User
from app.services import Credentials, DashboardContext
from app.tab_slots import clear_slot_session, slot_cookie


def _role_of(user):
    return (getattr(user, "role", "") or "").strip().lower()


def _is_admin(user):
    """True only for role=admin (case-insensitive: the live column has stray casing)."""
    return _role_of(user) == "admin"


class SuperAdminController(Controller):
    def show(self, view: View, request: Request):
        # Super admins never see or act on a peer's account.
        manageable_users = [
            user for user in (User.all() or []) if _role_of(user) != "superadmin"
        ]

        # "current_user" is the key the shared shell partials read.
        context = {
            "users": manageable_users,
            "current_user": request.user(),
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

        password = Credentials.generate_password()

        User.create(
            username=username,
            email=email,
            password=Hash.make(password),
            role="admin",
        )

        if not Credentials.send_credentials(email, username, password):
            return response.redirect(name="auth.super_admin").with_errors([
                "Admin was created, but the credentials email could not be sent.",
            ])

        return response.redirect(name="auth.super_admin").with_success([
            "Admin created and credentials emailed successfully.",
        ])

    def reset_password(self, request: Request, response: Response):
        """Mint a new password for an admin and email it; the plaintext never reaches the browser."""
        user = User.find(request.param("id"))

        if not user or not _is_admin(user):
            return response.redirect(name="auth.super_admin").with_errors([
                "Only admin accounts can have their password reset here.",
            ])

        email = (getattr(user, "email", "") or "").strip().lower()

        if not email:
            return response.redirect(name="auth.super_admin").with_errors([
                "That account has no email address to send a password to.",
            ])

        password = Credentials.generate_password()

        # Send before saving: a saved password whose email never arrived locks the admin out.
        if not Credentials.send_credentials(email, getattr(user, "username", ""), password):
            return response.redirect(name="auth.super_admin").with_errors([
                "Could not send the new password, so the existing one is "
                "unchanged. Check the mail settings and try again.",
            ])

        user.password = Hash.make(password)
        user.save()

        return response.redirect(name="auth.super_admin").with_success([
            "New password sent to {}.".format(email),
        ])

    def destroy(self, request: Request, response: Response):
        user = User.find(request.param("id"))

        # Re-checked server-side: the route accepts any id, not just what show() lists.
        if user and _role_of(user) == "superadmin":
            return response.redirect(name="auth.super_admin").with_errors([
                "Super admin accounts cannot be deleted from this dashboard.",
            ])

        if user:
            user.delete()

        return response.redirect(name="auth.super_admin")

    def logout(self, request: Request, response: Response):
        """Sign out this tab's slot only; remove_user() alone leaves the cookie behind."""
        slot = getattr(request, "tab_slot", 0)
        request.remove_user()
        response.delete_cookie(slot_cookie("token", slot))
        clear_slot_session(request, response, slot)
        return response.redirect(name="auth.login")
