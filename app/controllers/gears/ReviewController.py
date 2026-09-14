"""Admin review of stories editors have submitted.

Before this, "Publish" was one click by one person straight to a public campus
terminal, and the `news` table recorded nothing about who did it. Now an
editor's publish intent becomes `review` (NewsController._resolve_status_for_actor),
and it stays invisible until an admin acts here.

Both actions are admin-only at the route level. They are also written to be
safe if that guard were ever removed: each one re-checks the role rather than
trusting that the middleware ran.
"""

import traceback

from masonite.controllers import Controller
from masonite.facades import Cache
from masonite.request import Request
from masonite.response import Response
from masonite.views import View

from app.controllers.gears.NewsController import _NEWS_CACHE_KEY
from app.models.News import News
from app.services import KioskBroadcast, Notifications
from app.services.AjaxResponses import wants_json, json_success, json_errors
from config.database import DB

from app.services.ReviewQueue import (
    REVIEW_STATUS,
    issue_preview_context,
    pending_stories,
    preview_context,
)


#: Where an editor lands from the notification — the composer, with their story
#: in the library. There is no per-story deep link on the dashboard today.
_EDITOR_LINK = "/gears/dashboard?page=news"


def _is_admin(user):
    """Normalised like every other role check in the app: the live `role`
    column holds values with stray casing (see UserController._is_editor)."""
    return (getattr(user, "role", "") or "").strip().lower() == "admin"


