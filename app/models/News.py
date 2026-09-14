""" News Model """

from masoniteorm.models import Model
from masoniteorm.scopes import SoftDeletesMixin


class News(Model, SoftDeletesMixin):
    """News Model.

    Soft-deleting. The mixin installs a GLOBAL select scope, so every
    `News.where(...)`, `News.all()`, `News.count()` and even
    `News.select_raw(...)` compiles with `WHERE news.deleted_at IS NULL`
    appended -- the scope runs inside to_sql()/to_qmark(), after the whole
    builder chain, so nothing you chain can bypass it. That is what lets a
    category delete hide its stories from the kiosk, the review queue and the
    admin counters without touching any of those twelve read sites.

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
    __dates__ = ["deleted_at"]

    #: NOTE: `deleted_at` is deliberately NOT fillable. Mass-assigning it would
    #: make delete and undelete reachable from any form post -- the same class
    #: of bug as `role` sitting in User.__fillable__ (see ProfileController).
    __fillable__ = [
        "title",
        "description",
        "image",
        "published_at",
        "source",
        "location",
        "layout_type",
        "priority",
        "status",
        "dek",
        "image_caption",
        "image_credit",
        "excerpt",
        # Slug for the per-story furniture font (NULL = the brand face).
        # Validated against NEWSLETTER_FONTS in NewsController.
        "headline_font",
        # Who wrote it, and who touched it last. Both users.id, both nullable
        # (ON DELETE SET NULL) so removing a staff account never removes their
        # stories. `author_id` is set once on create; `updated_by_id` is
        # rewritten by every save, including a drag on the layout endpoint.
        "author_id",
        "updated_by_id",
        # Why an admin sent this story back. Set on reject, cleared on
        # resubmit. Column already existed in MySQL, left over from the
        # abandoned chief-editor flow -- this is the first code to read it.
        "rejection_reason",
        # The story's subject classification -- news_categories.id, NOT NULL.
        # Distinct from `layout_type` (where it sits on the front page) and
        # `status` (how far through review it is): this is what it is about.
        # NewsController.store() validates it against a LIVE category, because
        # pointing a story at a soft-deleted one blanks its kiosk label.
        "category_id",
        # Which newsletter this story belongs to -- issues.id, nullable
        # (ON DELETE SET NULL). Set once on create from the author's open
        # issue (Issues.ensure_current_for); never changed by a save, since a
        # story does not move between newsletters.
        "issue_id",
        ]
    pass
