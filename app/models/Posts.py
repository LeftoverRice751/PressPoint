""" Posts Model """

from masoniteorm.models import Model


class Posts(Model):
    """Posts Model"""
    __fillable__ = [
        "title",
        "content",
        "description",
        "event_date",
        "location_id",
        "status",
        "published_at",
        "category_id",
        "author_id"
        ]
    pass
