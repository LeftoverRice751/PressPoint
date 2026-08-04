"""AddExcerptToNewsTable Migration."""

from masoniteorm.migrations import Migration


class AddExcerptToNewsTable(Migration):
    """Short summary/teaser text for a story, distinct from `dek` (standfirst)."""

    def up(self):
        if not self.schema.has_column("news", "excerpt"):
            with self.schema.table("news") as table:
                table.string("excerpt").nullable()

    def down(self):
        if self.schema.has_column("news", "excerpt"):
            with self.schema.table("news") as table:
                table.drop_column("excerpt")
