"""DropUnusedSubmissionColumns Migration."""

from masoniteorm.migrations import Migration


class DropUnusedSubmissionColumns(Migration):
    """Remove what is left of the never-wired chief-editor approval flow.

    `templates/gears/news_editor_dashboard.html` (submissions / write story /
    notifications) and `app/models/Notification.py` were built but never
    reachable — no route or controller ever referenced either — so the storage
    behind them has only ever held rows nothing reads.

    Deliberately NOT touched: `news.status`. Its "review"/"approved" vocabulary
    looks like part of this flow but is the live story status the composer and
    the kiosk visibility check both run on (`NewsController._normalize_news_status`).
    """

    def up(self):
        if self.schema.has_table("notifications"):
            self.schema.drop("notifications")

        for column in ("submitted_by", "submitted_by_username"):
            if self.schema.has_column("news", column):
                with self.schema.table("news") as table:
                    table.drop_column(column)

    def down(self):
        """Recreate the shape, not the data — the rows are gone for good."""
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

        if not self.schema.has_column("news", "submitted_by_username"):
            with self.schema.table("news") as table:
                table.string("submitted_by_username").nullable()
