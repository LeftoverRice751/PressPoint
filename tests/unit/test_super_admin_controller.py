from unittest.mock import Mock, patch

from tests import TestCase

from app.controllers.auth.SuperAdminController import SuperAdminController


def _make_user(id, username, email, role):
    """Minimal stand-in for a User row — the controller only reads
    `.role` off these, and the view only renders `.username`/`.email`."""
    user = Mock()
    user.id = id
    user.username = username
    user.email = email
    user.role = role
    return user


def _mock_view():
    view = Mock()
    view.render.side_effect = lambda template, context: context
    return view


def _mock_request(param_id=None, current_user=None):
    request = Mock()
    request.param.return_value = param_id
    request.user.return_value = current_user or _make_user(
        1, "root", "root@example.com", "superadmin"
    )
    return request


def _mock_response():
    response = Mock()
    redirect_response = Mock()
    redirect_response.with_errors.return_value = "redirected-with-errors"
    redirect_response.with_success.return_value = "redirected-with-success"
    response.redirect.return_value = redirect_response
    return response, redirect_response


class SuperAdminListTestCase(TestCase):
    def test_show_excludes_superadmin_rows(self):
        users = [
            _make_user(1, "root", "root@example.com", "superadmin"),
            _make_user(2, "ann", "ann@example.com", "admin"),
            _make_user(3, "ed", "ed@example.com", "editor"),
        ]
        with patch("app.controllers.auth.SuperAdminController.User") as MockUser, patch(
            "app.controllers.auth.SuperAdminController.DashboardContext"
        ) as MockContext:
            MockUser.all.return_value = users
            MockContext.super_admin_stats.return_value = {}
            context = SuperAdminController().show(_mock_view(), _mock_request())

        self.assertEqual({user.id for user in context["users"]}, {2, 3})

    def test_show_excludes_superadmin_case_insensitively(self):
        users = [
            _make_user(1, "root", "root@example.com", "SuperAdmin"),
            _make_user(2, "pad", "pad@example.com", "  SUPERADMIN  "),
        ]
        with patch("app.controllers.auth.SuperAdminController.User") as MockUser, patch(
            "app.controllers.auth.SuperAdminController.DashboardContext"
        ) as MockContext:
            MockUser.all.return_value = users
            MockContext.super_admin_stats.return_value = {}
            context = SuperAdminController().show(_mock_view(), _mock_request())

        self.assertEqual(context["users"], [])

    def test_show_reads_the_current_user_from_the_request(self):
        # request.super_admin() is not a Masonite method — using it 500s the
        # page. The logged-in account comes from request.user(), the same
        # accessor SuperAdminMiddleware authorises against.
        current = _make_user(9, "boss", "boss@example.com", "superadmin")
        with patch("app.controllers.auth.SuperAdminController.User") as MockUser, patch(
            "app.controllers.auth.SuperAdminController.DashboardContext"
        ) as MockContext:
            MockUser.all.return_value = []
            MockContext.super_admin_stats.return_value = {}
            request = _mock_request(current_user=current)
            context = SuperAdminController().show(_mock_view(), request)

        request.user.assert_called()
        self.assertEqual(context["current_admin"], current)


class SuperAdminDestroyTestCase(TestCase):
    def test_destroy_refuses_to_delete_a_superadmin(self):
        target = _make_user(1, "root", "root@example.com", "superadmin")
        response, redirect_response = _mock_response()
        with patch("app.controllers.auth.SuperAdminController.User") as MockUser:
            MockUser.find.return_value = target
            result = SuperAdminController().destroy(_mock_request(param_id=1), response)

        target.delete.assert_not_called()
        redirect_response.with_errors.assert_called_once()
        self.assertEqual(result, "redirected-with-errors")

    def test_destroy_allows_deleting_an_admin(self):
        target = _make_user(2, "ann", "ann@example.com", "admin")
        response, _ = _mock_response()
        with patch("app.controllers.auth.SuperAdminController.User") as MockUser:
            MockUser.find.return_value = target
            SuperAdminController().destroy(_mock_request(param_id=2), response)

        target.delete.assert_called_once()

    def test_destroy_allows_deleting_an_editor(self):
        target = _make_user(3, "ed", "ed@example.com", "editor")
        response, _ = _mock_response()
        with patch("app.controllers.auth.SuperAdminController.User") as MockUser:
            MockUser.find.return_value = target
            SuperAdminController().destroy(_mock_request(param_id=3), response)

        target.delete.assert_called_once()

    def test_destroy_is_a_no_op_for_a_missing_user(self):
        response, _ = _mock_response()
        with patch("app.controllers.auth.SuperAdminController.User") as MockUser:
            MockUser.find.return_value = None
            SuperAdminController().destroy(_mock_request(param_id=404), response)

        response.redirect.assert_called_once()
