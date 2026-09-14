"""Editing a published story's body must not skip the editorial gate.

`_resolve_status_for_actor()` is the control that stops an editor publishing to
the campus terminal: any publish-intent status from a non-admin becomes
`review`. `store()` applies it. `body()` did not.

`body()` writes `description` -- the same column `store()` writes and the same
one the kiosk renders (`templates/kiosk/_issue.html`) -- looks the row up
by id with no ownership check, invalidates the kiosk cache, and never touches
`status`. So an editor could get an innocuous story approved, then POST
`/news/dashboard/<id>/body` and swap the text of a live story for anything they
liked, on any story in the table, with no admin seeing it. The route carries
only `auth`.

bleach keeps this to formatting-only HTML, so the impact is unreviewed content
on a public screen rather than stored XSS -- but the review workflow is exactly
the control it defeats.
"""

from unittest import TestCase
from unittest.mock import Mock, patch

from app.controllers.gears.NewsController import NewsController


def _request(role, story_id="5", description="<p>replacement text</p>"):
    inputs = {"description": description}
    params = {"id": story_id}
    request = Mock()
    request.input.side_effect = lambda key, default="": inputs.get(key, default)
    request.param.side_effect = lambda key, default="": params.get(key, default)
    request.header.side_effect = (
        lambda name: "XMLHttpRequest" if name == "X-Requested-With" else None
    )
    request.user.return_value = Mock(id=7, role=role)
    return request


def _response():
    response = Mock()
    terminal = Mock()
    terminal.with_errors.return_value = "errors"
    terminal.with_success.return_value = "success"
    response.back.return_value = terminal
    response.redirect.return_value = terminal
    return response


class NewsBodyReviewGateTestCase(TestCase):
    def _edit(self, role, current_status):
        record = Mock(id=5, status=current_status, description="<p>original</p>")
        with patch(
            "app.controllers.gears.NewsController.News"
        ) as news_mock, patch("app.controllers.gears.NewsController.Cache"):
            news_mock.where.return_value.first.return_value = record
            NewsController().body(_request(role), _response())
        return record

    def test_editor_editing_a_published_story_pulls_it_back_to_review(self):
        """The bypass. Without this the rewritten body goes straight to the
        kiosk on the next cache miss."""
        record = self._edit("editor", "published")

        self.assertEqual(
            record.status,
            "review",
            "an editor rewrote a live story without re-entering review",
        )

    def test_editor_editing_an_approved_story_pulls_it_back_to_review(self):
        record = self._edit("editor", "approved")
        self.assertEqual(record.status, "review")

    def test_editor_editing_a_scheduled_story_pulls_it_back_to_review(self):
        record = self._edit("editor", "scheduled")
        self.assertEqual(record.status, "review")

    def test_admin_editing_a_published_story_keeps_it_published(self):
        """Admins are the approvers; the gate does not apply to them, and
        demoting their edit would take the front page down on a typo fix."""
        record = self._edit("admin", "published")
        self.assertEqual(record.status, "published")

    def test_editor_editing_a_draft_leaves_it_a_draft(self):
        """Draft stays draft -- submitting is a deliberate act, and silently
        promoting a save into the admin's queue is the behaviour `store()`
        already avoids."""
        record = self._edit("editor", "draft")
        self.assertEqual(record.status, "draft")

    def test_editor_editing_a_story_already_in_review_leaves_it_in_review(self):
        record = self._edit("editor", "review")
        self.assertEqual(record.status, "review")

    def test_body_is_still_saved(self):
        """The gate must not break the actual feature."""
        record = self._edit("editor", "published")
        self.assertIn("replacement text", record.description)
        record.save.assert_called()
