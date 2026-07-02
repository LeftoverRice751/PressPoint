"""CreateMembersTable Migration."""

from masoniteorm.migrations import Migration


class CreateMembersTable(Migration):
    def up(self):
        """
        Run the migrations.
        """
        with self.schema.create("members") as table:
            table.increments("id")
            table.integer("department_id").unsigned()
            table.foreign("department_id").references("id").on("departments").on_delete("cascade")
            table.string("name")
            table.string("position")
            table.string("photo_path").nullable()
            table.integer("parent_id").unsigned().nullable()
            table.foreign("parent_id").references("id").on("members").on_delete("cascade")
            table.integer("sort_order").default(0)
            table.timestamps()

    def down(self):
        """
        Revert the migrations.
        """
        self.schema.drop("members")
