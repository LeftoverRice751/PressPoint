""" Video Model """

from masoniteorm.models import Model


class Video(Model):
    """Video Model"""
    __fillable__ = ["title", "file_path"]
    pass
