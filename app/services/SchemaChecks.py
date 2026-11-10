"""Schema questions scoped to the database actually being migrated.

masonite-orm's `Schema.has_column` asks
    information_schema.columns WHERE table_name=... AND column_name=...
with no `table_schema` filter, so it answers for EVERY database the MySQL
account can see. On a server that also hosts a copy of this schema (a preview
or staging database), "does news.kicker exist?" came back True on the live
database because the copy had it, and 2026_11_09_000100 recorded itself as run
while adding none of its columns. `has_table` is scoped already; use this for
columns. tests/unit/test_post_schema.py fails if a migration calls
`schema.has_column` again.
"""

from masoniteorm.query import QueryBuilder


def column_exists(connection, table, column):
    """True when `table`.`column` exists in the current database (DATABASE())."""
    rows = QueryBuilder(connection=connection).statement(
        "SELECT COUNT(*) AS n FROM information_schema.columns "
        "WHERE table_schema = DATABASE() AND table_name = %s AND column_name = %s",
        [table, column],
    )
    return bool(rows) and int(rows[0]["n"]) > 0
