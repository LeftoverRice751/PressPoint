"""CreateNewsCategoriesTable Migration.

Stories had `layout_type` (where they sit on the front page) and `status` (how
far through review they are), but nothing saying what they are ABOUT. This is
that column's table, and it is shared across every editor and session --
categories were never allowed to be client-side state.

Two decisions worth reading before altering this table.

`name_key` exists rather than a plain UNIQUE(name). MySQL's utf8mb4_unicode_ci
would already fold "Sports"/"sports", so case alone did not need a column --
but it would NOT fold "Campus  News" / "Campus News" / " Campus News ", which
is the collision editors actually produce. Putting the normaliser in
app/services/NewsCategories.normalise() and indexing its output keeps the rule
readable, instead of resting it on a COLLATE clause that also folds sharp-s to
"ss" and weights punctuation in ways nobody predicts from the DDL. It also
survives the .env.testing/sqlite trap CLAUDE.md documents, where UNIQUE is
case-SENSITIVE BINARY.

The unique index deliberately does NOT include `deleted_at`. MySQL treats
NULLs as distinct in a unique index, so UNIQUE(name_key, deleted_at) would
permit unlimited LIVE duplicates and enforce uniqueness only among tombstones
-- the exact opposite of the intent. The consequence, which the create path
depends on: at most one row per normalised name ever exists, live or deleted,
and a deleted name stays occupied by its tombstone. That is what makes
"detect the soft-deleted match and offer to restore it" coherent -- the lookup
returns one unambiguous candidate, never a set to choose between.
"""

from masoniteorm.migrations import Migration


class CreateNewsCategoriesTable(Migration):
    def up(self):
        """
        Run the migrations.
        """
        with self.schema.create("news_categories") as table:
            table.increments("id")
            # Display form: keeps the editor's own capitalisation, and is what
            # the kiosk renders at the top of each story.
            table.string("name", 80)
            # Lookup form: normalised, and the only thing uniqueness is on.
            table.string("name_key", 80).unique()
            table.timestamps()
            # updated_at is not just audit here -- DashboardContext's
            # section_stamp() is count:max(updated_at), and the dashboard
            # liveness poll needs a stamp for this section. Without the
            # column, section_stamp throws, returns "0:", and the panel reads
            # as "never changed" forever.
            table.soft_deletes()

    def down(self):
        """
        Revert the migrations.
        """
        self.schema.drop("news_categories")
