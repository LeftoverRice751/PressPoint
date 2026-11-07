"""CreateIssueEventsTable Migration.

Gives each newsletter its own calendar. Until now the calendar was one global
"next three events" query, so an editor's choice had nowhere to be stored and
every issue printed the same dates.

Two parts:

  1. Schema. `issue_events` links an issue to an event. Both keys cascade: a
     link means nothing once either side is gone. There is no sort column
     because the calendar always orders by `event_date`.

  2. Data. Issues already published keep the calendar they have been showing:
     up to three events from the publish day on, which is what the print view
     computed. Compared by day because older `published_at` values mix UTC and
     campus-local time. Open drafts and issues in review get no rows on
     purpose: a new calendar starts empty until an editor chooses its dates.

This is a DATA migration, the class that broke this repo's history (see the
header of databases/schema.sql): it guards its preconditions and returns early.
The status names are spelled out here, not imported, so a later change to the
app cannot change what this migration did. `down()` drops the table.
"""

from masoniteorm.migrations import Migration
from masoniteorm.query import QueryBuilder

CAPACITY = 3
VISIBLE_STATUSES = {"approved", "scheduled", "published", "publish", "live"}


def _day(value):
    """The YYYY-MM-DD of a datetime or of the string a driver returned for one."""
    return value.strftime("%Y-%m-%d") if hasattr(value, "strftime") else str(value)[:10]


def publish_day(issue):
    """When an issue ran. Older issues have no `published_at`, and fall back to
    `created_at` the way Issues.expires_at() does."""
    return issue["published_at"] or issue["created_at"]


def pick_calendar(events, published_at):
    """Ids of the first CAPACITY events on or after the publish day. `events`
    must already be in date order."""
    day = _day(published_at)
    return [event["id"] for event in events if _day(event["event_date"]) >= day][:CAPACITY]


def published_issue_ids(news_rows):
    """Issues with at least one story the kiosk would show."""
    return {
        row["issue_id"]
        for row in news_rows
        if row["issue_id"] is not None
        and str(row["status"] or "").strip().lower() in VISIBLE_STATUSES
    }


class CreateIssueEventsTable(Migration):
    def _query(self):
        return QueryBuilder(connection=self.schema.connection)

    def up(self):
        if self.schema.has_table("issue_events"):
            return
        if not self.schema.has_table("issues") or not self.schema.has_table("events"):
            return

        with self.schema.create("issue_events") as table:
            table.increments("id")
            table.integer("issue_id").unsigned()
            table.integer("event_id").unsigned()
            table.timestamps()
            table.foreign("issue_id").references("id").on("issues").on_delete("cascade")
            table.foreign("event_id").references("id").on("events").on_delete("cascade")
            table.unique(["issue_id", "event_id"])

        published = published_issue_ids(
            self._query().table("news").select("issue_id", "status").where_null("deleted_at").get()
        )
        events = list(
            self._query()
            .table("events")
            .where("is_archive", 0)
            .order_by("event_date", "asc")
            .get()
        )
        issues = (
            self._query()
            .table("issues")
            .select("id", "published_at", "created_at")
            .where_null("deleted_at")
            .get()
        )
        for issue in issues:
            if issue["id"] not in published:
                continue
            for event_id in pick_calendar(events, publish_day(issue)):
                self._query().table("issue_events").create(
                    {"issue_id": issue["id"], "event_id": event_id}
                )

    def down(self):
        if self.schema.has_table("issue_events"):
            self.schema.drop("issue_events")
