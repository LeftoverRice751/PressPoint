"""CreateEventsTable Migration."""

from masoniteorm.migrations import Migration


class CreateEventsTable(Migration):
    def up(self):
        """
        Run the migrations.
        """
        with self.schema.create("events") as table:
            table.increments("id")
            table.string("title")
            table.text("description")
            table.datetime("event_date")
            table.integer("location_id").unsigned().nullable()
            
            table.foreign("location_id").references("id").on("locations").on_delete("set null")
            
            table.timestamps()

    def down(self):
        """
        Revert the migrations.
        """
        self.schema.drop("events")
