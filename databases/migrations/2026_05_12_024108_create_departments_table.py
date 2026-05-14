"""CreateDepartmentsTable Migration."""

from masoniteorm.migrations import Migration


class CreateDepartmentsTable(Migration):
    def up(self):
        """
        Run the migrations.
        """
        with self.schema.create("departments") as table:
            table.increments("id")
            table.integer("location_id").unsigned()
            table.foreign("location_id").references("id").on("locations").on_delete("cascade")
            table.unique("location_id")
            table.string("name").unique()
            table.timestamps()

    def down(self):
        """
        Revert the migrations.
        """
        self.schema.drop("departments")
