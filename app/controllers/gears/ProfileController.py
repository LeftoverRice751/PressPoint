"""Self-service profile: display name, avatar and password.

`User.__fillable__` includes `role`, so every write here assigns one attribute
at a time. A mass assignment from request input would be privilege escalation.
"""

import traceback

from masonite.controllers import Controller
from masonite.request import Request
from masonite.response import Response

from app.services import PasswordChange, Profiles
from app.services.AjaxResponses import wants_json, json_success, json_errors
from app.services.ImageUploads import save_uploaded_image
from app.tab_slots import slot_cookie


# UI limit so the profile border and review byline stay laid out (column is varchar(255)).
MAX_NAME_LENGTH = 80


class ProfileController(Controller):
    def _actor(self, request):
        try:
            return request.user() if callable(getattr(request, "user", None)) else None
        except Exception:
            return None

    def _respond(self, request, response, user, message):
        if wants_json(request):
            return json_success(
                response,
                payload={
                    "full_name": getattr(user, "full_name", None) or "",
                    "display_name": Profiles.display_name(user),
                    "initials": Profiles.initials(user),
                    "avatar_url": Profiles.avatar_url(user),
                },
                messages=[message],
            )
        return response.redirect(
            name="gears.dashboard", query_params={"page": "profile"}
        ).with_success([message])

    def update(self, request: Request, response: Response):
        """Change the signed-in account's display name."""
        is_ajax = wants_json(request)

        def _err(messages, status=422):
            if is_ajax:
                return json_errors(response, messages, status=status)
            return response.back().with_errors(messages)

        user = self._actor(request)
        if not user:
            return _err(["Not signed in."], status=401)

        full_name = (request.input("full_name") or "").strip()
        if not full_name:
            return _err(["Please enter your name."])
        if len(full_name) > MAX_NAME_LENGTH:
            return _err([f"Name must be {MAX_NAME_LENGTH} characters or fewer."])

        try:
            user.full_name = full_name
            user.save()
        except Exception as exception:
            traceback.print_exception(type(exception), exception, exception.__traceback__)
            return _err(["Could not save your name. Please try again."])

        return self._respond(request, response, user, "Profile updated.")

    def upload_avatar(self, request: Request, response: Response):
        """Replace the signed-in account's profile picture (magic-byte validated)."""
        is_ajax = wants_json(request)

        def _err(messages, status=422):
            if is_ajax:
                return json_errors(response, messages, status=status)
            return response.back().with_errors(messages)

        user = self._actor(request)
        if not user:
            return _err(["Not signed in."], status=401)

        stored_path, error = save_uploaded_image(
            request.input("avatar"), Profiles.AVATAR_SUBDIR, "avatar"
        )
        if error:
            return _err([error])

        previous = getattr(user, "avatar_path", None)
        try:
            user.avatar_path = stored_path
            user.save()
        except Exception as exception:
            traceback.print_exception(type(exception), exception, exception.__traceback__)
            Profiles.delete_avatar_file(stored_path)  # unreferenced, don't leave it on the NAS
            return _err(["Could not save your picture. Please try again."])

        # Only after the new path is committed, or a failed save would point at a deleted file.
        if previous and previous != stored_path:
            Profiles.delete_avatar_file(previous)

        return self._respond(request, response, user, "Profile picture updated.")

    def remove_avatar(self, request: Request, response: Response):
        """Drop the picture and fall back to initials."""
        is_ajax = wants_json(request)

        def _err(messages, status=422):
            if is_ajax:
                return json_errors(response, messages, status=status)
            return response.back().with_errors(messages)

        user = self._actor(request)
        if not user:
            return _err(["Not signed in."], status=401)

        previous = getattr(user, "avatar_path", None)
        try:
            user.avatar_path = None
            user.save()
        except Exception as exception:
            traceback.print_exception(type(exception), exception, exception.__traceback__)
            return _err(["Could not remove your picture. Please try again."])

        if previous:
            Profiles.delete_avatar_file(previous)

        return self._respond(request, response, user, "Profile picture removed.")

    def change_password(self, request: Request, response: Response):
        """Change the signed-in account's password, then re-issue this tab's cookie
        (the service rotates remember_token, which signs every other tab out)."""
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
