""" News Model """

from masoniteorm.models import Model


class News(Model):
    """News Model"""
    __fillable__ = ["title", "description", "image", "published_at", "source", "location"]
    pass
