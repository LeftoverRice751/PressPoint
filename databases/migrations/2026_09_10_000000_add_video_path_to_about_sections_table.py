"""AddVideoPathToAboutSections Migration.

The hymn pane plays a video now. `video_path` sits alongside `audio_path`
rather than replacing it: the kiosk prefers the video and falls back to the
audio file, so an install that has only ever uploaded an MP3 keeps working
until someone gets round to recording the video.
"""

from masoniteorm.migrations import Migration


class AddVideoPathToAboutSectionsTable(Migration):
    def up(self):
        with self.schema.table("about_sections") as table:
            table.string("video_path", 255).nullable().after("audio_path")

    def down(self):
        with self.schema.table("about_sections") as table:
            table.drop_column("video_path")
