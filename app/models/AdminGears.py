""" AdminGears Model """

from masoniteorm.models import Model


class AdminGears(Model):
    """AdminGears Model"""
    __fillable__ = ["admin_username", "admin_password", "admin_email", "role"]
    __hidden__ = ["admin_password"]
    __auth__ = "admin_username"

    pass
