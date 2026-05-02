"""AddDecimalToLocationsTable Migration."""

from masoniteorm.migrations import Migration


class AddDecimalToLocationsTable(Migration):
    def up(self):
        """
        Run the migrations.
        """
        with self.schema.table("locations") as table:
            table.decimal("latitude", 12, 2).change()
            table.decimal("longitude", 12, 2).change()

    def down(self):
        """
        Revert the migrations.
        """
        with self.schema.table("locations") as table:
            table.decimal("latitude", 12, 2).change()
            table.decimal("longitude", 12, 2).change()
