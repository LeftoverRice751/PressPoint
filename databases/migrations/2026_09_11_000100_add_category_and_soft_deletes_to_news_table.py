"""AddCategoryAndSoftDeletesToNewsTable Migration.

Two columns that arrive together because the feature needs both: a story's
category, and the tombstone marker that lets a category delete hide its
stories recoverably.

`category_id` is added NULLABLE here and tightened to NOT NULL in
2026_09_11_000300, with the backfill in between. Doing it in one step would
fail against any database that already has rows -- which is every one of them.

`unsigned_integer`, NOT masonite's `foreign_id()`. That helper emits
BIGINT UNSIGNED, which does not match news_categories.id's INT UNSIGNED, and
MySQL rejects a foreign key between mismatched types with errno 3780.

ON DELETE RESTRICT, and it matters precisely BECAUSE it is unreachable in
normal operation: nothing in the app ever issues DELETE FROM news_categories,
because a category delete is a soft delete. The constraint exists for the
paths that bypass the app -- a hand-written DELETE in a mysql shell, or a
future "empty the trash" reaching for force_delete(). Under CASCADE those
would silently hard-delete published stories with no recovery; under RESTRICT
they fail loudly. (Once category_id is NOT NULL, SET NULL is illegal DDL
anyway, so RESTRICT is also the only real option.)

`deleted_at` gets its own index: the SoftDeletesMixin on the News model
appends `news.deleted_at IS NULL` to every SELECT this app will ever run
against the table, so the column is in the hot path of every read.
"""

from masoniteorm.migrations import Migration


class AddCategoryAndSoftDeletesToNewsTable(Migration):
    def up(self):
        """
        Run the migrations.
        """
        with self.schema.table("news") as table:
            table.unsigned_integer("category_id").nullable().after("location")
            table.foreign("category_id").references("id").on("news_categories").on_delete(
                "restrict"
            )

            table.datetime("deleted_at").nullable()
            table.index("deleted_at")

    def down(self):
        """
        Revert the migrations.
        """
        with self.schema.table("news") as table:
            table.drop_foreign("news_category_id_foreign")
            table.drop_index("news_deleted_at_index")
            table.drop_column("category_id")
            table.drop_column("deleted_at")
