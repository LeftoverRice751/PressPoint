"""Issues' Story Library queries: which newsletters belong to an editor's
library, and the stamp that tells the drawer one of them changed.

published_by() is the whole ownership rule for the Published tab -- an issue
another editor owns must never appear, however public it is."""

from datetime import datetime, timezone
from unittest.mock import Mock, patch

from tests import TestCase

from app.services import Issues


def _issue(id, owner_id=7, published_at=None):
    return Mock(id=id, owner_id=owner_id, published_at=published_at)


def _story(id, issue_id, status):
    return Mock(id=id, issue_id=issue_id, status=status)


class PublishedByTestCase(TestCase):
    def _run(self, issues, stories, user_id=7):
        issue_q = Mock()
        issue_q.get.return_value = issues
        news_q = Mock()
        news_q.order_by.return_value.get.return_value = stories
        with patch.object(Issues.Issue, "where", return_value=issue_q) as iw, \
                patch.object(Issues.News, "where_in", return_value=news_q) as nw:
            result = Issues.published_by(user_id)
        return result, iw, nw

    def test_no_user_is_empty(self):
        self.assertEqual(Issues.published_by(None), [])

    def test_queries_only_the_callers_issues(self):
        _, iw, _ = self._run([], [])
        iw.assert_called_once_with("owner_id", 7)

    def test_only_issues_with_a_visible_story_are_listed(self):
        a, b = _issue(1), _issue(2)
        result, _, nw = self._run(
            [a, b],
            [_story(10, 1, "published"), _story(11, 2, "draft"), _story(12, 2, "review")],
        )
        self.assertEqual([i.id for i in result], [1])
        nw.assert_called_once_with("issue_id", [1, 2])

    def test_stories_are_the_visible_ones_only(self):
        a = _issue(1)
        result, _, _ = self._run(
            [a], [_story(10, 1, "published"), _story(11, 1, "draft"), _story(12, 1, "live")])
        self.assertEqual([s.id for s in result[0].stories], [10, 12])

    def test_newest_publication_first_then_newest_id(self):
        old = _issue(1, published_at=datetime(2026, 9, 1, 9, tzinfo=timezone.utc))
        new = _issue(2, published_at=datetime(2026, 10, 1, 9, tzinfo=timezone.utc))
        undated = _issue(3, published_at=None)
        result, _, _ = self._run(
            [old, new, undated],
            [_story(10, 1, "published"), _story(11, 2, "published"), _story(12, 3, "approved")],
        )
        self.assertEqual([i.id for i in result], [2, 1, 3])


class OwnedIssueTestCase(TestCase):
    def test_filters_on_id_and_owner(self):
        q = Mock()
        q.where.return_value.first.return_value = "row"
        with patch.object(Issues.Issue, "where", return_value=q) as w:
            self.assertEqual(Issues.owned_issue(7, 3), "row")
        w.assert_called_once_with("id", 3)
        q.where.assert_called_once_with("owner_id", 7)

    def test_missing_user_or_id_is_none(self):
        self.assertIsNone(Issues.owned_issue(None, 3))
        self.assertIsNone(Issues.owned_issue(7, None))


class LibraryStampTestCase(TestCase):
    def test_no_owned_issues_is_zero(self):
        q = Mock()
        q.get.return_value = []
        with patch.object(Issues.Issue, "where", return_value=q):
            self.assertEqual(Issues.library_stamp(7), "0:")

    def test_stamps_the_owned_issues_stories(self):
        q = Mock()
        q.get.return_value = [_issue(1), _issue(2)]
        row = Mock(n=3, m="2026-10-07 09:00:00")
        news_q = Mock()
        news_q.select_raw.return_value.first.return_value = row
        with patch.object(Issues.Issue, "where", return_value=q), \
                patch.object(Issues.News, "where_in", return_value=news_q) as nw:
            self.assertEqual(Issues.library_stamp(7), "3:2026-10-07 09:00:00")
        nw.assert_called_once_with("issue_id", [1, 2])
