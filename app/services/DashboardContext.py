"""Per-section context builders for the editor dashboard.

The dashboard used to build its entire context in one controller method, so
refreshing a single list meant reloading every model on the page. Splitting it
per section lets a fragment request load only what that section renders, and
lets `full_context()` keep composing the identical context the full page has
always received.
"""

import random
from datetime import datetime

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
from app.models.NewsCategory import NewsCategory
from app.services import NewsCategories
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


#: The blocks an issue is made of, in the order they print. This is the
#: editor's own vocabulary -- a lead, a brief, an editorial, a notice -- and it
#: is what `news.layout_type` stores. It replaced `main`/`secondary`/`widget`,
#: which were words no newsroom uses and which forced a translation into every
#: surface between the column and the screen.
#:
#: `unassigned` is deliberately NOT here: it is a destination (the story
#: library), not a place on the page, so it has no capacity and no section.
BLOCK_TYPES = ("lead", "brief", "photo_essay", "editorial", "quote", "notice")

#: How many rows each block holds. Mirrored by NewsController._NEWS_SLOT_CAPACITY,
#: which is what layout() enforces inside its transaction, and derived again from
#: the rendered containers by news-dashboard.js -- so all three can only drift if
#: the markup drifts first.
#:
#: Truncating here is not cosmetic. A bucket over capacity leaves a story that
#: reads as placed in the composer and renders nowhere on the kiosk, which is
#: the worst kind of bug: silent, and invisible to the person who caused it.
BLOCK_CAPACITY = {
    "lead": 1,
    "brief": 4,
    "photo_essay": 3,
    "editorial": 1,
    "quote": 2,
    "notice": 1,
}

#: What a row lands in when its `layout_type` is blank. A model built in memory
#: can still carry None even though the column is NOT NULL with a default. A
#: brief is the safe landing -- the ordinary body of the page, never the lead.
DEFAULT_BLOCK = "brief"


def normalize_block(raw_type):
    """Resolve a stored `layout_type` to a block, or None if it is not one.

    Case- and padding-insensitive for the same reason `status` is: these values
    arrive from forms, fixtures and migrations, and a stray space should not
    decide whether a story prints.

    Returns None for `unassigned` AND for anything unrecognised -- a stale row,
    a hand-posted form, a half-run migration. Failing closed means such a story
    stays reachable in the library and simply does not print; guessing it into a
    block would put unreviewed placement on a public screen.
    """
    block = (raw_type or "").strip().lower()
    if not block:
        return DEFAULT_BLOCK
    return block if block in BLOCK_CAPACITY else None


def group_news_slots(news_items):
    """Split stories into the blocks the issue renders.

    Returns a dict keyed by block type, every key present (templates index
    these directly, so a missing one is a 500 rather than a blank section) and
    every list already truncated to capacity.

    Sort is ascending on `(priority, id)`: lower renders first, so the
    "Position #1" badge an editor reads is literally the render order. `id`
    breaks the tie because `priority` defaults to 0, so a run of new stories all
    carry it and the order would otherwise be whatever the driver returned.

    The lead falls back to the first assignable story when nothing is marked
    `lead`, or section 01 would be missing from a page that has stories. The
    fallback looks only at ASSIGNABLE rows -- sending a story to the library
    must remove it from the page, not promote it to the front of it.
    """
    sorted_items = sorted(
        list(news_items or []),
        key=lambda item: (
            int(getattr(item, "priority", 0) or 0),
            int(getattr(item, "id", 0) or 0),
        ),
    )

    placed = [
        (normalize_block(getattr(item, "layout_type", None)), item)
        for item in sorted_items
    ]
    assignable = [(block, item) for block, item in placed if block]

    slots = {block: [] for block in BLOCK_TYPES}
    for block, item in assignable:
        slots[block].append(item)

    # No explicit lead: borrow the first assignable story from wherever it sits,
    # and take it out of that bucket so it cannot render twice.
    if not slots["lead"] and assignable:
        fallback_block, fallback = assignable[0]
        slots["lead"] = [fallback]
        slots[fallback_block] = [
            item for item in slots[fallback_block] if item is not fallback
        ]

    return {block: slots[block][: BLOCK_CAPACITY[block]] for block in BLOCK_TYPES}


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


