""" Departments Model """

from masoniteorm.models import Model
from masoniteorm.relationships import belongs_to

from app.models.Locations import Locations


class Departments(Model):
    """Departments Model"""

    __fillable__ = ["location_id", "name"]

    @belongs_to("location_id", "id")
    def location(self):
        return Locations