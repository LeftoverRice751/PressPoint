from masonite.controllers import Controller
from masonite.facades import Hash
from masonite.views import View
from masonite.request import Request
from masonite.response import Response
from app.models.User import User
from app.tab_slots import (
    SLOT_PARAM,
    allocate_slot,
    clear_slot_session,
    slot_cookie,
)


class LoginController(Controller):
    def show(self, view: View):
        return view.render("auth.login")

    def _fresh_login_record(self, login, username: str):
        persisted_login = User.where("username", username).first()
        return persisted_login or login

    def store(self, request: Request, response: Response):
        username = (request.input("username") or "").strip()
        password = request.input("password") or ""

        login = User().attempt(username, password)

        if login:
            login = self._fresh_login_record(login, username)
            request.set_user(login)

            # Sign in on a free slot instead of overwriting the one "token"
            # cookie. That overwrite was the whole bug: signing in as an admin
            # in a second tab took over the editor's tab, so refreshing it
            # landed on the admin console. See app/tab_slots.py.
            slot = allocate_slot(request, lambda token: User.where("remember_token", token).first())
            request.tab_slot = slot
            response.cookie(slot_cookie("token", slot), getattr(login, "remember_token", "") or "")

            # Slot 0 keeps clean, parameter-free URLs -- and TabSlotMiddleware
            # will not stamp these redirects itself, because the /login request
            # that produced them carried no slot of its own.
            query_params = {} if slot == 0 else {SLOT_PARAM: slot}
            role = (getattr(login, "role", "") or "").strip().lower()

            # "gears.dashboard" is the route's registered name
            # (routes/dashboard.py). redirect(name=...) resolves a NAME, not a
            # path -- an unregistered one raises RouteNotFoundException and the
            # sign-in dies on the error page instead of landing anywhere.
            if role == "editor":
                return response.redirect(name="gears.dashboard", query_params=query_params)

            if role == "superadmin":
                return response.redirect(name="auth.super_admin", query_params=query_params)

            # /users is the admin console -- counts, the review queue, and
            # editor accounts. Admins never land on the editor dashboard;
            # DashboardController.show() bounces them back here if they try.
            if role == "admin":
                return response.redirect(name="users.view", query_params=query_params)

            # Every branch above matched a known role, so getting here means
            # the credentials were CORRECT and the account's role is empty or
            # misspelled -- the live users.role column has drifted before.
            # Reporting that as a bad password sends whoever hits it chasing a
            # problem they do not have.
            return response.redirect(name="auth.login").with_errors(
                ["This account has no role assigned. An admin needs to set one "
                 "before you can sign in."]
            )

        # Go back to login page
        return response.redirect(name="auth.login").with_errors(
            ["The email or password is incorrect"]
        )

    def logout(self, request: Request, response: Response):
        # Only this tab's slot. Deleting the bare "token" cookie would sign
        # every other tab out too, which is the mirror image of the bug that
        # slots exist to fix.
        slot = getattr(request, "tab_slot", 0)
        request.remove_user()
        response.delete_cookie(slot_cookie("token", slot))
        clear_slot_session(request, response, slot)
        return response.redirect(name="auth.login")
