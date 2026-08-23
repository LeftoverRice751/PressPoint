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
from app.models.Organization import Organization
from app.models.Video import Video
from app.services.AjaxResponses import json_success, json_errors
from app.services import DashboardContext


#: section -> (context builder, partial template, context key holding the rows)
FRAGMENTS = {
    "events": (DashboardContext.events_context, "gears/partials/events-list", "events"),
    "archives": (DashboardContext.archives_context, "gears/partials/archives-list", "archives"),
    "videos": (DashboardContext.videos_context, "gears/partials/videos-list", "videos"),
    "news": (DashboardContext.news_context, "gears/partials/news-slots", "news_items"),
    # Re-renders the composer canvas (kiosk/_news_slots.html in editor mode) so
    # the story-library drawer can refresh the secondary/widget placeholders
    # after an assignment without a full page reload. Never wired into the
    # 20s poll (no matching `data-live-section` in the DOM) — only fetched
    # directly, right after a drawer assignment succeeds. See
    # resources/js/news-dashboard.js `refreshCanvasFragment()`.
    "news-canvas": (DashboardContext.news_canvas_context, "kiosk/_news_slots", "news_items"),
    # The org board's managed organization list. Refreshing it also re-emits the
    # JSON block the three organization <select>s rebuild themselves from, so
    # adding one shows up in every dropdown without a page reload.
    "org-board-organizations": (
        DashboardContext.org_board_context,
        "gears/partials/organizations-list",
        "organizations",
    ),
}

#: section -> model to read the change stamp from
STAMP_MODELS = {
    "events": Events,
    "archives": Archives,
    "videos": Video,
    "news": News,
    "news-canvas": News,
    # `fragment` indexes this dict unguarded, so every FRAGMENTS key needs one.
    "org-board-organizations": Organization,
}


def _section_stamp(model):
    """A cheap marker that moves whenever the section's rows change.

    Creates and updates advance `max(updated_at)`; deletes change the count.
    Both are SQL aggregates, so polling never loads the rows themselves.
    """
    try:
        count = model.count()
        latest_row = model.max("updated_at").first()
        latest = getattr(latest_row, "updated_at", None) if latest_row else None
    except Exception:
        return "0:"

    return f"{count or 0}:{latest if latest is not None else ''}"


class DashboardController(Controller):
    def show(self, views: View, request: Request):
        default_page = (request.input("page") or "dashboard").strip() or "dashboard"
        return views.render("gears/dashboard", DashboardContext.full_context(default_page))

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

    def stamps(self, response: Response):
        return json_success(response, payload={
            "stamps": {
                name: _section_stamp(model)
                for name, model in STAMP_MODELS.items()
            }
        })
