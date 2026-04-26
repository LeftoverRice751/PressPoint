"""CreateVideosTable Migration."""

from masoniteorm.migrations import Migration


class CreateVideosTable(Migration):
    def up(self):
        """
        Run the migrations.
        """
        with self.schema.create("videos") as table:
            table.increments("id")
            table.string("title")
            table.string("file_path")
            table.timestamps()

    def down(self):
        """
        Revert the migrations.
        """
        self.schema.drop("videos")
