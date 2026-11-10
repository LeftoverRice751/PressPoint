"""Schema contract for single photo posts (additive columns on `news`)."""

import re
import unittest
from pathlib import Path

from app.models.News import News

SCHEMA = Path(__file__).resolve().parents[2] / "databases" / "schema.sql"


def _news_block():
    text = SCHEMA.read_text()
    match = re.search(r"CREATE TABLE `news` \((.*?)\n\) ENGINE", text, re.S)
    assert match, "news CREATE TABLE not found in schema.sql"
    return match.group(1)


class PostSchemaTestCase(unittest.TestCase):
    def test_schema_declares_post_columns(self):
        block = _news_block()
        for fragment in (
            "`kicker` varchar(80)",
            "`image_crop` text",
            "`source_lines` text",
            "`element_layout` text",
            "`expires_at` datetime",
        ):
            self.assertIn(fragment, block)

    def test_newsletter_columns_are_gone(self):
        # Dropped by 2026_11_09_000200_drop_newsletter_schema; nothing may write them.
        block = _news_block()
        for name in ("issue_id", "layout_type", "priority", "category_id"):
            self.assertNotIn(f"`{name}`", block)
        text = SCHEMA.read_text()
        for table in ("issues", "issue_events", "news_categories"):
            self.assertNotIn(f"CREATE TABLE `{table}`", text)

    def test_news_model_fillable_has_post_fields(self):
        for name in ("kicker", "image_crop", "source_lines", "element_layout", "expires_at"):
            self.assertIn(name, News.__fillable__)
        # Posts carry no logo of their own: never a column, never fillable.
        self.assertNotIn("logo_path", News.__fillable__)
        self.assertNotIn("`logo_path`", _news_block())
        self.assertIn("expires_at", News.__dates__)

    def test_migration_adds_element_layout(self):
        import importlib

        migration = importlib.import_module(
            "databases.migrations.2026_11_09_000100_add_post_fields_to_news"
        )
        self.assertIn("element_layout", migration.POST_COLUMNS)


MIGRATIONS = SCHEMA.parent / "migrations"


class ScopedColumnCheckTestCase(unittest.TestCase):
    """masonite's Schema.has_column ignores which database it is in, so on a MySQL
    server that also hosts a copy of the schema it reports a column the live
    database lacks. That is how 2026_11_09_000100 recorded itself as run on
    production while adding none of its columns."""

    def test_post_migrations_never_use_the_unscoped_check(self):
        for path in sorted(MIGRATIONS.glob("2026_11_*.py")):
            self.assertNotRegex(path.read_text(), r"\.has_column\(", path.name)

    def test_the_scoped_check_filters_by_the_current_database(self):
        from unittest.mock import patch

        from app.services import SchemaChecks

        with patch.object(SchemaChecks, "QueryBuilder") as builder:
            builder.return_value.statement.return_value = [{"n": 1}]
            self.assertTrue(SchemaChecks.column_exists("conn", "news", "kicker"))
            sql, bindings = builder.return_value.statement.call_args.args
            builder.return_value.statement.return_value = [{"n": 0}]
            self.assertFalse(SchemaChecks.column_exists("conn", "news", "kicker"))
        self.assertIn("table_schema = DATABASE()", sql)
        self.assertEqual(bindings, ["news", "kicker"])

    def test_the_repair_runs_before_the_guarded_drop(self):
        # 000200 raises while newsletter data remains, which stops craft migrate;
        # the column repair must sort ahead of it to ever run.
        names = sorted(p.name for p in MIGRATIONS.glob("2026_11_09_*.py"))
        repair = names.index("2026_11_09_000150_add_missing_post_columns.py")
        drop = names.index("2026_11_09_000200_drop_newsletter_schema.py")
        self.assertLess(repair, drop)

    def test_the_repair_adds_the_same_columns_as_000100(self):
        import importlib

        original = importlib.import_module(
            "databases.migrations.2026_11_09_000100_add_post_fields_to_news"
        )
        repair = importlib.import_module(
            "databases.migrations.2026_11_09_000150_add_missing_post_columns"
        )
        self.assertEqual(repair.POST_COLUMNS, original.POST_COLUMNS)
