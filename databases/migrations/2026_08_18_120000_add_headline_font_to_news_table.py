"""AddHeadlineFontToNewsTable Migration."""

from masoniteorm.migrations import Migration


class AddHeadlineFontToNewsTable(Migration):
    def up(self):
        """Run the migrations.

        Per-story font for the headline/dek furniture, chosen from the
        composer's "Headline font" dropdown. Nullable, and NULL means "use the
        brand face" — which is what every existing row wants, so no backfill.

        A slug, not a CSS font-family: the value is validated against
        NEWSLETTER_FONTS in NewsController and rendered as a `story-font-<slug>`
        class, so a bad value can never reach the page as CSS.
        """
        with self.schema.table("news") as table:
            table.string("headline_font", 32).nullable()

    def down(self):
        """Revert the migrations."""
        with self.schema.table("news") as table:
            table.drop_column("headline_font")
