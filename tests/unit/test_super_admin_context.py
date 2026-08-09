from unittest.mock import Mock, patch

from tests import TestCase

from app.services.DashboardContext import super_admin_stats


def _row(**attributes):
    row = Mock()
    for name, value in attributes.items():
        setattr(row, name, value)
    return row


def _patched_models():
    """Every model super_admin_stats() reads, patched at its import site.

    The live MySQL database is read-only for tests, so nothing here may fall
    through to a real query.
    """
    return (
        patch("app.services.DashboardContext.User"),
        patch("app.services.DashboardContext.News"),
        patch("app.services.DashboardContext.Archives"),
        patch("app.services.DashboardContext.Events"),
        patch("app.services.DashboardContext.Locations"),
    )


class SuperAdminStatsTestCase(TestCase):
    def _run(self, users, news_rows, archive_rows, event_count, location_count):
        user_patch, news_patch, archives_patch, events_patch, locations_patch = _patched_models()
        with user_patch as MockUser, news_patch as MockNews, archives_patch as MockArchives, \
                events_patch as MockEvents, locations_patch as MockLocations:
            MockUser.all.return_value = users
            MockNews.all.return_value = news_rows
            MockArchives.all.return_value = archive_rows
            MockEvents.count.return_value = event_count
            MockLocations.count.return_value = location_count
            return super_admin_stats()

    def test_counts_every_section(self):
        stats = self._run(
            users=[
                _row(role="superadmin"),
                _row(role="admin"),
                _row(role="admin"),
                _row(role="editor"),
            ],
            news_rows=[
                _row(status="published"),
                _row(status="draft"),
                _row(status="published"),
            ],
            archive_rows=[
                _row(type="Newsletter"),
                _row(type="Newsletter"),
                _row(type="Yearbook"),
            ],
            event_count=7,
            location_count=4,
        )

        self.assertEqual(
            stats,
            {
                "admin_count": 2,
                "editor_count": 1,
                "total_news": 3,
                "published_news": 2,
                "total_events": 7,
                "total_archives": 3,
                "total_newsletters": 2,
                "location_count": 4,
            },
        )

    def test_superadmins_are_not_counted_as_admins(self):
        stats = self._run(
            users=[_row(role="superadmin"), _row(role="superadmin")],
            news_rows=[],
            archive_rows=[],
            event_count=0,
            location_count=0,
        )

        self.assertEqual(stats["admin_count"], 0)
        self.assertEqual(stats["editor_count"], 0)

    def test_role_and_type_matching_ignore_case_and_padding(self):
        stats = self._run(
            users=[_row(role="  Admin "), _row(role="EDITOR")],
            news_rows=[],
            archive_rows=[_row(type=" newsletter ")],
            event_count=0,
            location_count=0,
        )

        self.assertEqual(stats["admin_count"], 1)
        self.assertEqual(stats["editor_count"], 1)
        self.assertEqual(stats["total_newsletters"], 1)

    def test_published_uses_the_shared_status_aliases(self):
        # normalize_news_status() maps "live"/"publish" onto "published";
        # counting raw strings here would undercount.
        stats = self._run(
            users=[],
            news_rows=[_row(status="live"), _row(status="publish"), _row(status="draft")],
            archive_rows=[],
            event_count=0,
            location_count=0,
        )

        self.assertEqual(stats["published_news"], 2)
        self.assertEqual(stats["total_news"], 3)

    def test_empty_tables_produce_zeros(self):
        stats = self._run(
            users=[], news_rows=[], archive_rows=[], event_count=0, location_count=0
        )

        self.assertTrue(all(value == 0 for value in stats.values()))

    def test_none_from_the_orm_is_treated_as_empty(self):
        stats = self._run(
            users=None, news_rows=None, archive_rows=None, event_count=None, location_count=None
        )

        self.assertTrue(all(value == 0 for value in stats.values()))
