"""The super admin page must only reference route names that are registered.

This guards a failure that took down sign-in for the superadmin role: the
template gained `route('auth.super_admin.credentials', ...)` in the same change
that added the route, and Masonite turns an unknown route name into a
RouteNotFoundException, which the error handler renders as a 404. Because
/auth/super_admin is the *only* page that role lands on, a single bad name
there means that account cannot sign in at all -- there is no other page to
fall back to.

Rendering the real template through the real router is what catches it.
Route-name typos are invisible to Jinja until the line actually executes, and
this page's rows only render when `users` is non-empty, so a smoke test that
loads the page with an empty table would sail straight past the bug.
"""

from tests import TestCase


class _Row(dict):
    """Stands in for a User row; the template only reads attributes."""

    __getattr__ = dict.get


class _EmptyBag:
    """The flash-message bag, which is normally request-scoped."""

    def any(self):
        return False

    def messages(self):
        return []


def _context():
    # Both roles are present on purpose: the credential controls are wrapped
    # in `{% if user.role == 'admin' %}`, so an editor-only fixture would
    # never execute the route() calls this test exists to check.
    users = [
        _Row(id=2, username="ann", email="ann@example.com", role="admin"),
        _Row(id=3, username="ed", email="ed@example.com", role="editor"),
    ]
    context = {
        "users": users,
        # The shell's profile menu reads current_user, so the page will not
        # render without it -- this is the same key /users and /gears pass.
        "current_user": _Row(
            id=1, username="root", email="root@example.com", role="superadmin"
        ),
        "bag": _EmptyBag,
        "csrf_field": "",
    }
    # super_admin_stats() supplies these on the real page.
    for key in (
        "admin_count",
        "editor_count",
        "published_news",
        "total_news",
        "total_events",
        "total_archives",
        "total_newsletters",
        "location_count",
    ):
        context[key] = 0
    return context


class SuperAdminTemplateRoutesTestCase(TestCase):
    def _render(self):
        from wsgi import application

        return application.make("view").render(
            "auth.super_admin", _context()
        ).rendered_template

    def test_the_page_renders_without_an_unknown_route_name(self):
        # A RouteNotFoundException raised here is the 404 the super admin saw.
        self.assertIn("Super Admin Dashboard", self._render())

    def test_credential_actions_point_at_the_admin_row(self):
        html = self._render()
        body = html.split("<tbody>")[1].split("</tbody>")[0]

        # id=2 is the admin, id=3 the editor. Editors are managed from /users.
        self.assertIn("/auth/super_admin/2/credentials", body)
        self.assertIn("/auth/super_admin/2/reset-password", body)
        self.assertNotIn("/auth/super_admin/3/credentials", body)
        self.assertNotIn("/auth/super_admin/3/reset-password", body)

    def test_destructive_actions_carry_a_confirmation(self):
        html = self._render()

        # confirm-modal.js keys off data-confirm; without the asset links the
        # attribute is inert, so both halves are checked together.
        self.assertIn("data-confirm-danger", html)
        self.assertIn("css/confirm-modal.css", html)
        self.assertIn("js/confirm-modal.js", html)
