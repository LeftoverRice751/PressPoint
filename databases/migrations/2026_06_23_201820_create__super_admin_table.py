"""Create_superAdminTable Migration."""

from masoniteorm.migrations import Migration


class Create_superAdminTable(Migration):
    def up(self):
        """
        Run the migrations.
        """
        with self.schema.create("super_admin") as table:
            table.increments("id")
            table.string("username")
            table.string("email").unique()
            table.string("password")
            table.timestamps()

    def down(self):
        """
        Revert the migrations.
        """
        self.schema.drop("super_admin")
