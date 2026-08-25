"""Persistent, per-account messages for the dashboard bell.

Why this exists rather than a toast: an approval decision happens while the
editor who submitted the story is somewhere else entirely. A toast is shown to
whoever is looking at the screen at that moment — which is the admin who just
clicked Approve, not the person who needs to know.

Why not masonite.notification: its database driver is configured against a
`sqlite` connection (config/notification.py) while the app runs on MySQL, and
nothing has ever exercised it. A row here is an insert; the package would be
more machinery than the flow needs and a second thing to keep configured.

Every write here is best-effort in the same spirit as the Pusher broadcasts:
failing to record a notification must never fail the editorial action that
produced it. An admin's approval is the important half.
"""

from datetime import datetime

from app.models.Notification import Notification


#: Newest-first slice the bell dropdown renders. The bell is a recent-activity
#: list, not an archive — there is no "load more", so anything past this is
#: unreachable by design rather than by omission.
RECENT_LIMIT = 20


def notify(user_id, kind, title, message=None, link=None):
    """Record one notification. Returns the row, or None if it could not be
    written — callers should not branch on it beyond reporting."""
    if not user_id:
        return None

    try:
        return Notification.create(
            user_id=user_id,
            type=kind,
            title=title,
            message=message,
            link=link,
        )
    except Exception:
        return None


def unread_count(user_id):
    """How many unread notifications the account has.

    Polled every 20 seconds per open dashboard by dashboard-live.js, so this is
    a COUNT against the (user_id, read_at) index and never loads rows.
    """
    if not user_id:
        return 0

    try:
        return Notification.where("user_id", user_id).where_null("read_at").count() or 0
    except Exception:
        return 0


def recent_for(user_id, limit=RECENT_LIMIT):
    """Newest-first notifications for the bell dropdown."""
    if not user_id:
        return []

    try:
        rows = (
            Notification.where("user_id", user_id)
            .order_by("id", "desc")
            .limit(limit)
            .get()
        )
        return list(rows or [])
    except Exception:
        return []


def mark_read(user_id, notification_id):
    """Mark one notification read, scoped to its owner.

    Scoped on purpose: the id comes from the URL, so without the user_id
    predicate any signed-in account could mark (and thereby probe the existence
    of) another account's notifications.
    """
    if not user_id or not notification_id:
        return False

    try:
        record = (
            Notification.where("id", notification_id).where("user_id", user_id).first()
        )
        if not record:
            return False
        if getattr(record, "read_at", None) is None:
            record.read_at = datetime.now()
            record.save()
        return True
    except Exception:
        return False


def mark_all_read(user_id):
    """Clear the badge. Returns how many rows were still unread."""
    if not user_id:
        return 0

    try:
        rows = list(
            Notification.where("user_id", user_id).where_null("read_at").get() or []
        )
        now = datetime.now()
        for record in rows:
            record.read_at = now
            record.save()
        return len(rows)
    except Exception:
        return 0
