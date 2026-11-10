"""AddPostFieldsToNews Migration.

First step of replacing the newsletter with single photo posts (see
docs/superpowers photo-posts design). Purely additive: five nullable columns
and a relaxed `category_id`, so the code that is live today keeps running
unchanged until the later tasks stop using categories.

`category_id` keeps its foreign key; only NOT NULL is dropped, because a post
has no subject classification. The FK itself goes in the final cleanup task.

The change() path is the same hazard as 2026_09_11_000300: masonite's alter
grammar has not been exercised on a column that carries a foreign key, so the
raw ALTER is the fallback.
"""

from masoniteorm.migrations import Migration
from masoniteorm.query import QueryBuilder

POST_COLUMNS = ("kicker", "image_crop", "source_lines", "element_layout", "expires_at")


class AddPostFieldsToNews(Migration):
    def up(self):
        """
        Run the migrations.
        """
        with self.schema.table("news") as table:
            if not self.schema.has_column("news", "kicker"):
                table.string("kicker", 80).nullable()
            if not self.schema.has_column("news", "image_crop"):
                table.text("image_crop").nullable()
            if not self.schema.has_column("news", "source_lines"):
                table.text("source_lines").nullable()
            if not self.schema.has_column("news", "element_layout"):
                table.text("element_layout").nullable()
            if not self.schema.has_column("news", "expires_at"):
                table.datetime("expires_at").nullable()

        try:
            with self.schema.table("news") as table:
                table.unsigned_integer("category_id").nullable().change()
        except Exception:
            QueryBuilder(connection=self.schema.connection).statement(
                "ALTER TABLE news MODIFY category_id INT UNSIGNED NULL"
            )

    def down(self):
        """
        Revert the migrations.
        """
        # Rows posted without a category would make NOT NULL fail; leaving
        # category_id nullable on rollback is the safe direction.
        for name in POST_COLUMNS:
            if self.schema.has_column("news", name):
                with self.schema.table("news") as table:
                    table.drop_column(name)
