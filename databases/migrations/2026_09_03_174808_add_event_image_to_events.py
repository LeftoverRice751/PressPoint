"""AddEventImageToEvents Migration."""

from masoniteorm.migrations import Migration


class AddEventImageToEvents(Migration):
    def up(self):
        """
        Run the migrations.
        """
        with self.schema.table("events") as table:
            table.string("event_image").nullable()

    def down(self):
        """
        Revert the migrations.
        """
        with self.schema.table("events") as table:
            table.drop_column("event_image")
