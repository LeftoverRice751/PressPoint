"""MakeNewsCategoryIdNotNull Migration.

The third step of the three-step add/backfill/tighten that gives news stories
a required category. Split into its own file on purpose: if this one fails --
because the backfill missed a row, or because the alter grammar trips over the
foreign key -- the backfill in 2026_09_11_000200 stays committed and can be
inspected, rather than being rolled back along with it.

A category is REQUIRED at the database level, not only in the composer's
submit flow, for the same reason _normalize_news_status fails closed: the UI
is just a form, and a hand-crafted POST that omits the field has to fail too.

Known hazard, and why the raw fallback is here: MySQL's MODIFY on a column
that already carries a foreign key is fine in principle, but masonite's alter
grammar builds the statement itself and has not been exercised on that
combination in this repo. If the schema-builder path errors, the raw ALTER
does exactly the same thing without going through the grammar.
"""

from masoniteorm.migrations import Migration
from masoniteorm.query import QueryBuilder


class MakeNewsCategoryIdNotNull(Migration):
    def up(self):
        """
        Run the migrations.
        """
        if not self.schema.has_column("news", "category_id"):
            return

        try:
            with self.schema.table("news") as table:
                table.unsigned_integer("category_id").change()
        except Exception:
            QueryBuilder(connection=self.schema.connection).statement(
                "ALTER TABLE news MODIFY category_id INT UNSIGNED NOT NULL"
            )

    def down(self):
        """
        Revert the migrations.
        """
        if not self.schema.has_column("news", "category_id"):
            return

        try:
            with self.schema.table("news") as table:
                table.unsigned_integer("category_id").nullable().change()
        except Exception:
            QueryBuilder(connection=self.schema.connection).statement(
                "ALTER TABLE news MODIFY category_id INT UNSIGNED NULL"
            )
