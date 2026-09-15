"""app/services/Issues.py -- the unit an editor composes and an admin decides on.

Status is derived from the stories, never stored, so most of what this module
does is answer "which issue" and "what state is it in" from rows it is handed.
These tests hand it rows directly; the two functions that must hit the
database (current_for's create, next_number) are exercised against the real
one, which the suite already requires.
"""

from datetime import datetime, timezone
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

    def test_a_new_issue_is_created_without_a_publish_date(self):
        """`published_at` is in Issue.__dates__, and masonite-orm runs every
        dates column through get_new_date() on create -- where None means
        "now". Passing `published_at: None` therefore stamped every issue as
        published the moment it was created, so the approval's "set it if
        unset" never fired and the kiosk's expiry clock would have started at
        drafting time. The key must be absent, not None."""
        published = Mock(id=7, owner_id=9)
        with patch.object(Issues.Issue, "where") as where, patch.object(
            Issues, "status_of", return_value="published"
        ), patch.object(Issues.Issue, "create") as create, patch.object(
            Issues, "next_number", return_value=8
        ):
            where.return_value.order_by.return_value.get.return_value = [published]
            Issues.ensure_current_for(9)
        self.assertNotIn("published_at", create.call_args[0][0])

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


class CurrentIssuesTestCase(TestCase):
    """What the kiosk prints: today's paper, not the whole back catalogue.

    published_issues() is everything ever published (the composer's library
    still wants that). current_issues() is the kiosk's cut: an issue is
    current from the moment it is approved until 08:00 the next calendar day,
    campus time. The hour, not midnight, so the morning shift sees yesterday's
    paper on the way in and a fresh one is expected by the start of classes.

    `now` is injected so these do not depend on the wall clock.
    """

    def _current(self, issues, now):
        with patch.object(Issues, "published_issues", return_value=list(issues)):
            return Issues.current_issues(now=now)

    def test_expires_at_eight_the_next_morning(self):
        issue = Mock(id=1, published_at=datetime(2026, 9, 15, 14, 0))
        self.assertEqual(
            Issues.expires_at(issue), datetime(2026, 9, 16, 8, 0))

    def test_published_before_eight_still_counts_as_that_days_paper(self):
        """07:30 on Monday expires Tuesday 08:00, not Monday 08:00 -- the
        boundary is the NEXT calendar day, whatever the hour of approval."""
        issue = Mock(id=1, published_at=datetime(2026, 9, 14, 7, 30))
        self.assertEqual(
            Issues.expires_at(issue), datetime(2026, 9, 15, 8, 0))

    def test_an_aware_published_at_is_read_in_local_time(self):
        """pendulum hands back UTC-aware datetimes; 23:50 UTC on the 14th is
        07:50 on the 15th in Manila, so the paper is the 15th's."""
        at = datetime(2026, 9, 14, 23, 50, tzinfo=timezone.utc)
        issue = Mock(id=1, published_at=at)
        self.assertEqual(
            Issues.expires_at(issue), datetime(2026, 9, 16, 8, 0))

    def test_no_published_at_falls_back_to_created_at(self):
        issue = Mock(id=1, published_at=None, created_at=datetime(2026, 9, 15, 9, 0))
        self.assertEqual(
            Issues.expires_at(issue), datetime(2026, 9, 16, 8, 0))

    def test_todays_issue_is_current_and_yesterdays_is_not(self):
        today = Mock(id=2, published_at=datetime(2026, 9, 15, 10, 0))
        yesterday = Mock(id=1, published_at=datetime(2026, 9, 14, 10, 0))
        found = self._current([today, yesterday], now=datetime(2026, 9, 15, 12, 0))
        self.assertEqual([i.id for i in found], [2])

    def test_yesterdays_issue_is_still_current_before_eight(self):
        yesterday = Mock(id=1, published_at=datetime(2026, 9, 14, 10, 0))
        found = self._current([yesterday], now=datetime(2026, 9, 15, 7, 59))
        self.assertEqual([i.id for i in found], [1])

    def test_at_eight_sharp_it_has_expired(self):
        yesterday = Mock(id=1, published_at=datetime(2026, 9, 14, 10, 0))
        with patch.object(Issues, "published_issues", return_value=[yesterday, Mock(id=0, published_at=datetime(2026, 9, 1))]):
            found = Issues.current_issues(now=datetime(2026, 9, 15, 8, 0))
        # Expired -- but the newest one is kept as the fallback (below), so
        # the check is that the OLDER one did not come back with it.
        self.assertEqual([i.id for i in found], [1])

    def test_nothing_current_keeps_the_newest_as_a_fallback(self):
        """Monday 09:00 with nothing approved since Friday: the terminal shows
        Friday's paper rather than a blank screen."""
        friday = Mock(id=3, published_at=datetime(2026, 9, 11, 10, 0))
        thursday = Mock(id=2, published_at=datetime(2026, 9, 10, 10, 0))
        found = self._current([friday, thursday], now=datetime(2026, 9, 14, 9, 0))
        self.assertEqual([i.id for i in found], [3])

    def test_no_issues_at_all_is_empty(self):
        self.assertEqual(self._current([], now=datetime(2026, 9, 15, 9, 0)), [])
