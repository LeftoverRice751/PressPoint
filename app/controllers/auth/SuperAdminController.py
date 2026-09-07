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
    """True only for role=admin.

    Credential editing is scoped to admins on purpose. Editors are managed
    from the admin console (/users), and super admins are filtered out of
    show() so one super admin can never act on a peer. Mirrors _is_editor()
    in UserController, including the case-insensitive compare -- the live
    `users.role` column has drifted and holds values with stray casing.
    """
    return _role_of(user) == "admin"


def _other_user_holds(users, field, value, target_id):
    """True if some *other* row already uses this username/email."""
    needle = (value or "").strip().lower()
    for row in users or []:
        if getattr(row, "id", None) == target_id:
            continue
        if (getattr(row, field, "") or "").strip().lower() == needle:
            return True
    return False


class SuperAdminController(Controller):
    def show(self, view: View, request: Request):
        # Super admins are deliberately absent from this list: one super admin
        # should neither see nor be able to act on another's account. The
        # delete button is rendered per row, so filtering here is also what
        # keeps that button from ever pointing at a peer.
        manageable_users = [
            user for user in (User.all() or []) if _role_of(user) != "superadmin"
        ]

        # "current_user", not "current_admin": this page wears gears/shell.html
        # now, and the shell's profile menu reads current_user for the avatar,
        # display name and role. Same key UserController.view() and
        # DashboardController use, so the shared partials render identically.
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

    def update_credentials(self, request: Request, response: Response):
        """Correct an admin's username and/or sign-in email.

        This exists because the only previous remedy for a typo'd email was
        delete-and-recreate, which drops the account row and nulls the
        author_id / updated_by_id that news stories point at.
        """
        user = User.find(request.param("id"))

        # show() only renders these controls on admin rows, but the route
        # takes a bare id -- a hand-crafted POST must not reach an editor or
        # a super admin either.
        if not user or not _is_admin(user):
            return response.redirect(name="auth.super_admin").with_errors([
                "Only admin accounts can be edited here.",
            ])

        username = (request.input("username") or "").strip()
        email = (request.input("email") or "").strip().lower()

        if not username or not email:
            return response.redirect(name="auth.super_admin").with_errors([
                "Username and email are required.",
            ])

        if "@" not in email or "." not in email.split("@")[-1]:
            return response.redirect(name="auth.super_admin").with_errors([
                "That does not look like a valid email address.",
            ])

        everyone = User.all() or []
        target_id = getattr(user, "id", None)

        if _other_user_holds(everyone, "email", email, target_id):
            return response.redirect(name="auth.super_admin").with_errors([
                "That email is already in use.",
            ])

        if _other_user_holds(everyone, "username", username, target_id):
            return response.redirect(name="auth.super_admin").with_errors([
                "That username is already taken.",
            ])

        previous_email = (getattr(user, "email", "") or "").strip().lower()

        # Assigned one field at a time, never .update(request.all()):
        # User.__fillable__ includes `role`, so a mass assignment here would
        # let a crafted POST hand the target a superadmin role.
        user.username = username
        user.email = email
        user.save()

        messages = ["Admin credentials updated."]

        if previous_email and previous_email != email:
            # Best-effort. A mail outage must not block a correction the super
            # admin needs to make -- the record is already saved by this point.
            sent_new = Credentials.send_email_change_notice(
                email, username, previous_email, email
            )
            sent_old = Credentials.send_email_change_notice(
                previous_email, username, previous_email, email
            )
            if sent_new and sent_old:
                messages.append("Change notice emailed to both addresses.")
            else:
                return response.redirect(name="auth.super_admin").with_errors([
                    "Credentials updated, but the change notice could not be "
                    "emailed to both addresses.",
                ])

        return response.redirect(name="auth.super_admin").with_success(messages)

    def reset_password(self, request: Request, response: Response):
        """Mint a new password for an admin and email it to them.

        The plaintext never reaches the browser: it is generated here, sent,
        and discarded. The super admin only ever learns which address it went
        to, so the password cannot be shoulder-surfed off this screen or dug
        out of the response later.
        """
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

        # Send BEFORE saving, and abandon the reset if delivery fails. This
        # follows PasswordResetController, which rolls its reset row back for
        # the same reason: a saved password whose email never arrived locks
        # the admin out of their own account with no way back in.
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

    def logout(self, request: Request, response: Response):
        """Sign the super admin out from the super admin dashboard.

        delete_cookie("token") is the half that actually ends the session --
        remove_user() alone leaves the sign-in cookie in the browser, so the
        very next request re-authenticates and the logout looks like a no-op.
        """
        # Slot-scoped: signing out of this tab must leave the other tab's
        # sign-in alone (app/tab_slots.py).
        slot = getattr(request, "tab_slot", 0)
        request.remove_user()
        response.delete_cookie(slot_cookie("token", slot))
        clear_slot_session(request, response, slot)
        return response.redirect(name="auth.login")
