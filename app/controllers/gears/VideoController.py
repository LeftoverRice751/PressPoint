from masonite.controllers import Controller
from masonite.request import Request
from masonite.filesystem import Storage
from masonite.utils.location import base_path
from masonite.facades import Broadcast
from app.models.Video import Video
from masonite.response import Response
import os
import json
import time
import mimetypes
import traceback
from datetime import datetime

from app.services.StorageRouter import absolute_path, is_safe_path
from app.services.AjaxResponses import wants_json, json_success, json_errors
from app.services.FileVerificationService import FileVerificationService
from app.services.KioskBroadcast import pusher_configured as _pusher_configured


VIDEO_UPLOAD_LIMIT = 10
VIDEO_UPLOAD_WINDOW_SECONDS = 60
VIDEO_UPLOAD_RATE_LIMIT_FILE = base_path("storage/framework/cache/video-upload-rate-limit.json")


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
            if wants_json(request):
                return json_errors(response, ["Too many video uploads. Please wait a minute and try again."], status=429)
            return response.redirect(name="gears.dashboard", query_params={"page": "video-manager"}).with_errors([
                "Too many video uploads. Please wait a minute and try again.",
            ])

        hits.append(now)
        state[key] = hits
        self._save_video_upload_rate_limit_state(state)
        return None

    def serve_storage(self, request: Request, response: Response, path):
        # Python fallback for /storage/<path> when nginx misses. StorageRouter picks
        # the root (NAS or local); is_safe_path blocks ../ traversal.
        requested_path = str(path or "").replace("\\", "/").lstrip("/")

        if not requested_path or not is_safe_path(requested_path):
            return "File not Found", 404

        full_path = absolute_path(requested_path)
        if not os.path.isfile(full_path):
            return "File not Found", 404

        try:
            stat = os.stat(full_path)
        except OSError:
            return "File not Found", 404

        etag = f'"{stat.st_mtime_ns}-{stat.st_size}"'
        last_modified = datetime.utcfromtimestamp(stat.st_mtime).strftime(
            "%a, %d %b %Y %H:%M:%S GMT"
        )

        if request.header("If-None-Match") == etag:
            return response.status(304)

        # Uploaded images have random names and are never overwritten, so cache for a year.
        ext = os.path.splitext(full_path)[1].lower()
        if ext in (".webp", ".jpg", ".jpeg", ".png", ".gif"):
            response.header("Cache-Control", "public, max-age=31536000, immutable")
        else:
            response.header("Cache-Control", "public, max-age=86400")
        response.header("ETag", etag)
        response.header("Last-Modified", last_modified)
        # Range support lets pdf.js and video seeking stream large files.
        response.header("Accept-Ranges", "bytes")

        file_size = stat.st_size
        range_header = request.header("Range")
        if range_header and range_header.strip().lower().startswith("bytes="):
            spec = range_header.split("=", 1)[1].split(",", 1)[0].strip()
            start_str, _, end_str = spec.partition("-")
            try:
                if start_str == "":  # suffix range: last N bytes
                    suffix = int(end_str)
                    if suffix <= 0:
                        raise ValueError
                    start = max(0, file_size - suffix)
                    end = file_size - 1
                else:
                    start = int(start_str)
                    end = int(end_str) if end_str else file_size - 1
            except ValueError:
                start, end = 0, file_size - 1

            if start >= file_size or start > end:
                response.header("Content-Range", f"bytes */{file_size}")
                return "Requested range not satisfiable", 416

            end = min(end, file_size - 1)
            length = end - start + 1
            with open(full_path, "rb") as fh:
                fh.seek(start)
                data = fh.read(length)

            content_type = mimetypes.guess_type(full_path)[0] or "application/octet-stream"
            response.status(206)
            response.header("Content-Type", content_type)
            response.header("Content-Range", f"bytes {start}-{end}/{file_size}")
            return response.view(data)  # Content-Length is recomputed by make_headers()

        return response.download(os.path.basename(full_path), full_path, force=False)

    def serve_sw(self, response: Response):
        sw_path = os.path.realpath(
            os.path.join(
                os.path.dirname(os.path.abspath(__file__)),
                "../../../storage/compiled/js/sw-archives.js",  # three levels up to the repo root
            )
        )
        if not os.path.isfile(sw_path):
            return "Not found", 404
        response.header("Content-Type", "application/javascript; charset=utf-8")
        response.header("Service-Worker-Allowed", "/")
        response.header("Cache-Control", "no-store")
        return response.download("sw-archives.js", sw_path, force=False)

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

        is_ajax = wants_json(request)

        def _err(messages):
            if is_ajax:
                return json_errors(response, messages)
            return response.redirect(name="gears.dashboard", query_params={"page": "video-manager"}).with_errors(messages)

        if not title:
            return _err(["Video title is required."])

        if not video_file:
            return _err(["No video file provided."])

        if not hasattr(video_file, "get_content") or not hasattr(video_file, "extension"):
            return _err(["Please upload a valid video file."])

        if not FileVerificationService.verify_extension(video_file.extension(), "video"):
            return _err(["Please upload a valid video file."])

        try:
            # Videos live on the NAS so editors can manage them over SMB.
            path = storage.disk("gearsnas").put_file("Videos", video_file)

            video = Video.create(
                title=title,
                file_path=path,
            )

            _broadcast_play_video(
                "/storage/" + str(path).replace("\\", "/").lstrip("/"),
                getattr(video, "title", None) or title,
            )

            if is_ajax:
                return json_success(response, payload={
                    "video": {
                        "id": getattr(video, "id", None),
                        "title": getattr(video, "title", None) or title,
                        "file_path": str(path),
                    }
                }, messages=["Video saved successfully."])

            return response.redirect(name="gears.dashboard", query_params={"page": "video-manager"}).with_success([
                "Video saved successfully.",
            ])
        except Exception as exception:
            traceback.print_exception(type(exception), exception, exception.__traceback__)
            return _err(["Could not save the video. Please try again."])

    def set_idle(self, request: Request, response: Response):
        # Exactly one attract video: clear every other row, then flag this one.
        is_ajax = wants_json(request)
        video = Video.find(request.param("id"))

        if not video:
            if is_ajax:
                return json_errors(response, ["Video not found."], status=404)
            return response.back().with_errors(["Video not found."])

        try:
            # Per-instance save(): a class-level builder .update() raises on masoniteorm 2.x.
            currently_idle = list(Video.where("show_when_idle", True).get() or [])
            for other in currently_idle:
                if getattr(other, "id", None) == video.id:
                    continue
                other.show_when_idle = False
                other.save()
            video.show_when_idle = True
            video.save()
        except Exception as exception:
            traceback.print_exception(type(exception), exception, exception.__traceback__)
            if is_ajax:
                return json_errors(response, ["Could not set idle video."], status=500)
            return response.back().with_errors(["Could not set idle video."])

        if is_ajax:
            return json_success(response, payload={
                "video": {
                    "id": getattr(video, "id", None),
                    "title": getattr(video, "title", None) or "",
                    "show_when_idle": True,
                }
            }, messages=["Idle video set."])
        return response.redirect(name="gears.dashboard", query_params={"page": "video-manager"})

    def clear_idle(self, request: Request, response: Response):
        is_ajax = wants_json(request)
        video = Video.find(request.param("id"))

        if not video:
            if is_ajax:
                return json_errors(response, ["Video not found."], status=404)
            return response.back().with_errors(["Video not found."])

        try:
            video.show_when_idle = False
            video.save()
        except Exception as exception:
            traceback.print_exception(type(exception), exception, exception.__traceback__)
            if is_ajax:
                return json_errors(response, ["Could not clear idle video."], status=500)
            return response.back().with_errors(["Could not clear idle video."])

        if is_ajax:
            return json_success(response, payload={
                "video": {
                    "id": getattr(video, "id", None),
                    "show_when_idle": False,
                }
            }, messages=["Idle video cleared."])
        return response.redirect(name="gears.dashboard", query_params={"page": "video-manager"})

    def idle_video(self, response: Response):
        # Public endpoint the welcome screen polls for the attract video.
        video = Video.where("show_when_idle", True).first()
        if not video:
            return response.json({"src": None, "title": None})

        raw_path = (getattr(video, "file_path", "") or "").replace("\\", "/").lstrip("/")
        if not raw_path:
            return response.json({"src": None, "title": None})

        return response.json({
            "src": "/storage/" + raw_path,
            "title": getattr(video, "title", "") or "",
        })

    def destroy(self, request: Request, response: Response):
        is_ajax = wants_json(request)
        video = Video.find(request.param("id"))

        if not video:
            if is_ajax:
                return json_errors(response, ["Video not found."], status=404)
            return response.back().with_errors(["Video not found."])

        file_path = getattr(video, "file_path", "") or ""
        if file_path and is_safe_path(file_path):
            full_path = absolute_path(file_path)
            if os.path.exists(full_path):
                try:
                    os.remove(full_path)
                except Exception as exception:
                    traceback.print_exception(type(exception), exception, exception.__traceback__)

        video.delete()

        if is_ajax:
            return json_success(response, messages=["Video deleted."])
        return response.redirect(name="gears.dashboard")
