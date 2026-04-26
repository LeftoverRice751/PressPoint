"""CreatePasswordResetTable Migration."""

from masoniteorm.migrations import Migration


class CreatePasswordResetTable(Migration):
    def up(self):
        """
        Run the migrations.
        """
        with self.schema.create("password_resets") as table:
            table.increments("id")
            table.string("email")
            table.string("token")
            table.datetime("expires_at").nullable()

            table.timestamps()

    def down(self):
        """
        Revert the migrations.
        """
        self.schema.drop("password_resets")
