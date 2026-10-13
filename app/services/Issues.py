"""Issues: the unit an editor composes and an admin decides on.

An issue is a row (app/models/Issue.py) with an owner, a number and its own
stories (`news.issue_id`). This module answers the questions every surface
asks about them:

    the composer   which issue is THIS editor working on?     current_for()
    the composer   which issues were ever published?          published_issues()
    the kiosk      which issues are today's paper?            current_issues()
    the admin      which issues are waiting on a decision?    pending_issues()
    news.layout    has this issue moved since the page loaded? stamp_for()

Issue status is DERIVED from the stories, never stored (see the model's
docstring for why). An issue is published if any of its stories is publicly
visible, in review if any is in review, otherwise a draft.
"""

from datetime import datetime, timedelta
from zoneinfo import ZoneInfo

from app.models.Issue import Issue
from app.models.News import News
from app.services.DashboardContext import normalize_news_status

#: Where the kiosk stands. Named explicitly rather than read from the process
#: because `published_at` comes back UTC-aware from pendulum and CI runs in
#: UTC: converting through the system zone there would put a 23:50 UTC
#: approval on the wrong calendar day.
CAMPUS_TZ = ZoneInfo("Asia/Manila")

#: Latest News is a daily paper. An issue is current from approval until this
#: hour on the NEXT calendar day -- 08:00, not midnight, so the morning shift
#: still sees yesterday's paper on the way in and a fresh one is expected by
#: the start of classes. One place to change if that ever moves.
ISSUE_EXPIRES_AT_HOUR = 8

#: Statuses that put a story on the kiosk. Mirrors NewsController's
#: _NEWS_VISIBLE_STATUSES; not imported from there because the controller
#: imports from the services package and the reverse would be a cycle.
#: `scheduled` counts here as "published-shaped"; the kiosk payload still
#: applies the date check per story before printing.
VISIBLE_STATUSES = frozenset({"approved", "scheduled", "published"})
REVIEW_STATUS = "review"


def next_number():
    """The next display number: one past the highest ever used, deleted
    issues included, so a number is never reused after a delete."""
    try:
        row = Issue.with_trashed().order_by("number", "desc").first()
    except Exception:
        row = None
    highest = int(getattr(row, "number", 0) or 0) if row else 0
    return highest + 1


def stories_of(issue):
    """The issue's live stories, oldest first. Accepts an Issue or an id."""
    issue_id = getattr(issue, "id", issue)
    if not issue_id:
        return []
    try:
        return list(News.where("issue_id", issue_id).order_by("id", "asc").get() or [])
    except Exception:
        return []


def status_from_stories(stories):
    """Derived issue status from its stories' statuses."""
    statuses = {normalize_news_status(getattr(s, "status", None)) for s in stories or []}
    if statuses & VISIBLE_STATUSES:
        return "published"
    if REVIEW_STATUS in statuses:
        return REVIEW_STATUS
    return "draft"


def status_of(issue):
    return status_from_stories(stories_of(issue))


def current_for(user_id):
    """The editor's OPEN issue: their newest owned issue that is not
    published. READ-ONLY -- None when there is none yet.

    Rendering the composer must not write rows: a GET that inserts is a
    surprise to every caller that renders a page (tests with a stand-in user,
    a prefetch, the admin console's polls), and the owner FK rightly refuses
    an owner that does not exist. Creation happens on the first WRITE instead
    -- see ensure_current_for(), which store() calls -- so until an editor
    saves something the top bar simply says the issue is new.

    None for a caller with no user id: an issue with no owner would be shared
    by every such caller, which is the situation this whole feature exists
    to end.
    """
    if not user_id:
        return None
    try:
        owned = list(
            Issue.where("owner_id", user_id).order_by("id", "desc").get() or []
        )
    except Exception:
        owned = []

    for issue in owned:
        if status_of(issue) != "published":
            return issue
    return None


