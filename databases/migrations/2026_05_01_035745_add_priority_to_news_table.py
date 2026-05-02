"""AddPriorityToNewsTable Migration."""

from masoniteorm.migrations import Migration


class AddPriorityToNewsTable(Migration):
    def up(self):
        """
        Run the migrations.
        """
        if not self.schema.has_column("news", "priority"):
            with self.schema.table("news") as table:
                table.integer("priority").default(0).after("id")

    def down(self):
        """
        Revert the migrations.
        """
        if self.schema.has_column("news", "priority"):
            with self.schema.table("news") as table:
                table.drop_column("priority")
