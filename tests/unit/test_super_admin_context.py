from unittest.mock import Mock, patch

from tests import TestCase

from app.services.DashboardContext import super_admin_stats


def _grouped(pairs):
    """Fake the rows a `GROUP BY <column>` comes back with.

    `grouped_counts()` reads `grouped_value` / `grouped_count` off each row,
    so the shape here mirrors the aliases in its select_raw().
    """
    rows = []
    for value, count in pairs:
        row = Mock()
        row.grouped_value = value
        row.grouped_count = count
        rows.append(row)
    return rows


def _model_returning(pairs):
    """A model stub whose select_raw(...).group_by(...).get() yields `pairs`."""
    model = Mock()
    model.select_raw.return_value.group_by.return_value.get.return_value = (
        None if pairs is None else _grouped(pairs)
    )
    return model


class SuperAdminStatsTestCase(TestCase):
    def _run(self, roles, statuses, archive_types, event_count, location_count):
        """The live MySQL database is read-only for tests, so every model is
        patched at its import site and nothing falls through to a real query."""
        with patch("app.services.DashboardContext.User", _model_returning(roles)), \
                patch("app.services.DashboardContext.News", _model_returning(statuses)), \
                patch("app.services.DashboardContext.Archives",
                      _model_returning(archive_types)), \
                patch("app.services.DashboardContext.Events") as MockEvents, \
                patch("app.services.DashboardContext.Locations") as MockLocations:
            MockEvents.count.return_value = event_count
            MockLocations.count.return_value = location_count
            return super_admin_stats()

    def test_counts_every_section(self):
        stats = self._run(
            roles=[("superadmin", 1), ("admin", 2), ("editor", 1)],
            statuses=[("published", 2), ("draft", 1)],
            archive_types=[("Newsletter", 2), ("Yearbook", 1)],
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
            roles=[("superadmin", 2)],
            statuses=[],
            archive_types=[],
            event_count=0,
            location_count=0,
        )

        self.assertEqual(stats["admin_count"], 0)
        self.assertEqual(stats["editor_count"], 0)

    def test_role_and_type_matching_ignore_case_and_padding(self):
        # A case-insensitive collation already folds these into one group, but
        # the label MySQL hands back is whichever spelling it saw first -- so
        # the normalisation has to survive on this side too.
        stats = self._run(
            roles=[("  Admin ", 1), ("EDITOR", 1)],
            statuses=[],
            archive_types=[(" newsletter ", 1)],
            event_count=0,
            location_count=0,
        )

        self.assertEqual(stats["admin_count"], 1)
        self.assertEqual(stats["editor_count"], 1)
        self.assertEqual(stats["total_newsletters"], 1)

    def test_published_uses_the_shared_status_aliases(self):
        # normalize_news_status() maps "live"/"publish" onto "published";
        # matching the raw string in SQL would undercount, which is exactly why
        # grouped_counts() returns raw values instead of filtering.
        stats = self._run(
            roles=[],
            statuses=[("live", 1), ("publish", 1), ("draft", 1)],
            archive_types=[],
            event_count=0,
            location_count=0,
        )

        self.assertEqual(stats["published_news"], 2)
        self.assertEqual(stats["total_news"], 3)

    def test_separate_raw_spellings_of_published_are_summed(self):
        stats = self._run(
            roles=[],
            statuses=[("published", 3), ("live", 2)],
            archive_types=[],
            event_count=0,
            location_count=0,
        )

        self.assertEqual(stats["published_news"], 5)

    def test_a_null_status_group_counts_as_draft_not_published(self):
        # normalize_news_status() fails closed; a NULL status column must not
        # be able to inflate the published figure.
        stats = self._run(
            roles=[],
            statuses=[(None, 4), ("published", 1)],
            archive_types=[],
            event_count=0,
            location_count=0,
        )

        self.assertEqual(stats["published_news"], 1)
        self.assertEqual(stats["total_news"], 5)

    def test_empty_tables_produce_zeros(self):
        stats = self._run(
            roles=[], statuses=[], archive_types=[], event_count=0, location_count=0
        )

        self.assertTrue(all(value == 0 for value in stats.values()))

    def test_none_from_the_orm_is_treated_as_empty(self):
        stats = self._run(
            roles=None,
            statuses=None,
            archive_types=None,
            event_count=None,
            location_count=None,
        )

        self.assertTrue(all(value == 0 for value in stats.values()))

    def test_a_failed_aggregate_renders_zeroes_rather_than_raising(self):
        # Same posture as the rest of DashboardContext: the super admin page
        # must not 500 because one count query broke.
        broken = Mock()
        broken.select_raw.side_effect = Exception("connection lost")

        with patch("app.services.DashboardContext.User", broken), \
                patch("app.services.DashboardContext.News", broken), \
                patch("app.services.DashboardContext.Archives", broken), \
                patch("app.services.DashboardContext.Events") as MockEvents, \
                patch("app.services.DashboardContext.Locations") as MockLocations:
            MockEvents.count.return_value = 0
            MockLocations.count.return_value = 0
            stats = super_admin_stats()

        self.assertTrue(all(value == 0 for value in stats.values()))