def ensure_current_for(user_id):
    """The editor's open issue, created if they have none -- so the first
    save of a session, and the first save after their last issue publishes,
    lands in a fresh newsletter without a "new issue" button. For WRITE
    paths only; the read side is current_for()."""
    if not user_id:
        return None
    existing = current_for(user_id)
    if existing is not None:
        return existing
    # No `published_at` key at all. It is a __dates__ column, and the ORM
    # runs every dates column it is handed through get_new_date(), where
    # None means "now" -- so `"published_at": None` stamped every issue as
    # published at creation, and the approval's "set if unset" never fired.
    return Issue.create({
        "number": next_number(),
        "owner_id": user_id,
        "title": None,
    })


def _issues_where_stories(predicate):
    """Issues that have at least one story satisfying `predicate`, with the
    matching stories attached as `.stories` for the caller to render."""
    try:
        issues = list(Issue.order_by("id", "desc").get() or [])
    except Exception:
        return []
    out = []
    for issue in issues:
        stories = [s for s in stories_of(issue) if predicate(s)]
        if stories:
            issue.stories = stories
            out.append(issue)
    return out


def published_issues():
    """Issues with at least one publicly visible story, newest first --
    by published_at when set, else by id. One kiosk slide each."""
    found = _issues_where_stories(
        lambda s: normalize_news_status(getattr(s, "status", None)) in VISIBLE_STATUSES
    )
    found.sort(
        key=lambda i: (
            getattr(i, "published_at", None) is None,
            -(getattr(i, "published_at", None).timestamp()
              if getattr(i, "published_at", None) is not None
              and hasattr(getattr(i, "published_at", None), "timestamp") else 0),
            -(getattr(i, "id", 0) or 0),
        )
    )
    return found


def _campus_local(value):
    """`value` as a naive campus-local datetime, or None.

    Naive datetimes are taken as already local: approval writes
    `datetime.now()` on a +08:00 server. Aware ones (pendulum's UTC reads)
    are converted explicitly, never through the process zone (see CAMPUS_TZ).
    """
    if value is None or not hasattr(value, "year"):
        return None
    if not isinstance(value, datetime):
        return datetime.combine(value, datetime.min.time())
    if value.tzinfo is not None:
        return value.astimezone(CAMPUS_TZ).replace(tzinfo=None)
    return value


def campus_now():
    """Naive campus-local now -- what `_campus_local()` values compare to."""
    return datetime.now(CAMPUS_TZ).replace(tzinfo=None)


def expires_at(issue):
    """When `issue` stops being today's paper: ISSUE_EXPIRES_AT_HOUR on the
    calendar day after it was published (campus time). Whatever the hour of
    approval -- 07:30 Monday and 23:50 Monday both expire Tuesday 08:00.

    Issues from before `published_at` existed fall back to `created_at`.
    None when neither is readable, which current_issues() treats as expired.
    """
    at = _campus_local(getattr(issue, "published_at", None)) or _campus_local(
        getattr(issue, "created_at", None)
    )
    if at is None:
        return None
    next_day = at.date() + timedelta(days=1)
    return datetime.combine(next_day, datetime.min.time()).replace(hour=ISSUE_EXPIRES_AT_HOUR)


def current_issues(now=None):
    """The kiosk's cut of published_issues(): every issue that has not yet
    expired, newest first. When nothing is current (Monday morning before a
    new paper is approved) the newest published issue is kept so the terminal
    never shows a blank Latest News.

    The kiosk reads this through NewsCache (TTL 300s), so an issue drops off
    within five minutes of its expiry with no scheduler involved.
    """
    now = now if now is not None else campus_now()
    published = published_issues()
    current = []
    for issue in published:
        until = expires_at(issue)
        if until is not None and now < until:
            current.append(issue)
    if current:
        return current
    return published[:1]


