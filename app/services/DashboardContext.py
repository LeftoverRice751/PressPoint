"""Per-section context builders for the editor dashboard.

The dashboard used to build its entire context in one controller method, so
refreshing a single list meant reloading every model on the page. Splitting it
per section lets a fragment request load only what that section renders, and
lets `full_context()` keep composing the identical context the full page has
always received.
"""

import random
from datetime import datetime
from types import SimpleNamespace

from app.models.Archives import Archives
from app.models.Organization import Organization
from app.models.Events import Events
from app.models.Locations import Locations
from app.models.Member import Member
from app.models.News import News
from app.models.TourScenes import TourScenes
from app.models.User import User
from app.models.Video import Video
from app.services import AboutValues, NewsCategories
from app.services.AboutContent import AboutContent
from app.services.ArchiveServices import ArchiveServices
from app.services.OrgBoardTree import build_org_board_organizations, organization_sort_key
from app.services.TourScenesCatalog import TourScenesCatalog


NEWS_STATUS_ALIASES = {
    "pending": "review",
    "reviewing": "review",
    "publish": "published",
    "live": "published",
}
NEWS_ALLOWED_STATUSES = {"draft", "review", "approved", "scheduled", "published", "archived"}


def normalize_news_status(raw_status, default="draft"):
    """Mirror of NewsController._normalize_news_status, kept for the dashboard's
    counting surfaces. Defaults to "draft" for the same reason: an unrecognised
    status must never be treated as one that reaches the public kiosk."""
    status = (raw_status or default or "draft").strip().lower()
    status = NEWS_STATUS_ALIASES.get(status, status)
    if status not in NEWS_ALLOWED_STATUSES:
        return default or "draft"
    return status


def section_stamp(model):
    """A cheap marker that moves whenever a section's rows change.

    Creates and updates advance `max(updated_at)`; deletes change the count.
    Both are SQL aggregates, so polling never loads the rows themselves.

    Lives here rather than in DashboardController because it has two callers
    now: the 20s liveness poll, and NewsController.layout, which uses it as an
    optimistic-concurrency token so a stale composer tab cannot overwrite
    another editor's front page. Importing the controller from the controller
    would be a cycle; both already import this module.
    """
    try:
        count = model.count()
        latest_row = model.max("updated_at").first()
        latest = getattr(latest_row, "updated_at", None) if latest_row else None
    except Exception:
        return "0:"

    return f"{count or 0}:{latest if latest is not None else ''}"


def display_name(user):
    """What to call a staff account on screen.

    `full_name` is the name they chose; `username` is the login they were
    issued. Falling back keeps every surface working for accounts that predate
    the profile fields, which is all of them right now.
    """
    if not user:
        return ""
    return (getattr(user, "full_name", None) or getattr(user, "username", None) or "").strip()


def author_names(news_items):
    """Map users.id -> display name for the authors of `news_items`.

    One query for the whole page. The Story Library renders every story, so
    resolving the author per row would be an N+1 across the entire table — and
    the composer re-renders that list on every live refresh.
    """
    wanted = {
        getattr(item, "author_id", None)
        for item in (news_items or [])
        if getattr(item, "author_id", None)
    }
    if not wanted:
        return {}

    try:
        rows = User.where_in("id", list(wanted)).get()
    except Exception:
        # Never let a byline lookup take the dashboard down; an unresolved
        # author simply renders as blank, which is what it did before.
        return {}

    return {getattr(row, "id", None): display_name(row) for row in (rows or [])}


def _by_id_desc(item):
    return getattr(item, "id", 0) or 0


def ordered_by_id(model, descending=True):
    """A section's rows, newest first, ordered by the database.

    These panels do render every row, so the rows themselves have to be
    loaded -- but the ordering does not have to happen in Python. `Model.all()`
    followed by `sorted()` pulls the whole table, materialises a model per row
    and then sorts the list; `ORDER BY id` lets MySQL walk the primary key
    instead. Exactly equivalent output, since `_by_id_desc` sorted on `id` too.

    Falls back to the unsorted read if the driver rejects the clause -- a panel
    in the wrong order is a far smaller problem than a dashboard that 500s.
    """
    direction = "desc" if descending else "asc"
    try:
        return list(model.order_by("id", direction).get() or [])
    except Exception:
        return sorted(list(model.all() or []), key=_by_id_desc, reverse=descending)


