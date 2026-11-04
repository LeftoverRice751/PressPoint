"""An editor changes their own stories; an admin approves only what they read.

The per-editor issue work scoped what the composer SHOWS and left the write paths
as they were, so every route still took any story id from any editor.

Separately, approval re-read the rows and published them, with nothing tying the
decision to the preview. Text changed after the admin read it went out unread.
"""

import json
from unittest import TestCase
from unittest.mock import Mock, patch

from app.controllers.gears.NewsController import NewsController
from app.controllers.gears.ReviewController import ReviewController
from app.services.ReviewQueue import content_stamp

NEWS = "app.controllers.gears.NewsController"
REVIEW = "app.controllers.gears.ReviewController"

AUTHOR = 5
OWNER = 6
STRANGER = 7
ADMIN = 8


def _request(user_id, role="editor", inputs=None, params=None, all_payload=None):
    inputs = inputs or {}
    params = params or {}
    request = Mock()
    request.input.side_effect = lambda key, default="": inputs.get(key, default)
    request.param.side_effect = lambda key, default="": params.get(key, default)
    request.header.side_effect = lambda name: (
        "XMLHttpRequest" if name == "X-Requested-With" else None
    )
    request.user.return_value = Mock(id=user_id, role=role)
    request.all.return_value = all_payload or {}
    return request


def _response():
    response = Mock()
    response.json.side_effect = lambda body, status=200: (body, status)
    return response


def _story(status="draft", author_id=AUTHOR, issue_id=30, **fields):
    record = Mock(
        id=11,
        status=status,
        author_id=author_id,
        issue_id=issue_id,
        title="Campus story",
        description="<p>Body</p>",
        image="news/a.jpg",
        layout_type="brief",
        priority=1,
        category_id=2,
        source=None,
        location=None,
        dek=None,
        excerpt=None,
        headline_font=None,
        image_caption=None,
        image_credit=None,
    )
    for name, value in fields.items():
        setattr(record, name, value)
    return record


def _where(record):
    query = Mock()
    query.first.return_value = record
    return Mock(return_value=query)


def _owned_issue(user_id, issue_id):
    return Mock(id=issue_id) if user_id == OWNER and issue_id == 30 else None


class _WritePathCase(TestCase):
    def run_route(self, method, record, request):
        response = _response()
        with patch(f"{NEWS}.News.where", _where(record)), patch(f"{NEWS}.Cache"), patch(
            f"{NEWS}.KioskBroadcast"
        ), patch(f"{NEWS}.Issues.owned_issue", side_effect=_owned_issue):
            getattr(NewsController(), method)(request, response)
        return response


