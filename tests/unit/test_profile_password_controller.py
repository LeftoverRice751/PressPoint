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
