"""IssueEvent Model -- one event chosen for one newsletter's calendar."""

from masoniteorm.models import Model


class IssueEvent(Model):
    """Link row between `issues` and `events`.

    Events stay owned by the Events panel. This row only records that a
    newsletter chose to show one, so the choice has somewhere to live. All
    reads and writes go through app/services/IssueCalendar.py.
    """

    __table__ = "issue_events"

    __fillable__ = [
        "issue_id",
        "event_id",
    ]
