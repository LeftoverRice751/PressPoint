from masonite.controllers import Controller
from masonite.facades import Hash
from masonite.views import View
from masonite.request import Request
from masonite.response import Response
from app.models.User import User
from app.services import SessionTokens
from app.services import AuditLog
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
            # Read before the re-fetch below: the plaintext exists only on the
            # instance attempt() minted it on; the database holds its hash.
            session_token = SessionTokens.plain_token(login)
            login = self._fresh_login_record(login, username)
            AuditLog.record("auth.login.succeeded", actor=login, request=request)
            request.set_user(login)

            # Sign in on a free tab slot so a second tab's login doesn't take over
            # this one's session (app/tab_slots.py).
            slot = allocate_slot(request, SessionTokens.find_user)
            request.tab_slot = slot
            response.cookie(slot_cookie("token", slot), session_token)

            # Slot 0 keeps parameter-free URLs; TabSlotMiddleware won't stamp these redirects.
            query_params = {} if slot == 0 else {SLOT_PARAM: slot}
            role = (getattr(login, "role", "") or "").strip().lower()

            if role == "editor":
                return response.redirect(name="gears.dashboard", query_params=query_params)

            if role == "superadmin":
                return response.redirect(name="auth.super_admin", query_params=query_params)

            if role == "admin":
                return response.redirect(name="users.view", query_params=query_params)

            # Credentials were correct but the role is empty or misspelled; say so.
            return response.redirect(name="auth.login").with_errors(
                ["This account has no role assigned. An admin needs to set one "
                 "before you can sign in."]
            )

        # The attempted name, so a run of failures against one account (or from
        # one address, via the ip column) is visible. Never the password.
        AuditLog.record("auth.login.failed", details={"username": username}, request=request)
        return response.redirect(name="auth.login").with_errors(
            ["The email or password is incorrect"]
        )

    def logout(self, request: Request, response: Response):
        # Only this tab's slot; the bare "token" cookie would sign every tab out.
        slot = getattr(request, "tab_slot", 0)
        request.remove_user()
        response.delete_cookie(slot_cookie("token", slot))
        clear_slot_session(request, response, slot)
        return response.redirect(name="auth.login")
