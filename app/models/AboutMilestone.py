""" AboutMilestone Model """

from masoniteorm.models import Model


class AboutMilestone(Model):
    """Child rows of the History section, rendered as a timeline."""

    __table__ = "about_milestones"
    __fillable__ = [
        "year",
        "heading",
        "body_html",
        "image_path",
        "sort_order",
    ]
