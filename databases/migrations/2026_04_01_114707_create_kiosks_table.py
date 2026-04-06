"""CreateKiosksTable Migration."""

from masoniteorm.migrations import Migration


class CreateKiosksTable(Migration):
    def up(self):
        """
        Run the migrations.
        """
        with self.schema.create("kiosks") as table:
            table.increments("id")
            table.string("name")
            table.timestamp("last_sync_at").nullable()
            table.boolean("is_online").default(1)
            table.timestamps()

    def down(self):
        """
        Revert the migrations.
        """
        self.schema.drop("kiosks")
