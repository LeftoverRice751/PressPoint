from masonite.controllers import Controller
from masonite.views import View
from masonite.request import Request
from masonite.response import Response
from masonite.authentication import Auth
from masonite.facades import Mail
from masonite.facades import Hash
from app.mailables.ResetPassword import ResetPassword
from app.models.User import User
from masonite.configuration import config
from wsgi import application
import re
import pendulum
import secrets


class PasswordResetController(Controller):
    def _is_reset_record_expired(self, reset_record):
        expires_at = reset_record.get("expires_at") if isinstance(reset_record, dict) else None
        if not expires_at:
            return False

        try:
            return pendulum.now() > pendulum.parse(str(expires_at))
        except Exception:
            return True

    def show(self, view: View):
        return view.render("auth.forgot-password")

    def show_otp(self, view: View, request: Request):
        return view.render("auth.otp-code", {"email": request.input("email")})

    def store(self, auth: Auth, request: Request, response: Response):
        email = (request.input("email") or "").strip().lower()

        if not email or not re.match(r"^[^\s@]+@[^\s@]+\.[^\s@]+$", email):
            return response.back().with_errors(["Please enter a valid email address."])

        editor = next(
            (
                user
                for user in User.all()
                if (getattr(user, "email", "") or "").strip().lower() == email
            ),
            None,
        )
        if not editor:
            return response.back().with_errors(["Could not find an account for that email."])

        reset_token = f"{secrets.randbelow(1000000):06d}"
        reset_table = config("auth.guards.password_reset_table", "password_resets")
        reset_expiration = config("auth.guards.password_reset_expiration", 1440)

        application.make("builder").new().statement(
            f"DELETE FROM {reset_table} WHERE email = %s",
            [email],
        )

        reset_payload = {
            "email": email,
            "token": reset_token,
            "expires_at": pendulum.now()
            .add(minutes=reset_expiration)
            .to_datetime_string()
            if reset_expiration
            else None,
            "created_at": pendulum.now().to_datetime_string(),
        }

        application.make("builder").new().table(reset_table).create(reset_payload)

        Mail.mailable(ResetPassword(token=reset_token).to(email)).send()
        return response.redirect(
            name="auth.forgot-password.otp",
            query_params={"email": email},
        )

    def verify_otp(self, request: Request, response: Response):
        request.validate(
            {
                "otp": "required",
            }
        )

        otp = (request.input("otp") or "").strip()
        if not otp:
            otp = "".join(
                [
                    str(request.input(f"otp{index}") or "").strip()
                    for index in range(1, 7)
                ]
            )

        if not otp or len(otp) != 6 or not otp.isdigit():
            return response.back().with_errors(["OTP code is required."])

        reset_table = config("auth.guards.password_reset_table", "password_resets")
        reset_records = application.make("builder").new().statement(
            f"SELECT * FROM {reset_table} WHERE token = %s LIMIT 1",
            [otp],
        )
        reset_record = reset_records[0] if reset_records else None

        if not reset_record:
            return response.back().with_errors(["Invalid OTP code. Please try again."])

        if self._is_reset_record_expired(reset_record):
            application.make("builder").new().statement(
                f"DELETE FROM {reset_table} WHERE token = %s",
                [otp],
            )
            return response.back().with_errors(["OTP code has expired. Please request a new one."])

        return response.redirect(name="auth.change-password", params={"token": otp})

    def change_password(self, view: View, request: Request):
        return view.render("auth.change_password", {"token": request.param("token")})

    def store_changed_password(self, auth: Auth, request: Request, response: Response):
        is_valid = request.validate(
            {
                "password": "required|strong|confirmed",
            }
        )

        if not is_valid:
            return response.back().with_errors(["Password must be strong and confirmed."])

        token = request.param("token")
        reset_table = config("auth.guards.password_reset_table", "password_resets")
        reset_records = application.make("builder").new().statement(
            f"SELECT * FROM {reset_table} WHERE token = %s LIMIT 1",
            [token],
        )
        reset_record = reset_records[0] if reset_records else None

        if not reset_record:
            return response.back().with_errors(["Could not reset your password"])

        if self._is_reset_record_expired(reset_record):
            application.make("builder").new().statement(
                f"DELETE FROM {reset_table} WHERE token = %s",
                [token],
            )
            return response.back().with_errors(["Reset token has expired. Please request a new one."])

        new_password = Hash.make(request.input("password"))
        application.make("builder").new().statement(
            "UPDATE users SET password = %s WHERE email = %s",
            [new_password, reset_record["email"]],
        )
        application.make("builder").new().statement(
            f"DELETE FROM {reset_table} WHERE token = %s",
            [token],
        )

        return response.redirect(name="auth.login").with_success([
            "Password Reset Successfully",
        ])
