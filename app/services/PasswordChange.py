"""Changing your own password from the profile panel.

Everything security-relevant about the feature lives here so the controller
stays an adapter. Order of checks matters: the current password is verified
first, but every refusal returns the same sentence — distinguishing "current
password wrong" from "new password weak" would let a hijacked session confirm
the current password one guess at a time, with the 5/minute throttle as the
only brake.

On success `remember_token` is rotated. Sessions on this app ARE that token
(LoadSlotUserMiddleware looks the user up by it), so rotating it signs out
every other tab and device on their next request; the controller re-issues
this tab's cookie so the caller stays in.
"""

import traceback

from masonite.facades import Hash, Mail

from wsgi import application

#: One message for every refusal. See the module docstring.
GENERIC_ERROR = "Current password is incorrect, or the new password doesn't meet the rules."

#: Masonite's `strong` rule defaults — the same thresholds the OTP reset flow
#: enforces via `request.validate({"password": "strong"})`, spelled out so the
#: dashboard meter (gears-dashboard.js) can mirror them exactly.
MIN_LENGTH = 8
MIN_UPPER = 2
MIN_LOWER = 2
MIN_DIGITS = 2
MIN_SYMBOLS = 2


def policy_errors(password):
    """Which of the `strong` thresholds a candidate misses; empty when it passes."""
    password = password or ""
    missing = []
    if len(password) < MIN_LENGTH:
        missing.append(f"at least {MIN_LENGTH} characters")
    if sum(1 for c in password if c.isupper()) < MIN_UPPER:
        missing.append(f"{MIN_UPPER} uppercase letters")
    if sum(1 for c in password if c.islower()) < MIN_LOWER:
        missing.append(f"{MIN_LOWER} lowercase letters")
    if sum(1 for c in password if c.isdigit()) < MIN_DIGITS:
        missing.append(f"{MIN_DIGITS} numbers")
    if sum(1 for c in password if not c.isalnum()) < MIN_SYMBOLS:
        missing.append(f"{MIN_SYMBOLS} symbols")
    return missing


class Result:
    def __init__(self, ok, errors=None, emailed=False):
        self.ok = ok
        self.errors = errors or []
        self.emailed = emailed


def forget_pending_resets(email):
    """A verified OTP reset in flight is moot once the password has changed."""
    application.make("builder").new().statement(
        "DELETE FROM password_resets WHERE email = %s", [email]
    )


def send_notice(user):
    """Best-effort 'your password was changed' email. True if it went out."""
    from app.mailables.PasswordChanged import PasswordChanged

    email = getattr(user, "email", None)
    if not email:
        return False
    try:
        Mail.mailable(PasswordChanged(username=user.username).to(email)).send()
        return True
    except Exception as exception:
        traceback.print_exception(type(exception), exception, exception.__traceback__)
        return False


def apply(user, current, new, confirmation):
    current = current or ""
    new = new or ""
    confirmation = confirmation or ""

    # Empty current can't match a bcrypt hash, but short-circuit anyway so an
    # all-blank post never reaches the hasher (request.input() defaults to "").
    if not current or not Hash.check(current, getattr(user, "password", "") or ""):
        return Result(False, [GENERIC_ERROR])
    if policy_errors(new) or new != confirmation or new == current:
        return Result(False, [GENERIC_ERROR])

    # One attribute at a time: User.__fillable__ includes `role`.
    user.password = Hash.make(new)
    user.set_remember_token()
    user.save()

    emailed = False
    email = (getattr(user, "email", None) or "").strip()
    if email:
        try:
            forget_pending_resets(email)
        except Exception as exception:
            # Cleanup only; the password is already changed.
            traceback.print_exception(type(exception), exception, exception.__traceback__)
        emailed = send_notice(user)

    return Result(True, emailed=emailed)
