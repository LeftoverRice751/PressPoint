# Profile Password Change Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let a signed-in editor, admin, or super admin change their own password from the profile panel, proving the current password, meeting the site policy, dropping every other session, and emailing the account.

**Architecture:** A pure service (`app/services/PasswordChange.py`) owns the policy and the write; a thin `ProfileController.change_password` action adapts it to AJAX/form posts and re-issues this tab's slot cookie; a second card in the shared `profile-panel.html` partial reaches all three consoles.

**Tech Stack:** Masonite 5 (Python 3.11), bcrypt via `masonite.facades.Hash`, Masonite Mail, plain-JS dashboard bundle (laravel-mix, Node 18), pytest.

**Spec:** `docs/superpowers/specs/2026-09-15-profile-password-change-design.md`

## Global Constraints

- Every Python command runs through `venv/bin/python`; assets build with `export PATH="$HOME/.nvm/versions/node/v18.20.8/bin:$PATH"` on PATH first.
- `.env` points at the **production** MySQL; never run `craft migrate` / `seed:run`. No schema change is needed here.
- `User.__fillable__` includes `role`: assign attributes one at a time, never `user.update({...})`.
- Password policy = Masonite's `strong` defaults, which the reset flow already enforces: length ≥ 8, ≥ 2 uppercase, ≥ 2 lowercase, ≥ 2 digits, ≥ 2 symbols.
- One generic refusal message everywhere: `Current password is incorrect, or the new password doesn't meet the rules.`
- Throttle bucket `password-change`, `5/minute`, `GuestAuthLimiter`. Never share `password-reset`/`otp`.
- flake8 max-line-length 99; `make lint` must stay green. Comments say *why*, matching the codebase.
- No gradients in UI.

---

### Task 1: `PasswordChange` service — policy and apply

**Files:**
- Create: `app/services/PasswordChange.py`
- Test: `tests/unit/test_password_change_service.py`

**Interfaces:**
- Produces:
  - `GENERIC_ERROR: str`
  - `policy_errors(password: str) -> list[str]` — empty list when the password meets policy.
  - `class Result` with attributes `ok: bool`, `errors: list[str]`, `emailed: bool`.
  - `apply(user, current: str, new: str, confirmation: str) -> Result`.
  - `forget_pending_resets(email: str) -> None` (module function; tests patch it).
  - `send_notice(user) -> bool` (module function; tests patch it; Task 2 makes it real).

- [ ] **Step 1: Write the failing tests**

