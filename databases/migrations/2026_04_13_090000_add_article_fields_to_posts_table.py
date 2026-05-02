"""AddArticleFieldsToPostsTable Migration."""

from masoniteorm.migrations import Migration


class AddArticleFieldsToPostsTable(Migration):
    def up(self):
        with self.schema.table("posts") as table:
            table.text("description").nullable().after("content")
            table.datetime("event_date").nullable().after("description")
            table.integer("location_id").unsigned().nullable().after("event_date")
            table.foreign("location_id").references("id").on("locations").on_delete("set null")

    def down(self):
        with self.schema.table("posts") as table:
            table.drop_foreign("posts_location_id_foreign")

        with self.schema.table("posts") as table:
            table.drop_column("location_id")
            table.drop_column("event_date")
            table.drop_column("description")
