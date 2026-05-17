from masonite.controllers import Controller
from masonite.request import Request
from masonite.filesystem import Storage
from masonite.utils.location import base_path
from masonite.facades import Broadcast
from masonite.configuration import config
from app.models.Categories import Categories
from app.models.Departments import Departments
from app.models.Events import Events
from app.models.News import News
from app.models.Posts import Posts
from app.models.Member import Member
from app.models.Video import Video
from app.models.Locations import Locations
from masonite.response import Response
from masonite.views import View
import os
import json
import time
import traceback
import random

from app.services.ArchiveServices import ArchiveServices
from app.services.AboutContent import AboutContent
from app.services.StorageRouter import absolute_path, is_safe_path
from app.models.Archives import Archives


VIDEO_UPLOAD_LIMIT = 10
VIDEO_UPLOAD_WINDOW_SECONDS = 60
VIDEO_UPLOAD_RATE_LIMIT_FILE = base_path("storage/framework/cache/video-upload-rate-limit.json")

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


def _member_sort_key(member):
    return (
        int(getattr(member, "sort_order", 0) or 0),
        (getattr(member, "name", "") or "").strip().lower(),
        int(getattr(member, "id", 0) or 0),
    )


def _build_org_board_departments(departments, locations, members):
    location_lookup = {
        getattr(location, "id", None): location
        for location in locations
    }

    node_lookup = {}
    roots_by_department = {}

    for member in members:
        node = {
            "id": getattr(member, "id", None),
            "name": getattr(member, "name", "") or "",
            "position": getattr(member, "position", "") or "",
            "photo_path": getattr(member, "photo_path", "") or "",
            "department_id": getattr(member, "department_id", None),
            "parent_id": getattr(member, "parent_id", None),
            "sort_order": int(getattr(member, "sort_order", 0) or 0),
            "children": [],
        }
        node_lookup[node["id"]] = node

    for node in sorted(node_lookup.values(), key=_member_sort_key):
        parent_node = node_lookup.get(node["parent_id"])
        if parent_node and parent_node["department_id"] == node["department_id"]:
            parent_node["children"].append(node)
        else:
            roots_by_department.setdefault(node["department_id"], []).append(node)

    def sort_branch(node):
        node["children"].sort(key=_member_sort_key)
        for child in node["children"]:
            sort_branch(child)

    department_rows = []
    for department in departments:
        roots = roots_by_department.get(getattr(department, "id", None), [])
        roots.sort(key=_member_sort_key)
        for root in roots:
            sort_branch(root)

        location = location_lookup.get(getattr(department, "location_id", None))
        department_rows.append(
            {
                "id": getattr(department, "id", None),
                "name": getattr(department, "name", "") or "",
                "location_name": getattr(location, "name", "") if location else "",
                "location_type": getattr(location, "type", "") if location else "",
                "members": roots,
            }
        )

    return department_rows