def _event_sort_key(item):
    reference_at = getattr(item, "event_date", None) or getattr(item, "created_at", None)
    if hasattr(reference_at, "timestamp"):
        return reference_at.timestamp()
    return 0


# ===== per-section builders =====


def events_context():
    events = sorted(
        list(Events.all() or []),
        key=lambda item: (_event_sort_key(item), _by_id_desc(item)),
        reverse=True,
    )
    locations = ordered_by_id(Locations, descending=False)

    return {
        "events": events,
        "location_lookup": {
            getattr(location, "id", None): getattr(location, "name", "")
            for location in locations
        },
    }


def archives_context():
    archive_services = ArchiveServices()
    archive_records = ordered_by_id(Archives)
    archive_groups_map = archive_services.group_archives_by_year(archive_records)
    archive_years = sorted(archive_groups_map.keys(), reverse=True)

    return {
        "archives": [archive_services.build_archive_entry(archive) for archive in archive_records],
        "archive_years": archive_years,
        "archive_groups": archive_groups_map,
        # Kept for parity with the original context; the kiosk picks a year to
        # feature, the dashboard panel does not read this.
        "selected_archive_year": random.choice(archive_years) if archive_years else None,
    }


def videos_context():
    return {
        "videos": ordered_by_id(Video),
    }


def post_editor_context(user_id=None):
    """The News panel's editor: an EMPTY post, i.e. what "New post" resets to.

    A blank namespace through the same card_context() the kiosk uses, so the empty
    template carries the site logo, the default crop and DEFAULT_SOURCE_LINES with
    no second definition of any of them. Loading an existing post is the browser's
    job, from the library row's JSON. `user_id` is unused today and accepted so the
    builder has the same shape as post_library_context().
    """
    from app.services import Posts

    return {
        "post_editor_card": Posts.card_context(SimpleNamespace()),
        "post_source_icons": Posts.SOURCE_ICONS,
        "post_limits": {
            "kicker": Posts.KICKER_MAX,
            "headline": Posts.HEADLINE_MAX,
            "body": Posts.BODY_MAX,
            "source_text": Posts.SOURCE_TEXT_MAX,
            "source_lines": Posts.SOURCE_LINES_MAX,
        },
    }


def post_library_context(user_id=None):
    """The signed-in editor's own posts. None (no user) is an empty list, never
    everyone's posts. Imported lazily: PostLibrary reaches NewsController, which
    imports this module."""
    from app.services import PostLibrary

    return {"post_library": PostLibrary.library_rows(user_id) if user_id else []}


#: How many events the composer's "add an event" picker lists.
CALENDAR_CHOICES_LIMIT = 50


def calendar_row(row):
    """One event as the issue's calendar block and the composer's picker read it."""
    at = getattr(row, "event_date", None)
    return {
        "id": getattr(row, "id", None),
        "title": getattr(row, "title", None),
        # Pre-formatted for the same reason published_label is: Jinja
        # cannot strftime, and the date chip wants "SEP 15".
        "chip": at.strftime("%b %d").upper() if hasattr(at, "strftime") else "",
        "iso": at.strftime("%Y-%m-%d") if hasattr(at, "strftime") else "",
    }


def upcoming_events(limit=CALENDAR_CHOICES_LIMIT):
    """Events an editor can still choose for a newsletter, nearest first.

    From the START of today, not from now: the Add Event form sends a date
    only, so an event today is stored at 00:00 and comparing to the clock
    dropped it the moment it was saved. `events.event_date` is a naive local
    `datetime NOT NULL`, so a naive campus-local bound is right.

    What a newsletter actually shows is its own choice; see IssueCalendar.
    """
    # Imported here: Issues imports normalize_news_status from this module.
    from app.services import Issues

    today = Issues.campus_now().strftime("%Y-%m-%d")
    try:
        rows = (
            Events.where("is_archive", 0)
            .where("event_date", ">=", f"{today} 00:00:00")
            .order_by("event_date", "asc")
            .limit(limit)
            .get()
        )
    except Exception:
        # The picker is one control on the composer. A DB hiccup here must not
        # take the dashboard down with it.
        return []

    return [calendar_row(row) for row in rows]


def locations_context():
    locations = ordered_by_id(Locations, descending=False)

    return {
        "locations": locations,
        "location_lookup": {
            getattr(location, "id", None): getattr(location, "name", "")
            for location in locations
        },
        "location_count": len(locations),
    }


