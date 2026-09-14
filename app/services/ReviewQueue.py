"""Context for the admin's review queue.

Editors cannot publish. Their "Submit for review" writes `status = "review"`,
which `_news_is_public()` already excludes from every public surface, so a
submitted story is invisible on the kiosk until an admin acts on it. This module
is what the admin sees in the meantime.

The preview the queue renders is the real kiosk partial (kiosk/_issue.html
with `news_editor` off), not a dashboard-styled approximation — so what an admin
approves is what the campus terminal shows. A second renderer here would drift
from the first one the moment either changed.

── The unit of review is the ISSUE ──────────────────────────────────────────
An editor composes an issue as one thing and submits it in one click. This
module used to hand the admin N unrelated submissions instead — one queue row
and one Approve per block, with every preview forcing the story into the lead
slot regardless of what it was. A fully-filled issue is twelve blocks: twelve
clicks, twelve misleading previews.

"The issue" here is every story currently in review. There is no `issues`
table yet, and the single-issue model means exactly one issue is ever in
flight, so the two are the same set by construction. When multi-issue lands,
this becomes "every review story in issue X" and nothing else about the shape
has to change.
"""

from app.models.News import News
from app.services.DashboardContext import (
    BLOCK_TYPES,
    author_names,
    group_news_slots,
    normalize_news_status,
)


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


def pending_issue(stories=None):
    """The one issue awaiting a decision, described as a unit.

    Returns None when nothing is pending — the template renders its empty
    state off that, and the approve/reject endpoints refuse rather than
    reporting success on nothing.
    """
    stories = pending_stories() if stories is None else stories
    if not stories:
        return None

    names = author_names(stories)
    counts = {block: 0 for block in BLOCK_TYPES}
    for row in stories:
        block = (getattr(row, "layout_type", "") or "").strip().lower()
        if block in counts:
            counts[block] += 1

    # Distinct, in first-seen order: an issue written by two editors names both,
    # once each, rather than listing an author per block.
    authors = []
    for row in stories:
        name = names.get(getattr(row, "author_id", None))
        if name and name not in authors:
            authors.append(name)

    return {
        "stories": stories,
        "block_count": len(stories),
        "blocks": counts,
        "authors": authors,
    }


def review_context():
    """Context for the review panel and its live fragment.

    `review_stories` / `review_count` / `review_authors` are kept: the admin
    console's count tile and the live-refresh row count read them, and the
    count of pending BLOCKS is still the right depth for a work queue.
    """
    stories = pending_stories()

    return {
        "review_stories": stories,
        "review_count": len(stories),
        "review_authors": author_names(stories),
        "review_issue": pending_issue(stories),
    }


def issue_preview_context(stories):
    """Render the whole pending issue through the kiosk's own partial, every
    block in its real place.

    group_news_slots() is the same bucketing the kiosk uses, so a quote
    previews as a quote and an essay photograph as an essay photograph — not,
    as before, every one of them forced into the lead slot.
    """
    return {
        "blocks": group_news_slots(list(stories or [])),
        "news_editor": False,
        "events": [],
        "issue_vol": None,
        "issue_no": None,
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
        # The story under review fills the frame as the lead, with every other
        # block empty -- each one then omits its own section and the band
        # numbering closes the gap, leaving it alone on the page.
        "blocks": {block: ([story] if block == "lead" else []) for block in BLOCK_TYPES},
        "news_editor": False,
        # kiosk/_issue.html renders the whole issue, so the sections this
        # preview has no data for have to be explicitly empty rather than
        # undefined -- each one skips itself and the band numbering closes the
        # gap, leaving the story under review alone in the frame.
        "events": [],
        "issue_vol": None,
        "issue_no": None,
    }
