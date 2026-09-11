"""BackfillNewsCategory Migration.

Seeds an "Uncategorized" category and assigns every existing story to it, so
2026_09_11_000300 can make news.category_id NOT NULL.

This is a DATA BACKFILL, which is the exact class of migration that broke this
repo's history -- 2026_05_17_172930_fix_news_defaults_and_add_notifications
runs `UPDATE news SET status = ...` before any migration has added
news.status, and a fresh `craft migrate` dies 23 migrations in because of it
(see the header of databases/schema.sql). So this one guards its own
preconditions and returns early when they are absent, the way
2026_05_12_..._add_sort_order_to_members_table now does. A backfill that
cannot run is a no-op; a backfill that raises stops the whole history.

Both statements are idempotent -- the INSERT is guarded by NOT EXISTS and the
UPDATE only touches NULLs -- so a re-run, or a partially-applied history,
cannot double-seed or clobber a category someone has since assigned by hand.

Product consequence worth knowing: 'Uncategorized' is an ordinary category in
every respect. It is renameable, and per the agreed permission model any
editor may delete it -- which would soft-delete all of these legacy stories at
once. That is the stated behaviour, not an oversight; the delete confirmation
in the composer states the story count before it happens.
"""

from masoniteorm.migrations import Migration
from masoniteorm.query import QueryBuilder


class BackfillNewsCategory(Migration):
    def up(self):
        """
        Run the migrations.
        """
        if not self.schema.has_table("news_categories"):
            return
        if not self.schema.has_column("news", "category_id"):
            return

        qb = QueryBuilder(connection=self.schema.connection)

        # `FROM DUAL` so the NOT EXISTS guard has a row to filter -- a bare
        # `SELECT ... WHERE NOT EXISTS` is valid in MySQL but not portable.
        qb.statement(
            "INSERT INTO news_categories (name, name_key, created_at, updated_at) "
            "SELECT 'Uncategorized', 'uncategorized', NOW(), NOW() FROM DUAL "
            "WHERE NOT EXISTS ("
            "  SELECT 1 FROM news_categories WHERE name_key = 'uncategorized'"
            ")"
        )

        qb.statement(
            "UPDATE news SET category_id = ("
            "  SELECT id FROM news_categories WHERE name_key = 'uncategorized'"
            ") WHERE category_id IS NULL"
        )

    def down(self):
        """
        Revert the migrations.
        """
        if not self.schema.has_table("news_categories"):
            return
        if not self.schema.has_column("news", "category_id"):
            return

        qb = QueryBuilder(connection=self.schema.connection)

        # The extra SELECT wrapper is MySQL's "you can't read the table you
        # are updating in a subquery" workaround (error 1093).
        qb.statement(
            "UPDATE news SET category_id = NULL WHERE category_id = ("
            "  SELECT id FROM ("
            "    SELECT id FROM news_categories WHERE name_key = 'uncategorized'"
            "  ) AS seeded"
            ")"
        )

        # Only remove the seed if nothing points at it any more -- the FK is
        # ON DELETE RESTRICT, so a stray reference would make this fail loudly
        # rather than orphan a story.
        qb.statement(
            "DELETE FROM news_categories WHERE name_key = 'uncategorized' "
            "AND NOT EXISTS ("
            "  SELECT 1 FROM (SELECT category_id FROM news) AS n "
            "  WHERE n.category_id = news_categories.id"
            ")"
        )
