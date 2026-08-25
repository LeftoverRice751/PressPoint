"""Context for the admin's review queue.

Editors cannot publish. Their "Submit for review" writes `status = "review"`,
which `_news_is_public()` already excludes from every public surface, so a
submitted story is invisible on the kiosk until an admin acts on it. This module
is what the admin sees in the meantime.

The preview the queue renders is the real kiosk partial (kiosk/_news_slots.html
with `news_editor` off), not a dashboard-styled approximation — so what an admin
approves is what the campus terminal shows. A second renderer here would drift
from the first one the moment either changed.
"""

from app.models.News import News
from app.services.DashboardContext import author_names, normalize_news_status


#: The one status this queue acts on.
REVIEW_STATUS = "review"


def pending_stories():
    """Stories awaiting an admin decision, oldest submission first.

    Oldest-first on purpose: this is a work queue, and the story that has been
    waiting longest is the one most likely to be time-sensitive. That is the
    opposite of the Story Library's newest-first ordering, which is a browsing
    surface rather than a queue.
    """
    try:
        rows = list(News.all() or [])
    except Exception:
        return []

    pending = [
        row
        for row in rows
        if normalize_news_status(getattr(row, "status", None)) == REVIEW_STATUS
    ]
    pending.sort(key=lambda row: (getattr(row, "id", 0) or 0))
    return pending


def review_context():
    """Context for the review panel and its live fragment."""
    stories = pending_stories()

    return {
        "review_stories": stories,
        "review_count": len(stories),
        "review_authors": author_names(stories),
    }


def preview_context(story):
    """Render one story through the kiosk's own front-page partial.

    The partial expects the slot buckets, so the story under review is handed
    in as the lead with both other buckets empty: it fills the whole preview
    frame, at the size and typography the kiosk uses. `news_editor` stays False
    so none of the composer's editing chrome (context menus, contenteditable
    regions, assign placeholders) leaks into a read-only preview.
    """
    return {
        "main_story": story,
        "secondary_stories": [],
        "widget_news": [],
        "news_editor": False,
    }
