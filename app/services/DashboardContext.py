"""Per-section context builders for the editor dashboard.

The dashboard used to build its entire context in one controller method, so
refreshing a single list meant reloading every model on the page. Splitting it
per section lets a fragment request load only what that section renders, and
lets `full_context()` keep composing the identical context the full page has
always received.
"""

import random

from app.models.Archives import Archives
from app.models.Categories import Categories
from app.models.Organization import Organization
from app.models.Events import Events
from app.models.Locations import Locations
from app.models.Member import Member
from app.models.News import News
from app.models.Posts import Posts
from app.models.TourScenes import TourScenes
from app.models.User import User
from app.models.Video import Video
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


def group_news_slots(news_items):
    """Split stories into the main / secondary / widget slots the composer shows.

    Sort is ascending on `(priority, id)` — lower priority renders first, so
    the "Position #1" label editors see is literally true. Stories explicitly
    marked `layout_type == "unassigned"` sit in the library only: they are
    excluded from every bucket below, including the `main_news` fallback, so
    an unplaced story can never accidentally become the lead.
    """
    sorted_items = sorted(
        list(news_items or []),
        key=lambda item: (
            int(getattr(item, "priority", 0) or 0),
            int(getattr(item, "id", 0) or 0),
        ),
    )

    assignable_items = [
        item for item in sorted_items
        if (getattr(item, "layout_type", "") or "").lower() != "unassigned"
    ]

    main_news = next(
        (
            item
            for item in assignable_items
            if (getattr(item, "layout_type", "") or "").lower() == "main"
        ),
        assignable_items[0] if assignable_items else None,
    )

    secondary_news = [
        item
        for item in assignable_items
        if item is not main_news
        and (getattr(item, "layout_type", "secondary") or "secondary").lower() == "secondary"
    ][:4]

    widget_news = [
        item
        for item in assignable_items
        if item is not main_news and (getattr(item, "layout_type", "") or "").lower() == "widget"
    ][:2]

    return {
        "main_news": main_news,
        "secondary_news": secondary_news,
        "widget_news": widget_news,
    }


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


def news_context():
    news_items = ordered_by_id(News)
    slots = group_news_slots(news_items)

    news_status_counts = {
        "draft": 0,
        "review": 0,
        "approved": 0,
        "scheduled": 0,
        "published": 0,
        "archived": 0,
    }
    for news_item in news_items:
        status = normalize_news_status(getattr(news_item, "status", None))
        news_status_counts[status] = news_status_counts.get(status, 0) + 1

    return {
        "news_items": news_items,
        "main_news": slots["main_news"],
        "secondary_news": slots["secondary_news"],
        "widget_news": slots["widget_news"],
        "news_status_counts": news_status_counts,
        "news_count": len(news_items),
        # Seeds the composer's optimistic-concurrency token so the FIRST
        # layout write from a freshly loaded page is already versioned. Without
        # it the opening drag of a session is unguarded — exactly the window a
        # long-open tab is most likely to be stale in.
        "news_stamp": section_stamp(News),
        # users.id -> display name, for the Story Library's Author column.
        # Built once here rather than per row: the alternative is an N+1 across
        # a table the composer renders in full.
        "news_authors": author_names(news_items),
    }


def news_canvas_context():
    """Context for re-rendering `kiosk/_news_slots.html` from the dashboard
    fragment endpoint (Task 4's stale-canvas fix).

    `news_context()` returns the slot buckets under the `main_news` /
    `secondary_news` / `widget_news` keys (matching the story-library
    fragment's naming). The canvas include expects the composer's own
    variable names instead — `templates/gears/dashboard.html` sets these via
    `{% set %}` before including the shared partial:
        main_story = main_news
        secondary_stories = secondary_news
        widget_news = widget_news   (already matches)
        news_editor = true
    Rebuilding those here keeps the fragment's `view.render()` call a plain
    template + context pair, with no `{% set %}` needed on the fragment path.
    """
    news = news_context()
    return {
        "main_story": news["main_news"],
        "secondary_stories": news["secondary_news"],
        "widget_news": news["widget_news"],
        "news_editor": True,
        # Kept so DashboardController.fragment() can still report a row
        # count for this section the same way every other fragment does.
        "news_items": news["news_items"],
    }


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

    return {
        "sections": about_data["sections"],
        "ordered_slugs": about_data["ordered_slugs"],
        "milestones": about_data["milestones"],
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


def overview_context():
    posts = ordered_by_id(Posts)
    categories = ordered_by_id(Categories, descending=False)

    published_articles = [
        post for post in posts if (getattr(post, "status", "") or "").lower() == "published"
    ]

    category_rows = []
    for category in categories:
        article_items = [
            post for post in posts
            if getattr(post, "category_id", None) == getattr(category, "id", None)
        ]
        category_rows.append(
            {
                "name": getattr(category, "name", "Untitled category"),
                "count": len(article_items),
                "percent": round((len(article_items) / len(posts)) * 100) if posts else 0,
                "items": article_items[:3],
            }
        )

    uncategorized_posts = [post for post in posts if not getattr(post, "category_id", None)]
    if uncategorized_posts:
        category_rows.append(
            {
                "name": "Uncategorized",
                "count": len(uncategorized_posts),
                "percent": round((len(uncategorized_posts) / len(posts)) * 100) if posts else 0,
                "items": uncategorized_posts[:3],
            }
        )

    return {
        "posts": posts,
        "categories": categories,
        "recent_articles": posts[:5],
        "article_groups": category_rows,
        "category_lookup": {
            getattr(category, "id", None): getattr(category, "name", "")
            for category in categories
        },
        "total_articles": len(posts),
        "published_articles": len(published_articles),
    }


# ===== composition =====

#: Sections a fragment request may ask for, mapped to their context builder.
FRAGMENT_SECTIONS = {
    "events": events_context,
    "archives": archives_context,
    "videos": videos_context,
    "news": news_context,
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


def full_context(default_page="dashboard"):
    """The complete dashboard context, identical to what the page always got."""
    locations_data = locations_context()

    context = {}
    context.update(overview_context())
    context.update(events_context())
    context.update(news_context())
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