def pending_issues():
    """Issues with at least one story awaiting review, oldest first -- a work
    queue, so the one that has waited longest comes first."""
    found = _issues_where_stories(
        lambda s: normalize_news_status(getattr(s, "status", None)) == REVIEW_STATUS
    )
    found.sort(key=lambda i: getattr(i, "id", 0) or 0)
    return found


def _stamp_of(query):
    """`count:max(updated_at)` off a News query -- the shape every stamp uses."""
    try:
        row = query.select_raw("COUNT(*) AS n, MAX(updated_at) AS m").first()
        n = getattr(row, "n", None) if row is not None else None
        m = getattr(row, "m", None) if row is not None else None
        if isinstance(row, dict):
            n, m = row.get("n"), row.get("m")
        return f"{int(n or 0)}:{m or ''}"
    except Exception:
        return "0:"


def stamp_for(issue):
    """`count:max(updated_at)` over THIS issue's stories -- the
    optimistic-concurrency token news.layout checks. Scoped to the issue so
    one editor's writes never read as a conflict to another editor working
    on a different newsletter."""
    issue_id = getattr(issue, "id", issue)
    if not issue_id:
        return "0:"
    return _stamp_of(News.where("issue_id", issue_id))


def is_visible(story):
    """True when `story` is on the kiosk side of the review gate."""
    return normalize_news_status(getattr(story, "status", None)) in VISIBLE_STATUSES


def published_local(issue):
    """The issue's publish moment as naive campus-local time, or None."""
    return _campus_local(getattr(issue, "published_at", None))


def owned_issue(user_id, issue_id):
    """`issue_id` if `user_id` owns it, else None.

    The owner is part of the WHERE, not checked after a plain find(): a guessed
    id then gets the same None (404) as a missing one, so the endpoint cannot
    be used to confirm another editor's issue exists."""
    if not user_id or not issue_id:
        return None
    try:
        return Issue.where("id", issue_id).where("owner_id", user_id).first()
    except Exception:
        return None


def _owned(user_id):
    try:
        return list(Issue.where("owner_id", user_id).get() or [])
    except Exception:
        return []


def _library_sort_key(issue):
    at = published_local(issue)
    return (at is None, -(at.timestamp() if at else 0), -(getattr(issue, "id", 0) or 0))


def published_by(user_id):
    """The Story Library's Published tab: `user_id`'s issues with at least one
    visible story, newest publication first, each with `.stories` set to its
    visible stories (oldest first).

    Two queries, not one per issue: _issues_where_stories() calls stories_of()
    per issue, which is fine for the kiosk's handful of current issues and an
    N+1 across an editor's whole back catalogue.

    The story query selects only the five columns library_rows() reads. It
    used to hydrate every row whole, `description` HTML bodies included, just
    to count and label them on each dashboard render and live refresh (the
    same fix super_admin_stats() got). The SoftDeletes scope still adds
    `deleted_at IS NULL` to a narrowed select."""
    if not user_id:
        return []
    owned = _owned(user_id)
    if not owned:
        return []
    ids = [getattr(i, "id", None) for i in owned]
    try:
        rows = list(
            News.where_in("issue_id", ids)
            .select("id", "issue_id", "status", "layout_type", "title")
            .order_by("id", "asc").get() or []
        )
    except Exception:
        return []

    by_issue = {}
    for row in rows:
        if is_visible(row):
            by_issue.setdefault(getattr(row, "issue_id", None), []).append(row)

    out = []
    for issue in owned:
        stories = by_issue.get(getattr(issue, "id", None))
        if stories:
            issue.stories = stories
            out.append(issue)
    out.sort(key=_library_sort_key)
    return out


def library_stamp(user_id):
    """Change marker for the Published tab: every story in every issue this
    editor owns. stamp_for is per OPEN issue, so it never moves when an
    admin approves one of this editor's older issues -- this one does."""
    if not user_id:
        return "0:"
    ids = [getattr(i, "id", None) for i in _owned(user_id)]
    if not ids:
        return "0:"
    return _stamp_of(News.where_in("issue_id", ids))
