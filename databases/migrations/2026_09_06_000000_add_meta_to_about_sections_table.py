from masoniteorm.migrations import Migration


class AddMetaToAboutSectionsTable(Migration):
    """Per-section display copy that used to be hardcoded.

    The kiosk's About page renders a lot of short strings that no editor could
    touch: the hub hero, the one-line hint under each index row, the prev/next
    short labels, the quality policy footer, the values band, and the six seal
    hotspot callouts (which lived in a Python constant in AboutController).
    Rather than a column per string, each section carries a small JSON bag whose
    keys are whitelisted per slug in AboutContent.DEFAULT_META — a null `meta`
    falls back to those defaults, so this migration is a no-op for the kiosk
    until an editor actually saves something.
    """

    def up(self):
        with self.schema.table("about_sections") as table:
            table.json("meta", nullable=True).after("lyric_timings")

    def down(self):
        with self.schema.table("about_sections") as table:
            table.drop_column("meta")