class StoryOwnershipTestCase(_WritePathCase):
    ROUTES = (
        ("body", {"description": "<p>Replaced</p>"}),
        ("autosave", {"title": "Replaced", "description": "<p>Replaced</p>"}),
        ("unassign", {}),
        ("destroy", {}),
    )

    def _attempt(self, method, inputs, user_id, role="editor"):
        record = _story()
        request = _request(user_id, role, inputs, {"id": 11})
        self.run_route(method, record, request)
        return record

    def test_another_editor_cannot_use_any_write_route(self):
        for method, inputs in self.ROUTES:
            record = self._attempt(method, inputs, STRANGER)
            record.save.assert_not_called()
            record.delete.assert_not_called()

    def test_the_author_can_use_every_write_route(self):
        for method, inputs in self.ROUTES:
            record = self._attempt(method, inputs, AUTHOR)
            self.assertTrue(record.save.called or record.delete.called, method)

    def test_the_issue_owner_can_use_every_write_route(self):
        for method, inputs in self.ROUTES:
            record = self._attempt(method, inputs, OWNER)
            self.assertTrue(record.save.called or record.delete.called, method)

    def test_an_admin_can_use_every_write_route(self):
        for method, inputs in self.ROUTES:
            record = self._attempt(method, inputs, ADMIN, role="admin")
            self.assertTrue(record.save.called or record.delete.called, method)

    def test_a_story_with_no_author_or_issue_is_admin_only(self):
        record = _story(author_id=None, issue_id=None)
        self.run_route("unassign", record, _request(AUTHOR, params={"id": 11}))
        record.save.assert_not_called()

    def test_refusal_looks_the_same_as_a_missing_story(self):
        """A guessed id must not confirm that another editor's story exists."""
        refused = self.run_route("unassign", _story(), _request(STRANGER, params={"id": 11}))
        missing = self.run_route("unassign", None, _request(STRANGER, params={"id": 11}))

        self.assertEqual(refused.json.call_args, missing.json.call_args)

    def _store(self, user_id, record):
        request = _request(
            user_id,
            inputs={
                "article_id": "11",
                "title": "Replaced",
                "description": "<p>Replaced</p>",
                "category_id": "2",
                "layout_type": "brief",
                "status": "draft",
                "remove_image": "1",
            },
        )
        storage = Mock()
        response = _response()
        with patch(f"{NEWS}.News.where", _where(record)), patch(f"{NEWS}.Cache"), patch(
            f"{NEWS}.KioskBroadcast"
        ), patch(f"{NEWS}.Issues.owned_issue", side_effect=_owned_issue), patch(
            f"{NEWS}.NewsCategories.find_live", return_value=Mock()
        ), patch(
            f"{NEWS}.NewNews"
        ), patch(
            f"{NEWS}._delete_image_files"
        ) as delete_files:
            NewsController().store(request, storage, response)
        return delete_files

    def test_another_editor_cannot_overwrite_a_story_through_store(self):
        record = _story()
        delete_files = self._store(STRANGER, record)

        record.save.assert_not_called()
        delete_files.assert_not_called()
        self.assertEqual(record.title, "Campus story")

    def test_the_author_can_overwrite_a_story_through_store(self):
        record = _story()
        self._store(AUTHOR, record)

        record.save.assert_called_once()
        self.assertEqual(record.title, "Replaced")

    def _layout(self, user_id, record):
        request = _request(
            user_id,
            all_payload={"items": [{"id": 11, "layout_type": "lead", "priority": 1}]},
        )
        with patch(f"{NEWS}.DB"):
            self.run_route("layout", record, request)

    def test_another_editor_cannot_move_a_story(self):
        record = _story()
        self._layout(STRANGER, record)

        record.save.assert_not_called()
        self.assertEqual(record.layout_type, "brief")

    def test_the_author_can_move_a_story(self):
        record = _story()
        with patch(f"{NEWS}.News.where") as where:
            query = where.return_value
            query.first.return_value = record
            query.where.return_value.count.return_value = 0
            query.count.return_value = 0
            request = _request(
                AUTHOR,
                all_payload={"items": [{"id": 11, "layout_type": "lead", "priority": 1}]},
            )
            with patch(f"{NEWS}.DB"), patch(f"{NEWS}.Cache"), patch(
                f"{NEWS}.KioskBroadcast"
            ), patch(f"{NEWS}.Issues.stamp_for", return_value="1:x"):
                NewsController().layout(request, _response())

        self.assertEqual(record.layout_type, "lead")


class SilentEditsDuringReviewTestCase(_WritePathCase):
    def test_autosave_cannot_change_a_story_awaiting_review(self):
        record = _story(status="review")
        request = _request(
            AUTHOR, inputs={"title": "Swapped", "description": "<p>x</p>"}, params={"id": 11}
        )

        self.run_route("autosave", record, request)

        record.save.assert_not_called()
        self.assertEqual(record.title, "Campus story")

    def test_body_save_cannot_change_a_story_awaiting_review(self):
        record = _story(status="review")
        request = _request(AUTHOR, inputs={"description": "<p>Swapped</p>"}, params={"id": 11})

        self.run_route("body", record, request)

        record.save.assert_not_called()
        self.assertEqual(record.description, "<p>Body</p>")


