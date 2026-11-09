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
from app.services import AdminConsole, DashboardContext, Notifications, PostLibrary, ReviewQueue


# section -> (context builder, partial template, context key holding the rows)
FRAGMENTS = {
    "events": (DashboardContext.events_context, "gears/partials/events-list", "events"),
    "archives": (DashboardContext.archives_context, "gears/partials/archives-list", "archives"),
    "videos": (DashboardContext.videos_context, "gears/partials/videos-list", "videos"),
    # The signed-in editor's own photo posts (the News panel's library column).
    # User-scoped: the context and the stamp both read only the caller's rows.
    "post-library": (
        DashboardContext.post_library_context,
        "gears/partials/post-library",
        "post_library",
    ),
    # Also re-emits the JSON block the organization <select>s rebuild from.
    "org-board-organizations": (
        DashboardContext.org_board_context,
        "gears/partials/organizations-list",
        "organizations",
    ),
    # Admin review queue; polling is the only signal since submissions raise no bell.
    "review": (
        ReviewQueue.review_context,
        "gears/partials/review-queue",
        "review_stories",
    ),
    # Admin count tiles; `review_stories` is the count the payload should report.
    "admin-stats": (
        AdminConsole.stats_context,
        "gears/partials/admin-stats",
        "review_stories",
    ),
}

_ADMIN_ONLY_SECTIONS = {"review", "admin-stats"}


def _is_admin(request):
    try:
        user = request.user() if callable(getattr(request, "user", None)) else None
    except Exception:
        return False
    return (getattr(user, "role", "") or "").strip().lower() == "admin"


# section -> model to read the change stamp from. Every FRAGMENTS key needs one.
STAMP_MODELS = {
    "events": Events,
    "archives": Archives,
    "videos": Video,
    "post-library": News,  # stamp is user-scoped; see _stamp_for
    "org-board-organizations": Organization,
    "review": News,  # submissions are News rows
    "admin-stats": News,  # three of four tiles are News figures
}


# Lives in DashboardContext so NewsController.layout can share it; alias kept for tests.
_section_stamp = DashboardContext.section_stamp


def _user_id(request):
    """users.id of the signed-in account, or None (guests and test doubles)."""
    try:
        user = request.user() if callable(getattr(request, "user", None)) else None
    except Exception:
        return None
    return getattr(user, "id", None) or None


# Sections whose context depends on who is asking (the editor's own posts).
_USER_SCOPED_SECTIONS = {"post-library"}


class DashboardController(Controller):
    def show(self, views: View, request: Request, response: Response):
        try:
            user = request.user() if callable(getattr(request, "user", None)) else None
        except Exception:
            user = None

        is_admin = (getattr(user, "role", "") or "").strip().lower() == "admin"

        # Admins get their own console at /users. Only show() redirects: fragment()
        # and stamps() are what that console polls.
        if is_admin:
            return response.redirect(name="users.view")

        default_page = (request.input("page") or "dashboard").strip() or "dashboard"
        context = DashboardContext.full_context(default_page, user_id=getattr(user, "id", None))

        # Request-specific keys, kept out of the request-agnostic full_context().
        context["current_user"] = user or None
        # Presentation only; the server downgrades an editor's publish intent regardless.
        context["is_admin"] = is_admin
        context["unread_notifications"] = Notifications.unread_count(getattr(user, "id", None))

        return views.render("gears/dashboard", context)

    def fragment(self, section, view: View, request: Request, response: Response):
        key = (section or "").strip().lower()
        entry = FRAGMENTS.get(key)
        if not entry:
            return json_errors(response, ["Unknown dashboard section."], status=404)

        # What the admin console polls. The queue names who has submitted what.
        if key in _ADMIN_ONLY_SECTIONS and not _is_admin(request):
            return json_errors(response, ["Only an admin can see this."], status=403)

        build_context, template, rows_key = entry
        user_id = _user_id(request)
        context = build_context(user_id) if key in _USER_SCOPED_SECTIONS else build_context()
        html = view.render(template, context).rendered_template
        rows = context.get(rows_key) or []

        return json_success(response, payload={
            "section": section,
            "html": html,
            "count": len(rows),
            "stamp": self._stamp_for(key, user_id),
        })

    @staticmethod
    def _stamp_for(section, user_id):
        """Change marker for one section. The library is per editor, so another
        editor's save does not read as a change here."""
        if section in _USER_SCOPED_SECTIONS:
            return PostLibrary.library_stamp(user_id)
        return _section_stamp(STAMP_MODELS[section])

    def stamps(self, request: Request, response: Response):
        # The bell's unread count rides on this 20s poll rather than a second timer.
        try:
            user = request.user() if callable(getattr(request, "user", None)) else None
        except Exception:
            user = None

        user_id = getattr(user, "id", None) or None
        return json_success(response, payload={
            "unread_notifications": Notifications.unread_count(user_id),
            "stamps": {
                name: self._stamp_for(name, user_id)
                for name in STAMP_MODELS
            }
        })
