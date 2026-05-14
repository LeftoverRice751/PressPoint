""" Member Model """

from masoniteorm.models import Model
from masoniteorm.relationships import belongs_to, has_many

from app.models.Departments import Departments


class Member(Model):
    """Member Model"""
    __fillable__ = ["department_id", "name", "position", "photo_path", "parent_id", "sort_order"]

    @has_many("id", "parent_id")
    def subordinates(self):
        return Member
    
    @belongs_to("parent_id", "id")
    def leader(self):
        return Member

    @belongs_to("department_id", "id")
    def department(self):
        return Departments
