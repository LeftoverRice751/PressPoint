from datetime import datetime, timezone
from unittest.mock import Mock, patch

from tests import TestCase

from app.services.DashboardContext import overview_context


def _post(id, title, status, published_at=None, description=None):
    row = Mock()
    row.id = id
    row.title = title
    row.status = status
    row.published_at = published_at
    row.description = description
    return row


def _news_returning(rows):
    """A News stub whose select(...).order_by(...).get() yields `rows`."""
    model = Mock()
    model.select.return_value.order_by.return_value.get.return_value = rows
    return model


class OverviewContextTestCase(TestCase):
    """The editor dashboard's Dashboard tab: stat cards and "Recent Posts".

    The live MySQL database is read-only for tests, so the model is patched at
    its import site.
    """

    def _run(self, posts):
        with patch("app.services.DashboardContext.News", _news_returning(posts)):
            return overview_context()

    def test_the_date_is_shown_in_campus_time(self):
        # 23:50 UTC on the 14th is already the 15th in Manila.
        posts = [
            _post(1, "Dated", "published", datetime(2026, 9, 14, 23, 50, tzinfo=timezone.utc)),
            _post(2, "Undated", "draft"),
        ]
        context = self._run(posts)
        self.assertEqual(context["recent_articles"][0]["published_at"], "Sep 15, 2026")
        self.assertEqual(context["recent_articles"][1]["published_at"], "")

    def test_cards_count_the_whole_news_table(self):
        context = self._run(
            [_post(3, "C", "published"), _post(2, "B", "draft"), _post(1, "A", "review")]
        )
        self.assertEqual(context["total_news"], 3)
        self.assertEqual(context["published_news"], 1)

    def test_published_folds_the_shared_status_aliases(self):
        # "live" and "publish" mean published everywhere else in the app.
        context = self._run(
            [_post(1, "A", "live"), _post(2, "B", "publish"), _post(3, "C", "draft")]
        )
        self.assertEqual(context["published_news"], 2)

    def test_recent_lists_the_newest_five_with_a_readable_date(self):
        posts = [
            _post(i, f"Post {i}", "published", datetime(2026, 9, i, 8, 0), f"Body {i}")
            for i in range(8, 0, -1)
        ]
        recent = self._run(posts)["recent_articles"]
        self.assertEqual([p["title"] for p in recent], [f"Post {i}" for i in range(8, 3, -1)])
        self.assertEqual(recent[0]["published_at"], "Sep 08, 2026")
        self.assertEqual(recent[0]["excerpt"], "Body 8")
        self.assertEqual(recent[0]["status"], "published")

    def test_the_category_grouping_is_gone(self):
        context = self._run([_post(1, "A", "draft")])
        for gone in ("article_groups", "category_lookup"):
            self.assertNotIn(gone, context)

    def test_empty_table_gives_zeros_and_no_rows(self):
        context = self._run([])
        self.assertEqual(context["total_news"], 0)
        self.assertEqual(context["published_news"], 0)
        self.assertEqual(context["recent_articles"], [])

    def test_a_failed_query_renders_empty_rather_than_raising(self):
        broken = Mock()
        broken.select.side_effect = RuntimeError("db down")
        with patch("app.services.DashboardContext.News", broken):
            context = overview_context()
        self.assertEqual(context["total_news"], 0)
        self.assertEqual(context["recent_articles"], [])
