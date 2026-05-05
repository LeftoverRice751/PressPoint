from masonite.controllers import Controller
from masonite.request import Request
from masonite.filesystem import Storage
from masonite.utils.location import base_path
from masonite.facades import Broadcast
from masonite.configuration import config
from app.models.Categories import Categories
from app.models.News import News
from app.models.Posts import Posts
from app.models.Video import Video
from app.models.Locations import Locations
from masonite.response import Response
from masonite.views import View
import os
import traceback
import random

from app.services.ArchiveServices import ArchiveServices
from app.services.StorageRouter import absolute_path, is_safe_path
from app.models.Archives import Archives

def _pusher_configured():
    broadcasts = config("broadcast.broadcasts", {}) or config("broadcast.BROADCASTS", {}) or {}
    pusher_settings = broadcasts.get("pusher") or {}
    return bool(
        (pusher_settings.get("client") or pusher_settings.get("key"))
        and pusher_settings.get("app_id")
        and pusher_settings.get("secret")
    )


def _broadcast_play_video(src, title):
    payload = {"src": src, "title": title or ""}

    if not _pusher_configured():
        return False

    try:
        Broadcast.channel(["editorial"], "play-video", payload)
        return True
    except Exception:
        return False


class VideoController(Controller):
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

    def serve_storage(self, response: Response, path):
        # /storage/<path> serves files from either the GearsNAS volume
        # (anything under Archives/ or Videos/) or the project's local
        # public folder (everything else). The router maps which one;
        # the safety check confirms the resolved file is still inside
        # an allowed root, blocking ../ traversal.
        requested_path = str(path or "").replace("\\", "/").lstrip("/")

        if not requested_path or not is_safe_path(requested_path):
            return "File not Found", 404

        full_path = absolute_path(requested_path)
        if not os.path.isfile(full_path):
            return "File not Found", 404

        return response.download(os.path.basename(full_path), full_path, force=False)
    
    def show(self, views: View, request: Request):
        posts = sorted(list(Posts.all() or []), key=lambda item: getattr(item, "id", 0), reverse=True)
        news_items = sorted(list(News.all() or []), key=lambda item: getattr(item, "id", 0), reverse=True)
        news_slots = self._group_news_slots(news_items)
        archive_services = ArchiveServices()
        archive_records = sorted(list(Archives.all() or []), key=lambda item: getattr(item, "id", 0), reverse=True)
        archive_entries = [archive_services.build_archive_entry(archive) for archive in archive_records]
        archive_groups_map = archive_services.group_archives_by_year(archive_records)
        archive_years = sorted(archive_groups_map.keys(), reverse=True)
        selected_archive_year = random.choice(archive_years) if archive_years else None
        categories = sorted(list(Categories.all() or []), key=lambda item: getattr(item, "id", 0))
        videos = sorted(list(Video.all() or []), key=lambda item: getattr(item, "id", 0), reverse=True)
        locations = sorted(list(Locations.all() or []), key=lambda item: getattr(item, "id", 0))
        location_lookup = {getattr(location, "id", None): getattr(location, "name", "") for location in locations}

        published_articles = [
            post for post in posts if (getattr(post, "status", "") or "").lower() == "published"
        ]

        category_rows = []
        category_lookup = {getattr(category, "id", None): getattr(category, "name", "") for category in categories}
        for category in categories:
            article_items = [
                post for post in posts if getattr(post, "category_id", None) == getattr(category, "id", None)
            ]
            category_rows.append(
                {
                    "name": getattr(category, "name", "Untitled category"),
                    "count": len(article_items),
                    "percent": round((len(article_items) / len(posts)) * 100) if posts else 0,
                    "items": article_items[:3],
                }
            )

        uncategorized_posts = [
            post for post in posts if not getattr(post, "category_id", None)
        ]
        if uncategorized_posts:
            category_rows.append(
                {
                    "name": "Uncategorized",
                    "count": len(uncategorized_posts),
                    "percent": round((len(uncategorized_posts) / len(posts)) * 100) if posts else 0,
                    "items": uncategorized_posts[:3],
                }
            )

        recent_articles = posts[:5]
        default_page = (request.input("page") or "dashboard").strip() or "dashboard"

        return views.render("gears/dashboard.html", {
            "posts": posts,
            "categories": categories,
            "videos": videos,
            "news_items": news_items,
            "main_news": news_slots["main_news"],
            "secondary_news": news_slots["secondary_news"],
            "widget_news": news_slots["widget_news"],
            "archives": archive_entries,
            "archive_years": archive_years,
            "archive_groups": archive_groups_map,
            "selected_archive_year": selected_archive_year,
            "locations": locations,
            "recent_articles": recent_articles,
            "article_groups": category_rows,
            "category_lookup": category_lookup,
            "location_lookup": location_lookup,
            "total_articles": len(posts),
            "published_articles": len(published_articles),
            "location_count": len(locations),
            "news_count": len(news_items),
            "default_page": default_page,
        })

    def upload(self, request: Request, storage: Storage, response: Response):
        title = (request.input("title") or "").strip()
        video_file = request.input("video")

        if isinstance(video_file, list):
            video_file = video_file[0] if video_file else None

        if video_file and not hasattr(video_file, "name") and hasattr(video_file, "filename"):
            class _UploadedVideoAdapter:
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

            video_file = _UploadedVideoAdapter(video_file)

        if not title:
            return response.redirect(name="gears.dashboard", query_params={"page": "video-manager"}).with_errors([
                "Video title is required.",
            ])

        if not video_file:
            return response.redirect(name="gears.dashboard", query_params={"page": "video-manager"}).with_errors([
                "No video file provided.",
            ])

        if not hasattr(video_file, "get_content") or not hasattr(video_file, "extension"):
            return response.redirect(name="gears.dashboard", query_params={"page": "video-manager"}).with_errors([
                "Please upload a valid video file.",
            ])

        allowed_extensions = {".mp4", ".mov", ".webm", ".m4v", ".ogg"}
        file_extension = (video_file.extension() or "").lower()

        if file_extension not in allowed_extensions:
            return response.redirect(name="gears.dashboard", query_params={"page": "video-manager"}).with_errors([
                "Please upload a valid video file.",
            ])

        try:
            # Videos live on GearsNAS/Videos so editors can drop files
            # via SMB and the kiosk plays them without an extra copy.
            path = storage.disk("gearsnas").put_file("Videos", video_file)

            video = Video.create(
                title=title,
                file_path=path,
            )

            _broadcast_play_video(
                "/storage/" + str(path).replace("\\", "/").lstrip("/"),
                getattr(video, "title", None) or title,
            )

            return response.redirect(name="gears.dashboard", query_params={"page": "video-manager"}).with_success([
                "Video saved successfully.",
            ])
        except Exception as exception:
            traceback.print_exception(type(exception), exception, exception.__traceback__)
            return response.redirect(name="gears.dashboard", query_params={"page": "video-manager"}).with_errors([
                "Could not save the video. Please try again.",
            ])

    def destroy(self, request: Request, response: Response):
        video = Video.find(request.param("id"))

        if not video:
            return response.back().with_errors(["Video not found."])

        file_path = getattr(video, "file_path", "") or ""
        if file_path and is_safe_path(file_path):
            full_path = absolute_path(file_path)
            if os.path.exists(full_path):
                os.remove(full_path)

        video.delete()

        return response.redirect(name="gears.dashboard")