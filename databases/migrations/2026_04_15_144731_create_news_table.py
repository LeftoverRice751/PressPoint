"""CreateNewsTable Migration."""

from masoniteorm.migrations import Migration


class CreateNewsTable(Migration):
    def up(self):
        """
        Run the migrations.
        """
        with self.schema.create("news") as table:
            table.increments("id")
            table.string("title")
            table.text("description")
            table.string("image").nullable()
            table.datetime("published_at").nullable()
            table.string("source").nullable()
            table.string("location").nullable()
            table.string("layout_type").default("secondary")
            table.integer("priority").default(0)
            table.timestamps()

    def down(self):
        """
        Revert the migrations.
        """
        self.schema.drop("news")