```python
"""Changing your own password from the profile panel.

The service is the whole security story: the caller must hold the current
password, the new one must meet the same `strong` policy the reset flow uses,
and a success rotates `remember_token` so every other tab and device is signed
out on its next request. Refusals share ONE message on purpose — a form that
said "current password wrong" separately from "new password weak" would let a
hijacked session confirm the current password one guess at a time.

Real bcrypt through the Hash facade (needs the container, hence `wsgi`);
the user row and the two side effects (reset-row cleanup, email) are mocked.
"""

from unittest import TestCase
from unittest.mock import Mock, patch

from masonite.facades import Hash

from app.services import PasswordChange
from wsgi import application  # noqa: F401  (binds the Hash facade)

CURRENT = "OldPass!!22Aa"
STRONG = "NewPass!!33Bb"


def _user(**overrides):
    fields = {
        "id": 3,
        "username": "jdelacruz",
        "email": "j@example.com",
        "role": "editor",
        "password": Hash.make(CURRENT),
        "remember_token": "token-before",
    }
    fields.update(overrides)
    user = Mock(**fields)
    user.save = Mock()

    def _mint(token=None):
        user.remember_token = "token-after"
        return user

    user.set_remember_token = Mock(side_effect=_mint)
    return user


class PolicyTestCase(TestCase):
    def test_accepts_the_strong_shape(self):
        self.assertEqual(PasswordChange.policy_errors(STRONG), [])

    def test_rejects_short(self):
        self.assertTrue(PasswordChange.policy_errors("Aa!1Aa!"))

    def test_rejects_one_of_a_class(self):
        # Masonite's `strong` wants TWO of each class; one uppercase is not enough.
        self.assertTrue(PasswordChange.policy_errors("newpass!!33bA"))

    def test_rejects_no_symbol(self):
        self.assertTrue(PasswordChange.policy_errors("NewPass3344Bb"))


@patch("app.services.PasswordChange.send_notice", return_value=True)
@patch("app.services.PasswordChange.forget_pending_resets")
class ApplyTestCase(TestCase):
    def test_wrong_current_password_is_refused(self, forget, notice):
        user = _user()
        before = user.password
        result = PasswordChange.apply(user, "nope", STRONG, STRONG)
        self.assertFalse(result.ok)
        self.assertEqual(result.errors, [PasswordChange.GENERIC_ERROR])
        self.assertEqual(user.password, before)
        self.assertEqual(user.remember_token, "token-before")
        user.save.assert_not_called()
        forget.assert_not_called()
        notice.assert_not_called()

    def test_weak_new_password_is_refused(self, forget, notice):
        user = _user()
        result = PasswordChange.apply(user, CURRENT, "weak", "weak")
        self.assertFalse(result.ok)
        self.assertEqual(result.errors, [PasswordChange.GENERIC_ERROR])
        user.save.assert_not_called()

    def test_mismatched_confirmation_is_refused(self, forget, notice):
        user = _user()
        result = PasswordChange.apply(user, CURRENT, STRONG, STRONG + "x")
        self.assertFalse(result.ok)
        user.save.assert_not_called()

    def test_same_as_current_is_refused(self, forget, notice):
        user = _user()
        result = PasswordChange.apply(user, CURRENT, CURRENT, CURRENT)
        self.assertFalse(result.ok)
        user.save.assert_not_called()

    def test_success_rehashes_rotates_token_and_cleans_up(self, forget, notice):
        user = _user()
        result = PasswordChange.apply(user, CURRENT, STRONG, STRONG)
        self.assertTrue(result.ok)
        self.assertTrue(result.emailed)
        self.assertTrue(Hash.check(STRONG, user.password))
        self.assertFalse(Hash.check(CURRENT, user.password))
        self.assertEqual(user.remember_token, "token-after")
        user.save.assert_called_once()
        forget.assert_called_once_with("j@example.com")
        notice.assert_called_once_with(user)

    def test_mail_failure_does_not_fail_the_change(self, forget, notice):
        notice.return_value = False
        user = _user()
        result = PasswordChange.apply(user, CURRENT, STRONG, STRONG)
        self.assertTrue(result.ok)
        self.assertFalse(result.emailed)
        self.assertTrue(Hash.check(STRONG, user.password))

    def test_account_without_email_skips_cleanup_and_notice(self, forget, notice):
        user = _user(email=None)
        result = PasswordChange.apply(user, CURRENT, STRONG, STRONG)
        self.assertTrue(result.ok)
        self.assertFalse(result.emailed)
        forget.assert_not_called()
        notice.assert_not_called()

    def test_missing_fields_are_refused_without_touching_the_row(self, forget, notice):
        # request.input() defaults to "" — Hash.make("") must never be reached.
        user = _user()
        result = PasswordChange.apply(user, "", "", "")
        self.assertFalse(result.ok)
        user.save.assert_not_called()
```

- [ ] **Step 2: Run to verify it fails**

Run: `venv/bin/python -m pytest -q tests/unit/test_password_change_service.py`
Expected: FAIL — `ImportError: cannot import name 'PasswordChange'` (or `ModuleNotFoundError`).

- [ ] **Step 3: Write the service**

```python
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
```

- [ ] **Step 4: Run to verify it passes**

Run: `venv/bin/python -m pytest -q tests/unit/test_password_change_service.py`
Expected: `13 passed`. (`send_notice` imports a mailable that does not exist yet, but it is patched in every test that would reach it.)

- [ ] **Step 5: Lint and commit**

```bash
make lint
git add app/services/PasswordChange.py tests/unit/test_password_change_service.py
git commit -m "feat(profile): PasswordChange service — policy, current-password check, token rotation

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 2: `PasswordChanged` mailable

**Files:**
- Create: `app/mailables/PasswordChanged.py`
- Create: `templates/auth/mailables/password_changed.html`
- Test: `tests/unit/test_password_changed_mailable.py`

**Interfaces:**
- Consumes: `PasswordChange.send_notice(user)` from Task 1 imports `app.mailables.PasswordChanged.PasswordChanged(username=...)`.
- Produces: `class PasswordChanged(Mailable)` with `__init__(self, username=None)`.

- [ ] **Step 1: Write the failing test**

```python
"""The password-changed notice is the only channel a hijacked change can be
noticed on, so it must actually send, and send to the account's own address."""