def org_board_context():
    """Organizations and their member trees, for the org board panel.

    There used to be an `ensure_departments_for_locations()` alongside this that
    created a `departments` row for every Department-type location on each full
    page render, and this builder then filtered the list back down to rows whose
    `location_id` resolved to such a location. That made editor-created rows
    invisible and meant the board could never show a student organization.
    Organizations are now plain editor-owned records: no locations, no filter,
    no write on render.
    """
    organizations = sorted(
        list(Organization.all() or []),
        key=organization_sort_key,
    )
    org_board_members = sorted(
        list(Member.all() or []),
        key=lambda item: (
            getattr(item, "organization_id", 0) or 0,
            getattr(item, "parent_id", 0) or 0,
            getattr(item, "sort_order", 0) or 0,
            (getattr(item, "name", "") or "").lower(),
            getattr(item, "id", 0) or 0,
        ),
    )
    org_board_organizations = build_org_board_organizations(organizations, org_board_members)
    member_counts = {}
    for member in org_board_members:
        organization_id = getattr(member, "organization_id", None)
        member_counts[organization_id] = member_counts.get(organization_id, 0) + 1

    return {
        "organizations": organizations,
        "organization_lookup": {
            getattr(organization, "id", None): getattr(organization, "name", "")
            for organization in organizations
        },
        # Grouped for the dashboard's <optgroup> dropdowns, in KINDS order.
        "organization_groups": [
            {
                "kind": kind,
                "label": Organization.KIND_LABELS[kind],
                "rows": [row for row in org_board_organizations if row["kind"] == kind],
            }
            for kind in Organization.KINDS
        ],
        "organization_member_counts": member_counts,
        # (value, label) pairs for the kind selects, in KINDS order.
        "organization_kind_labels": [
            (kind, Organization.KIND_LABELS[kind]) for kind in Organization.KINDS
        ],
        "org_board_members": org_board_members,
        "org_board_organizations": org_board_organizations,
    }


def about_context():
    about_data = AboutContent.load_all()
    values = about_data["sections"].get("values")

    return {
        "sections": about_data["sections"],
        "ordered_slugs": about_data["ordered_slugs"],
        "milestones": about_data["milestones"],
        # Short kiosk display copy (hub hero, index hints, section chrome, seal
        # callouts), merged with AboutContent.DEFAULT_META so the editor forms
        # render the live default rather than an empty box.
        "about_meta": about_data["meta"],
        "about_page": about_data["page"],
        # The Values repeaters pre-fill from the same resolver the kiosk uses, so
        # a row saved before they existed opens with what the kiosk shows today
        # and its first save migrates it.
        "about_values_rows": AboutValues.resolve(
            about_data["meta"]["values"],
            (getattr(values, "subsections", None) or []) if values else [],
        ),
    }


def tour_context():
    tour_mappings = {
        (getattr(row, "scene_id", "") or ""): row
        for row in (TourScenes.all() or [])
    }

    tour_scene_rows = []
    for entry in TourScenesCatalog.all_scenes():
        mapping = tour_mappings.get(entry["scene_id"])
        tour_scene_rows.append(
            {
                "scene_id": entry["scene_id"],
                "scene_name": entry["name"],
                "location_id": getattr(mapping, "location_id", None) if mapping else None,
                "display_name": (getattr(mapping, "display_name", None) if mapping else "") or "",
                # Thumbnail + 360 preview. preview.jpg already ships beside the
                # tiles (kiosk-tour.js uses it as Marzipano's cubeMapPreviewUrl),
                # so recognising a scene costs no new imagery -- just the band
                # of the cube strip that faces the way the scene opens.
                "preview_url": "/pano/tiles/{}/preview.jpg".format(entry["scene_id"]),
                "preview_face": entry["preview_face"],
                "initial_view": entry["initial_view"],
            }
        )

    return {
        "tour_scene_rows": tour_scene_rows,
        "tour_geometry": TourScenesCatalog.geometry(),
    }


#: How many stories the "Recent Newsletters" panel lists.
OVERVIEW_RECENT_LIMIT = 5

#: How many story titles each row of "Newsletters by Category" previews.
OVERVIEW_CATEGORY_PREVIEW = 3

#: The columns the overview renders. Selected explicitly so the query never
#: hydrates `description` -- the full Quill HTML body -- for a panel that
#: shows a title, a status pill and a one-line excerpt.
_OVERVIEW_COLUMNS = [
    "id", "title", "status", "category_id", "issue_id", "published_at", "excerpt", "dek",
]


