from masonite.controllers import Controller
from masonite.views import View
from masonite.request import Request
from masonite.response import Response
from masonite.facades import Hash
from app.models.User import User
from app.services import AdminConsole, Credentials, Notifications, ReviewQueue
from app.tab_slots import clear_slot_session, slot_cookie


def _is_editor(user):
    """True only for role=editor (case-insensitive: the live column has stray casing)."""
    return (getattr(user, "role", "") or "").strip().lower() == "editor"


class UserController(Controller):
    def view(self, view: View, request: Request):
        """The admin console: counts, the approval queue, editor accounts."""
        user = request.user() or None
        users = [row for row in (User.all() or []) if _is_editor(row)]

        # Panels are tabs, so ?page= is the only way to deep-link one.
        default_page = (request.input("page") or "dashboard").strip() or "dashboard"

        context = {
            "users": users,
            "current_user": user,
            "default_page": default_page,
            "is_admin": True,  # route is admin-gated; the shell reads this for the profile menu
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

        password = Credentials.generate_password()

        User.create(
            username=username,
            email=email,
            password=Hash.make(password),
            role="editor"
        )

        if not Credentials.send_credentials(email, username, password):
            return response.redirect(name="users.view").with_errors([
                "User was created, but the credentials email could not be sent.",
            ])

        return response.redirect(name="users.view").with_success([
            "User created and credentials emailed successfully.",
        ])

    def destroy(self, request: Request, response: Response):
        user = User.find(request.param("id"))

        # Re-checked server-side: the route accepts any id, not just what the list shows.
        if not user or not _is_editor(user):
            return response.redirect(name="users.view").with_errors([
                "Only editor accounts can be removed here.",
            ])

        user.delete()

        return response.redirect(name="users.view").with_success([
            "Editor account removed.",
        ])

    def logout(self, request: Request, response: Response):
        """Sign out this tab's slot only; remove_user() alone leaves the cookie behind."""
        slot = getattr(request, "tab_slot", 0)
        request.remove_user()
        response.delete_cookie(slot_cookie("token", slot))
        clear_slot_session(request, response, slot)
        return response.redirect(name="auth.login")