from unittest import TestCase
from unittest.mock import Mock, patch

from app.services import PasswordChange
from wsgi import application  # noqa: F401


class PasswordChangedNoticeTestCase(TestCase):
    @patch("app.services.PasswordChange.Mail")
    def test_sends_to_the_account_email(self, MockMail):
        user = Mock(username="jdelacruz", email="j@example.com")
        self.assertTrue(PasswordChange.send_notice(user))
        mailable = MockMail.mailable.call_args[0][0]
        self.assertEqual(type(mailable).__name__, "PasswordChanged")
        self.assertEqual(mailable.username, "jdelacruz")
        MockMail.mailable.return_value.send.assert_called_once()

    @patch("app.services.PasswordChange.Mail")
    def test_mail_exception_is_swallowed(self, MockMail):
        MockMail.mailable.return_value.send.side_effect = RuntimeError("smtp down")
        user = Mock(username="jdelacruz", email="j@example.com")
        self.assertFalse(PasswordChange.send_notice(user))

    def test_mailable_builds(self):
        from app.mailables.PasswordChanged import PasswordChanged

        mailable = PasswordChanged(username="jdelacruz").to("j@example.com")
        self.assertEqual(mailable.username, "jdelacruz")
```

- [ ] **Step 2: Run to verify it fails**

Run: `venv/bin/python -m pytest -q tests/unit/test_password_changed_mailable.py`
Expected: FAIL — `ModuleNotFoundError: No module named 'app.mailables.PasswordChanged'`.

- [ ] **Step 3: Write the mailable and its template**

`app/mailables/PasswordChanged.py`:

```python
from masonite.mail import Mailable
from masonite.configuration import config


class PasswordChanged(Mailable):
    """Notice that the account's own password was changed from the dashboard.

    Sent to the account's email only. It carries nothing secret — no password,
    no token — its whole job is to be noticed by the real owner if it was not
    them at the keyboard.
    """

    def __init__(self, username=None):
        super().__init__()
        self.username = username

    def build(self):
        return (
            self.subject("Your Presspoint Password Was Changed")
            .from_(config("mail.drivers.smtp.from"))
            .view("auth.mailables.password_changed", {"username": self.username})
        )