def _published_label(value):
    """`value` as a campus-local "Sep 15, 2026", or "" when unset.

    Goes through Issues' campus-zone conversion rather than strftime on the
    raw value: the ORM hands `published_at` back UTC-aware, and a 23:50 UTC
    approval is already the next day in Manila.
    """
    from app.services import Issues

    local = Issues._campus_local(value)
    return local.strftime("%b %d, %Y") if local else ""


def _overview_story(row, issue_published_at):
    """A plain dict for the overview partial -- title, folded status, category
    id, a display-ready date and a one-line summary.

    Plain dicts rather than models because the template used to print
    `published_at` raw, which for an ORM datetime is a full ISO timestamp with
    offset; the panel wants a date an editor can read at a glance.

    The date is the story's own `published_at` when set, else its ISSUE's.
    Since review went issue-based, approval stamps `issues.published_at`
    (ReviewController) and leaves the story's column NULL -- so without the
    fallback every published story here read "Not set".
    """
    published_at = getattr(row, "published_at", None)
    if published_at is None:
        published_at = issue_published_at.get(getattr(row, "issue_id", None))

    return {
        "id": getattr(row, "id", None),
        "title": getattr(row, "title", None) or "Untitled story",
        "status": normalize_news_status(getattr(row, "status", None)),
        "category_id": getattr(row, "category_id", None),
        "published_at": _published_label(published_at),
        "excerpt": getattr(row, "excerpt", None) or getattr(row, "dek", None) or "",
    }


def _issue_published_dates(rows):
    """{issues.id: published_at} for the issues these stories belong to.

    One where_in rather than a lookup per story, same shape as author_names().
    """
    from app.models.Issue import Issue

    wanted = {getattr(row, "issue_id", None) for row in rows} - {None}
    if not wanted:
        return {}
    try:
        issues = Issue.select("id", "published_at").where_in("id", list(wanted)).get() or []
    except Exception:
        return {}
    return {getattr(i, "id", None): getattr(i, "published_at", None) for i in issues}


def _overview_stories():
    """Every live story, newest first, as _overview_story() dicts.

    Whole table on purpose: the category panel needs every story's
    category_id to group and to size the progress bars, and the table is
    tens of rows. What it must NOT do is load the bodies -- hence the column
    list. The soft-delete scope on News hides deleted stories here the same
    way it does on the kiosk.
    """
    try:
        rows = News.select(*_OVERVIEW_COLUMNS).order_by("id", "desc").get() or []
    except Exception:
        # Same failure posture as the rest of this module: a broken query
        # renders an empty panel rather than taking the dashboard down.
        return []
    issue_dates = _issue_published_dates(rows)
    return [_overview_story(row, issue_dates) for row in rows]


def overview_context():
    """The Dashboard tab: the three stat cards, "Newsletters by Category" and
    "Recent Newsletters".

    All of it reads `news` + `news_categories` -- the tables the composer and
    the kiosk actually run on. This used to read the legacy `Posts` /
    `Categories` tables, which nothing has written since the composer
    replaced them, so both panels rendered "No data available" forever while
    the kiosk was showing seventeen published stories.
    """
    stories = _overview_stories()
    total = len(stories)

    # Category rows in the same order the composer's picker lists them
    # (NewsCategories.live() is name-ascending). Grouping is done here rather
    # than with one GROUP BY because each row also previews its first few
    # titles, which an aggregate cannot return.
    by_category = {}
    for story in stories:
        by_category.setdefault(story["category_id"], []).append(story)

    category_rows = []
    for category in NewsCategories.live():
        items = by_category.pop(getattr(category, "id", None), [])
        category_rows.append(
            {
                "name": getattr(category, "name", None) or "Untitled category",
                "count": len(items),
                "percent": round((len(items) / total) * 100) if total else 0,
                "items": items[:OVERVIEW_CATEGORY_PREVIEW],
            }
        )

    # A story whose category was soft-deleted still counts -- the story is
    # live, only its label is gone. Folded into one trailing row rather than
    # dropped, so the row counts add up to the "Total News" card.
    orphaned = [story for items in by_category.values() for story in items]
    if orphaned:
        category_rows.append(
            {
                "name": "Uncategorized",
                "count": len(orphaned),
                "percent": round((len(orphaned) / total) * 100) if total else 0,
                "items": orphaned[:OVERVIEW_CATEGORY_PREVIEW],
            }
        )

    # The two stat cards. Not news_context()'s `news_count`: that one is
    # scoped to the signed-in editor's own open issue since the composer
    # became per-editor, so on the overview it read 0 for anyone without a
    # draft in progress. Same status folding as super_admin_stats(), so the
    # two dashboards agree.
    published_news = sum(1 for story in stories if story["status"] == "published")

    return {
        "recent_articles": stories[:OVERVIEW_RECENT_LIMIT],
        "article_groups": category_rows,
        "category_lookup": NewsCategories.names_by_id(),
        "total_news": total,
        "published_news": published_news,
    }


