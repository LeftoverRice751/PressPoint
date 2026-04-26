"""CreateLocationsTable Migration."""

from masoniteorm.migrations import Migration


class CreateLocationsTable(Migration):
    def up(self):
        """
        Run the migrations.
        """
        with self.schema.create("locations") as table:
            table.increments("id")
            table.string("name")
            table.string("type")
            table.decimal("latitude", 10, 8)
            table.decimal("longitude", 10, 8)
            table.boolean("is_routable").default(True)
            table.timestamps()

    def down(self):
        """
        Revert the migrations.
        """
        self.schema.drop("locations")
