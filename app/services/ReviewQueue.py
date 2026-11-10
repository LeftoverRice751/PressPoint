"""Context for the admin's review queue.

Editors cannot publish. Their "Submit for review" writes `status = "review"`,
which `_news_is_public()` already excludes from every public surface, so a
submitted post is invisible on the kiosk until an admin acts on it. This module
is what the admin sees in the meantime.

The unit of review is one post. The preview is the real kiosk card partial
(kiosk/_post_card.html with `post_editor` off), not a dashboard-styled
approximation, so what an admin approves is what the campus terminal shows. A
second renderer here would drift from the first one the moment either changed.
"""

import hashlib
import json
from datetime import datetime

from app.models.News import News
from masonite.facades import Storage as StorageFacade

from app.services import Posts
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
        # Every photo post carries image_crop; a NULL one is a legacy newsletter
        # story, which approving would put on the kiosk as a malformed card.
        and getattr(row, "image_crop", None) is not None
    ]
    pending.sort(key=lambda row: (getattr(row, "id", 0) or 0))
    return pending


# Everything the kiosk card draws from a post, plus when it leaves the screen.
_STAMPED_FIELDS = (
    "title",
    "description",
    "image",
    "kicker",
    "image_crop",
    "source_lines",
    "element_layout",
    "expires_at",
)


def content_stamp(stories):
    """A fingerprint of what these stories would show on the kiosk.

    The preview returns it and approval must send it back, which ties the
    decision to the text the admin read. Approving used to re-read the rows and
    publish whatever they held by then. Content rather than updated_at because
    that column has one-second resolution and isn't written by every path.
    """
    rows = sorted(stories or [], key=lambda story: getattr(story, "id", 0) or 0)
    payload = [
        [str(getattr(story, "id", ""))]
        + [str(getattr(story, field, None)) for field in _STAMPED_FIELDS]
        for story in rows
    ]
    return hashlib.sha256(json.dumps(payload).encode()).hexdigest()


def expiry_input(post):
    """The post's expiry as a campus-local `datetime-local` value, or "" if unset."""
    expires_at = getattr(post, "expires_at", None)
    if not isinstance(expires_at, datetime):
        return ""
    # A lapsed expiry prefills empty: approve then answers "This post's expiry has
    # passed. Set a new expiry to approve it." instead of silently resending it.
    if Posts.is_expired(post):
        return ""
    return Posts._aware_utc(expires_at).astimezone(Posts.CAMPUS_TZ).strftime("%Y-%m-%dT%H:%M")


def review_context():
    """Context for the review panel and its live fragment.

    `review_stories` / `review_count` / `review_authors` are kept: the admin
    console's count tile and the live-refresh row count read them.
    """
    stories = pending_stories()
    names = author_names(stories)
    return {
        "review_stories": stories,
        "review_count": len(stories),
        "review_authors": names,
        # One row per pending post, oldest first.
        "review_posts": [
            {
                "id": getattr(story, "id", None),
                "headline": getattr(story, "title", None) or "Untitled post",
                "kicker": getattr(story, "kicker", None) or "",
                "author": names.get(getattr(story, "author_id", None)),
                "expires_input": expiry_input(story),
            }
            for story in stories
        ],
    }


def preview_context(story):
    """Render one post through the kiosk's own card partial, read-only."""
    try:
        disk = StorageFacade.disk("public")
    except Exception:
        disk = None
    return {"card": Posts.card_context(story, disk), "post_editor": False}
