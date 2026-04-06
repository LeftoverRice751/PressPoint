""" Posts Model """

from masoniteorm.models import Model


class Posts(Model):
    """Posts Model"""
    __fillable__ = ["title", "content"]
    pass
