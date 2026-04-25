""" Archives Model """

from masoniteorm.models import Model


class Archives(Model):
    """Archives Model"""

    __fillable__ = ["folio", "name", "type", "file_path"]

    pass
