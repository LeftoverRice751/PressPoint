from masoniteorm.migrations import Migration


class AddRememberTokenToUsersTable(Migration):
    def up(self):
        with self.schema.table("users") as table:
            table.string("remember_token", nullable=True).after("role")
    def down(self):
        with self.schema.table("users") as table:
            table.drop_column("remember_token")