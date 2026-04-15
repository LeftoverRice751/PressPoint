"""AddIsArchiveToEventsTable Migration."""

from masoniteorm.migrations import Migration


class AddIsArchiveToEventsTable(Migration):
    def up(self):
        with self.schema.table("events") as table:
            table.boolean("is_archive").default(False).after("location_id")

    def down(self):
        with self.schema.table("events") as table:
            table.drop_column("is_archive")