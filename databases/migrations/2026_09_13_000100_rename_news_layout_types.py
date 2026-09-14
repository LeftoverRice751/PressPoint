"""RenameNewsLayoutTypes Migration.

`news.layout_type` stops being `main` / `secondary` / `widget` and becomes the
newsroom's own vocabulary: `lead`, `brief`, `photo_essay`, `editorial`, `quote`,
`notice` (plus `unassigned`, which is unchanged -- it is a destination, the
story library, not a place on the page).

The old three were never the words an editor uses. Every surface between the
column and the screen carried a translation, and the composer's block chips
could not match the stored types because there were only three of them. The
vocabulary now IS the blocks, so the chip an editor clicks, the row the outline
shows, the bucket the kiosk renders and the value in this column are one word.

    main      -> lead
    secondary -> brief
    widget    -> editorial

`widget` held two different things (an editorial and a notice) told apart only
by which cell they landed in, and that distinction does not survive in the
column -- nothing ever stored it. `editorial` is the better of the two landings:
it is the one an editor is more likely to have meant, and moving a story between
two adjacent single-capacity blocks is a click. At the time of writing no live
row carries `widget` at all, so this arm is here for completeness rather than
for data.

This is a DATA migration, the exact class that broke this repo's history
(2026_05_17_172930 runs `UPDATE news SET status = ...` before any migration has
added news.status, and a fresh `craft migrate` dies 23 migrations in because of
it -- see the header of databases/schema.sql). So it guards its own
preconditions and returns early when they are absent: a migration that cannot
run is a no-op, while one that raises stops the whole history.

Deliberately NOT a coercion. Only the three known values are mapped; anything
else is left exactly as it is. An unrecognised `layout_type` is already excluded
from every block by DashboardContext.group_news_slots -- it fails closed and the
story stays reachable in the library -- so leaving it loses nothing, whereas
sweeping it into a block would silently put unreviewed placement on a public
screen.

Both directions are idempotent: each UPDATE matches only values the other
direction produces, so a re-run or a partially-applied history cannot
double-apply.
"""

from masoniteorm.migrations import Migration
from masoniteorm.query import QueryBuilder


#: old -> new. `down()` reverses it, so this is not a one-way door.
_RENAMES = (
    ("main", "lead"),
    ("secondary", "brief"),
    ("widget", "editorial"),
)


class RenameNewsLayoutTypes(Migration):
    def up(self):
        """
        Run the migrations.
        """
        if not self.schema.has_column("news", "layout_type"):
            return

        qb = QueryBuilder(connection=self.schema.connection)

        for old, new in _RENAMES:
            qb.statement(
                "UPDATE news SET layout_type = ? WHERE layout_type = ?", [new, old]
            )

        # The column default has to move with the values, or the next INSERT
        # that omits layout_type writes a word the vocabulary no longer knows
        # and the story renders nowhere.
        qb.statement(
            "ALTER TABLE news MODIFY layout_type VARCHAR(255) NOT NULL DEFAULT 'brief'"
        )

    def down(self):
        """
        Revert the migrations.
        """
        if not self.schema.has_column("news", "layout_type"):
            return

        qb = QueryBuilder(connection=self.schema.connection)

        qb.statement(
            "ALTER TABLE news MODIFY layout_type VARCHAR(255) NOT NULL DEFAULT 'secondary'"
        )

        # `photo_essay`, `quote` and `notice` have no pre-rename equivalent --
        # they are blocks the old vocabulary could not express. They collapse to
        # `secondary`, which is where an unknown value used to land, rather than
        # being left as words the old code cannot group.
        for old, new in _RENAMES:
            qb.statement(
                "UPDATE news SET layout_type = ? WHERE layout_type = ?", [old, new]
            )

        qb.statement(
            "UPDATE news SET layout_type = 'secondary' "
            "WHERE layout_type IN ('photo_essay', 'quote', 'notice')"
        )
