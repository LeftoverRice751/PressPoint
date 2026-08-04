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

    Safety: `craft migrate` only ever runs a given migration file once per
    environment — but `craft migrate:rollback` followed by `craft migrate`
    IS a reachable way to re-run this file's `up()` against data this same
    migration already flipped. `down()` is a deliberate no-op (a data
    reshuffle has no recorded "before" state), so a rollback+re-migrate
    doesn't undo anything first — it just calls `up()` again on already-
    ascending data. Sorting an already-1..N-ascending sequence by the OLD
    descending key `(-priority, -id)` produces the exact reverse order,
    which then gets written back as a fresh 1..N — silently flipping the
    entire front page end to end. To guard against that, `up()` bails out
    immediately if the existing priorities already form a dense 1..N
    permutation (exactly what one successful run of this migration, or an
    app that has otherwise kept priorities dense, produces) — that state
    is treated as "already done", not as new data to re-derive an order
    from.

    Only touches rows that exist when it runs; any row created afterward is
    written directly by the application under the new ascending convention
    and is never revisited by this file.
    """

    def up(self):
        reader = QueryBuilder(connection=self.schema.connection, table="news")
        rows = reader.select("id", "priority").get()

        if not rows:
            return

        existing_priorities = sorted(int(row["priority"] or 0) for row in rows)
        if existing_priorities == list(range(1, len(rows) + 1)):
            # Already a dense ascending 1..N permutation — this is exactly
            # what a prior run of this migration leaves behind. Re-deriving
            # an order from the OLD descending key against data that is
            # already ascending would reverse it, so treat this as done.
            return

        ordered = sorted(
            rows,
            key=lambda row: (
                -int(row["priority"] or 0),
                -int(row["id"] or 0),
            ),
        )

        # Share one connection/transaction across every UPDATE so a failure
        # partway through leaves the table untouched instead of half
        # renumbered (which a retry would then read back under the OLD key
        # and mis-order).
        connection = QueryBuilder(connection=self.schema.connection, table="news").new_connection()
        connection.begin()
        try:
            for index, row in enumerate(ordered, start=1):
                updater = QueryBuilder(connection=self.schema.connection, table="news")
                updater._connection = connection
                updater.where("id", row["id"]).update({"priority": index})
        except Exception:
            connection.rollback()
            raise
        else:
            connection.commit()

    def down(self):
        # Purely a data reshuffle - there is no recorded "before" state to
        # restore to, so this is intentionally not reversible.
        pass