```

`templates/auth/mailables/password_changed.html` (same shell as `email_changed.html`):

```html
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Your Presspoint Password Was Changed</title>
    <style>
    /* Literal brand hexes on purpose: email clients do not support CSS
       custom properties, so kiosk-tokens.css cannot reach this file.
       Keep in sync with --brand-cream / --brand-maroon by hand. */
        html { background-color: #e9dac4; /* brand cream */ }
        .button {
            color: white;
            padding: 10px 14px;
            background-color: #6b2516; /* brand maroon */
            text-decoration: none;
            display: inline-block;
            margin-top: 16px;
        }
        .notice {
            border-left: 4px solid #6b2516; /* brand maroon */
            padding: 8px 12px;
            margin-top: 16px;
        }
    </style>
</head>
<body>
    <div style="width: 98%; background-color: white; margin-right: 10px; padding: 20px">
        <h3>Hello,</h3>
        <p>
            The password on the Presspoint account <strong>{{ username }}</strong>
            was just changed from the GEARS dashboard.
        </p>
        <p>Every other signed-in tab and device has been signed out.</p>
        <div class="notice">
            <p>
                If this wasn't you, reset your password now with the link below
                and tell The Gears publication straight away.
            </p>
        </div>
        <p>
            <a class="button" href="{{ route('auth.forgot-password') }}">Reset password</a>
        </p>
    </div>
</body>
</html>
```

- [ ] **Step 4: Run to verify it passes**

Run: `venv/bin/python -m pytest -q tests/unit/test_password_changed_mailable.py tests/unit/test_password_change_service.py`
Expected: all pass.

- [ ] **Step 5: Lint and commit**

```bash
make lint
git add app/mailables/PasswordChanged.py templates/auth/mailables/password_changed.html tests/unit/test_password_changed_mailable.py
git commit -m "feat(profile): password-changed email notice

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 3: Route, throttle bucket, and controller action

**Files:**
- Modify: `routes/dashboard.py:37-41`
- Modify: `app/providers/AppProvider.py:118-136` (boot)
- Modify: `app/controllers/gears/ProfileController.py` (append action)
- Modify: `tests/unit/test_auth_rate_limit_buckets.py:29-40` (extend the two dicts)
- Test: `tests/unit/test_profile_password_controller.py`

**Interfaces:**
- Consumes: `PasswordChange.apply(user, current, new, confirmation) -> Result` (Task 1); `app.tab_slots.slot_cookie(name, slot)`.
- Produces: route `profile.password` → `POST /gears/profile/password`; JSON `{ok: true, emailed: bool, messages: [...]}` on success.

- [ ] **Step 1: Write the failing tests**

Append to the two dicts in `tests/unit/test_auth_rate_limit_buckets.py`:

```python
EXPECTED_ROUTE_LIMITERS = {
    "auth.login.store": "throttle:auth",
    "auth.forgot-password.store": "throttle:password-reset",
    "auth.forgot-password.otp.store": "throttle:otp",
    "auth.change-password.store": "throttle:password-reset",
    "profile.password": "throttle:password-change",
}

EXPECTED_LIMITS = {
    "auth": "5/minute",
    "password-reset": "10/minute",
    "otp": "5/minute",
    "password-change": "5/minute",
}
```

New `tests/unit/test_profile_password_controller.py`:

```python
"""The change-password action is an adapter over PasswordChange.apply: it must
refuse anonymous callers, pass the three fields through untouched, and on
success re-issue THIS tab's token cookie — the service rotated remember_token,
and without the new cookie the caller would be signed out along with everyone
else on their very next request."""

from unittest import TestCase
from unittest.mock import Mock, patch

from app.controllers.gears.ProfileController import ProfileController
from app.services.PasswordChange import Result
from app.tab_slots import slot_cookie


def _request(inputs=None, user=None, slot=2):
    request = Mock()
    request.input.side_effect = lambda key, default="": (inputs or {}).get(key, default)
    request.header.side_effect = lambda name: (
        "XMLHttpRequest" if name == "X-Requested-With" else None
    )
    request.user.return_value = user
    request.tab_slot = slot
    return request


def _response():
    response = Mock()
    redirect = Mock()
    redirect.with_success.return_value = "redirected"
    redirect.with_errors.return_value = "redirected-with-errors"
    response.redirect.return_value = redirect
    response.back.return_value = redirect
    return response


def _body(response):
    return response.json.call_args[0][0]


def _status(response):
    return response.json.call_args[1]["status"]


FIELDS = {
    "current_password": "OldPass!!22Aa",
    "password": "NewPass!!33Bb",
    "password_confirmation": "NewPass!!33Bb",
}


class ChangePasswordTestCase(TestCase):
    def test_anonymous_is_401(self):
        response = _response()
        ProfileController().change_password(_request(FIELDS, user=None), response)
        self.assertEqual(_status(response), 401)

    @patch("app.controllers.gears.ProfileController.PasswordChange")
    def test_refusal_is_422_with_the_service_message(self, MockService):
        MockService.apply.return_value = Result(False, ["nope"])
        user = Mock(remember_token="t1")
        response = _response()
        ProfileController().change_password(_request(FIELDS, user=user), response)
        self.assertEqual(_status(response), 422)
        self.assertEqual(_body(response)["errors"], ["nope"])
        response.cookie.assert_not_called()

    @patch("app.controllers.gears.ProfileController.PasswordChange")
    def test_success_reissues_this_tabs_cookie(self, MockService):
        def _apply(user, current, new, confirmation):
            user.remember_token = "t2"
            return Result(True, emailed=True)

        MockService.apply.side_effect = _apply
        user = Mock(remember_token="t1")
        response = _response()
        ProfileController().change_password(_request(FIELDS, user=user, slot=2), response)
        MockService.apply.assert_called_once_with(
            user, "OldPass!!22Aa", "NewPass!!33Bb", "NewPass!!33Bb"
        )
        response.cookie.assert_called_once_with(slot_cookie("token", 2), "t2")
        body = _body(response)
        self.assertTrue(body["ok"])
        self.assertTrue(body["emailed"])

    @patch("app.controllers.gears.ProfileController.PasswordChange")
    def test_plain_form_post_redirects_with_flash(self, MockService):
        MockService.apply.return_value = Result(True, emailed=False)
        user = Mock(remember_token="t2")
        request = _request(FIELDS, user=user)
        request.header.side_effect = lambda name: None  # not AJAX
        response = _response()
        result = ProfileController().change_password(request, response)
        self.assertEqual(result, "redirected")
        response.cookie.assert_called_once()
```

- [ ] **Step 2: Run to verify they fail**

Run: `venv/bin/python -m pytest -q tests/unit/test_profile_password_controller.py tests/unit/test_auth_rate_limit_buckets.py`
Expected: FAIL — `AttributeError: 'ProfileController' object has no attribute 'change_password'`; the buckets test fails on the missing `profile.password` route and `password-change` limiter.

- [ ] **Step 3: Add the route, the limiter, and the action**

`routes/dashboard.py` — after line 41:

```python
    # Its own throttle bucket: the middleware keys on limit_string + ip, so
    # sharing `password-reset` would let a change attempt spend a stranger's
    # reset allowance on a campus NAT — the same collision `otp` was split for.
    Route.post("/gears/profile/password", "gears.ProfileController@change_password")
    .name("profile.password")
    .middleware("auth", "throttle:password-change"),
```

`app/providers/AppProvider.py` — after the `otp` registration:

```python
        # Self-service password change (signed in, must supply the current
        # password). Tight like `otp`: with one generic refusal message this
        # endpoint is the only way to test a guessed current password.
        RateLimiter.register("password-change", GuestAuthLimiter("5/minute"))
```

`app/controllers/gears/ProfileController.py` — add the imports and the action:

```python
from app.services import PasswordChange, Profiles
from app.tab_slots import slot_cookie
```

(replace the existing `from app.services import Profiles` line), then append to the class:

```python
    def change_password(self, request: Request, response: Response):
        """Change the signed-in account's own password.

        PasswordChange.apply does the checking and the write; this re-issues
        the cookie. Sessions on this app are `users.remember_token`, which the
        service rotates so every other tab and device drops — without a fresh
        cookie for *this* slot the caller would drop with them.
        """
        is_ajax = wants_json(request)

        def _err(messages, status=422):
            if is_ajax:
                return json_errors(response, messages, status=status)
            return response.back().with_errors(messages)

        user = self._actor(request)
        if not user:
            return _err(["Not signed in."], status=401)

        try:
            result = PasswordChange.apply(
                user,
                request.input("current_password"),
                request.input("password"),
                request.input("password_confirmation"),
            )
        except Exception as exception:
            traceback.print_exception(type(exception), exception, exception.__traceback__)
            return _err(["Could not change your password. Please try again."])

        if not result.ok:
            return _err(result.errors)

        response.cookie(
            slot_cookie("token", getattr(request, "tab_slot", 0)),
            getattr(user, "remember_token", "") or "",
        )

        message = "Password changed. Other devices have been signed out."
        if is_ajax:
            return json_success(
                response, payload={"emailed": result.emailed}, messages=[message]
            )
        return response.redirect(
            name="gears.dashboard", query_params={"page": "profile"}
        ).with_success([message])
```

- [ ] **Step 4: Run to verify they pass**

Run: `venv/bin/python -m pytest -q tests/unit/test_profile_password_controller.py tests/unit/test_auth_rate_limit_buckets.py tests/unit/test_profile.py`
Expected: all pass.

- [ ] **Step 5: Lint and commit**

```bash
make lint
git add routes/dashboard.py app/providers/AppProvider.py app/controllers/gears/ProfileController.py tests/unit/test_profile_password_controller.py tests/unit/test_auth_rate_limit_buckets.py
git commit -m "feat(profile): POST /gears/profile/password behind auth + its own throttle bucket

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 4: Profile panel card, dashboard JS, styles

**Files:**
- Modify: `templates/gears/partials/profile-panel.html` (append a second `gears-panel` after the Identity one, inside the `<section>`)
- Modify: `resources/js/gears-dashboard.js` (inside the `if (profileForm) { ... }` block, after the avatar handlers)
- Modify: `resources/css/review-queue.css` (after `.profile-editor__fields .field__input:disabled`)
- Test: `tests/unit/test_profile_panel_password_form.py`

**Interfaces:**
- Consumes: route `profile.password` (Task 3); JSON shape `{ok, errors, messages, emailed}`; `postJson`, `toast` already defined in `gears-dashboard.js`.

- [ ] **Step 1: Write the failing test**

```python
"""The password card's markup contract: the three inputs the controller reads,
with the autocomplete hints that keep password managers filling the right
box, posting to the named route so a plain form submit still works."""

import re
from pathlib import Path
from unittest import TestCase

PARTIAL = (
    Path(__file__).resolve().parents[2]
    / "templates" / "gears" / "partials" / "profile-panel.html"
)


class ProfilePasswordFormTestCase(TestCase):
    def setUp(self):
        self.source = PARTIAL.read_text(encoding="utf-8")

    def _input(self, name):
        match = re.search(rf'<input[^>]*name="{name}"[^>]*>', self.source)
        self.assertIsNotNone(match, f"no <input name={name}>")
        return match.group(0)

    def test_current_password_field(self):
        tag = self._input("current_password")
        self.assertIn('type="password"', tag)
        self.assertIn('autocomplete="current-password"', tag)

    def test_new_password_fields(self):
        for name in ("password", "password_confirmation"):
            tag = self._input(name)
            self.assertIn('type="password"', tag)
            self.assertIn('autocomplete="new-password"', tag)

    def test_form_posts_to_the_named_route(self):
        self.assertIn("route('profile.password'", self.source)
        self.assertIn("data-profile-password-form", self.source)
```

- [ ] **Step 2: Run to verify it fails**

Run: `venv/bin/python -m pytest -q tests/unit/test_profile_panel_password_form.py`
Expected: FAIL — `no <input name=current_password>`.

- [ ] **Step 3: Add the card to the partial**

Insert before the closing `</section>` of `profile-panel.html`:

```html
      {# Second card: password. A real <form> with the CSRF token so a plain
         submit works if the script is not loaded; gears-dashboard.js
         intercepts it for the AJAX path. Three ids are unique on the page —
         none of the consoles has another #password. #}
      <form class="gears-panel gears-panel--narrow profile-password"
            method="POST" action="{{ route('profile.password', {}, False) }}"
            data-profile-password-form autocomplete="on">
        {{ csrf_field | safe }}
        <div class="panel-header panel-header--compact">
          <div>
            <p class="panel-header__eyebrow">Security</p>
            <h3 class="panel-header__title">Change password</h3>
          </div>
        </div>

        <div class="profile-password__fields">
          <label class="field" for="current_password">
            <span class="field__label">Current password</span>
            <span class="profile-password__field">
              <input type="password" name="current_password" id="current_password"
                     class="field__input" autocomplete="current-password" required>
              <button type="button" class="profile-password__toggle" data-password-toggle="current_password"
                      aria-pressed="false" aria-label="Show password">
                <svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>
              </button>
            </span>
          </label>

          <label class="field" for="password">
            <span class="field__label">New password</span>
            <span class="profile-password__field">
              <input type="password" name="password" id="password"
                     class="field__input" autocomplete="new-password" required
                     data-profile-password-new>
              <button type="button" class="profile-password__toggle" data-password-toggle="password"
                      aria-pressed="false" aria-label="Show password">
                <svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>
              </button>
            </span>
          </label>
          <div class="profile-password__meter" aria-hidden="true">
            <div class="profile-password__meter-bar" data-profile-password-bar></div>
          </div>
          <p class="profile-editor__hint" data-profile-password-label>
            At least 8 characters, with 2 uppercase, 2 lowercase, 2 numbers and 2 symbols.
          </p>

          <label class="field" for="password_confirmation">
            <span class="field__label">Confirm new password</span>
            <span class="profile-password__field">
              <input type="password" name="password_confirmation" id="password_confirmation"
                     class="field__input" autocomplete="new-password" required
                     data-profile-password-confirm>
              <button type="button" class="profile-password__toggle" data-password-toggle="password_confirmation"
                      aria-pressed="false" aria-label="Show password">
                <svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>
              </button>
            </span>
          </label>

          <p class="profile-editor__hint">
            Changing your password signs you out everywhere else. This tab stays signed in.
          </p>

          <button type="submit" class="review-btn review-btn--approve" data-profile-password-save>Update password</button>
        </div>
      </form>
```

`{{ csrf_field | safe }}` is the spelling every other dashboard form uses (see `panel-archives.html`).

- [ ] **Step 4: Run the template test**

Run: `venv/bin/python -m pytest -q tests/unit/test_profile_panel_password_form.py tests/unit/test_account_templates.py`
Expected: pass.

- [ ] **Step 5: Wire the JS**

In `resources/js/gears-dashboard.js`, inside `if (profileForm) { ... }` after the `avatarRemove` handler, add:

```js
    // ── Change password ──────────────────────────────────────────────────
    // Mirrors app/services/PasswordChange.py's thresholds (Masonite's
    // `strong` defaults). The server is the authority; this only tells an
    // honest user which rule they miss BEFORE submit, since the server's
    // refusal is deliberately one generic sentence.
    var pwForm = root.querySelector('[data-profile-password-form]');
    if (pwForm) {
      var pwNew = pwForm.querySelector('[data-profile-password-new]');
      var pwConfirm = pwForm.querySelector('[data-profile-password-confirm]');
      var pwBar = pwForm.querySelector('[data-profile-password-bar]');
      var pwLabel = pwForm.querySelector('[data-profile-password-label]');
      var pwSave = pwForm.querySelector('[data-profile-password-save]');
      var pwHint = pwLabel ? pwLabel.textContent : '';

      function count(str, test) {
        var n = 0;
        for (var i = 0; i < str.length; i++) if (test(str[i])) n++;
        return n;
      }

      function missingRules(pw) {
        var missing = [];
        if (pw.length < 8) missing.push('8+ characters');
        if (count(pw, function (c) { return c !== c.toLowerCase() && c === c.toUpperCase(); }) < 2) missing.push('2 uppercase');
        if (count(pw, function (c) { return c !== c.toUpperCase() && c === c.toLowerCase(); }) < 2) missing.push('2 lowercase');
        if (count(pw, function (c) { return /\d/.test(c); }) < 2) missing.push('2 numbers');
        if (count(pw, function (c) { return /[^A-Za-z0-9]/.test(c); }) < 2) missing.push('2 symbols');
        return missing;
      }

      function updateMeter() {
        var pw = pwNew ? pwNew.value : '';
        var missing = missingRules(pw);
        var met = 5 - missing.length;
        if (pwBar) {
          pwBar.style.width = (pw ? (met / 5) * 100 : 0) + '%';
          pwBar.style.backgroundColor = met < 3 ? 'var(--danger)' : met < 5 ? 'var(--warn)' : 'var(--ok)';
        }
        if (pwLabel) {
          if (!pw) { pwLabel.textContent = pwHint; pwLabel.style.color = ''; }
          else if (!missing.length) { pwLabel.textContent = 'Strong password.'; pwLabel.style.color = 'var(--ok)'; }
          else { pwLabel.textContent = 'Needs: ' + missing.join(', '); pwLabel.style.color = ''; }
        }
      }

      if (pwNew) { pwNew.addEventListener('input', updateMeter); updateMeter(); }
      if (pwConfirm && pwNew) {
        pwConfirm.addEventListener('input', function () {
          pwConfirm.setCustomValidity(
            pwNew.value && pwConfirm.value && pwNew.value !== pwConfirm.value ? 'Passwords do not match.' : ''
          );
        });
      }

      // aria-pressed is the single source of truth, same as auth-password-toggle.js.
      Array.prototype.forEach.call(pwForm.querySelectorAll('[data-password-toggle]'), function (toggle) {
        var input = document.getElementById(toggle.getAttribute('data-password-toggle'));
        if (!input) return;
        toggle.addEventListener('click', function () {
          var showing = toggle.getAttribute('aria-pressed') === 'true';
          input.type = showing ? 'password' : 'text';
          toggle.setAttribute('aria-pressed', String(!showing));
          toggle.setAttribute('aria-label', showing ? 'Show password' : 'Hide password');
        });
      });

      pwForm.addEventListener('submit', function (event) {
        event.preventDefault();
        if (!pwForm.reportValidity()) return;
        if (pwSave) pwSave.disabled = true;
        postJson(pwForm.getAttribute('action'), {
          current_password: pwForm.elements.current_password.value,
          password: pwForm.elements.password.value,
          password_confirmation: pwForm.elements.password_confirmation.value
        })
          .then(function (json) {
            if (pwSave) pwSave.disabled = false;
            if (json && json.ok) {
              pwForm.reset();
              updateMeter();
              toast((json.messages && json.messages[0]) || 'Password changed.', false);
            } else {
              toast((json && json.errors && json.errors[0]) || 'Could not change your password.', true);
            }
          })
          .catch(function () {
            if (pwSave) pwSave.disabled = false;
            toast('Request failed — please try again.', true);
          });
      });
    }
```

- [ ] **Step 6: Style the card**

Append to `resources/css/review-queue.css` after the `.profile-editor__fields .field__input:disabled` rule:

```css
/* ── Change password card ─────────────────────────────────────────────── */

.profile-password { margin-top: 20px; }

.profile-password__fields {
  display: flex;
  flex-direction: column;
  gap: 10px;
  max-width: 420px;
}

/* The reveal button sits inside the input's box; the input keeps its own
   right padding so typed text never runs under the glyph. */
.profile-password__field {
  position: relative;
  display: block;
}

.profile-password__field .field__input {
  width: 100%;
  padding-right: 44px;
}

.profile-password__toggle {
  position: absolute;
  top: 50%;
  right: 6px;
  transform: translateY(-50%);
  width: 32px;
  height: 32px;
  display: grid;
  place-items: center;
  border: 0;
  border-radius: var(--radius-sm, 4px);
  background: transparent;
  color: var(--ink-muted);
  cursor: pointer;
}

.profile-password__toggle svg { width: 18px; height: 18px; }

.profile-password__toggle:hover,
.profile-password__toggle[aria-pressed="true"] {
  color: var(--ink);
  background: var(--surface-sunken);
}

.profile-password__toggle:focus-visible {
  outline: 2px solid var(--accent);
  outline-offset: 1px;
}

.profile-password__meter {
  height: 6px;
  border-radius: 999px;
  background: var(--surface-sunken);
  overflow: hidden;
}

.profile-password__meter-bar {
  height: 100%;
  width: 0;
  background: var(--danger);
  transition: width 0.15s ease, background-color 0.15s ease;
}

@media (prefers-reduced-motion: reduce) {
  .profile-password__meter-bar { transition: none; }
}
```

- [ ] **Step 7: Build and run everything**

```bash
export PATH="$HOME/.nvm/versions/node/v18.20.8/bin:$PATH"
npm run prod 2>&1 | tail -3
npm run test:js 2>&1 | grep -E "^# (pass|fail)"
venv/bin/python -m pytest -q tests/unit 2>&1 | tail -1
make lint
```

Expected: `webpack compiled successfully`; JS `fail 0`; pytest all passed; lint silent.

- [ ] **Step 8: Commit**

```bash
git add templates/gears/partials/profile-panel.html resources/js/gears-dashboard.js resources/css/review-queue.css tests/unit/test_profile_panel_password_form.py mix-manifest.json
git commit -m "feat(profile): change-password card on every console's profile panel

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

(`storage/compiled` is untracked; `mix-manifest.json` is tracked and changes with every build.)

---

### Task 5: CLAUDE.md note

**Files:**
- Modify: `CLAUDE.md` — "Notifications and profile" section.

- [ ] **Step 1: Add the paragraph**

After the sentence ending "a mass assignment there is privilege escalation.", add:

```markdown
Self-service password change is `POST /gears/profile/password` → `app/services/PasswordChange.py`. It refuses with **one** generic message whatever failed (current password wrong, policy, mismatch, same-as-current) so the endpoint cannot confirm a current password separately from the policy check; it has its own `password-change` throttle bucket for the same reason. Success rotates `remember_token` — sessions *are* that token — so every other tab and device signs out, and the controller re-issues this tab's slot cookie so the caller doesn't. The policy is Masonite's `strong` defaults (8+, **two** of each class), the same rule the OTP reset enforces; the dashboard meter mirrors those numbers, so change both or neither.
```

- [ ] **Step 2: Commit**

```bash
git add CLAUDE.md
git commit -m "docs: password change flow in CLAUDE.md

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```
