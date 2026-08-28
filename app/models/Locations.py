""" Locations Model """

from masoniteorm.models import Model


class Locations(Model):
    """Locations Model"""
    __fillable__ = [
        "name",
        "type",
        "latitude",
        "longitude",
        "is_routable"
        ]
    pass
