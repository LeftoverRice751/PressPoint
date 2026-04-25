"""CreateArchivesTable Migration."""

from masoniteorm.migrations import Migration


class CreateArchivesTable(Migration):
    def up(self):
        """
        Run the migrations.
        """
        with self.schema.create("archives") as table:
            table.increments("id")
            table.string("folio").nullable()
            table.string("name")
            table.string("type").nullable()
            table.string("file_path")

            table.timestamps()

    def down(self):
        """
        Revert the migrations.
        """
        self.schema.drop("archives")
