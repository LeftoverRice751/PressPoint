from datetime import datetime, timezone
from unittest.mock import Mock, patch

from tests import TestCase

from app.services.DashboardContext import overview_context


def _story(id, title, status, category_id, published_at=None, excerpt=None, dek=None,
           issue_id=None):
    row = Mock()
    row.id = id
    row.title = title
    row.status = status
    row.category_id = category_id
    row.published_at = published_at
    row.excerpt = excerpt
    row.dek = dek
    row.issue_id = issue_id
    return row


def _issue(id, published_at):
    row = Mock()
    row.id = id
    row.published_at = published_at
    return row


def _issues_returning(rows):
    """An Issue stub whose select(...).where_in(...).get() yields `rows`."""
    model = Mock()
    model.select.return_value.where_in.return_value.get.return_value = rows
    return model


def _category(id, name):
    row = Mock()
    row.id = id
    row.name = name
    return row


def _news_returning(rows):
    """A News stub whose select(...).order_by(...).get() yields `rows`."""
    model = Mock()
    model.select.return_value.order_by.return_value.get.return_value = rows
    return model


class OverviewContextTestCase(TestCase):
    """The editor dashboard's Dashboard tab: stat cards, "Newsletters by
    Category" and "Recent Newsletters".

    All three used to read the legacy `Posts` / `Categories` tables, which
    nothing writes any more, so the panels showed "No data available" and the
    cards 0 while the kiosk was serving published stories. They now read
    `news` + `news_categories`; the live MySQL database is read-only for
    tests, so every model is patched at its import site.
    """

    def _run(self, stories, categories, issues=()):
        with patch("app.services.DashboardContext.News", _news_returning(stories)), \
                patch("app.models.Issue.Issue", _issues_returning(list(issues))), \
                patch("app.services.NewsCategories.live", return_value=categories), \
                patch("app.services.NewsCategories.names_by_id",
                      return_value={c.id: c.name for c in categories}):
            return overview_context()

    def test_date_falls_back_to_the_issues_published_at_in_campus_time(self):
        # Approval stamps issues.published_at (UTC) and leaves the story's own
        # column NULL. 23:50 UTC on the 14th is already the 15th in Manila.
        stories = [
            _story(1, "In issue", "published", 1, issue_id=7),
            _story(2, "No issue", "draft", 1),
        ]
        issues = [_issue(7, datetime(2026, 9, 14, 23, 50, tzinfo=timezone.utc))]
        context = self._run(stories, [_category(1, "Campus")], issues)
        self.assertEqual(context["recent_articles"][0]["published_at"], "Sep 15, 2026")
        self.assertEqual(context["recent_articles"][1]["published_at"], "")

    def test_cards_count_the_whole_news_table(self):
        context = self._run(
            [
                _story(3, "C", "published", 1),
                _story(2, "B", "draft", 1),
                _story(1, "A", "review", 2),
            ],
            [_category(1, "Campus"), _category(2, "Sports")],
        )
        self.assertEqual(context["total_news"], 3)
        self.assertEqual(context["published_news"], 1)

    def test_published_folds_the_shared_status_aliases(self):
        # "live" and "publish" mean published everywhere else in the app.
        context = self._run(
            [_story(1, "A", "live", 1), _story(2, "B", "publish", 1), _story(3, "C", "draft", 1)],
            [_category(1, "Campus")],
        )
        self.assertEqual(context["published_news"], 2)

    def test_groups_stories_by_live_category_with_a_preview(self):
        context = self._run(
            [_story(i, f"Story {i}", "published", 1) for i in range(5, 0, -1)]
            + [_story(9, "Solo", "draft", 2)],
            [_category(1, "Campus"), _category(2, "Sports"), _category(3, "Empty")],
        )
        groups = {g["name"]: g for g in context["article_groups"]}
        self.assertEqual(groups["Campus"]["count"], 5)
        self.assertEqual(groups["Campus"]["percent"], 83)
        self.assertEqual(len(groups["Campus"]["items"]), 3)
        self.assertEqual(groups["Sports"]["count"], 1)
        # An empty category still renders as a row, so an editor sees it exists.
        self.assertEqual(groups["Empty"]["count"], 0)
        self.assertEqual(groups["Empty"]["items"], [])
        self.assertNotIn("Uncategorized", groups)

    def test_a_story_whose_category_was_deleted_is_still_counted(self):
        context = self._run(
            [_story(1, "Kept", "published", 1), _story(2, "Orphan", "published", 42)],
            [_category(1, "Campus")],
        )
        names = [g["name"] for g in context["article_groups"]]
        self.assertEqual(names, ["Campus", "Uncategorized"])
        self.assertEqual(context["article_groups"][-1]["count"], 1)
        self.assertEqual(context["total_news"], 2)

    def test_recent_lists_the_newest_five_with_a_readable_date(self):
        stories = [
            _story(i, f"Story {i}", "published", 1,
                   published_at=datetime(2026, 9, i, 8, 0), excerpt=f"Excerpt {i}")
            for i in range(8, 0, -1)
        ]
        context = self._run(stories, [_category(1, "Campus")])
        recent = context["recent_articles"]
        self.assertEqual([s["title"] for s in recent], [f"Story {i}" for i in range(8, 3, -1)])
        self.assertEqual(recent[0]["published_at"], "Sep 08, 2026")
        self.assertEqual(recent[0]["excerpt"], "Excerpt 8")
        self.assertEqual(recent[0]["status"], "published")
        self.assertEqual(context["category_lookup"], {1: "Campus"})

    def test_excerpt_falls_back_to_the_dek(self):
        context = self._run([_story(1, "A", "draft", 1, dek="The dek")], [_category(1, "Campus")])
        self.assertEqual(context["recent_articles"][0]["excerpt"], "The dek")

    def test_empty_table_gives_zeros_and_no_rows(self):
        context = self._run([], [_category(1, "Campus")])
        self.assertEqual(context["total_news"], 0)
        self.assertEqual(context["published_news"], 0)
        self.assertEqual(context["recent_articles"], [])
        self.assertEqual(context["article_groups"][0]["percent"], 0)

    def test_a_failed_query_renders_empty_rather_than_raising(self):
        broken = Mock()
        broken.select.side_effect = RuntimeError("db down")
        with patch("app.services.DashboardContext.News", broken), \
                patch("app.services.NewsCategories.live", return_value=[]), \
                patch("app.services.NewsCategories.names_by_id", return_value={}):
            context = overview_context()
        self.assertEqual(context["total_news"], 0)
        self.assertEqual(context["recent_articles"], [])
        self.assertEqual(context["article_groups"], [])
