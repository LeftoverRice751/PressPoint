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
    def show(self, view: View):
        news_items = sorted(list(News.all() or []), key=lambda item: getattr(item, "id", 0), reverse=True)

        return view.render(
            "kiosk/news",
            {
                "news_items": news_items,
                "featured_news": news_items[0] if news_items else None,
                "recent_news": news_items[1:6] if len(news_items) > 1 else [],
            },
        )

    def store(self, request: Request, storage: Storage, response: Response):
        title = (request.input("title") or "").strip()
        description = (request.input("description") or "").strip()
        source = (request.input("source") or "").strip()
        location = (request.input("location") or "").strip()
        published_at_value = (request.input("published_at") or "").strip()
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

        if not title or not description:
            return response.back().with_errors([
                "Title and description are required.",
            ])

        published_at = None
        if published_at_value:
            try:
                published_at = datetime.fromisoformat(published_at_value)
            except ValueError:
                return response.back().with_errors([
                    "Published at must be a valid date and time.",
                ])

        image_path = None
        if image_file:
            if not hasattr(image_file, "get_content") or not hasattr(image_file, "extension"):
                return response.back().with_errors([
                    "Please upload a valid image file.",
                ])

            allowed_extensions = {".jpg", ".jpeg", ".png", ".gif", ".webp"}
            file_extension = (image_file.extension() or "").lower()

            if file_extension not in allowed_extensions:
                return response.back().with_errors([
                    "Please upload a valid image file.",
                ])

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
            )

            try:
                NewNews(created_news).fire()
            except Exception:
                pass

            return response.redirect(name="gears.dashboard").with_success([
                "News saved successfully.",
            ])
        except Exception as exception:
            traceback.print_exception(type(exception), exception, exception.__traceback__)
            return response.back().with_errors([
                "Could not save the news item. Please try again.",
            ])