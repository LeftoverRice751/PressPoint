from masoniteorm.migrations import Migration


class AddLyricTimingsToAboutSectionsTable(Migration):
    def up(self):
        with self.schema.table("about_sections") as table:
            table.json("lyric_timings", nullable=True).after("audio_path")

    def down(self):
        with self.schema.table("about_sections") as table:
            table.drop_column("lyric_timings")
