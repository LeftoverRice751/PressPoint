"""Notification Model"""

from masoniteorm.models import Model


class Notification(Model):
    """Notification Model"""
    __fillable__ = [
        "user_id",
        "type",
        "title",
        "message",
        "link",
        "read_at",
    ]
