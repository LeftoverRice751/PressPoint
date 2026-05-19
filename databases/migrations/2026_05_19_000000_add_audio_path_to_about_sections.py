"""AddAudioPathToAboutSections Migration."""
from masoniteorm.migrations import Migration


class AddAudioPathToAboutSections(Migration):
    def up(self):
        with self.schema.table("about_sections") as table:
            table.string("audio_path", 255).nullable()

    def down(self):
        with self.schema.table("about_sections") as table:
            table.drop_column("audio_path")
