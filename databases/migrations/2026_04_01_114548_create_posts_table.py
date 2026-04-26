"""CreatePostsTable Migration."""

from masoniteorm.migrations import Migration


class CreatePostsTable(Migration):
    def up(self):
        """
        Run the migrations.
        """
        with self.schema.create("posts") as table:
            table.increments("id")
            table.string("title")
            table.text("content")
            table.integer("category_id").unsigned().nullable()
            table.integer("author_id").unsigned().nullable()
            
            table.foreign("category_id").references("id").on("categories").on_delete("set null")
            table.foreign("author_id").references("id").on("users").on_delete("set null")
            
            table.string("status").default("draft")
            table.timestamp("published_at").nullable()
            
            table.timestamps()

    def down(self):
        """
        Revert the migrations.
        """
        self.schema.drop("posts")
