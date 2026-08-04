"""FlipNewsPriorityToAscending Migration."""

from masoniteorm.migrations import Migration
from masoniteorm.query import QueryBuilder


class FlipNewsPriorityToAscending(Migration):
    """One-time data migration.

    The news slot sort key is flipping from descending priority (higher
    number sorts first) to ascending (lower number sorts first), so the
    dashboard's "Position #1 = first" label is actually true.

    This rewrites the `priority` values on every existing row so that the
    story order visible today — computed under the OLD key
    `(-priority, -id)` — is reproduced exactly once everything is re-sorted
    under the NEW key `(priority, id)`. Each row gets a fresh, dense,
    1-based priority in that order.

    Safety: like every other Masonite migration, this file is recorded in
    the migrations table and only ever runs once per environment (a normal
    `craft migrate` is a no-op the second time). It only touches rows that
    exist at the moment it runs; any row created afterward is written
    directly by the application under the new ascending convention and is
    never revisited by this file.
    """

    def up(self):
        reader = QueryBuilder(connection=self.schema.connection, table="news")
        rows = reader.select("id", "priority").get()

        ordered = sorted(
            rows,
            key=lambda row: (
                -int(row["priority"] or 0),
                -int(row["id"] or 0),
            ),
        )

        for index, row in enumerate(ordered, start=1):
            QueryBuilder(connection=self.schema.connection, table="news").where(
                "id", row["id"]
            ).update({"priority": index})

    def down(self):
        # Purely a data reshuffle - there is no recorded "before" state to
        # restore to, so this is intentionally not reversible.
        pass
