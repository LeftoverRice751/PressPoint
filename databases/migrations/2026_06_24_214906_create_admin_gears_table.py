from masoniteorm.migrations import Migration


class CreateAdminGearsTable(Migration):
    def up(self):
        """
        Run the migrations.
        """
        with self.schema.create("admin_gears") as table:
            table.increments("id")
            table.string("admin_username").unique()
            table.string("admin_email").unique()
            table.string("admin_password")
            table.string("role").default("admin")
            table.timestamps()

    def down(self):
        """
        Revert the migrations.
        """
        self.schema.drop("admin_gears")
