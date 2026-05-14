"""CreateOfficesTable Migration."""

from masoniteorm.migrations import Migration


class CreateOfficesTable(Migration):
    def up(self):
        """
        Run the migrations.
        """
        with self.schema.create("offices") as table:
            table.increments("id")
            table.timestamps()

    def down(self):
        """
        Revert the migrations.
        """
        self.schema.drop("offices")
