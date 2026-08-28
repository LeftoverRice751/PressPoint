"""AddSortOrderToMembersTable Migration."""

from masoniteorm.migrations import Migration


class AddSortOrderToMembersTable(Migration):
    """Adds members.sort_order -- but only when `members` already exists.

    This migration is dated 2026_05_12 while the migration that CREATES
    `members` is dated 2026_07_02, so on a fresh database this runs first and
    the table is not there yet. `has_column()` does not save us: on MySQL it
    raises (1146, "Table 'x.members' doesn't exist") rather than returning
    False, so the existing guard only ever worked on a database that already
    had the table -- i.e. production.

    Skipping is the correct behaviour, not a workaround: the later
    CreateMembersTable already declares `sort_order` itself, so a clean replay
    ends with exactly the same schema either way. Do not "fix" this by
    renaming the file to sort after the create -- the `migrations` table keys
    its history by filename, so a rename makes production re-run it.
    """

    def up(self):
        if not self.schema.has_table("members"):
            return

        if not self.schema.has_column("members", "sort_order"):
            with self.schema.table("members") as table:
                table.integer("sort_order").default(0).after("parent_id")

    def down(self):
        if not self.schema.has_table("members"):
            return

        if self.schema.has_column("members", "sort_order"):
            with self.schema.table("members") as table:
                table.drop_column("sort_order")