class ContentStampTestCase(TestCase):
    def test_the_stamp_changes_with_anything_the_kiosk_would_show(self):
        base = content_stamp([_story()])
        for field, value in (
            ("title", "New"),
            ("description", "<p>New</p>"),
            ("image", "news/b.jpg"),
            ("layout_type", "lead"),
            ("priority", 2),
            ("dek", "New"),
            ("excerpt", "New"),
            ("source", "New"),
            ("location", "New"),
            ("image_caption", "New"),
            ("image_credit", "New"),
            ("headline_font", "New"),
            ("category_id", 3),
        ):
            self.assertNotEqual(content_stamp([_story(**{field: value})]), base, field)

    def test_the_stamp_ignores_row_order(self):
        first, second = _story(id=1), _story(id=2)
        self.assertEqual(content_stamp([first, second]), content_stamp([second, first]))

    def test_the_stamp_covers_every_story(self):
        self.assertNotEqual(
            content_stamp([_story(id=1)]), content_stamp([_story(id=1), _story(id=2)])
        )


class ApprovalMatchesThePreviewTestCase(TestCase):
    def _approve_issue(self, stories, stamp):
        inputs = {} if stamp is None else {"review_stamp": stamp}
        request = _request(ADMIN, "admin", inputs, {"id": 30})
        response = _response()
        with patch(f"{REVIEW}.review_stories_of", return_value=stories), patch(
            f"{REVIEW}.Cache"
        ), patch(f"{REVIEW}.KioskBroadcast"), patch(f"{REVIEW}.Notifications"), patch(
            f"{REVIEW}.DB"
        ), patch(
            "app.models.Issue.Issue.where"
        ):
            ReviewController().approve_issue(request, response)
        return response

    def test_approving_what_was_previewed_publishes_it(self):
        story = _story(status="review")

        self._approve_issue([story], content_stamp([story]))

        self.assertEqual(story.status, "published")

    def test_text_changed_after_the_preview_is_not_published(self):
        story = _story(status="review")
        previewed = content_stamp([story])
        story.description = "<p>Changed after the admin read it</p>"

        self._approve_issue([story], previewed)

        self.assertEqual(story.status, "review")
        story.save.assert_not_called()

    def test_a_story_added_after_the_preview_is_not_published(self):
        story = _story(status="review")
        previewed = content_stamp([story])
        late = _story(id=12, status="review")

        self._approve_issue([story, late], previewed)

        self.assertEqual(story.status, "review")
        self.assertEqual(late.status, "review")

    def test_approving_without_a_preview_is_refused(self):
        story = _story(status="review")

        self._approve_issue([story], None)

        self.assertEqual(story.status, "review")

    def test_rejecting_needs_no_preview(self):
        story = _story(status="review")
        request = _request(ADMIN, "admin", {"reason": "Fix the headline"}, {"id": 30})
        with patch(f"{REVIEW}.review_stories_of", return_value=[story]), patch(
            f"{REVIEW}.Cache"
        ), patch(f"{REVIEW}.KioskBroadcast"), patch(f"{REVIEW}.Notifications"), patch(
            f"{REVIEW}.DB"
        ):
            ReviewController().reject_issue(request, _response())

        self.assertEqual(story.status, "draft")

    def test_the_preview_hands_the_admin_the_stamp_of_what_it_rendered(self):
        story = _story(status="review")
        request = _request(ADMIN, "admin", params={"id": 30})
        response = _response()
        view = Mock()
        view.render.return_value.rendered_template = "<div></div>"
        with patch(f"{REVIEW}.review_stories_of", return_value=[story]), patch(
            f"{REVIEW}.issue_preview_context", return_value={}
        ):
            ReviewController().preview_issue(request, response, view)

        body = response.json.call_args.args[0]
        body = json.loads(body) if isinstance(body, str) else body
        self.assertEqual(body["review_stamp"], content_stamp([story]))

    def test_single_story_approval_is_bound_too(self):
        story = _story(status="review")
        previewed = content_stamp([story])
        story.title = "Changed"
        request = _request(ADMIN, "admin", {"review_stamp": previewed}, {"id": 11})
        with patch(f"{REVIEW}.News.where", _where(story)), patch(f"{REVIEW}.Cache"), patch(
            f"{REVIEW}.KioskBroadcast"
        ), patch(f"{REVIEW}.Notifications"):
            ReviewController().approve(request, _response())

        self.assertEqual(story.status, "review")
