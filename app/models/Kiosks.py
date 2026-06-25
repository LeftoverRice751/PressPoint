""" Kiosks Model """

from masoniteorm.models import Model


class Kiosks(Model):
    """Kiosks Model"""
    __fillable__ = [
        "name", 
        "last_sync_at", 
        "is_online"
        ]
    pass
