"""app/services/Issues.py -- the unit an editor composes and an admin decides on.

Status is derived from the stories, never stored, so most of what this module
does is answer "which issue" and "what state is it in" from rows it is handed.
These tests hand it rows directly; the two functions that must hit the
database (current_for's create, next_number) are exercised against the real
one, which the suite already requires.
"""

from unittest.mock import Mock, patch

from tests import TestCase

from app.services import Issues


def _story(status, issue_id=1, **over):
    s = Mock(status=status, issue_id=issue_id)
    for k, v in over.items():
        setattr(s, k, v)
    return s


class DerivedStatusTestCase(TestCase):
    def test_no_stories_is_a_draft(self):
        self.assertEqual(Issues.status_from_stories([]), "draft")

    def test_any_public_story_makes_the_issue_published(self):
        self.assertEqual(
            Issues.status_from_stories([_story("draft"), _story("published")]), "published")

    def test_any_review_story_without_a_public_one_is_in_review(self):
        self.assertEqual(
            Issues.status_from_stories([_story("draft"), _story("review")]), "review")

    def test_published_outranks_review(self):
        """An issue with one story live and another being revised is on the
        kiosk -- that is what matters to the reader."""
        self.assertEqual(
            Issues.status_from_stories([_story("review"), _story("approved")]), "published")

    def test_aliases_are_normalised(self):
        self.assertEqual(Issues.status_from_stories([_story("pending")]), "review")
        self.assertEqual(Issues.status_from_stories([_story("live")]), "published")


class CurrentIssueTestCase(TestCase):
    def test_no_user_gets_no_issue(self):
        """An unowned issue would be shared by every anonymous caller -- the
        exact situation this feature exists to end."""
        self.assertIsNone(Issues.current_for(None))
        self.assertIsNone(Issues.current_for(0))

    def test_the_newest_unpublished_owned_issue_is_current(self):
        older = Mock(id=3, owner_id=9)
        newer = Mock(id=7, owner_id=9)
        with patch.object(Issues.Issue, "where") as where, patch.object(
            Issues, "status_of", side_effect=lambda i: "draft"
        ):
            where.return_value.order_by.return_value.get.return_value = [newer, older]
            self.assertIs(Issues.current_for(9), newer)

    def test_a_published_issue_is_skipped_and_the_next_one_returned(self):
        published = Mock(id=7, owner_id=9)
        draft = Mock(id=3, owner_id=9)
        with patch.object(Issues.Issue, "where") as where, patch.object(
            Issues, "status_of", side_effect=lambda i: "published" if i is published else "draft"
        ):
            where.return_value.order_by.return_value.get.return_value = [published, draft]
            self.assertIs(Issues.current_for(9), draft)

    def test_reading_never_creates(self):
        """A page render must not write rows: with every owned issue
        published, the read side answers None and leaves creation to the
        first save."""
        published = Mock(id=7, owner_id=9)
        with patch.object(Issues.Issue, "where") as where, patch.object(
            Issues, "status_of", return_value="published"
        ), patch.object(Issues.Issue, "create") as create:
            where.return_value.order_by.return_value.get.return_value = [published]
            self.assertIsNone(Issues.current_for(9))
        create.assert_not_called()

    def test_the_first_save_creates_the_next_issue(self):
        """The save after your last issue publishes lands in a fresh
        newsletter -- 'start the next issue' is not a button."""
        published = Mock(id=7, owner_id=9)
        with patch.object(Issues.Issue, "where") as where, patch.object(
            Issues, "status_of", return_value="published"
        ), patch.object(Issues.Issue, "create") as create, patch.object(
            Issues, "next_number", return_value=8
        ):
            where.return_value.order_by.return_value.get.return_value = [published]
            Issues.ensure_current_for(9)
        create.assert_called_once()
        self.assertEqual(create.call_args[0][0]["owner_id"], 9)
        self.assertEqual(create.call_args[0][0]["number"], 8)

    def test_a_save_reuses_the_open_issue(self):
        draft = Mock(id=3, owner_id=9)
        with patch.object(Issues.Issue, "where") as where, patch.object(
            Issues, "status_of", return_value="draft"
        ), patch.object(Issues.Issue, "create") as create:
            where.return_value.order_by.return_value.get.return_value = [draft]
            self.assertIs(Issues.ensure_current_for(9), draft)
        create.assert_not_called()


class IssueListsTestCase(TestCase):
    def _issues_with(self, mapping):
        """mapping: issue -> its stories. Patches the two DB reads."""
        issues = list(mapping.keys())
        with patch.object(Issues.Issue, "order_by") as order_by, patch.object(
            Issues, "stories_of", side_effect=lambda i: mapping[i]
        ):
            order_by.return_value.get.return_value = issues
            yield

    def test_published_issues_are_those_with_a_public_story(self):
        a = Mock(id=1, published_at=None)
        b = Mock(id=2, published_at=None)
        mapping = {a: [_story("draft")], b: [_story("published"), _story("draft")]}
        for _ in self._issues_with(mapping):
            found = Issues.published_issues()
        self.assertEqual([i.id for i in found], [2])
        # Only the public stories ride along for rendering.
        self.assertEqual([s.status for s in found[0].stories], ["published"])

    def test_pending_issues_are_those_with_a_review_story_oldest_first(self):
        a = Mock(id=5)
        b = Mock(id=2)
        mapping = {a: [_story("review")], b: [_story("review"), _story("draft")]}
        for _ in self._issues_with(mapping):
            found = Issues.pending_issues()
        self.assertEqual([i.id for i in found], [2, 5])
