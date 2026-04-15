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
            table.timestamps()

    def down(self):
        """
        Revert the migrations.
        """
        self.schema.drop("news")
