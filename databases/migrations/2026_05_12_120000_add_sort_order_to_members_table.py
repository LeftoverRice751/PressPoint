"""AddSortOrderToMembersTable Migration."""

from masoniteorm.migrations import Migration


class AddSortOrderToMembersTable(Migration):
    def up(self):
        if not self.schema.has_column("members", "sort_order"):
            with self.schema.table("members") as table:
                table.integer("sort_order").default(0).after("parent_id")

    def down(self):
        if self.schema.has_column("members", "sort_order"):
            with self.schema.table("members") as table:
                table.drop_column("sort_order")