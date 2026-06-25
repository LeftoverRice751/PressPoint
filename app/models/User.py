"""User Model."""
from masoniteorm.models import Model
from masonite.authentication import Authenticates


class User(Model, Authenticates):
    """User Model."""

    __fillable__ = [
        "username", 
        "email", 
        "password", 
        "role", 
        "remember_token"
        ]
    __hidden__ = ["password"]
    __auth__ = "username"
