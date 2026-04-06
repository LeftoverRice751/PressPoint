from masoniteorm.migrations import Migration


class CreateUsersTable(Migration):
    def up(self):
        """Run the migrations."""
        with self.schema.create("users") as table:
            table.increments("id")
            table.string("email").unique()
            table.string("username")
            table.string("password")
            table.string("role")
            table.timestamps()


    def down(self):
        """Revert the migrations."""
        self.schema.drop("users")
