"""Category logic for news stories: normalise, resolve, cascade, restore.

Controllers stay thin (see CLAUDE.md); NewsCategoryController is routing and
response shaping, and everything that decides anything lives here.

The awkward part of this module is that a category delete is a SOFT delete
that cascades to stories, and the name it occupied stays occupied by the
tombstone. That combination is deliberate -- see NewsCategory's docstring for
why the unique index excludes deleted_at -- and it is what forces the
three-outcome create contract in resolve_or_offer().
"""

from app.models.News import News
from app.models.NewsCategory import NewsCategory
from app.services import KioskBroadcast, NewsCache


#: Matches the varchar(80) in the schema. A category is a one-word kiosk
#: label, not prose.
MAX_NAME_LENGTH = 80

#: Seeded by the backfill migration and assigned to every story that predates
#: categories. An ORDINARY category in every other respect -- it is renameable
#: and, per the agreed permission model, any editor can delete it, which would
#: hide every legacy story at once. The delete confirmation states the count.
DEFAULT_CATEGORY_KEY = "uncategorized"


def normalise(raw):
    """Return (display_name, lookup_key) for a user-typed category name.

    `" ".join(split())` collapses runs of internal whitespace and strips the
    ends in one pass, so "  Campus   News " and "Campus News" are the same
    category. casefold(), not lower(), because casefold is the aggressive form
    intended for caseless matching.

    Returns (None, None) when the input is empty or over length -- the caller
    turns that into a validation error rather than this raising, because the
    only source is a text input an editor can typo.
    """
    name = " ".join(str(raw or "").split())
    if not name or len(name) > MAX_NAME_LENGTH:
        return None, None
    return name, name.casefold()


def live():
    """Every category an editor may assign to, oldest first.

    The global soft-delete scope excludes tombstones with no where clause
    here; that is the whole point of the mixin.
    """
    try:
        return list(NewsCategory.order_by("name", "asc").get() or [])
    except Exception:
        return []


def names_by_id():
    """{id: display name} for every LIVE category.

    One query, used to decorate the kiosk projection. Mirrors how
    DashboardContext.author_names() resolves author_id -- deliberately not an
    ORM relationship: with ~20 stories and well under 20 categories there is
    no N+1 to avoid, and a relationship would be a second thing to configure
    and keep in sync.
    """
    return {getattr(row, "id", None): getattr(row, "name", None) for row in live()}


def find_live(category_id):
    """The live category with this id, or None.

    Used by store() to validate a posted category_id. A soft-deleted id
    returns None here (global scope), which is the correct answer: assigning
    a story to a tombstone would blank its kiosk label.
    """
    try:
        return NewsCategory.where("id", category_id).first()
    except Exception:
        return None


def story_count(category_id, trashed=False):
    """How many stories sit in this category.

    `trashed=False` counts live stories -- what the delete confirmation must
    state. `trashed=True` counts tombstones -- what the restore prompt must
    state. Both are one COUNT; neither loads a row.

    For a WHOLE LIST of categories use story_counts() below instead: this is
    one query per category, and the modal renders every category at once.
    """
    try:
        query = News.only_trashed() if trashed else News
        return int(query.where("category_id", category_id).count() or 0)
    except Exception:
        return 0


def story_counts():
    """{category_id: live story count} for every category, in ONE query.

    Uses the same GROUP BY helper the dashboard's other counters use rather
    than a COUNT per row -- describe_all() renders the entire category list on
    every dashboard page load, so per-row counting is an N+1 in the hot path.

    Keys come back as the raw column values, which for an int column is what
    the caller's `category.id` already is.
    """
    from app.services.DashboardContext import grouped_counts

    return grouped_counts(News, "category_id") or {}


def _describe(category, trashed=False, counts=None):
    """The JSON shape every category endpoint returns for a single row."""
    category_id = getattr(category, "id", None)
    payload = {
        "id": category_id,
        "name": getattr(category, "name", None),
    }
    if trashed:
        deleted_at = getattr(category, "deleted_at", None)
        payload["deleted_at"] = (
            deleted_at.isoformat() if hasattr(deleted_at, "isoformat") else None
        )
        payload["deleted_label"] = (
            deleted_at.strftime("%b %d, %Y") if hasattr(deleted_at, "strftime") else None
        )
        payload["trashed_story_count"] = story_count(category_id, trashed=True)
    elif counts is not None:
        payload["story_count"] = int(counts.get(category_id, 0) or 0)
    else:
        payload["story_count"] = story_count(category_id)
    return payload


def describe(category, counts=None):
    """Public wrapper: a live category as the modal's list expects it."""
    return _describe(category, counts=counts)


def describe_all(categories=None):
    """Every live category as a dict, with story counts from one GROUP BY.

    This is what the template iterates. The list has to be dicts rather than
    model rows because the partial reads `category.story_count`, which is not
    a column -- on a model row Jinja would resolve it to Undefined and render
    an empty count with no error.
    """
    rows = live() if categories is None else categories
    counts = story_counts()
    return [_describe(row, counts=counts) for row in rows]


def _outcome_for(existing):
    """Turn an existing row -- live or tombstone -- into its outcome tuple."""
    if getattr(existing, "deleted_at", None):
        return "restorable", _describe(existing, trashed=True)
    return "exists", _describe(existing)


