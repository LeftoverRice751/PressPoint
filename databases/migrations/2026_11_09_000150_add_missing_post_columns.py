"""AddMissingPostColumns Migration.

2026_11_09_000100 decided which post columns to add with masonite's
Schema.has_column, which is not scoped to the current database. On production
the MySQL account could also see a preview copy of the schema whose `news`
already had the columns, so 000100 recorded itself as run and added none of
them (only its raw category_id ALTER took effect). 000100 is fixed now, but a
recorded migration never runs again, so this one adds whatever is still missing,
checked against THIS database only (app/services/SchemaChecks.py).

Idempotent: on a database where 000100 worked (CI's schema.sql, a fresh
install) every column exists and this does nothing. Sorted before
2026_11_09_000200, which refuses to run while newsletter data remains and would
otherwise stop `craft migrate` before reaching this.
"""

from masoniteorm.migrations import Migration

from app.services.SchemaChecks import column_exists

# Same definitions, same order, as 2026_11_09_000100 and databases/schema.sql.
POST_COLUMNS = ("kicker", "image_crop", "source_lines", "element_layout", "expires_at")


class AddMissingPostColumns(Migration):
    def up(self):
        """
        Run the migrations.
        """
        missing = [
            name for name in POST_COLUMNS
            if not column_exists(self.schema.connection, "news", name)
        ]
        if not missing:
            return
        with self.schema.table("news") as table:
            if "kicker" in missing:
                table.string("kicker", 80).nullable()
            if "image_crop" in missing:
                table.text("image_crop").nullable()
            if "source_lines" in missing:
                table.text("source_lines").nullable()
            if "element_layout" in missing:
                table.text("element_layout").nullable()
            if "expires_at" in missing:
                table.datetime("expires_at").nullable()

    def down(self):
        """
        Revert the migrations.
        """
        # 000100 owns these columns and drops them on its own rollback; dropping
        # them here too would make rolling back this repair destroy post data.
        pass
