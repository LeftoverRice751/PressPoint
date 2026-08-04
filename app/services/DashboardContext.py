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
from app.models.Departments import Departments
from app.models.Events import Events
from app.models.Locations import Locations
from app.models.Member import Member
from app.models.News import News
from app.models.Posts import Posts
from app.models.TourScenes import TourScenes
from app.models.Video import Video
from app.services.AboutContent import AboutContent
from app.services.ArchiveServices import ArchiveServices
from app.services.OrgBoardTree import build_org_board_departments
from app.services.TourScenesCatalog import TourScenesCatalog


NEWS_STATUS_ALIASES = {
    "pending": "review",
    "reviewing": "review",
    "publish": "published",
    "live": "published",
}
NEWS_ALLOWED_STATUSES = {"draft", "review", "approved", "scheduled", "published", "archived"}


def normalize_news_status(raw_status, default="approved"):
    status = (raw_status or default or "approved").strip().lower()
    status = NEWS_STATUS_ALIASES.get(status, status)
    if status not in NEWS_ALLOWED_STATUSES:
        return default or "approved"
    return status


def _by_id_desc(item):
    return getattr(item, "id", 0) or 0


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
    locations = sorted(list(Locations.all() or []), key=_by_id_desc)

    return {
        "events": events,
        "location_lookup": {
            getattr(location, "id", None): getattr(location, "name", "")
            for location in locations
        },
    }


def archives_context():
    archive_services = ArchiveServices()
    archive_records = sorted(list(Archives.all() or []), key=_by_id_desc, reverse=True)
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
        "videos": sorted(list(Video.all() or []), key=_by_id_desc, reverse=True),
    }


def news_context():
    news_items = sorted(list(News.all() or []), key=_by_id_desc, reverse=True)
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
        status = normalize_news_status(getattr(news_item, "status", None), default="approved")
        news_status_counts[status] = news_status_counts.get(status, 0) + 1

    return {
        "news_items": news_items,
        "main_news": slots["main_news"],
        "secondary_news": slots["secondary_news"],
        "widget_news": slots["widget_news"],
        "news_status_counts": news_status_counts,
        "news_count": len(news_items),
    }


def locations_context():
    locations = sorted(list(Locations.all() or []), key=_by_id_desc)

    return {
        "locations": locations,
        "location_lookup": {
            getattr(location, "id", None): getattr(location, "name", "")
            for location in locations
        },
        "location_count": len(locations),
    }


def ensure_departments_for_locations(locations):
    """Give every Department-type location a matching departments row.

    This writes, so it belongs only on a full page render — never on a fragment
    refresh or a polling request.
    """
    existing_location_ids = {
        getattr(department, "location_id", None)
        for department in (Departments.all() or [])
    }

    for location in locations:
        if (getattr(location, "type", "") or "") != "Department":
            continue
        if getattr(location, "id", None) in existing_location_ids:
            continue
        Departments.create({
            "location_id": location.id,
            "name": getattr(location, "name", "") or "Department",
        })


def org_board_context(locations=None):
    locations = locations if locations is not None else sorted(list(Locations.all() or []), key=_by_id_desc)
    location_type_lookup = {
        getattr(location, "id", None): (getattr(location, "type", "") or "")
        for location in locations
    }

    departments = sorted(
        [
            department for department in list(Departments.all() or [])
            if location_type_lookup.get(getattr(department, "location_id", None), "") == "Department"
        ],
        key=lambda item: (getattr(item, "name", "") or "").lower(),
    )
    org_board_members = sorted(
        list(Member.all() or []),
        key=lambda item: (
            getattr(item, "department_id", 0) or 0,
            getattr(item, "parent_id", 0) or 0,
            getattr(item, "sort_order", 0) or 0,
            (getattr(item, "name", "") or "").lower(),
            getattr(item, "id", 0) or 0,
        ),
    )

    return {
        "departments": departments,
        "department_lookup": {
            getattr(department, "id", None): getattr(department, "name", "")
            for department in departments
        },
        "org_board_members": org_board_members,
        "org_board_departments": build_org_board_departments(departments, locations, org_board_members),
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
            }
        )

    return {"tour_scene_rows": tour_scene_rows}


def overview_context():
    posts = sorted(list(Posts.all() or []), key=_by_id_desc, reverse=True)
    categories = sorted(list(Categories.all() or []), key=_by_id_desc)

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


def full_context(default_page="dashboard"):
    """The complete dashboard context, identical to what the page always got."""
    locations_data = locations_context()
    locations = locations_data["locations"]

    ensure_departments_for_locations(locations)

    context = {}
    context.update(overview_context())
    context.update(events_context())
    context.update(news_context())
    context.update(archives_context())
    context.update(videos_context())
    context.update(locations_data)
    context.update(org_board_context(locations))
    context.update(about_context())
    context.update(tour_context())
    context["default_page"] = default_page

    return context
