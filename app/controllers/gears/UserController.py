from masonite.controllers import Controller
from masonite.views import View
from masonite.request import Request
from masonite.response import Response
from masonite.facades import Hash
from app.mailables.AccountCredentials import AccountCredentials
from app.models.User import User
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
        users = [user for user in (User.all() or []) if _is_editor(user)]
        return view.render("auth.admin", {
            "users": users,
            "current_user": request.user(),
        })
    
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
        request.remove_user()
        request.delete_cookie()
        return response.redirect("auth.login")
        
