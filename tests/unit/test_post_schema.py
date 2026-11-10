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
