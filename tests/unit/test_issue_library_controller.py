"""HTTP surface of the Story Library's Published tab."""

from unittest.mock import Mock, patch

from tests import TestCase

from app.controllers.gears import IssueLibraryController as C


def _request(user_id=7, issue_id="3", inputs=None, ajax=True):
    inputs = inputs or {}
    request = Mock()
    request.user.return_value = Mock(id=user_id) if user_id else None
    request.param.side_effect = lambda key, default="": issue_id if key == "id" else default
    request.input.side_effect = lambda key, default="": inputs.get(key, default)
    request.header.side_effect = lambda name: (
        "XMLHttpRequest" if (ajax and name == "X-Requested-With") else None
    )
    return request


class DuplicateEndpointTestCase(TestCase):
    def _call(self, side_effect=None, result=None, **kw):
        response = Mock()
        with patch.object(
            C.IssueLibrary, "duplicate", side_effect=side_effect, return_value=result
        ) as dup:
            C.IssueLibraryController().duplicate(_request(**kw), response)
        return response, dup

    def test_success(self):
        response, dup = self._call(result={"issue_id": 50, "number": 12, "story_count": 2})
        dup.assert_called_once_with(7, 3, discard=False)
        body = response.json.call_args.args[0]
        self.assertTrue(body["ok"])
        self.assertEqual(body["issue_id"], 50)

    def test_discard_flag(self):
        _, dup = self._call(
            result={"issue_id": 1, "number": 1, "story_count": 1}, inputs={"discard": "1"}
        )
        dup.assert_called_once_with(7, 3, discard=True)

    def test_not_found_is_404(self):
        response, _ = self._call(side_effect=C.IssueLibrary.NotFound())
        self.assertEqual(response.json.call_args.kwargs["status"], 404)

    def test_not_published_is_422(self):
        response, _ = self._call(side_effect=C.IssueLibrary.NotPublished())
        self.assertEqual(response.json.call_args.kwargs["status"], 422)

    def test_draft_in_progress_is_409_with_count(self):
        response, _ = self._call(side_effect=C.IssueLibrary.DraftInProgress(3))
        body = response.json.call_args.args[0]
        self.assertEqual(response.json.call_args.kwargs["status"], 409)
        self.assertTrue(body["needs_confirm"])
        self.assertEqual(body["draft_story_count"], 3)

    def test_unexpected_failure_is_500(self):
        response, _ = self._call(side_effect=RuntimeError("boom"))
        self.assertEqual(response.json.call_args.kwargs["status"], 500)

    def test_non_numeric_id_is_404(self):
        response, dup = self._call(issue_id="abc")
        dup.assert_not_called()
        self.assertEqual(response.json.call_args.kwargs["status"], 404)


class PrintEndpointTestCase(TestCase):
    def test_not_owned_is_404(self):
        response, view = Mock(), Mock()
        with patch.object(C.Issues, "owned_issue", return_value=None):
            C.IssueLibraryController().print_view(view, _request(), response)
        response.view.assert_called_once_with("Not found", status=404)
        view.render.assert_not_called()

    def test_unpublished_is_404(self):
        response, view = Mock(), Mock()
        with patch.object(C.Issues, "owned_issue", return_value=Mock()), patch.object(
            C.Issues, "stories_of", return_value=[Mock(status="draft")]
        ):
            C.IssueLibraryController().print_view(view, _request(), response)
        response.view.assert_called_once_with("Not found", status=404)

    def test_renders_with_autoprint(self):
        response, view = Mock(), Mock()
        issue = Mock()
        with patch.object(C.Issues, "owned_issue", return_value=issue), patch.object(
            C.Issues, "stories_of", return_value=[Mock(status="published")]
        ) as so, patch.object(C.IssueLibrary, "print_context", return_value={"k": 1}) as pc:
            C.IssueLibraryController().print_view(
                view, _request(inputs={"autoprint": "1"}), response
            )
        # The rows loaded for the published check are handed on, not re-queried.
        pc.assert_called_once_with(issue, autoprint=True, stories=so.return_value)
        so.assert_called_once_with(issue)
        view.render.assert_called_once_with("gears/issue-print", {"k": 1})
