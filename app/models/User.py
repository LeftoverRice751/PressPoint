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
    __hidden__ = ["password", "remember_token"]
    __auth__ = "username"

    def set_remember_token(self, token=None):
        """Store the session token hashed; keep the plaintext on this instance.

        Overrides Masonite's, which writes a bare uuid4 to the column. Its own
        attempt() and attempt_by_id() call this and then save(), so the login
        path picks the hash up without any change of its own. The cookie value
        comes from SessionTokens.plain_token(user) -- see that module.
        """
        from app.services import SessionTokens

        SessionTokens.remember(self, str(token) if token else SessionTokens.new_token())
        return self
