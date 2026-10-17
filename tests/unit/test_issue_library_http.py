"""Story Library endpoints driven through the real request pipeline.

test_issue_library_controller.py calls the controller methods directly with a
Mock request, so it cannot catch a wiring fault: a route that never resolves,
a missing `auth` middleware, CSRF rejecting the drawer's POST, or the print
template failing to render inside the full stack. These tests go through
Masonite's fetch() -- router, `web` + `auth` middleware, controller, Jinja --
and stub only the database reads, because `.env` is the production MySQL.
"""

import importlib
from datetime import datetime, timezone
from unittest.mock import Mock, patch

from tests import TestCase

from app.controllers.gears import IssueLibraryController as C
from app.services import IssueLibrary as L

# The module, not the class: app/middlewares/__init__.py re-exports the class
# under the module's own name, so `from app.middlewares import ...` would hand
# back the class and the `User` patch below would miss.
LoadUser = importlib.import_module("app.middlewares.LoadSlotUserMiddleware")

PRINT_URL = "/gears/issues/3/print"
DUPLICATE_URL = "/gears/issues/3/duplicate"


def _story():
    return Mock(id=1, status="published", layout_type="lead", priority=1, image=None,
                published_at=None, created_at=None, category_id=None,
                title="Campus Fair Opens", description="<p>Full body here.</p>",
                excerpt="", dek="", source="", location="", image_caption="",
                image_credit="", headline_font=None)


class _Pipeline(TestCase):
    def setUp(self):
        super().setUp()
        self.user = Mock(id=7, role="editor")
        self.user.get_primary_key_value.return_value = 7

    def _signed_in(self):
        """Resolve the slot-0 token cookie to self.user without the users
        table: LoadSlotUserMiddleware does `User.where(...).first()`."""
        users = Mock()
        users.where.return_value.first.return_value = self.user
        patcher = patch.object(LoadUser, "User", users)
        patcher.start()
        self.addCleanup(patcher.stop)
        return self.withCookies({"token": "test-token"})


class GuestTestCase(_Pipeline):
    def test_print_redirects_a_guest_to_login(self):
        with patch.object(C.Issues, "owned_issue") as owned:
            self.get(PRINT_URL).assertRedirect(name="auth.login")
        owned.assert_not_called()

    def test_duplicate_redirects_a_guest_without_copying_anything(self):
        with patch.object(C.IssueLibrary, "duplicate") as dup:
            self.post(DUPLICATE_URL).assertRedirect(name="auth.login")
        dup.assert_not_called()

    def test_non_numeric_id_matches_no_route(self):
        # @id:int, not @id: a literal-looking segment must never reach the
        # controller (Route.routes order is not stable across boots).
        self.assertIsNone(self.application.make("router").find("/gears/issues/abc/print", "GET"))


class SignedInPrintTestCase(_Pipeline):
    def _print(self, data=None, issue=None, stories=None):
        issue = issue if issue is not None else Mock(
            id=3, owner_id=7, number=12, title="Week 41",
            published_at=datetime(2026, 7, 1, 1, 0, tzinfo=timezone.utc),
            created_at=datetime(2026, 6, 30, tzinfo=timezone.utc))
        with patch.object(C.Issues, "owned_issue", return_value=issue) as owned, \
                patch.object(C.Issues, "stories_of",
                             return_value=stories if stories is not None else [_story()]), \
                patch.object(L.NewsCategories, "names_by_id", return_value={}), \
                patch.object(L, "upcoming_events", return_value=[]):
            response = self._signed_in().get(PRINT_URL, data)
        return response, owned

    def test_renders_the_issue_through_the_kiosk_template(self):
        response, owned = self._print()
        response.assertOk()
        owned.assert_called_once_with(7, 3)
        response.assertContains("Campus Fair Opens")
        response.assertContains("Full body here.")
        response.assertContains("css/issue-print.css")
        response.assertContains('data-autoprint="0"')

    def test_autoprint_query_reaches_the_page(self):
        # fetch() takes no query string (it would land in the path and 404),
        # so autoprint rides as input data; request.input() reads both alike.
        response, _ = self._print(data={"autoprint": "1"})
        response.assertOk()
        response.assertContains('data-autoprint="1"')

    def test_print_page_is_never_cached(self):
        # An editor's unreleased reprint must not sit in a shared cache.
        response, _ = self._print()
        response.assertHasHeader("Cache-Control", "no-store, private")

    def test_someone_elses_issue_is_404(self):
        with patch.object(C.Issues, "owned_issue", return_value=None):
            response = self._signed_in().get(PRINT_URL)
        response.assertNotFound()

    def test_unpublished_issue_is_404(self):
        draft = _story()
        draft.status = "draft"
        response, _ = self._print(stories=[draft])
        response.assertNotFound()


class SignedInDuplicateTestCase(_Pipeline):
    def _post(self, data=None, result=None, side_effect=None):
        with patch.object(C.IssueLibrary, "duplicate", return_value=result,
                          side_effect=side_effect) as dup:
            response = self._signed_in().withHeaders(
                {"X-Requested-With": "XMLHttpRequest"}).post(DUPLICATE_URL, data)
        return response, dup

    def test_ajax_duplicate_passes_csrf_and_returns_the_new_issue(self):
        response, dup = self._post(result={"issue_id": 50, "number": 13, "story_count": 4})
        response.assertOk()
        dup.assert_called_once_with(7, 3, discard=False)
        response.assertContains('"issue_id": 50')

    def test_discard_flag_survives_the_form_body(self):
        _, dup = self._post(data={"discard": "1"},
                            result={"issue_id": 51, "number": 14, "story_count": 1})
        dup.assert_called_once_with(7, 3, discard=True)

    def test_open_draft_is_409_needs_confirm(self):
        response, _ = self._post(side_effect=L.DraftInProgress(2))
        response.assertIsStatus(409)
        response.assertContains('"needs_confirm": true')
        response.assertContains('"draft_story_count": 2')
