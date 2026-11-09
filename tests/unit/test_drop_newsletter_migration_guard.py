"""The drop migration must not run before the purge has emptied the newsletter data.

Doubles only: no database is touched.
"""

import importlib.util
import unittest
from pathlib import Path
from unittest.mock import Mock

PATH = (
    Path(__file__).resolve().parents[2]
    / "databases" / "migrations" / "2026_11_09_000200_drop_newsletter_schema.py"
)


def _migration(tables, columns, counts):
    spec = importlib.util.spec_from_file_location("drop_newsletter", PATH)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    migration = module.DropNewsletterSchema.__new__(module.DropNewsletterSchema)
    migration.schema = Mock()
    migration.schema.has_table.side_effect = lambda t: t in tables
    migration.schema.has_column.side_effect = lambda t, c: (t, c) in columns
    statements = []

    def statement(sql, *args):
        statements.append(sql)
        for needle, value in counts.items():
            if needle in sql:
                return [{"n": value}]
        return [{"n": 0}]

    builder = Mock()
    builder.statement.side_effect = statement
    migration._query = lambda: builder
    return migration, statements


class DropGuardTestCase(unittest.TestCase):
    def test_refuses_while_issues_have_rows(self):
        migration, statements = _migration({"issues", "news"}, {("news", "issue_id")}, {"FROM issues": 3})
        with self.assertRaisesRegex(RuntimeError, "purge_newsletters.py"):
            migration.up()
        self.assertFalse([s for s in statements if "DROP" in s])

    def test_refuses_while_news_rows_keep_an_issue(self):
        migration, statements = _migration(
            {"issues", "news"}, {("news", "issue_id")}, {"issue_id IS NOT NULL": 2}
        )
        with self.assertRaisesRegex(RuntimeError, "purge_newsletters.py"):
            migration.up()
        self.assertFalse([s for s in statements if "DROP" in s])

    def test_passes_after_the_purge_and_after_the_drop(self):
        migration, _ = _migration({"issues", "news"}, {("news", "issue_id")}, {})
        migration._refuse_while_newsletter_data_remains()
        # Already dropped: no issues table, no issue_id column.
        migration, statements = _migration({"news"}, set(), {})
        migration.up()
        self.assertFalse([s for s in statements if "COUNT" in s and "FROM issues" in s])
        self.assertFalse([s for s in statements if "ALTER" in s or "DROP" in s])
