from datetime import datetime
import os
import traceback

from masonite.controllers import Controller
from masonite.configuration import config
from masonite.filesystem import Storage
from masonite.facades import Broadcast
from masonite.request import Request
from masonite.response import Response
from masonite.views import View

from app.events.NewNews import NewNews
from app.models.News import News
from app.services.AjaxResponses import wants_json, json_success, json_errors


_NEWS_STATUS_ALIASES = {
    "pending": "review",
    "reviewing": "review",
    "publish": "published",
    "live": "published",
}
_NEWS_VISIBLE_STATUSES = {"approved", "scheduled", "published"}
_NEWS_ALLOWED_STATUSES = {"draft", "review", "approved", "scheduled", "published", "archived"}


def _normalize_news_status(raw_status, default="approved"):
    status = (raw_status or default or "approved").strip().lower()
    status = _NEWS_STATUS_ALIASES.get(status, status)
    if status not in _NEWS_ALLOWED_STATUSES:
        return default or "approved"
    return status


def _news_is_public(news_item):
    status = _normalize_news_status(getattr(news_item, "status", None), default="approved")
    if status not in _NEWS_VISIBLE_STATUSES:
        return False

    published_at = getattr(news_item, "published_at", None)
    if status == "scheduled":
        if not published_at or not hasattr(published_at, "timestamp"):
            return False

        now = datetime.now(published_at.tzinfo) if getattr(published_at, "tzinfo", None) else datetime.now()
        return published_at <= now

    return True


def _pusher_configured():
    broadcasts = config("broadcast.broadcasts", {}) or config("broadcast.BROADCASTS", {}) or {}
    pusher_settings = broadcasts.get("pusher") or {}
    return bool(
        (pusher_settings.get("client") or pusher_settings.get("key"))
        and pusher_settings.get("app_id")
        and pusher_settings.get("secret")
    )


def _build_flash_payload(news_item):
    reference_at = getattr(news_item, "published_at", None) or getattr(news_item, "created_at", None)
    return {
        "headline": getattr(news_item, "title", None) or "News update",
        "date": reference_at.strftime("%b %d, %Y") if hasattr(reference_at, "strftime") else "",
        "copy": getattr(news_item, "description", None) or "",
        "kind": "news",
        "occured_on": reference_at.date().isoformat() if hasattr(reference_at, "date") else "",
        "today_key": datetime.now().date().isoformat(),
    }


class NewsController(Controller):
    def _group_news_slots(self, news_items):
        sorted_items = sorted(
            list(news_items or []),
            key=lambda item: (
                -int(getattr(item, "priority", 0) or 0),
                -int(getattr(item, "id", 0) or 0),
            ),
        )

        main_news = next(
            (item for item in sorted_items if (getattr(item, "layout_type", "") or "").lower() == "main"),
            sorted_items[0] if sorted_items else None,
        )

        secondary_news = [
            item for item in sorted_items
            if item is not main_news and (getattr(item, "layout_type", "secondary") or "secondary").lower() == "secondary"
        ][:4]

        widget_news = [
            item for item in sorted_items
            if item is not main_news and (getattr(item, "layout_type", "") or "").lower() == "widget"
        ][:2]

        return {
            "main_news": main_news,
            "secondary_news": secondary_news,
            "widget_news": widget_news,
        }

    def show(self, view: View):
        news_items = [item for item in sorted(list(News.all() or []), key=lambda item: getattr(item, "id", 0), reverse=True) if _news_is_public(item)]
        news_slots = self._group_news_slots(news_items)

        return view.render(
            "kiosk/news",
            {
                "news_items": news_items,
                "featured_news": news_slots["main_news"],
                "recent_news": news_slots["secondary_news"],
                "main_news": news_slots["main_news"],
                "secondary_news": news_slots["secondary_news"],
                "widget_news": news_slots["widget_news"],
                "active_nav": "news",
            },
        )

    def store(self, request: Request, storage: Storage, response: Response):
        title = (request.input("title") or "").strip()
        description = (request.input("description") or "").strip()
        source = (request.input("source") or "").strip()
        location = (request.input("location") or "").strip()
        layout_type = (request.input("layout_type") or "secondary").strip().lower() or "secondary"
        status = _normalize_news_status(request.input("status"), default="approved")
        published_at_value = (request.input("published_at") or "").strip()
        priority_value = request.input("priority")
        image_file = request.input("image")

        if isinstance(image_file, list):
            image_file = image_file[0] if image_file else None

        if image_file and not hasattr(image_file, "name") and hasattr(image_file, "filename"):
            class _UploadedImageAdapter:
                def __init__(self, file_obj):
                    self._file_obj = file_obj
                    self.name = getattr(file_obj, "filename", "upload")

                def extension(self):
                    if hasattr(self._file_obj, "extension"):
                        return self._file_obj.extension()

                    filename = getattr(self._file_obj, "filename", "") or ""
                    return os.path.splitext(filename)[1]

                def get_content(self):
                    if hasattr(self._file_obj, "get_content"):
                        return self._file_obj.get_content()

                    if hasattr(self._file_obj, "stream"):
                        stream = self._file_obj.stream()
                        return stream.read() if hasattr(stream, "read") else stream

                    return getattr(self._file_obj, "content", b"")

            image_file = _UploadedImageAdapter(image_file)

        is_ajax = wants_json(request)

        def _err(messages):
            if is_ajax:
                return json_errors(response, messages)
            return response.back().with_errors(messages)

        if not title or not description:
            return _err(["Title and description are required."])

        try:
            priority = int(priority_value or 0)
        except (TypeError, ValueError):
            return _err(["Priority must be a valid number."])

        published_at = None
        if published_at_value:
            try:
                published_at = datetime.fromisoformat(published_at_value)
            except ValueError:
                return _err(["Published at must be a valid date and time."])

        image_path = None
        if image_file:
            if not hasattr(image_file, "get_content") or not hasattr(image_file, "extension"):
                return _err(["Please upload a valid image file."])

            allowed_extensions = {".jpg", ".jpeg", ".png", ".gif", ".webp"}
            file_extension = (image_file.extension() or "").lower()

            if file_extension not in allowed_extensions:
                return _err(["Please upload a valid image file."])

        try:
            if image_file:
                image_path = storage.disk("public").put_file("news", image_file)

            created_news = News.create(
                title=title,
                description=description,
                image=image_path,
                published_at=published_at,
                source=source or None,
                location=location or None,
                layout_type=layout_type,
                priority=priority,
                status=status,
            )

            try:
                NewNews(created_news).fire()
            except Exception:
                pass

            if is_ajax:
                return json_success(response, payload={
                    "article": {
                        "id": getattr(created_news, "id", None),
                        "title": title,
                        "layout_type": layout_type,
                        "status": status,
                        "image": image_path,
                    }
                }, messages=["News saved successfully."])

            return response.redirect(name="gears.dashboard").with_success([
                "News saved successfully.",
            ])
        except Exception as exception:
            traceback.print_exception(type(exception), exception, exception.__traceback__)
            return _err(["Could not save the news item. Please try again."])