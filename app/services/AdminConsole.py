"""Context for the admin console at /users.

The admin's surface is not the editor dashboard. Editors cannot publish, so
every submission waits at `status = "review"` until an admin acts on it
(`app/services/ReviewQueue.py`), and these are the numbers that tell them
whether anything is waiting.

News counts read `News` -- the table the composer and the kiosk front page
actually run on -- not `Posts`, which is what `overview_context()`'s older
cards counted. This mirrors `DashboardContext.super_admin_stats()`, which
made the same choice for the same reason.
"""

from datetime import datetime

from app.models.News import News
from app.models.User import User
from app.services.DashboardContext import normalize_news_status
from app.services.ReviewQueue import pending_stories


#: The role the /users editor table manages. Compared case-insensitively --
#: the live `users.role` column has drifted and holds values with stray
#: casing, which is why UserController._is_editor does the same.
EDITOR_ROLE = "editor"


def _editor_count():
    try:
        users = list(User.all() or [])
    except Exception:
        return 0
    return sum(
        1
        for user in users
        if (getattr(user, "role", "") or "").strip().lower() == EDITOR_ROLE
    )


def _news_status_counts():
    """{normalized status: count} across the whole news table."""
    try:
        rows = list(News.all() or [])
    except Exception:
        return {}, 0

    counts = {}
    for row in rows:
        status = normalize_news_status(getattr(row, "status", None))
        counts[status] = counts.get(status, 0) + 1
    return counts, len(rows)


def _days_waiting(story):
    """Whole days since `story` was submitted, or None if that can't be told.

    `created_at` comes back as a datetime from the ORM but as a string from a
    raw row, and it is nullable on rows that predate the column -- none of
    which should cost an admin their dashboard, so anything unparseable just
    means the tile shows no age line.
    """
    raw = getattr(story, "created_at", None)
    if not raw:
        return None

    if isinstance(raw, str):
        try:
            raw = datetime.fromisoformat(raw)
        except ValueError:
            return None

    try:
        delta = datetime.now() - raw.replace(tzinfo=None)
    except (AttributeError, TypeError):
        return None

    return max(delta.days, 0)


def stats_context():
    """The four figures on the console's Dashboard panel.

    `review_stories` rides along so DashboardController.FRAGMENTS can use it
    as this section's `rows_key` -- the pending count is genuinely the number
    the fragment payload should report.
    """
    counts, _total = _news_status_counts()
    pending = pending_stories()

    return {
        "editor_count": _editor_count(),
        "awaiting_review": len(pending),
        "published_count": counts.get("published", 0),
        # Where a rejected story lands: ReviewController._decide sets
        # status="draft" plus a rejection_reason, so "sent back" and "never
        # submitted" are the same bucket by design.
        "draft_count": counts.get("draft", 0),
        "oldest_pending_days": _days_waiting(pending[0]) if pending else None,
        "review_stories": pending,
    }
