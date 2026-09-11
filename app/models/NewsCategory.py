""" NewsCategory Model """

from masoniteorm.models import Model
from masoniteorm.scopes import SoftDeletesMixin


class NewsCategory(Model, SoftDeletesMixin):
    """A subject classification for a news story -- "Sports", "Campus News".

    Shared across every editor and session; this is a real table, never
    client-side state. `news.category_id` is a NOT NULL foreign key into it.

    NOT the legacy `categories` table. That one (id + name, no timestamps) is
    wired to the legacy `posts` table and the read-only "Articles by Category"
    widget on the dashboard overview. Reusing it would have entangled two
    unrelated content types in one namespace.

    Uniqueness is on `name_key`, not `name`. MySQL's utf8mb4_unicode_ci would
    already fold "Sports"/"sports" on its own, but it would NOT fold
    "Campus  News" / "Campus News" / " Campus News ". `name_key` puts the
    whole normaliser in one readable place (NewsCategories.normalise) rather
    than depending on a COLLATE clause at the bottom of the DDL that also
    folds sharp-s to "ss" and weights punctuation in ways no reader predicts.
    It also survives the .env.testing/sqlite trap CLAUDE.md documents, where
    UNIQUE is case-SENSITIVE BINARY. `name` keeps the editor's own
    capitalisation, and is what the kiosk renders.

    Soft-deleting, and the unique index deliberately does NOT include
    `deleted_at`: MySQL treats NULLs as distinct in a unique index, so
    UNIQUE(name_key, deleted_at) would permit unlimited *live* duplicates and
    enforce uniqueness only among tombstones -- the exact opposite of the
    intent. The consequence is that at most one row per normalised name ever
    exists, live or deleted, and a name stays occupied by its tombstone. That
    is what makes the restore-on-duplicate flow coherent: the create path's
    lookup returns exactly one unambiguous candidate, never a set to choose
    from.
    """

    __fillable__ = [
        "name",
        "name_key",
    ]

    # Same reasoning as News: hydrate the tombstone marker as a datetime so
    # the restore prompt can format it, and never let it be mass-assigned.
    __dates__ = ["deleted_at"]
