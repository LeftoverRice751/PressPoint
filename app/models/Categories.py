""" Categories Model """

from masoniteorm.models import Model


class Categories(Model):
    """Categories Model"""
    __fillable__ = ["name", "description"]
    pass