# ===== composition =====

#: Sections a fragment request may ask for, mapped to their context builder.
FRAGMENT_SECTIONS = {
    "events": events_context,
    "archives": archives_context,
    "videos": videos_context,
    "post-library": post_library_context,
}


def grouped_counts(model, column):
    """`{raw value: row count}` for one column, aggregated in SQL.

    The callers below want a handful of integers, not the rows. Loading the
    table to `len()` it costs a full scan plus the memory to hydrate every
    model -- which for `news` means every story's full HTML body, on a page
    that renders none of them. One GROUP BY returns as many rows as there are
    distinct values instead.

    Values come back raw so the caller can fold them with the same normaliser
    the rest of the app uses: `status` has aliases ("live"/"publish" both mean
    published) and `role`/`type` are compared case- and padding-insensitively,
    so neither can be matched safely in the WHERE clause.
    """
    try:
        rows = (
            model.select_raw(f"{column} AS grouped_value, COUNT(*) AS grouped_count")
            .group_by(column)
            .get()
        )
    except Exception:
        # Same failure posture as the rest of this module: a broken stats query
        # renders zeroes rather than taking the dashboard down.
        return {}

    counts = {}
    for row in rows or []:
        value = getattr(row, "grouped_value", None)
        counts[value] = int(getattr(row, "grouped_count", 0) or 0)
    return counts


def super_admin_stats():
    """Organization-wide counts for the super admin dashboard.

    News counts read `News` -- the table the composer and the kiosk front page
    actually run on -- not `Posts`, which is what `overview_context()`'s older
    "Total News" cards count. That mismatch is pre-existing on the editor
    dashboard and deliberately left alone here; these numbers are meant to be
    the true org-wide figures.

    Events come from `Events` -- the model `events_context()` renders -- not
    from `Posts`, which is a legacy table `overview_context()` still reads.

    Nothing on this page renders a row, so every figure here is a SQL
    aggregate. This used to be three `Model.all()` calls folded in Python,
    which scaled linearly in both query time and memory against tables the
    page never displays.
    """
    role_counts = grouped_counts(User, "role")
    admin_count = 0
    editor_count = 0
    for raw_role, count in role_counts.items():
        role = (raw_role or "").strip().lower()
        if role == "admin":
            admin_count += count
        elif role == "editor":
            editor_count += count

    status_counts = grouped_counts(News, "status")
    published_news = sum(
        count
        for raw_status, count in status_counts.items()
        if normalize_news_status(raw_status) == "published"
    )

    type_counts = grouped_counts(Archives, "type")
    total_newsletters = sum(
        count
        for raw_type, count in type_counts.items()
        if (raw_type or "").strip().lower() == "newsletter"
    )

    return {
        "admin_count": admin_count,
        "editor_count": editor_count,
        "total_news": sum(status_counts.values()),
        "published_news": published_news,
        "total_events": Events.count() or 0,
        "total_archives": sum(type_counts.values()),
        "total_newsletters": total_newsletters,
        "location_count": Locations.count() or 0,
    }


def full_context(default_page="dashboard", user_id=None):
    """The complete dashboard context. `user_id` scopes the News panel's
    library to that editor's own posts; everything else is shared."""
    locations_data = locations_context()

    context = {}
    context.update(overview_context())
    context.update(events_context())
    context.update(post_editor_context(user_id))
    context.update(post_library_context(user_id))
    context.update(archives_context())
    context.update(videos_context())
    context.update(locations_data)
    context.update(org_board_context())
    context.update(about_context())
    context.update(tour_context())
    # No review_context() here any more. The approval queue moved off the
    # editor dashboard onto the admin console at /users, which builds its own
    # context in UserController.view() -- this function is the editors'
    # surface, and it should not be paying for a query it no longer renders.
    context["default_page"] = default_page

    return context
