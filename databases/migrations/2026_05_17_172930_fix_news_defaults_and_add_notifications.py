"""FixNewsDefaultsAndAddNotifications Migration."""

from masoniteorm.migrations import Migration
from masoniteorm.query import QueryBuilder


class FixNewsDefaultsAndAddNotifications(Migration):
    def up(self):
        """Run the migrations."""
        qb = QueryBuilder(connection=self.schema.connection)

        # Backfill: existing published rows should remain visible after we flip the default to pending.
        qb.statement(
            "UPDATE news SET status = 'approved' WHERE status = 'published' OR status IS NULL OR status = ''"
        )

        # SQLite cannot ALTER COLUMN; add a parallel string column and copy values.
        if self.schema.has_column("news", "submitted_by") and not self.schema.has_column("news", "submitted_by_username"):
            with self.schema.table("news") as table:
                table.string("submitted_by_username").nullable()
            qb.statement(
                "UPDATE news SET submitted_by_username = CAST(submitted_by AS CHAR) "
                "WHERE submitted_by IS NOT NULL"
            )

        # Notifications table for editor inboxes.
        if not self.schema.has_table("notifications"):
            with self.schema.create("notifications") as table:
                table.increments("id")
                table.string("user_id")
                table.string("type")
                table.string("title")
                table.text("message").nullable()
                table.string("link").nullable()
                table.datetime("read_at").nullable()
                table.timestamps()

    def down(self):
        """Revert the migrations."""
        if self.schema.has_table("notifications"):
            self.schema.drop("notifications")

        if self.schema.has_column("news", "submitted_by_username"):
            with self.schema.table("news") as table:
                table.drop_column("submitted_by_username")
