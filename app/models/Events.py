""" Events Model """

from masoniteorm.models import Model


class Events(Model):
    """Events Model"""
    __fillable__ = [
        "title",
        "description",
        "event_date",
        "location_id",
        "is_archive"
        ]
    pass
