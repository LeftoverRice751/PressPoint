"""Self-service profile: display name and avatar.

There was no authenticated self-service surface anywhere in this app before —
the only way to change anything about your own account was the logged-out OTP
password reset. This is the first, which is why it is deliberately narrow: name
and picture only. Username and email are login credentials (User.__auth__ is
"username"), and letting people change those self-service can lock them out or
collide with another account.

SECURITY NOTE, load-bearing: `User.__fillable__` includes `role`. Every write
here assigns one attribute at a time. Do not "tidy" this into
`user.update(request.all())` — an editor posting role=admin would be obeyed,
and admins are the accounts that approve stories onto a public screen.
"""

import traceback

from masonite.controllers import Controller
from masonite.request import Request
from masonite.response import Response

from app.services import Profiles
from app.services.AjaxResponses import wants_json, json_success, json_errors
from app.services.ImageUploads import save_uploaded_image


#: Longest display name we will store. The column is varchar(255); this is a
#: UI limit so the profile border and the review byline stay laid out.
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
            # One attribute, assigned by name. See the module docstring.
            user.full_name = full_name
            user.save()
        except Exception as exception:
            traceback.print_exception(type(exception), exception, exception.__traceback__)
            return _err(["Could not save your name. Please try again."])

        return self._respond(request, response, user, "Profile updated.")

    def upload_avatar(self, request: Request, response: Response):
        """Replace the signed-in account's profile picture.

        Goes through ImageUploads.save_uploaded_image, which validates by magic
        bytes rather than by the browser-supplied filename, caps the size, and
        writes with the group-writable umask the Samba share needs.
        """
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
            # The row did not take the new path, so the file we just wrote is
            # unreferenced — clean it up rather than leaving it on the NAS.
            Profiles.delete_avatar_file(stored_path)
            return _err(["Could not save your picture. Please try again."])

        # Only after the new path is committed: if this ran first and the save
        # failed, the account would be left pointing at a file we had deleted.
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
