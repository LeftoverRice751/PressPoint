"""The events a newsletter chose for its calendar block.

The calendar used to be one global "next three events" query, which is why an
event added for a newsletter might never appear on it: nothing recorded the
choice, a date further out than three others was cut, and every issue printed
the same list. `issue_events` now records the choice and this module owns the
rules around it.

The issue being written to always comes from the signed-in editor, never from
the request, so another editor's newsletter cannot be reached.
"""

from config.database import DB

from app.models.Events import Events
from app.models.IssueEvent import IssueEvent
from app.services import Issues
from app.services.DashboardContext import calendar_row, upcoming_events

#: How many events the issue's calendar block is laid out for.
CAPACITY = 3


class CalendarRefused(Exception):
    """A change the rules forbid. `status` is the HTTP status to answer with."""

    def __init__(self, message, status=409):
        super().__init__(message)
        self.message = message
        self.status = status


# ── Database seams ───────────────────────────────────────────────────────────


def _transaction():
    return DB.transaction()


def _attached(issue_ids):
    """(issue_id, event_id) pairs for these issues."""
    rows = IssueEvent.where_in("issue_id", list(issue_ids)).get()
    return [(row.issue_id, row.event_id) for row in rows]


def _load_events(event_ids):
    """Live events by id, earliest first. Archive-sourced rows are not calendar
    entries, which is what upcoming_events() has always excluded too."""
    return list(
        Events.where_in("id", list(event_ids))
        .where("is_archive", 0)
        .order_by("event_date", "asc")
        .get()
    )


def _find_event(event_id):
    return Events.find(event_id)


def _insert_link(issue_id, event_id):
    IssueEvent.create({"issue_id": issue_id, "event_id": event_id})


def _delete_link(issue_id, event_id):
    IssueEvent.where("issue_id", issue_id).where("event_id", event_id).delete()


# ── Dates ────────────────────────────────────────────────────────────────────


def _is_past(at):
    """True when `at` falls on a day before today, campus time.

    By calendar day, never against the clock: the Add Event form sends a date
    only, so an event today is stored at 00:00 and is "earlier than now" from
    the moment it is saved. Compared as day strings because `event_date` is a
    naive local value that the ORM may hand back tagged with a timezone, and
    converting that tag would move the date.
    """
    if not hasattr(at, "strftime"):
        return True
    return at.strftime("%Y-%m-%d") < Issues.campus_now().strftime("%Y-%m-%d")


# ── Reads ────────────────────────────────────────────────────────────────────


def events_for(issue):
    """Everything chosen for `issue`, past dates included: the composer has to
    show a date so it can be removed, and a reprint must match what ran."""
    issue_id = getattr(issue, "id", issue)
    if not issue_id:
        return []
    try:
        links = _attached([issue_id])
        rows = _load_events([event_id for _, event_id in links]) if links else []
    except Exception:
        # One block on a public screen. A DB hiccup here must not take the
        # whole issue down with it; the partial skips an empty calendar.
        return []
    return [calendar_row(row) for row in rows]


def upcoming_by_issue(issue_ids):
    """{issue id: rows} for the kiosk, one query for every slide. Dates already
    past are dropped: a public screen should not advertise yesterday."""
    result = {issue_id: [] for issue_id in issue_ids}
    if not result:
        return result
    try:
        links = _attached(list(result))
        rows = _load_events({event_id for _, event_id in links}) if links else []
    except Exception:
        return result

    owners = {}
    for issue_id, event_id in links:
        owners.setdefault(event_id, []).append(issue_id)
    for row in rows:
        if _is_past(getattr(row, "event_date", None)):
            continue
        for issue_id in owners.get(row.id, []):
            result[issue_id].append(calendar_row(row))
    return result


def _count(issue_id):
    return len(_attached([issue_id]))


def _summary(issue, count):
    return {
        "issue_no": int(getattr(issue, "number", 0) or 0) or None,
        "count": count,
        "capacity": CAPACITY,
        "full": count >= CAPACITY,
    }


def _locked(issue):
    """Locked during review so what the admin read is what gets approved."""
    return Issues.status_of(issue) == Issues.REVIEW_STATUS


def offer_for(user_id, event_date):
    """What the modal after an event save should ask, or None to not ask.

    With no open issue the offer still stands, because adding an event before
    writing the first story is an ordinary way to start. Nothing is created
    unless the editor answers yes.
    """
    if not user_id or _is_past(event_date):
        return None
    issue = Issues.current_for(user_id)
    if issue is None:
        return _summary(None, 0)
    if _locked(issue):
        return None
    return _summary(issue, _count(issue.id))


def manager_context(issue):
    """What the composer's Calendar section renders, plus the canvas's dates."""
    chosen = events_for(issue)
    chosen_ids = {row["id"] for row in chosen}
    return {
        "calendar_events": chosen,
        "calendar_capacity": CAPACITY,
        "calendar_choices": [row for row in upcoming_events() if row["id"] not in chosen_ids],
        "calendar_locked": bool(issue) and _locked(issue),
    }


# ── Writes ───────────────────────────────────────────────────────────────────


def attach(user_id, event_id):
    """Put an event on the editor's open newsletter, starting one if needed."""
    # Checked before ensure_current_for() so a bad id cannot create an issue.
    event = _find_event(event_id)
    if event is None or getattr(event, "is_archive", 0):
        raise CalendarRefused("That event is no longer available.", status=404)
    if _is_past(getattr(event, "event_date", None)):
        raise CalendarRefused("That event has already passed.", status=422)

    issue = Issues.ensure_current_for(user_id)
    if _locked(issue):
        raise CalendarRefused("This newsletter is in review, so its calendar is locked.")

    with _transaction():
        ids = [linked for _, linked in _attached([issue.id])]
        if event_id in ids:
            return _summary(issue, len(ids))
        if len(ids) >= CAPACITY:
            raise CalendarRefused(
                f"The calendar holds {CAPACITY} events. Remove one to add another."
            )
        _insert_link(issue.id, event_id)
    return _summary(issue, len(ids) + 1)


def copy_upcoming(source_id, target_id):
    """Carry a calendar into a duplicated issue, leaving out dates already past.
    Runs inside IssueLibrary.duplicate()'s transaction, so a failure here has to
    raise and roll the whole copy back. The target may be a reused empty draft,
    whose earlier choices the copied newsletter replaces."""
    for _, event_id in _attached([target_id]):
        _delete_link(target_id, event_id)
    links = _attached([source_id])
    rows = _load_events([event_id for _, event_id in links]) if links else []
    for row in rows:
        if not _is_past(getattr(row, "event_date", None)):
            _insert_link(target_id, row.id)


def detach(user_id, event_id):
    """Take an event off the editor's open newsletter."""
    issue = Issues.current_for(user_id)
    if issue is None:
        return _summary(None, 0)
    if _locked(issue):
        raise CalendarRefused("This newsletter is in review, so its calendar is locked.")
    _delete_link(issue.id, event_id)
    return _summary(issue, _count(issue.id))
