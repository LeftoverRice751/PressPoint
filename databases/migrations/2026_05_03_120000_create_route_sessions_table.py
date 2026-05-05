"""CreateRouteSessionsTable Migration."""

from masoniteorm.migrations import Migration


class CreateRouteSessionsTable(Migration):
    def up(self):
        """
        Run the migrations.
        """
        with self.schema.create("route_sessions") as table:
            table.increments("id")

            # Random URL-safe token embedded in the QR code. The mobile page
            # is served at /m/route/<token>; the same token is used to look
            # up and finish the session.
            table.string("token", 64).unique()

            table.integer("destination_location_id").unsigned()
            table.integer("start_location_id").unsigned()
            table.integer("kiosk_id").unsigned().nullable()

            # When the QR link stops working on the phone.
            table.datetime("expires_at")
            # Set when the user taps "Finish Route" on the phone.
            table.datetime("finished_at").nullable()

            table.timestamps()

            table.foreign("destination_location_id").references("id").on("locations").on_delete("cascade")
            table.foreign("start_location_id").references("id").on("locations").on_delete("cascade")
            table.foreign("kiosk_id").references("id").on("kiosks").on_delete("set null")

    def down(self):
        """
        Revert the migrations.
        """
        self.schema.drop("route_sessions")