def resolve_or_offer(raw_name):
    """Create a category, or report what already holds that name.

    Returns (outcome, payload) where outcome is one of:

      "created"     -- a new row exists; payload describes it.
      "exists"      -- a LIVE row already holds the name. This is a SUCCESS,
                       not an error: the caller's actual goal is "give me a
                       category id to assign this story to", and that goal is
                       met. Returning it through json_errors would be wrong --
                       that envelope has no payload slot, so the modal would
                       have to parse an id out of an English sentence.
      "restorable"  -- a SOFT-DELETED row holds the name. Deliberately NOT
                       auto-restored: restoring resurrects every story that
                       was cascade-deleted with it, published ones included,
                       straight back onto the campus kiosk. That needs a
                       second, explicit click.

    The caller maps outcomes to HTTP status; the browser switches on the
    outcome string, never on the status.
    """
    name, key = normalise(raw_name)
    if not name:
        return "invalid", None

    existing = NewsCategory.with_trashed().where("name_key", key).first()
    if existing:
        return _outcome_for(existing)

    try:
        created = NewsCategory.create({"name": name, "name_key": key})
    except Exception:
        # Lost a race: two editors posted the same new name, both lookups
        # missed, and the other INSERT landed first. Re-select rather than
        # surfacing a driver-specific IntegrityError -- masonite-orm does not
        # wrap driver exceptions and the class differs between connectors, so
        # catching by type would be catching the wrong thing on some installs.
        #
        # Re-raising when the re-select finds NOTHING is what stops this
        # swallowing a genuine error: a failure that isn't a uniqueness
        # collision leaves no row to find.
        duplicate = NewsCategory.with_trashed().where("name_key", key).first()
        if not duplicate:
            raise
        return _outcome_for(duplicate)

    NewsCache.forget()
    # A category label is printed on the kiosk, so the terminal is told too.
    KioskBroadcast.section_changed("latest-news")
    return "created", _describe(created)


def rename(category_id, raw_name):
    """Rename a live category. Same uniqueness and normalisation as create.

    Stories keep their association by foreign key, so this changes the label
    everywhere -- including the kiosk -- without touching a single news row.
    Which is exactly why it has to invalidate the news cache: nothing about
    `news` changed, so no news-side invalidation would ever fire.
    """
    name, key = normalise(raw_name)
    if not name:
        return "invalid", None

    category = find_live(category_id)
    if not category:
        return "missing", None

    clash = NewsCategory.with_trashed().where("name_key", key).first()
    if clash and getattr(clash, "id", None) != getattr(category, "id", None):
        return _outcome_for(clash)

    category.name = name
    category.name_key = key
    category.save()

    NewsCache.forget()
    KioskBroadcast.section_changed("latest-news")
    return "renamed", _describe(category)


def soft_delete_cascade(category_id):
    """Soft-delete a category and every story assigned to it.

    Both halves are recoverable -- that is the entire point, and it is why
    this is reachable by any editor rather than admins only. The guard is the
    confirmation dialog's story count, not a role.

    Note the ordering: stories first, then the category. If the category went
    first, a failure partway would leave a hidden category whose stories are
    still on the public kiosk -- the one outcome worse than either extreme.
    """
    category = find_live(category_id)
    if not category:
        return "missing", None

    affected = story_count(category_id)

    # Bulk update, not a loop of record.delete(): one statement, and it cannot
    # half-apply.
    #
    # Note this re-stamps `deleted_at` on stories in this category that were
    # ALREADY individually deleted -- the soft-delete scope only filters
    # SELECTs, so the generated `UPDATE news SET deleted_at = now WHERE
    # category_id = ?` carries no `deleted_at IS NULL` clause. Harmless,
    # because restore_cascade brings back every tombstone in the category
    # regardless of when it was stamped; `affected` is counted before this
    # runs, so the number reported to the editor still means "stories that
    # were visible and now are not".
    News.where("category_id", category_id).delete()
    category.delete()

    NewsCache.forget()
    KioskBroadcast.section_changed("latest-news")
    return "deleted", {
        "id": getattr(category, "id", None),
        "name": getattr(category, "name", None),
        "deleted_stories": affected,
    }


def restore_cascade(category_id):
    """Bring back a soft-deleted category and the stories that went with it.

    Symmetric with soft_delete_cascade by design: a delete that cascades and
    a restore that does not would be a trap, leaving an editor with an empty
    category and no obvious way to get their stories back.

    Accepted limitation: stories carry no "why deleted" marker, so this also
    restores stories that were deleted INDIVIDUALLY before the category went.
    The confirmation states the exact count, so nothing is silent. The upgrade
    path, if editors ever complain, is a `news.deleted_via_category_id`
    column -- deliberately not built for one button.
    """
    category = NewsCategory.only_trashed().where("id", category_id).first()
    if not category:
        return "missing", None

    affected = story_count(category_id, trashed=True)

    # Category first here, mirroring the delete's ordering rule: a partial
    # failure must never leave stories publicly visible under a category that
    # is still hidden.
    NewsCategory.with_trashed().where("id", category_id).update({"deleted_at": None})
    News.with_trashed().where("category_id", category_id).update({"deleted_at": None})

    NewsCache.forget()
    KioskBroadcast.section_changed("latest-news")
    restored = NewsCategory.where("id", category_id).first()
    return "restored", {
        "id": category_id,
        "name": getattr(restored, "name", None),
        "restored_stories": affected,
    }


def default_category_id():
    """The seeded 'Uncategorized' category's id, or None if it is gone.

    Used as the fallback when a story arrives with no category -- which should
    not happen through the composer, but `category_id` is NOT NULL and a
    write that fails a database constraint is a worse failure mode than a
    story landing in Uncategorized.
    """
    row = NewsCategory.where("name_key", DEFAULT_CATEGORY_KEY).first()
    return getattr(row, "id", None) if row else None
