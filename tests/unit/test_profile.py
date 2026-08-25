"""Self-service profile: display name and avatar.

The privilege test here is the one that matters. `User.__fillable__` includes
`role`, so a profile endpoint that mass-assigned request input would let an
editor make themselves an admin — and admins are precisely the accounts that
approve stories onto a public campus screen. The controller assigns attributes
one at a time for that reason, and this pins it.
"""

from unittest import TestCase
from unittest.mock import Mock, patch

from app.controllers.gears.ProfileController import ProfileController
from app.services import Profiles


def _request(inputs=None, user=None):
    request = Mock()
    request.input.side_effect = lambda key, default="": (inputs or {}).get(key, default)
    request.header.side_effect = lambda name: (
        "XMLHttpRequest" if name == "X-Requested-With" else None
    )
    request.user.return_value = user
    return request


def _user(**overrides):
    fields = {
        "id": 3,
        "username": "jdelacruz",
        "full_name": None,
        "avatar_path": None,
        "role": "editor",
    }
    fields.update(overrides)
    user = Mock(**fields)
    user.save = Mock()
    return user


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


class DisplayNameTestCase(TestCase):
    def test_full_name_wins_over_username(self):
        self.assertEqual(Profiles.display_name(_user(full_name="Maria Santos")), "Maria Santos")

    def test_falls_back_to_username(self):
        """Every account predates the full_name column, so this is the common
        case, not the edge case."""
        self.assertEqual(Profiles.display_name(_user(full_name=None)), "jdelacruz")

    def test_initials_use_first_and_last(self):
        self.assertEqual(Profiles.initials(_user(full_name="Juan Dela Cruz")), "JC")

    def test_initials_of_a_single_word(self):
        self.assertEqual(Profiles.initials(_user(full_name="Madonna")), "M")

    def test_initials_of_nothing(self):
        self.assertEqual(Profiles.initials(None), "?")


class AvatarUrlTestCase(TestCase):
    def test_no_path_renders_initials(self):
        self.assertEqual(Profiles.avatar_url(_user(avatar_path=None)), "")

    def test_missing_file_degrades_to_initials(self):
        """An unmounted NAS must show initials, not a broken image."""
        with patch("app.services.Profiles.os.path.isfile", return_value=False):
            self.assertEqual(Profiles.avatar_url(_user(avatar_path="Profiles/a.png")), "")

    def test_traversal_attempt_is_refused(self):
        """The value comes out of the database, so it goes through the same
        guard every other stored path does."""
        with patch("app.services.Profiles.is_safe_path", return_value=False):
            self.assertEqual(Profiles.avatar_url(_user(avatar_path="../../etc/passwd")), "")

    def test_present_file_is_served_from_storage(self):
        with patch("app.services.Profiles.os.path.isfile", return_value=True):
            self.assertEqual(
                Profiles.avatar_url(_user(avatar_path="Profiles/a.png")),
                "/storage/Profiles/a.png",
            )


class NameUpdateTestCase(TestCase):
    def test_saves_the_name(self):
        user = _user()
        response = _response()
        ProfileController().update(_request({"full_name": "Maria Santos"}, user), response)

        self.assertEqual(user.full_name, "Maria Santos")
        user.save.assert_called_once()
        self.assertTrue(_body(response)["ok"])

    def test_blank_name_is_refused(self):
        user = _user()
        response = _response()
        ProfileController().update(_request({"full_name": "   "}, user), response)

        user.save.assert_not_called()
        self.assertFalse(_body(response)["ok"])

    def test_overlong_name_is_refused(self):
        user = _user()
        response = _response()
        ProfileController().update(_request({"full_name": "x" * 200}, user), response)

        user.save.assert_not_called()

    def test_unauthenticated_request_is_refused(self):
        response = _response()
        ProfileController().update(_request({"full_name": "Nobody"}, None), response)
        self.assertEqual(_status(response), 401)

    def test_role_cannot_be_changed_through_the_profile_endpoint(self):
        """The privilege-escalation guard. `role` is in User.__fillable__, so a
        mass assignment here would be obeyed — an editor could make themselves
        an admin and start approving their own stories onto the kiosk."""
        user = _user(role="editor")
        response = _response()
        ProfileController().update(
            _request({"full_name": "Sneaky", "role": "admin", "username": "root"}, user),
            response,
        )

        self.assertEqual(user.role, "editor")
        self.assertEqual(user.username, "jdelacruz")
        self.assertEqual(user.full_name, "Sneaky")


class AvatarUploadTestCase(TestCase):
    def test_upload_stores_the_path_and_removes_the_old_file(self):
        user = _user(avatar_path="Profiles/old.png")
        response = _response()

        with patch(
            "app.controllers.gears.ProfileController.save_uploaded_image",
            return_value=("Profiles/new.png", None),
        ), patch("app.controllers.gears.ProfileController.Profiles") as profiles_mock:
            profiles_mock.AVATAR_SUBDIR = "Profiles"
            ProfileController().upload_avatar(_request({"avatar": Mock()}, user), response)

        self.assertEqual(user.avatar_path, "Profiles/new.png")
        profiles_mock.delete_avatar_file.assert_called_once_with("Profiles/old.png")

    def test_rejected_upload_leaves_the_existing_picture_alone(self):
        user = _user(avatar_path="Profiles/old.png")
        response = _response()

        with patch(
            "app.controllers.gears.ProfileController.save_uploaded_image",
            return_value=(None, "Upload must be a JPEG, PNG, or WEBP image."),
        ):
            ProfileController().upload_avatar(_request({"avatar": Mock()}, user), response)

        self.assertEqual(user.avatar_path, "Profiles/old.png")
        user.save.assert_not_called()
        self.assertFalse(_body(response)["ok"])

    def test_failed_save_cleans_up_the_orphaned_upload(self):
        """The bytes are already on the NAS by the time the row is written; if
        that write fails, nothing references the file."""
        user = _user()
        user.save.side_effect = RuntimeError("db down")
        response = _response()

        with patch(
            "app.controllers.gears.ProfileController.save_uploaded_image",
            return_value=("Profiles/new.png", None),
        ), patch("app.controllers.gears.ProfileController.Profiles") as profiles_mock:
            profiles_mock.AVATAR_SUBDIR = "Profiles"
            ProfileController().upload_avatar(_request({"avatar": Mock()}, user), response)

        profiles_mock.delete_avatar_file.assert_called_once_with("Profiles/new.png")
        self.assertFalse(_body(response)["ok"])

    def test_remove_clears_the_path_and_deletes_the_file(self):
        user = _user(avatar_path="Profiles/old.png")
        response = _response()

        with patch("app.controllers.gears.ProfileController.Profiles") as profiles_mock:
            ProfileController().remove_avatar(_request({}, user), response)

        self.assertIsNone(user.avatar_path)
        profiles_mock.delete_avatar_file.assert_called_once_with("Profiles/old.png")
