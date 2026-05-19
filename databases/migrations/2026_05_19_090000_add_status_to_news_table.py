"""AddStatusToNewsTable Migration."""

from masoniteorm.migrations import Migration


class AddStatusToNewsTable(Migration):
    def up(self):
        """Run the migrations."""
        if not self.schema.has_column("news", "status"):
            with self.schema.table("news") as table:
                table.string("status").default("approved").after("layout_type")

    def down(self):
        """Revert the migrations."""
        if self.schema.has_column("news", "status"):
            with self.schema.table("news") as table:
                table.drop_column("status")