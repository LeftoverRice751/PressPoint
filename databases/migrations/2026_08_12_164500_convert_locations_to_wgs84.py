"""ConvertLocationsToWgs84 Migration."""

from masoniteorm.migrations import Migration
from masoniteorm.query import QueryBuilder

from app.services import CampusGeo


class ConvertLocationsToWgs84(Migration):
    """Turn the locations table's fake coordinates into real ones.

    `latitude` / `longitude` have never held coordinates. They hold pixel
    positions on campus-map.png in Leaflet's CRS.Simple space — Main Gate is
    stored as (111.00, 620.00). This rewrites all of them as true WGS84 using
    the QGIS georeferencing in app/services/CampusGeo.py, and narrows the
    columns to decimal(10,7) so a coordinate actually fits.

    Why not a plain ALTER on the existing columns: the current values run up
    to 1113.00 and decimal(10,7) tops out at 999.9999999, so changing the type
    before rewriting the data overflows it. New columns are added, backfilled,
    and then swapped into place, which never has the old magnitudes and the
    new precision in the same column at the same time.

    Re-running is safe. `up()` bails out if the stored latitudes are already
    within +/-90, which pixel values (which reach 1113) can never be.

    Two things the add/swap approach costs, both measured on a rehearsal
    against a copy of the live table and both accepted:

    - `latitude` and `longitude` end up last in the column order instead of
      in their original position. Everything reads them by name, so this only
      matters to a positional `INSERT ... VALUES`. The mysqldump in
      storage/backups/ carries its own CREATE TABLE, so restoring it is
      unaffected.
    - `down()` returns to within ~0.03 px rather than to the byte-identical
      value: seven decimal places of WGS84 is about 11 mm, and rounding that
      back into decimal(12,2) can shift a pixel value by 0.01. Main Gate
      makes the trip 111.00 -> 14.2617464 -> 110.99. That is 1/50th of a
      pixel and invisible on the kiosk, but it does mean `down()` is a
      practical revert, not a bit-exact one. Restore the dump if you need
      the original numbers back exactly.
    """

    #: decimal(10,7) holds seven decimal places, ~11 mm at this latitude.
    COORDINATE_PLACES = 7

    def up(self):
        """Run the migrations."""
        if self._already_converted():
            return

        qb = QueryBuilder(connection=self.schema.connection, table="locations")
        rows = qb.select("id", "latitude", "longitude").get()

        # Nullable to start with: they have to exist before they can be filled.
        if not self.schema.has_column("locations", "latitude_wgs84"):
            qb.statement(
                "ALTER TABLE locations "
                "ADD COLUMN latitude_wgs84 DECIMAL(10,7) NULL, "
                "ADD COLUMN longitude_wgs84 DECIMAL(10,7) NULL"
            )

        # One transaction for the whole backfill. A failure halfway through
        # would otherwise leave some rows converted and some not, with nothing
        # in the row itself to say which is which.
        connection = QueryBuilder(
            connection=self.schema.connection, table="locations"
        ).new_connection()
        connection.begin()
        try:
            for row in rows:
                map_x = float(row["longitude"])
                map_y = float(row["latitude"])
                lat, lng = CampusGeo.to_wgs84(map_x, map_y)

                updater = QueryBuilder(connection=self.schema.connection, table="locations")
                updater._connection = connection
                updater.where("id", row["id"]).update(
                    {
                        "latitude_wgs84": round(lat, self.COORDINATE_PLACES),
                        "longitude_wgs84": round(lng, self.COORDINATE_PLACES),
                    }
                )
        except Exception:
            connection.rollback()
            raise
        else:
            connection.commit()

        qb.statement("ALTER TABLE locations DROP COLUMN latitude, DROP COLUMN longitude")
        qb.statement(
            "ALTER TABLE locations "
            "CHANGE COLUMN latitude_wgs84 latitude DECIMAL(10,7) NOT NULL, "
            "CHANGE COLUMN longitude_wgs84 longitude DECIMAL(10,7) NOT NULL"
        )

    def down(self):
        """Revert the migrations."""
        if not self._already_converted():
            return

        qb = QueryBuilder(connection=self.schema.connection, table="locations")
        rows = qb.select("id", "latitude", "longitude").get()

        if not self.schema.has_column("locations", "latitude_pixel"):
            qb.statement(
                "ALTER TABLE locations "
                "ADD COLUMN latitude_pixel DECIMAL(12,2) NULL, "
                "ADD COLUMN longitude_pixel DECIMAL(12,2) NULL"
            )

        connection = QueryBuilder(
            connection=self.schema.connection, table="locations"
        ).new_connection()
        connection.begin()
        try:
            for row in rows:
                map_x, map_y = CampusGeo.to_pixel(
                    float(row["latitude"]), float(row["longitude"])
                )

                updater = QueryBuilder(connection=self.schema.connection, table="locations")
                updater._connection = connection
                updater.where("id", row["id"]).update(
                    {
                        "latitude_pixel": round(map_y, 2),
                        "longitude_pixel": round(map_x, 2),
                    }
                )
        except Exception:
            connection.rollback()
            raise
        else:
            connection.commit()

        qb.statement("ALTER TABLE locations DROP COLUMN latitude, DROP COLUMN longitude")
        qb.statement(
            "ALTER TABLE locations "
            "CHANGE COLUMN latitude_pixel latitude DECIMAL(12,2) NOT NULL, "
            "CHANGE COLUMN longitude_pixel longitude DECIMAL(12,2) NOT NULL"
        )

    def _already_converted(self):
        """True when latitude already looks like a coordinate rather than a pixel.

        Pixel latitudes span 0..1113, so anything inside +/-90 has been
        converted. Checking the values rather than the column type keeps this
        working against the live schema, which has drifted from the migration
        history.
        """
        rows = (
            QueryBuilder(connection=self.schema.connection, table="locations")
            .select("latitude")
            .get()
        )

        values = [abs(float(row["latitude"])) for row in rows if row["latitude"] is not None]
        return bool(values) and max(values) <= 90
