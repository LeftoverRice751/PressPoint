"""IssueLibrary.duplicate(): a published newsletter becomes a new draft issue
with the same layout, owned and authored by the caller."""

from contextlib import contextmanager
from unittest.mock import Mock, patch

from tests import TestCase

from app.services import IssueLibrary as L


def _story(id, status="published", **over):
    base = dict(
        id=id, status=status, issue_id=1, title=f"T{id}", description="<p>b</p>",
        dek="d", excerpt="e", source="PIO", location="Gym", category_id=4,
        layout_type="brief", priority=id, headline_font=None, image_caption="c",
        image_credit="cr", image=None, author_id=99, rejection_reason="old",
    )
    base.update(over)
    return Mock(**base)


@contextmanager
def _no_tx():
    yield


class DuplicateTestCase(TestCase):
    def setUp(self):
        super().setUp()
        self.source = Mock(id=1, title="Week 1", owner_id=7)
        self.created_issue = Mock(id=50, number=12)
        self.stories = [_story(10, layout_type="lead"), _story(11)]
        self.current = None
        self.current_stories = []
        self.created_news = []

        def stories_of(issue):
            return self.current_stories if issue is self.current else self.stories

        patches = [
            patch.object(L.Issues, "owned_issue", side_effect=lambda u, i: self.source if (u, i) == (7, 1) else None),
            patch.object(L.Issues, "stories_of", side_effect=stories_of),
            patch.object(L.Issues, "current_for", side_effect=lambda u: self.current),
            patch.object(L.Issues, "next_number", return_value=12),
            patch.object(L.Issue, "create", return_value=self.created_issue),
            patch.object(L.News, "create", side_effect=lambda data: self.created_news.append(data) or Mock()),
            patch.object(L.NewsCategories, "names_by_id", return_value={4: "Campus"}),
            patch.object(L.NewsCategories, "default_category_id", return_value=1),
            patch.object(L.DB, "transaction", _no_tx),
        ]
        self.mocks = [p.start() for p in patches]
        self._patches = patches

    def tearDown(self):
        for p in self._patches:
            p.stop()
        super().tearDown()

    def test_not_mine_is_not_found(self):
        with self.assertRaises(L.NotFound):
            L.duplicate(8, 1)

    def test_unpublished_source_is_refused(self):
        self.stories = [_story(10, status="draft")]
        with self.assertRaises(L.NotPublished):
            L.duplicate(7, 1)

    def test_creates_issue_without_published_at(self):
        result = L.duplicate(7, 1)
        L.Issue.create.assert_called_once_with({"number": 12, "owner_id": 7, "title": "Week 1"})
        self.assertEqual(result, {"issue_id": 50, "number": 12, "story_count": 2})

    def test_copies_fields_and_resets_the_rest(self):
        L.duplicate(7, 1)
        first = self.created_news[0]
        for field in L.COPIED_FIELDS:
            self.assertEqual(first[field], getattr(self.stories[0], field), field)
        self.assertEqual(first["status"], "draft")
        self.assertEqual(first["author_id"], 7)
        self.assertEqual(first["updated_by_id"], 7)
        self.assertEqual(first["issue_id"], 50)
        for absent in ("published_at", "rejection_reason", "display_date", "expiration_date", "content"):
            self.assertNotIn(absent, first)

    def test_only_visible_stories_are_copied(self):
        self.stories.append(_story(12, status="draft"))
        L.duplicate(7, 1)
        self.assertEqual([d["title"] for d in self.created_news], ["T10", "T11"])

    def test_draft_with_stories_blocks(self):
        self.current = Mock(id=40)
        self.current_stories = [Mock(), Mock(), Mock()]
        with self.assertRaises(L.DraftInProgress) as caught:
            L.duplicate(7, 1)
        self.assertEqual(caught.exception.story_count, 3)
        L.Issue.create.assert_not_called()

    def test_second_duplicate_is_blocked_by_the_first(self):
        L.duplicate(7, 1)
        self.current = self.created_issue
        self.current_stories = [Mock(), Mock()]
        with self.assertRaises(L.DraftInProgress):
            L.duplicate(7, 1)

    def test_discard_soft_deletes_the_draft_then_duplicates(self):
        self.current = Mock(id=40)
        old = [Mock(), Mock()]
        self.current_stories = old
        L.duplicate(7, 1, discard=True)
        for s in old:
            s.delete.assert_called_once_with()
        self.current.delete.assert_called_once_with()
        L.Issue.create.assert_called_once()

    def test_empty_draft_is_reused(self):
        self.current = Mock(id=40, number=9, title=None)
        result = L.duplicate(7, 1)
        L.Issue.create.assert_not_called()
        self.assertEqual(self.current.title, "Week 1")
        self.current.save.assert_called_once_with()
        self.assertEqual(result["issue_id"], 40)
        self.assertTrue(all(d["issue_id"] == 40 for d in self.created_news))

    def test_images_are_copied_to_new_paths(self):
        self.stories[0].image = "news/a.jpg"
        with patch.object(L, "copy_image_and_variants", return_value="news/new.jpg") as cp:
            L.duplicate(7, 1)
        cp.assert_called_once_with("news/a.jpg")
        self.assertEqual(self.created_news[0]["image"], "news/new.jpg")
        self.assertIsNone(self.created_news[1]["image"])

    def test_missing_image_copies_without_image(self):
        self.stories[0].image = "news/gone.jpg"
        with patch.object(L, "copy_image_and_variants", return_value=None):
            L.duplicate(7, 1)
        self.assertIsNone(self.created_news[0]["image"])

    def test_db_failure_removes_copied_images(self):
        self.stories[0].image = "news/a.jpg"
        L.News.create.side_effect = RuntimeError("db down")
        with patch.object(L, "copy_image_and_variants", return_value="news/new.jpg"), \
                patch.object(L, "delete_image_and_variants") as rm:
            with self.assertRaises(RuntimeError):
                L.duplicate(7, 1)
        rm.assert_called_once_with("news/new.jpg")

    def test_deleted_category_falls_back_to_default(self):
        self.stories[1].category_id = 99
        L.duplicate(7, 1)
        self.assertEqual(self.created_news[1]["category_id"], 1)

    def test_copy_failure_removes_earlier_copies(self):
        self.stories[0].image = "news/a.jpg"
        self.stories[1].image = "news/b.jpg"
        with patch.object(L, "copy_image_and_variants",
                          side_effect=["news/new1.jpg", OSError("disk full")]), \
                patch.object(L, "delete_image_and_variants") as rm:
            with self.assertRaises(OSError):
                L.duplicate(7, 1)
        rm.assert_called_once_with("news/new1.jpg")
        L.Issue.create.assert_not_called()
