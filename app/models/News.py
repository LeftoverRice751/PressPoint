""" News Model """

from masoniteorm.models import Model
from masoniteorm.scopes import SoftDeletesMixin


class News(Model, SoftDeletesMixin):
    """News Model.

    Soft-deleting. The mixin installs a GLOBAL select scope, so every
    `News.where(...)`, `News.all()`, `News.count()` and even
    `News.select_raw(...)` compiles with `WHERE news.deleted_at IS NULL`
    appended -- the scope runs inside to_sql()/to_qmark(), after the whole
    builder chain, so nothing you chain can bypass it. Legacy newsletter rows
    soft-deleted by the old category delete stay hidden from every read site.
    Photo posts are hard-deleted (NewsController.destroy uses force_delete).

    The inverse is the thing to remember: a surface that wants tombstones
    (a restore prompt, a trash panel) MUST say `.with_trashed()` /
    `.only_trashed()` explicitly.

    One quirk worth knowing before you reason about `updated_at`: a soft
    delete does NOT bump it. SoftDeleteScope flips the action from "delete"
    to "update" from inside QueryBuilder.run_scopes()' own loop, so the
    "update"-action scopes -- TimeStampsScope among them -- are never reached
    for that statement. A restore DOES bump it, because that is a genuine
    update. DashboardContext.section_stamp() depends on that asymmetry.
    """

    # Hydrate deleted_at as a datetime rather than a raw driver value --
    # get_dates() is __dates__ + [created_at, updated_at], so without this the
    # restore prompt cannot format it.
    __dates__ = ["deleted_at", "expires_at"]

    #: NOTE: `deleted_at` is deliberately NOT fillable. Mass-assigning it would
    #: make delete and undelete reachable from any form post -- the same class
    #: of bug as `role` sitting in User.__fillable__ (see ProfileController).
    __fillable__ = [
        "title",
        "description",
        "image",
        "published_at",
        "status",
        # Who wrote it, and who touched it last. Both users.id, both nullable
        # (ON DELETE SET NULL) so removing a staff account never removes their
        # posts. `author_id` is set once on create; `updated_by_id` is
        # rewritten by every save.
        "author_id",
        "updated_by_id",
        # Why an admin sent this post back. Set on reject, cleared on resubmit.
        "rejection_reason",
        # Photo-post fields. `expires_at` is aware-UTC (editor input is campus
        # local); the rest are plain text, `image_crop`/`source_lines` JSON.
        "kicker",
        "logo_path",
        "image_crop",
        "source_lines",
        "element_layout",
        "expires_at",
    ]
    pass
