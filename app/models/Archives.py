""" Archives Model """

from masoniteorm.models import Model


class Archives(Model):
    """Archives Model"""
    __fillable__ = ["name", "type", "date", "file_path"]
    pass
