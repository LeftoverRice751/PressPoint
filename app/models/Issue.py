"""Issue Model -- one newsletter, composed by one editor."""

from masoniteorm.models import Model
from masoniteorm.scopes import SoftDeletesMixin


class Issue(Model, SoftDeletesMixin):
    """A newsletter issue: an owner, a number, and its own set of stories.

    Until this existed there was one implicit issue -- every published story
    was "the front page", every editor edited the same canvas, and the issue
    number was derived from the lead story's date. Two editors could not work
    on two newsletters. Now the issue is a row, `news.issue_id` files a story
    into one, and everything that used to mean "all stories" means "this
    issue's stories".

    Issue STATUS is deliberately not a column. It is derived from the stories
    (see app/services/Issues.py:status_of): the per-story `status` and the
    whole pipeline behind it -- visibility, the editor's review downgrade,
    approve/reject -- keep working unchanged, and a stored copy would be a
    second source of truth those writes would have to keep in step.

    Soft-deleting, like News: an issue is the unit an admin decides on, and a
    decision should be recoverable.
    """

    __table__ = "issues"

    __fillable__ = [
        "number",
        "owner_id",
        "title",
        "published_at",
    ]

    __dates__ = ["published_at", "deleted_at"]
