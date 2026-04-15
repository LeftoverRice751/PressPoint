from datetime import datetime

from masonite.controllers import Controller
from masonite.filesystem import Storage
from masonite.request import Request
from masonite.response import Response
from masonite.views import View

from app.models.News import News


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

            image_path = storage.disk("public").put_file("news", image_file)

        News.create(
            title=title,
            description=description,
            image=image_path,
            published_at=published_at,
            source=source or None,
            location=location or None,
        )

        return response.redirect(name="gears.dashboard").with_success([
            "News saved successfully.",
        ])