class ReviewController(Controller):
    def _actor(self, request):
        try:
            return request.user() if callable(getattr(request, "user", None)) else None
        except Exception:
            return None

    def _decide(self, request, response, story_id, approve):
        """Shared approve/reject body — the two differ only in the status they
        write, whether a reason is required, and the notification they send."""
        is_ajax = wants_json(request)

        def _err(messages, status=422):
            if is_ajax:
                return json_errors(response, messages, status=status)
            return response.back().with_errors(messages)

        actor = self._actor(request)
        if not _is_admin(actor):
            # Belt and braces: the route already carries the `admin`
            # middleware. Duplicated because the cost of this check being
            # absent is an editor approving their own story onto a public
            # screen, and route middleware is easy to drop in a refactor.
            return _err(["Only an admin can review stories."], status=403)

        record = News.where("id", story_id).first()
        if not record:
            return _err(["Story not found."], status=404)

        current = (getattr(record, "status", "") or "").strip().lower()
        if current != REVIEW_STATUS:
            # Someone else already decided, or the editor withdrew it. Refusing
            # is better than silently re-deciding: two admins opening the queue
            # together would otherwise both "approve" and the second would
            # overwrite a rejection that had already been sent.
            return _err(["That story is no longer awaiting review."], status=409)

        reason = (request.input("reason") or "").strip()
        if not approve and not reason:
            return _err(["Please say why you are sending this story back."])

        title = getattr(record, "title", None) or "Your story"

        try:
            if approve:
                record.status = "published"
                record.rejection_reason = None
            else:
                # Back to draft, not deleted and not left in the queue: the
                # editor can fix it and resubmit, and store() clears the reason
                # when they do.
                record.status = "draft"
                record.rejection_reason = reason
            record.save()

            # Imported from NewsController rather than repeated as a literal:
            # the key carries a version suffix that gets bumped whenever the
            # cached projection changes, and a second copy would silently stop
            # matching on the next bump — leaving the kiosk serving a story the
            # admin just rejected for up to the cache TTL.
            Cache.forget(_NEWS_CACHE_KEY)
            # Same fact, second consumer: the terminal re-fetches instead of
            # waiting for its next manual reload. Approval is the moment a
            # story becomes publicly visible, so this is the site that matters.
            KioskBroadcast.section_changed("latest-news")

            Notifications.notify(
                getattr(record, "author_id", None),
                "news.approved" if approve else "news.rejected",
                (
                    f'"{title}" was published'
                    if approve
                    else f'"{title}" was sent back for changes'
                ),
                None if approve else reason,
                _EDITOR_LINK,
            )

            message = (
                "Story approved and published."
                if approve
                else "Story sent back to the editor."
            )

            if is_ajax:
                return json_success(
                    response,
                    payload={"id": getattr(record, "id", None), "status": record.status},
                    messages=[message],
                )
            # The admin console, not the editor dashboard: the queue moved
            # to /users and an admin is redirected off /gears/dashboard, so
            # this fallback would bounce them straight back here anyway.
            return response.redirect(
                name="users.view", query_params={"page": "review"}
            ).with_success([message])
        except Exception as exception:
            traceback.print_exception(type(exception), exception, exception.__traceback__)
            return _err(["Could not record that decision. Please try again."])

    def _decide_issue(self, request, response, approve):
        """Approve or reject the whole pending issue in one decision.

        An editor composes an issue as one thing and submits it in one click;
        this is the admin's matching single action. All-or-nothing by decision:
        one Approve publishes every pending block, one Reject sends every
        pending block back with one reason.

        The per-story _decide() above stays as the building block and for the
        API it already exposes; this is what the queue's buttons call.
        """
        is_ajax = wants_json(request)

        def _err(messages, status=422):
            if is_ajax:
                return json_errors(response, messages, status=status)
            return response.back().with_errors(messages)

        actor = self._actor(request)
        if not _is_admin(actor):
            return _err(["Only an admin can review stories."], status=403)

        # Re-read at decision time, not from whatever the page rendered: two
        # admins with the queue open would otherwise both act on a stale list.
        stories = list(pending_stories() or [])
        if not stories:
            # Refuse, do not report success on nothing -- a double-click after
            # a colleague already approved would otherwise say "published" to
            # an admin who published nothing.
            return _err(["Nothing is awaiting review."], status=409)

        reason = (request.input("reason") or "").strip()
        if not approve and not reason:
            return _err(["Please say why you are sending this issue back."])

        try:
            # One transaction: an issue is published whole or not at all. A
            # failure halfway would otherwise leave the kiosk printing half an
            # issue with the other half still in the queue.
            with DB.transaction():
                for record in stories:
                    if approve:
                        record.status = "published"
                        record.rejection_reason = None
                    else:
                        record.status = "draft"
                        record.rejection_reason = reason
                    record.save()

            # Once, after the batch: the cache is one thing, not one per block.
            Cache.forget(_NEWS_CACHE_KEY)
            KioskBroadcast.section_changed("latest-news")

            # One notification per author, not one per block. Three blocks by
            # the same editor is one issue and one bell entry, not three saying
            # the same thing.
            notified = set()
            for record in stories:
                author_id = getattr(record, "author_id", None)
                if not author_id or author_id in notified:
                    continue
                notified.add(author_id)
                Notifications.notify(
                    author_id,
                    "news.approved" if approve else "news.rejected",
                    (
                        "Your issue was published"
                        if approve
                        else "Your issue was sent back for changes"
                    ),
                    None if approve else reason,
                    _EDITOR_LINK,
                )

            count = len(stories)
            message = (
                f"Issue approved and published ({count} blocks)."
                if approve
                else f"Issue sent back to the editor ({count} blocks)."
            )

            if is_ajax:
                return json_success(
                    response,
                    payload={
                        "ids": [getattr(r, "id", None) for r in stories],
                        "status": "published" if approve else "draft",
                        "count": count,
                    },
                    messages=[message],
                )
            return response.redirect(
                name="users.view", query_params={"page": "review"}
            ).with_success([message])
        except Exception as exception:
            traceback.print_exception(type(exception), exception, exception.__traceback__)
            return _err(["Could not record that decision. Please try again."])

    def approve_issue(self, request: Request, response: Response):
        return self._decide_issue(request, response, approve=True)

    def reject_issue(self, request: Request, response: Response):
        return self._decide_issue(request, response, approve=False)

    def preview_issue(self, request: Request, response: Response, view: View):
        """The whole pending issue, as the kiosk will print it."""
        actor = self._actor(request)
        if not _is_admin(actor):
            return json_errors(response, ["Only an admin can review stories."], status=403)

        stories = list(pending_stories() or [])
        if not stories:
            return json_errors(response, ["Nothing is awaiting review."], status=404)

        html = view.render("kiosk/_issue", issue_preview_context(stories)).rendered_template
        return json_success(
            response,
            payload={"count": len(stories), "html": html},
        )

    def approve(self, request: Request, response: Response):
        return self._decide(request, response, request.param("id"), approve=True)

    def reject(self, request: Request, response: Response):
        return self._decide(request, response, request.param("id"), approve=False)

    def preview(self, view: View, request: Request, response: Response):
        """The kiosk-accurate render of one pending story.

        Returned as an HTML fragment the queue drops into a scaled frame rather
        than a JSON projection, because the whole point is that it goes through
        the same template the touchscreen uses.
        """
        record = News.where("id", request.param("id")).first()
        if not record:
            return json_errors(response, ["Story not found."], status=404)

        html = view.render("kiosk/_issue", preview_context(record)).rendered_template
        return json_success(response, payload={"id": getattr(record, "id", None), "html": html})
