""" AboutSection Model """

from masoniteorm.models import Model


class AboutSection(Model):
    """One row per fixed About LSPU section. The six rows are seeded;
    editors only ever update — never insert or delete."""

    __table__ = "about_sections"
    __fillable__ = [
        "slug",
        "title",
        "body_html",
        "subsections",
        "image_path",
        "audio_path",
        "updated_by_id",
    ]
    __casts__ = {"subsections": "json"}
