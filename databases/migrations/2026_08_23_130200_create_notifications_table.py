"""CreateNotificationsTable Migration."""

from masoniteorm.migrations import Migration


class CreateNotificationsTable(Migration):
    def up(self):
        """Run the migrations.

        Brings back the table 2026_08_23_120000 dropped, but for a flow that is
        actually wired this time: an admin approving or rejecting a story needs
        to tell the editor who submitted it, and a toast cannot do that — the
        editor is usually not looking at the screen when the decision happens.

        Two deliberate departures from the shape in that migration's `down()`:

        - `user_id` is an unsigned integer with a real foreign key, not a
          `string`. It was always meant to be users.id; storing it as text just
          meant nothing enforced it. ON DELETE CASCADE because a notification
          addressed to a deleted account has no meaning and nothing else joins
          to it (unlike `news.author_id`, which is SET NULL so stories survive).

        - `read_at` is indexed alongside `user_id`, because the only query this
          table ever serves is "unread count for the signed-in user", and
          dashboard-live.js asks for it every 20 seconds per open dashboard.

        Masonite's notification package is deliberately NOT used: its database
        driver in config/notification.py points at a `sqlite` connection on a
        MySQL app and has never been exercised. Rows here are written directly
        through app/models/Notification.py like every other model in the app.
        """
        with self.schema.create("notifications") as table:
            table.increments("id")
            table.integer("user_id").unsigned()
            table.foreign("user_id").references("id").on("users").on_delete("cascade")
            # "news.approved" / "news.rejected" today. Kept as a free string so
            # a new kind does not need a migration, and read only by the bell's
            # icon switch — an unknown type renders the default icon.
            table.string("type")
            table.string("title")
            table.text("message").nullable()
            # Deep link back into the dashboard, e.g. "/gears/dashboard?page=news".
            table.string("link").nullable()
            table.datetime("read_at").nullable()
            table.timestamps()

            table.index(["user_id", "read_at"])

    def down(self):
        """Revert the migrations."""
        self.schema.drop("notifications")
