"""User Model."""
from masoniteorm.models import Model
from masonite.authentication import Authenticates


class User(Model, Authenticates):
    """User Model."""

    # NOTE: `role` is fillable, so `User.create(request.all())` or
    # `user.update(request.all())` on any user-facing form is privilege
    # escalation — an editor posting role=admin would be obeyed. Every write
    # path here assigns attributes one at a time on purpose; see
    # ProfileController.update. Do not "tidy" that into a mass assignment.
    __fillable__ = [
        "username",
        "email",
        "password",
        "role",
        "remember_token",
        # Display name shown in the profile border and as the byline in the
        # review queue. Nullable — falls back to `username`, which is what
        # every account had before this column existed.
        "full_name",
        # NAS-relative path ("Profiles/avatar-a1b2c3d4.png"), resolved through
        # StorageRouter. NULL, or a path whose file is missing, renders initials.
        "avatar_path",
        ]
    __hidden__ = ["password"]
    __auth__ = "username"