def news_context(user_id=None):
    """The composer's context, scoped to the signed-in editor's OPEN issue.

    `user_id` is the seam this whole feature turns on. Before it, every editor
    saw and edited the same canvas -- there was one implicit issue and this
    read the whole table. With it, the canvas is the editor's own newsletter:
    their newest unpublished issue, created on demand (Issues.current_for).

    None -- a caller with no user, which is the fragment poll from a surface
    that has none -- gets an empty issue rather than everyone's stories.
    """
    # Imported here rather than at module top: Issues imports
    # normalize_news_status from this module, and the reverse would be a cycle.
    from app.services import Issues

    issue = Issues.current_for(user_id) if user_id else None
    news_items = Issues.stories_of(issue) if issue else []
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
        # ONE key, not one per block. The issue partial indexes it by block
        # name, so adding a block type later costs nothing here -- which is the
        # point of the vocabulary living in BLOCK_TYPES rather than in the
        # shape of this dict.
        "blocks": slots,
        # The issue's non-slot sections. They live here rather than only in
        # news_canvas_context() so the FULL page render and the canvas fragment
        # hand kiosk/_issue.html the same context -- otherwise the calendar
        # would be missing on load and appear on the first live refresh, which
        # reads as a bug.
        "events": upcoming_events(),
        **issue_identity_of(issue),
        # The issue the composer is editing, for the top bar and the outline.
        "news_issue": issue_summary(issue),
        "news_status_counts": news_status_counts,
        "news_count": len(news_items),
        # Seeds the composer's optimistic-concurrency token so the FIRST
        # layout write from a freshly loaded page is already versioned. Without
        # it the opening drag of a session is unguarded — exactly the window a
        # long-open tab is most likely to be stale in.
        #
        # Per ISSUE, not table-wide: another editor saving their own newsletter
        # must not read as a conflict on this one.
        "news_stamp": Issues.stamp_for(issue) if issue else "0:",
        # users.id -> display name, for the Story Library's Author column.
        # Built once here rather than per row: the alternative is an N+1 across
        # a table the composer renders in full.
        "news_authors": author_names(news_items),
        # news_categories.id -> display name, for the Story Library's Category
        # column. Same one-query shape as news_authors above, and for the same
        # reason.
        "news_category_lookup": NewsCategories.names_by_id(),
        # The category modal is rendered as part of the news panel on the FULL
        # page, so its two context keys have to be here too — not only in
        # news_categories_context(). Without them the full-page render hits an
        # undefined `news_categories_json` in the partial's JSON block.
        **news_categories_context(),
    }


def news_categories_context():
    """Context for the categories fragment.

    This section exists so a category rename propagates to another editor's
    open composer. A rename touches zero `news` rows, so section_stamp(News)
    does not move and the news fragment never refreshes for it — the category
    list needs a stamp of its own.

    Both keys hold the SAME list of dicts. `news_categories` is what the
    partial iterates (it reads `category.story_count`, which is not a column,
    so model rows would render an empty count with no error); the JSON block
    is what news-dashboard.js re-reads after a live refresh.
    """
    categories = NewsCategories.describe_all()
    return {
        "news_categories": categories,
        "news_categories_json": categories,
    }


