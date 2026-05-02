"""AddLayoutTypeToNewsTable Migration."""

from masoniteorm.migrations import Migration


class AddLayoutTypeToNewsTable(Migration):
    def up(self):
        if not self.schema.has_column("news", "layout_type"):
            with self.schema.table("news") as table:
                table.string("layout_type").default("secondary").after("location")

    def down(self):
        if self.schema.has_column("news", "layout_type"):
            with self.schema.table("news") as table:
                table.drop_column("layout_type")