class VideoController(Controller):
    def _event_sort_key(self, item):
        reference_at = getattr(item, "event_date", None) or getattr(item, "created_at", None)
        if hasattr(reference_at, "timestamp"):
            return reference_at.timestamp()
        return 0

    def _video_upload_rate_limit_key(self, request: Request):
        user = request.user() if callable(getattr(request, "user", None)) else None
        if user:
            user_id = getattr(user, "id", None)
            if user_id is not None:
                return f"user:{user_id}"
            username = (getattr(user, "username", None) or getattr(user, "email", None) or "").strip()
            if username:
                return f"user:{username.lower()}"

        return "user:anonymous"

    def _load_video_upload_rate_limit_state(self):
        try:
            with open(VIDEO_UPLOAD_RATE_LIMIT_FILE, "r", encoding="utf-8") as handle:
                data = json.load(handle)
                return data if isinstance(data, dict) else {}
        except FileNotFoundError:
            return {}
        except (OSError, ValueError, TypeError):
            return {}

    def _save_video_upload_rate_limit_state(self, state):
        os.makedirs(os.path.dirname(VIDEO_UPLOAD_RATE_LIMIT_FILE), exist_ok=True)
        temp_path = VIDEO_UPLOAD_RATE_LIMIT_FILE + ".tmp"
        with open(temp_path, "w", encoding="utf-8") as handle:
            json.dump(state, handle)
        os.replace(temp_path, VIDEO_UPLOAD_RATE_LIMIT_FILE)

    def _enforce_video_upload_rate_limit(self, request: Request, response: Response):
        now = time.time()
        cutoff = now - VIDEO_UPLOAD_WINDOW_SECONDS
        key = self._video_upload_rate_limit_key(request)
        state = self._load_video_upload_rate_limit_state()

        raw_hits = state.get(key, [])
        hits = []
        for value in raw_hits:
            try:
                timestamp = float(value)
            except (TypeError, ValueError):
                continue
            if timestamp >= cutoff:
                hits.append(timestamp)

        if len(hits) >= VIDEO_UPLOAD_LIMIT:
            return response.redirect(name="gears.dashboard", query_params={"page": "video-manager"}).with_errors([
                "Too many video uploads. Please wait a minute and try again.",
            ])

        hits.append(now)
        state[key] = hits
        self._save_video_upload_rate_limit_state(state)
        return None

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
        events = sorted(
            list(Events.all() or []),
            key=lambda item: (self._event_sort_key(item), getattr(item, "id", 0)),
            reverse=True,
        )
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
        location_type_lookup = {
            getattr(location, "id", None): (getattr(location, "type", "") or "")
            for location in locations
        }
        departments = sorted(
            [
                d for d in list(Departments.all() or [])
                if location_type_lookup.get(getattr(d, "location_id", None), "") == "Department"
            ],
            key=lambda item: (getattr(item, "name", "") or "").lower(),
        )
        org_board_members = sorted(
            list(Member.all() or []),
            key=lambda item: (
                getattr(item, "department_id", 0) or 0,
                getattr(item, "parent_id", 0) or 0,
                getattr(item, "sort_order", 0) or 0,
                (getattr(item, "name", "") or "").lower(),
                getattr(item, "id", 0) or 0,
            ),
        )
        department_lookup = {
            getattr(department, "id", None): getattr(department, "name", "")
            for department in departments
        }
        org_board_departments = _build_org_board_departments(departments, locations, org_board_members)
        about_data = AboutContent.load_all()

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

        from app.models.TourScenes import TourScenes
        from app.services.TourScenesCatalog import TourScenesCatalog

        tour_catalog = TourScenesCatalog.all_scenes()
        tour_mappings = {
            (getattr(row, "scene_id", "") or ""): row
            for row in (TourScenes.all() or [])
        }
        tour_scene_rows = []
        for entry in tour_catalog:
            mapping = tour_mappings.get(entry["scene_id"])
            tour_scene_rows.append(
                {
                    "scene_id": entry["scene_id"],
                    "scene_name": entry["name"],
                    "location_id": getattr(mapping, "location_id", None) if mapping else None,
                    "display_name": (getattr(mapping, "display_name", None) if mapping else "") or "",
                }
            )

        return views.render("gears/dashboard", {
            "posts": posts,
            "events": events,
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
            "departments": departments,
            "department_lookup": department_lookup,
            "org_board_members": org_board_members,
            "org_board_departments": org_board_departments,
            "location_lookup": location_lookup,
            "total_articles": len(posts),
            "published_articles": len(published_articles),
            "location_count": len(locations),
            "news_count": len(news_items),
            "default_page": default_page,
            "tour_scene_rows": tour_scene_rows,
            "sections": about_data["sections"],
            "ordered_slugs": about_data["ordered_slugs"],
            "milestones": about_data["milestones"],
        })

    def upload(self, request: Request, storage: Storage, response: Response):
        limited_response = self._enforce_video_upload_rate_limit(request, response)
        if limited_response:
            return limited_response

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