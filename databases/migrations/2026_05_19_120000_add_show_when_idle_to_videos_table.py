"""AddShowWhenIdleToVideosTable Migration."""

from masoniteorm.migrations import Migration


class AddShowWhenIdleToVideosTable(Migration):
    def up(self):
        """
        Run the migrations.
        """
        with self.schema.table("videos") as table:
            table.boolean("show_when_idle").default(False)

    def down(self):
        """
        Revert the migrations.
        """
        with self.schema.table("videos") as table:
            table.drop_column("show_when_idle")
