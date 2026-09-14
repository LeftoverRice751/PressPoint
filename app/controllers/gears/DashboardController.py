"""Editor dashboard: the full page, plus the pieces that keep it live.

`fragment` re-renders one section's list from the same partial the full page
uses, so an editor's change lands in place instead of reloading everything.
`stamps` reports a cheap per-section change marker the browser polls, so a
dashboard left open notices another editor's work without refetching anything
that has not moved.
"""

from masonite.controllers import Controller
from masonite.request import Request
from masonite.response import Response
from masonite.views import View

from app.models.Archives import Archives
from app.models.Events import Events
from app.models.News import News
from app.models.NewsCategory import NewsCategory
from app.models.Organization import Organization
from app.models.Video import Video
from app.services.AjaxResponses import json_success, json_errors
from app.services import AdminConsole, DashboardContext, Notifications, ReviewQueue


#: section -> (context builder, partial template, context key holding the rows)
FRAGMENTS = {
    "events": (DashboardContext.events_context, "gears/partials/events-list", "events"),
    "archives": (DashboardContext.archives_context, "gears/partials/archives-list", "archives"),
    "videos": (DashboardContext.videos_context, "gears/partials/videos-list", "videos"),
    "news": (DashboardContext.news_context, "gears/partials/news-slots", "news_items"),
    # Re-renders the composer canvas (kiosk/_issue.html in editor mode) so the
    # story-library drawer can refresh the slot placeholders after an
    # assignment without a full page reload. It is the same partial the kiosk
    # renders, which is the point: an injected row cannot differ from a freshly
    # rendered one. Never wired into the 20s poll (no matching
    # `data-live-section` in the DOM) — only fetched directly, right after a
    # drawer assignment succeeds. See news-dashboard.js `refreshCanvasFragment()`.
    "news-canvas": (DashboardContext.news_canvas_context, "kiosk/_issue", "news_items"),
    # The composer's category list. Refreshing it also re-emits the JSON block
    # the category modal rebuilds its options from, so a category another
    # editor just added becomes assignable without a reload — same pattern as
    # org-board-organizations below.
    #
    # This needs its OWN section rather than riding on "news": a rename
    # changes a label the kiosk renders while touching zero news rows, so
    # section_stamp(News) does not move and the news poll would never fire.
    "news-categories": (
        DashboardContext.news_categories_context,
        "gears/partials/news-categories-list",
        "news_categories",
    ),
    # The org board's managed organization list. Refreshing it also re-emits the
    # JSON block the three organization <select>s rebuild themselves from, so
    # adding one shows up in every dropdown without a page reload.
    "org-board-organizations": (
        DashboardContext.org_board_context,
        "gears/partials/organizations-list",
        "organizations",
    ),
    # The admin's queue of stories editors have submitted. Polled like any
    # other section so a submission appears without the admin reloading — the
    # only signal they get, since submissions deliberately do not raise a bell
    # notification.
    "review": (
        ReviewQueue.review_context,
        "gears/partials/review-queue",
        "review_stories",
    ),
    # The admin console's count tiles. Same 20s poll, so the queue depth on
    # /users is never staler than the queue itself sitting next to it.
    # `review_stories` as the rows_key is not a placeholder: the pending count
    # IS the number this fragment's payload should report.
    "admin-stats": (
        AdminConsole.stats_context,
        "gears/partials/admin-stats",
        "review_stories",
    ),
}

#: section -> model to read the change stamp from
STAMP_MODELS = {
    "events": Events,
    "archives": Archives,
    "videos": Video,
    "news": News,
    "news-canvas": News,
    # Its own model, deliberately: a rename bumps news_categories.updated_at
    # and nothing on `news`, so watching News here would miss exactly the
    # change this section exists to catch.
    "news-categories": NewsCategory,
    # `fragment` indexes this dict unguarded, so every FRAGMENTS key needs one.
    "org-board-organizations": Organization,
    # Submissions are News rows, so the news stamp already moves when one
    # arrives. Pointing at the same model keeps the queue live without a
    # second aggregate.
    "review": News,
    # Three of the four tiles are News figures, and the fourth (editor
    # accounts) only changes through this console's own form, which does a
    # full redirect. News is the right thing to watch.
    "admin-stats": News,
}


# Moved to DashboardContext so NewsController.layout can share it as an
# optimistic-concurrency token without importing this controller. Kept as an
# alias because the fragment/stamps methods below and the tests both name it.
_section_stamp = DashboardContext.section_stamp


class DashboardController(Controller):
    def show(self, views: View, request: Request, response: Response):
        try:
            user = request.user() if callable(getattr(request, "user", None)) else None
        except Exception:
            user = None

        is_admin = (getattr(user, "role", "") or "").strip().lower() == "admin"

        # Admins have their own console at /users -- counts, the approval
        # queue, and editor accounts. This is the editors' composer, and an
        # admin landing here is how the approval queue ended up buried inside
        # a surface its own audience never opens. Checked before
        # full_context() so the redirect does not pay for a page nobody
        # renders. Only show() redirects: fragment() and stamps() below are
        # what the admin console itself polls, and bouncing those would break
        # its live refresh.
        if is_admin:
            return response.redirect(name="users.view")

        default_page = (request.input("page") or "dashboard").strip() or "dashboard"
        context = DashboardContext.full_context(default_page)

        # The shell needs to know who is looking at it: the profile border
        # renders their name and avatar. Not part of full_context() because
        # that is request-agnostic — the fragment endpoints call the same
        # builders.
        context["current_user"] = user or None
        # Presentation only, and now always False here. The composer still
        # reads it for data-can-publish; the server downgrades an editor's
        # publish intent regardless (NewsController._resolve_status_for_actor).
        context["is_admin"] = is_admin
        context["unread_notifications"] = Notifications.unread_count(getattr(user, "id", None))

        return views.render("gears/dashboard", context)

    def fragment(self, section, view: View, response: Response):
        entry = FRAGMENTS.get((section or "").strip().lower())
        if not entry:
            return json_errors(response, ["Unknown dashboard section."], status=404)

        build_context, template, rows_key = entry
        context = build_context()
        html = view.render(template, context).rendered_template
        rows = context.get(rows_key) or []

        return json_success(response, payload={
            "section": section,
            "html": html,
            "count": len(rows),
            "stamp": _section_stamp(STAMP_MODELS[section]),
        })

    def stamps(self, request: Request, response: Response):
        # The bell's unread count rides along on the poll the dashboard already
        # runs every 20 seconds rather than adding a second timer. It is a
        # COUNT against the (user_id, read_at) index, so it costs about the
        # same as one more stamp.
        try:
            user = request.user() if callable(getattr(request, "user", None)) else None
        except Exception:
            user = None

        return json_success(response, payload={
            "unread_notifications": Notifications.unread_count(getattr(user, "id", None)),
            "stamps": {
                name: _section_stamp(model)
                for name, model in STAMP_MODELS.items()
            }
        })
