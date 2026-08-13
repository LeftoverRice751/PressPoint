"""AddPositionToMembersTable Migration."""

from masoniteorm.migrations import Migration


class AddPositionToMembersTable(Migration):
    def up(self):
        if not self.schema.has_column("members", "pos_x"):
            with self.schema.table("members") as table:
                table.integer("pos_x").nullable().after("sort_order")

        if not self.schema.has_column("members", "pos_y"):
            with self.schema.table("members") as table:
                table.integer("pos_y").nullable().after("pos_x")

    def down(self):
        if self.schema.has_column("members", "pos_y"):
            with self.schema.table("members") as table:
                table.drop_column("pos_y")

        if self.schema.has_column("members", "pos_x"):
            with self.schema.table("members") as table:
                table.drop_column("pos_x")
