"""Admin review of stories editors have submitted.

Routes are admin-only, but every action re-checks the role so a dropped
middleware cannot let an editor publish.
"""

import hmac
import traceback
from datetime import datetime, timezone

from masonite.controllers import Controller
from masonite.facades import Cache
from masonite.request import Request
from masonite.response import Response
from masonite.views import View

from app.controllers.gears.NewsController import _NEWS_CACHE_KEY
from app.models.News import News
from app.services import AuditLog, KioskBroadcast, Notifications, Posts
from app.services.AjaxResponses import wants_json, json_success, json_errors

from app.services.ReviewQueue import (
    REVIEW_STATUS,
    content_stamp,
    expiry_input,
    preview_context,
)


# Where an editor lands from the notification; there is no per-story deep link.
_EDITOR_LINK = "/gears/dashboard?page=news"


_STALE_PREVIEW = (
    "This has changed since you previewed it, or it hasn't been previewed. "
    "Open the preview and read it before approving."
)


def _matches_preview(request, stories):
    """True when `review_stamp` is the stamp of exactly these stories as they are now."""
    stamp = str(request.input("review_stamp") or "")
    return bool(stamp) and hmac.compare_digest(stamp, content_stamp(stories))


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

        if approve and not _matches_preview(request, [record]):
            return _err([_STALE_PREVIEW], status=409)

        reason = (request.input("reason") or "").strip()
        if not approve and not reason:
            return _err(["Please say why you are sending this story back."])

        title = getattr(record, "title", None) or "Your story"

        expires_at = None
        now = datetime.now(timezone.utc)
        if approve:
            # The admin's override is part of what is being approved, so it is
            # resolved only after the stamp check above has passed.
            try:
                expires_at = Posts.parse_local_expiry(request.input("expires_at"), now)
            except ValueError as error:
                return _err([str(error)])
            if expires_at is None:
                stored = getattr(record, "expires_at", None)
                if not isinstance(stored, datetime):
                    expires_at = Posts.default_expiry(now)
                elif Posts.is_expired(record, now):
                    return _err(
                        ["This post's expiry has passed. Set a new expiry to approve it."]
                    )
                else:
                    expires_at = stored

        try:
            if approve:
                record.status = "published"
                # Approval is publication: UTC-aware, because the ORM tags a naive
                # datetime as UTC without shifting it. expires_at is only ever
                # assigned a real datetime: None on a __dates__ column becomes now().
                record.published_at = now
                record.expires_at = expires_at
                record.rejection_reason = None
            else:
                # Back to draft so the editor can fix and resubmit; store() clears the reason.
                record.status = "draft"
                record.rejection_reason = reason
            record.save()
            AuditLog.record(
                "news.approved" if approve else "news.rejected",
                target_type="news",
                target_id=getattr(record, "id", None),
                details={"title": title} if approve else {"title": title, "reason": reason},
                actor=actor,
                request=request,
            )

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
                "Post approved and published."
                if approve
                else "Post sent back to the editor."
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

    def approve(self, request: Request, response: Response):
        return self._decide(request, response, request.param("id"), approve=True)

    def reject(self, request: Request, response: Response):
        return self._decide(request, response, request.param("id"), approve=False)

    def preview(self, view: View, request: Request, response: Response):
        """One pending story rendered through the kiosk's own template."""
        record = News.where("id", request.param("id")).first()
        if not record:
            return json_errors(response, ["Story not found."], status=404)

        html = view.render("kiosk/_post_card", preview_context(record)).rendered_template
        return json_success(
            response,
            payload={
                "id": getattr(record, "id", None),
                "html": html,
                "title": getattr(record, "title", None) or "",
                "expires_input": expiry_input(record),
                "review_stamp": content_stamp([record]),
            },
        )
