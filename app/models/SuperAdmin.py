""" SuperAdmin Model """

from masoniteorm.models import Model


class SuperAdmin(Model):
    """SuperAdmin Model"""
    __fillable__ = [
        'username', 
        'email', 
        'password', 
        'remember_token'
        ]
    __hidden__ = ['password']
    __auth__ = 'username'
    pass
