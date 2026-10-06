"""Admin review of stories editors have submitted.

Routes are admin-only, but every action re-checks the role so a dropped
middleware cannot let an editor publish.
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
    review_stories_of,
)


# Where an editor lands from the notification; there is no per-story deep link.
_EDITOR_LINK = "/gears/dashboard?page=news"


def _is_admin(user):
    """Case-insensitive: the live `role` column has stray casing."""
    return (getattr(user, "role", "") or "").strip().lower() == "admin"


class ReviewController(Controller):
    def _actor(self, request):
        try:
            return request.user() if callable(getattr(request, "user", None)) else None
        except Exception:
            return None

    def _decide(self, request, response, story_id, approve):
        """Shared approve/reject body for one story."""
        is_ajax = wants_json(request)

        def _err(messages, status=422):
            if is_ajax:
                return json_errors(response, messages, status=status)
            return response.back().with_errors(messages)

        actor = self._actor(request)
        if not _is_admin(actor):
            return _err(["Only an admin can review stories."], status=403)

        record = News.where("id", story_id).first()
        if not record:
            return _err(["Story not found."], status=404)

        current = (getattr(record, "status", "") or "").strip().lower()
        if current != REVIEW_STATUS:
            # Already decided or withdrawn; refuse rather than overwrite another admin's call.
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
                # Back to draft so the editor can fix and resubmit; store() clears the reason.
                record.status = "draft"
                record.rejection_reason = reason
            record.save()

            Cache.forget(_NEWS_CACHE_KEY)
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
            # The admin console: an admin is redirected off /gears/dashboard anyway.
            return response.redirect(
                name="users.view", query_params={"page": "review"}
            ).with_success([message])
        except Exception as exception:
            traceback.print_exception(type(exception), exception, exception.__traceback__)
            return _err(["Could not record that decision. Please try again."])

    def _decide_issue(self, request, response, approve, issue_id=None):
        """Approve or reject one pending issue, all blocks at once. The queue's buttons call this."""
        is_ajax = wants_json(request)

        def _err(messages, status=422):
            if is_ajax:
                return json_errors(response, messages, status=status)
            return response.back().with_errors(messages)

        actor = self._actor(request)
        if not _is_admin(actor):
            return _err(["Only an admin can review stories."], status=403)

        # Re-read at decision time and scoped to this issue, so two admins with the
        # queue open cannot act on a stale list or each other's newsletter.
        stories = list(review_stories_of(issue_id) if issue_id else pending_stories() or [])
        if not stories:
            # Refuse rather than report success on nothing (double-click after a colleague).
            return _err(["Nothing is awaiting review."], status=409)

        reason = (request.input("reason") or "").strip()
        if not approve and not reason:
            return _err(["Please say why you are sending this issue back."])

        try:
            # One transaction: an issue is published whole or not at all.
            with DB.transaction():
                for record in stories:
                    if approve:
                        record.status = "published"
                        record.rejection_reason = None
                    else:
                        record.status = "draft"
                        record.rejection_reason = reason
                    record.save()
                # Stamp published_at on every approve (approval is publication for a
                # daily). UTC-aware: the ORM tags a naive datetime as UTC without shifting.
                if approve and issue_id:
                    try:
                        from datetime import datetime, timezone

                        from app.models.Issue import Issue

                        issue = Issue.where("id", issue_id).first()
                        if issue is not None:
                            issue.published_at = datetime.now(timezone.utc)
                            issue.save()
                    except Exception:
                        pass

            Cache.forget(_NEWS_CACHE_KEY)
            KioskBroadcast.section_changed("latest-news")

            # One notification per author, not one per block.
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
        return self._decide_issue(request, response, approve=True, issue_id=self._issue_id(request))

    def reject_issue(self, request: Request, response: Response):
        return self._decide_issue(request, response, approve=False, issue_id=self._issue_id(request))

    @staticmethod
    def _issue_id(request):
        try:
            return int(request.param("id")) or None
        except (TypeError, ValueError):
            return None

    def preview_issue(self, request: Request, response: Response, view: View):
        """One pending issue, as the kiosk will print it."""
        actor = self._actor(request)
        if not _is_admin(actor):
            return json_errors(response, ["Only an admin can review stories."], status=403)

        issue_id = self._issue_id(request)
        stories = list(review_stories_of(issue_id) if issue_id else pending_stories() or [])
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
        """One pending story rendered through the kiosk's own template."""
        record = News.where("id", request.param("id")).first()
        if not record:
            return json_errors(response, ["Story not found."], status=404)

        html = view.render("kiosk/_issue", preview_context(record)).rendered_template
        return json_success(response, payload={"id": getattr(record, "id", None), "html": html})
