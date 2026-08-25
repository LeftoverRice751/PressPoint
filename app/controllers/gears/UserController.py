from masonite.controllers import Controller
from masonite.views import View
from masonite.request import Request
from masonite.response import Response
from masonite.facades import Hash
from app.mailables.AccountCredentials import AccountCredentials
from app.models.User import User
from app.services import AdminConsole, Notifications, ReviewQueue
from masonite.facades import Mail
import secrets


def _is_editor(user):
    """True only for role=editor.

    The admin user list is an editor-management screen: an admin manages the
    newsroom's editors, not the other admins and not the superadmin (nor
    themselves). Roles are compared case-insensitively because the live
    `users.role` column has drifted and holds values with stray casing.
    """
    return (getattr(user, "role", "") or "").strip().lower() == "editor"


class UserController(Controller):
    def view(self, view: View, request: Request):
        """The admin console: counts, the approval queue, editor accounts.

        This used to be a bare create-an-editor form on the auth shell, with
        no link to anywhere else -- which is why the approval queue, built on
        the editor dashboard, was unreachable for the one role allowed to use
        it. The console now wears the GEARS shell (gears/shell.html) and is
        where an admin lands at sign-in.

        The context is assembled the way DashboardController.show() does it:
        request-agnostic builders, plus the request-scoped keys the shell
        needs for the profile border and the bell.
        """
        user = request.user() or None
        users = [row for row in (User.all() or []) if _is_editor(row)]

        # Panels are tabs, not routes, so ?page= is the only way to deep-link
        # one -- which is how ReviewController's non-AJAX fallback and the
        # bell's notification links land on the right panel.
        default_page = (request.input("page") or "dashboard").strip() or "dashboard"

        context = {
            "users": users,
            "current_user": user,
            "default_page": default_page,
            # The whole route is admin-gated, so this is not a question here.
            # The shell still reads it for the profile menu.
            "is_admin": True,
            "unread_notifications": Notifications.unread_count(getattr(user, "id", None)),
        }
        context.update(AdminConsole.stats_context())
        context.update(ReviewQueue.review_context())

        return view.render("gears/admin-console", context)
    
    def store(self, request: Request, response: Response):
        username = (request.input("username") or "").strip()
        email = (request.input("email") or "").strip().lower()

        if not username or not email:
            return response.back().with_errors(["Username and email are required."])

        existing_user = next(
            (
                user
                for user in User.all()
                if (getattr(user, "email", "") or "").strip().lower() == email
            ),
            None,
        )

        if existing_user:
            return response.back().with_errors(["That email is already in use."])

        password = secrets.token_urlsafe(8)

        created_user = User.create(
            username=username,
            email=email,
            password=Hash.make(password),
            role="editor"
        )

        try:
            Mail.mailable(
                AccountCredentials(username=username, password=password).to(email)
            ).send()
        except Exception:
            return response.redirect(name="users.view").with_errors([
                "User was created, but the credentials email could not be sent.",
            ])

        return response.redirect(name="users.view").with_success([
            "User created and credentials emailed successfully.",
        ])

    def destroy(self, request: Request, response: Response):
        user = User.find(request.param("id"))

        # The list only renders editors, but the delete route takes a bare id —
        # without this check a hand-crafted POST would let an admin delete a
        # fellow admin or the superadmin account.
        if not user or not _is_editor(user):
            return response.redirect(name="users.view").with_errors([
                "Only editor accounts can be removed here.",
            ])

        user.delete()

        return response.redirect(name="users.view").with_success([
            "Editor account removed.",
        ])

    def logout(self, request: Request, response: Response):
        """Sign the admin out from the admin dashboard.

        Both halves matter: remove_user() only clears the user resolved for
        *this* request, while the `token` cookie LoginController sets at sign-in
        is what LoadUserMiddleware reads on the next one. Dropping only the
        first would bounce straight back into the dashboard still logged in.

        `name=` is not optional here -- redirect()'s first positional argument
        is a literal URL, so redirect("auth.login") sends a Location header of
        "auth.login" (a relative path) rather than resolving the route.
        """
        request.remove_user()
        response.delete_cookie("token")
        return response.redirect(name="auth.login")
