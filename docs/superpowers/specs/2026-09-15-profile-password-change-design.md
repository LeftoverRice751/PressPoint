# Profile password change — design

Date: 2026-09-15. Status: approved in chat.

## Goal

Let a signed-in editor, admin, or super admin change their own password from
the profile panel of their dashboard, with the same guarantees a password
reset gives: the caller must prove they hold the current password, the new
one must meet the site policy, every other session drops, and the account's
email is told.

## Route

`POST /gears/profile/password` → `gears.ProfileController@change_password`,
middleware `auth` and `throttle:password-change`.

`password-change` is a new named limiter (5/min, `GuestAuthLimiter`, keyed by
`CF-Connecting-IP`), registered in `AppProvider.boot()` beside `auth`,
`password-reset` and `otp`. It is its own bucket because the middleware keys
on `limit_string + ip`: sharing `password-reset` would let a change attempt
spend a reset allowance and vice versa.

## Service: `app/services/PasswordChange.py`

`apply(user, current, new, confirmation) -> Result` where `Result` carries
`ok: bool`, `errors: list[str]`, `emailed: bool`.

Order of checks; the first failure returns:

1. `Hash.check(current, user.password)` is false.
2. `new` fails the policy (`strong`: ≥ 8 chars, upper, lower, digit, symbol —
   the same rule `PasswordResetController` uses) or `new != confirmation`.
3. `new == current`.

Every refusal returns one generic message — *"Current password is incorrect,
or the new password doesn't meet the rules."* — so the endpoint cannot be used
to confirm the current password separately from the policy check. The
strength meter on the form tells an honest user which it was before they
submit.

On success:

- `user.password = Hash.make(new)`; `user.set_remember_token()` (Masonite's
  own minting on the `Authenticates` mixin); `user.save()`. Attributes are
  assigned one at a time — `User.__fillable__` includes `role`.
- `DELETE FROM password_resets WHERE email = ?` for the user's email, if any.
- Best-effort email through a new `Credentials.send_password_changed_notice(
  email, username)` → `app/mailables/PasswordChanged.py` +
  `templates/auth/mailables/password_changed.html`. A missing email or a mail
  failure never fails the change; `emailed` reports what happened.

## Controller

`ProfileController.change_password` resolves the actor (`_actor`), reads the
three inputs, calls the service, and:

- on refusal: 422 via `json_errors` / `redirect.with_errors`;
- on success: re-issues **this tab's** cookie —
  `response.cookie(slot_cookie("token", request.tab_slot), user.remember_token)`
  — exactly as `LoginController` does, so the caller stays signed in while
  every other tab and device is signed out on its next request; then
  `json_success` with `{"emailed": bool}` and one message, or a redirect with
  the same flash.

## UI

A second card in `templates/gears/partials/profile-panel.html`, after
Identity: heading *Change password*, fields current / new / confirm with
`autocomplete="current-password"` / `"new-password"` / `"new-password"`,
each with the existing show/hide toggle, the existing strength meter under
the new password, and one *Update password* button. Submits over AJAX with
the CSRF meta; success clears the fields and toasts; failure shows the
generic message under the button. The partial is included by the editor
dashboard, the admin console, and the super-admin page, so all three roles
get it without further wiring.

Plain form post still works (the controller degrades via `AjaxResponses`).

## Not in scope

Audit log, forcing the current tab to re-login, 2FA, admin-initiated changes
(the super-admin "reset an admin's password" button is untouched).

## Tests

- `tests/unit/test_password_change_service.py` — the service against a real
  `users` row: wrong current / weak / mismatch / same-as-current each refused
  with hash and token untouched; success flips `Hash.check`, rotates the
  token, removes the `password_resets` row; mail failure still succeeds with
  `emailed False`.
- `tests/unit/test_password_change_route.py` — unauthenticated POST redirects;
  the route carries `throttle:password-change`; the limiter is registered.
- `tests/unit/test_profile_panel_password_form.py` — the partial's source
  carries the three fields with the right `autocomplete` values and posts to
  the named route.