def news_canvas_context(user_id=None):
    """Context for re-rendering `kiosk/_issue.html` from the dashboard
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
    news = news_context(user_id)
    return {
        "blocks": news["blocks"],
        "news_editor": True,
        # The issue's non-slot sections, already built by news_context(). The
        # composer renders the whole page, not just the slots, so without these
        # the editor would lay out an issue with its photo essay and calendar
        # missing -- the drift kiosk/_issue.html was extracted to end.
        "events": news["events"],
        "issue_vol": news["issue_vol"],
        "issue_no": news["issue_no"],
        # Kept so DashboardController.fragment() can still report a row
        # count for this section the same way every other fragment does.
        "news_items": news["news_items"],
    }


#: How many upcoming events the issue's calendar block shows.
CALENDAR_LIMIT = 3


def upcoming_events(limit=CALENDAR_LIMIT):
    """The next few events, for the issue's calendar block.

    Lives here rather than in NewsController because BOTH surfaces need it and
    the import can only run one way: NewsController already imports from this
    module, so the reverse would be a cycle.

    Deliberately never cached alongside the news payload. EventController has
    no reason to call NewsCache.forget() -- it writes no `news` rows -- so a
    calendar living inside that cache would keep showing yesterday's list for
    up to NewsCache.TTL after an editor added an event, and nobody would
    connect the two.

    `events.event_date` is a naive local `datetime NOT NULL`, so comparing it
    against a naive datetime.now() is right. (WelcomeController's flash ticker
    needs a +/-2 day margin for the opposite reason: it also measures against
    `created_at`, which comes back UTC-aware from pendulum.)
    """
    try:
        rows = (
            Events.where("is_archive", 0)
            .where("event_date", ">=", datetime.now().strftime("%Y-%m-%d %H:%M:%S"))
            .order_by("event_date", "asc")
            .limit(limit)
            .get()
        )
    except Exception:
        # The calendar is one block on a public screen. A DB hiccup here must
        # not take the whole issue down with it -- the partial already skips
        # the section when this is empty.
        return []

    events = []
    for row in rows:
        at = getattr(row, "event_date", None)
        events.append({
            "title": getattr(row, "title", None),
            # Pre-formatted for the same reason published_label is: Jinja
            # cannot strftime, and the date chip wants "SEP 15".
            "chip": at.strftime("%b %d").upper() if hasattr(at, "strftime") else "",
            "iso": at.strftime("%Y-%m-%d") if hasattr(at, "strftime") else "",
        })
    return events


def issue_summary(issue):
    """What the composer's top bar and outline say about the issue being
    edited. None when there is no issue (no signed-in editor)."""
    if not issue:
        return None
    from app.services import Issues

    return {
        "id": getattr(issue, "id", None),
        "number": int(getattr(issue, "number", 0) or 0),
        "title": getattr(issue, "title", None) or "",
        "status": Issues.status_of(issue),
        "published_at": getattr(issue, "published_at", None),
    }


def issue_identity_of(issue):
    """Folio numbering from the ISSUE row. Vol. still counts years since
    founding, off the issue's publish date (or today's, for an open draft);
    No. is the issue's own number now rather than a day-of-year stand-in."""
    if not issue:
        return {"issue_vol": None, "issue_no": None}
    at = getattr(issue, "published_at", None) or getattr(issue, "created_at", None)
    year = at.year if hasattr(at, "year") else datetime.now().year
    return {
        "issue_vol": max(1, year - 2025),
        "issue_no": int(getattr(issue, "number", 0) or 0) or None,
    }


def issue_identity(lead):
    """Folio numbering, derived from the lead story's date -- no schema.

    Vol. counts publication years since founding (2026 -> 1); No. is the
    day-of-year, a plausible edition number that changes with each date. Shared
    so the composer's masthead cannot print a different issue line from the
    kiosk's.
    """
    lead_at = getattr(lead, "published_at", None) or getattr(lead, "created_at", None)
    if not hasattr(lead_at, "timetuple"):
        return {"issue_vol": None, "issue_no": None}
    return {
        "issue_vol": max(1, lead_at.year - 2025),
        "issue_no": lead_at.timetuple().tm_yday,
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
        # Short kiosk display copy (hub hero, index hints, section chrome, seal
        # callouts), merged with AboutContent.DEFAULT_META so the editor forms
        # render the live default rather than an empty box.
        "about_meta": about_data["meta"],
        "about_page": about_data["page"],
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
    "news-categories": news_categories_context,
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
    """The complete dashboard context. `user_id` scopes the News panel to
    that editor's own issue; everything else is shared."""
    locations_data = locations_context()

    context = {}
    context.update(overview_context())
    context.update(events_context())
    context.update(news_context(user_id))
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
