from datetime import datetime
import os
import traceback

import bleach

from masonite.controllers import Controller
from masonite.configuration import config
from masonite.filesystem import Storage
from masonite.facades import Broadcast, Cache, Storage as StorageFacade
from masonite.request import Request
from masonite.response import Response
from masonite.views import View

from app.events.NewNews import NewNews
from app.models.News import News
from app.services.AjaxResponses import wants_json, json_success, json_errors
from app.services.DashboardContext import group_news_slots
from app.services.ImageDerivatives import generate_variants, variant_path
from app.services.StorageRouter import absolute_path, is_safe_path


# The story body is authored in a rich-text editor (Quill) and rendered as HTML
# on the kiosk news page, so it MUST be sanitized on write. Only this small,
# formatting-only allowlist survives; everything else (scripts, event handlers,
# style, iframes, etc.) is stripped.
_ALLOWED_TAGS = ["p", "br", "strong", "em", "u", "s", "h2", "h3", "blockquote", "ul", "ol", "li", "a"]
_ALLOWED_ATTRS = {"a": ["href", "title", "rel", "target"]}


def _sanitize_news_html(raw_html):
    """Return a safe HTML subset of the given rich-text body."""
    cleaned = bleach.clean(
        raw_html or "",
        tags=_ALLOWED_TAGS,
        attributes=_ALLOWED_ATTRS,
        protocols=["http", "https", "mailto"],
        strip=True,
    )
    # Force external links to open safely.
    return bleach.linkify(cleaned, callbacks=[bleach.callbacks.nofollow]) if cleaned else cleaned


def _html_to_text(html):
    """Plain-text projection of the body — used for the 'required' check so an
    editor can't publish a visually-empty body like Quill's '<p><br></p>'."""
    return bleach.clean(html or "", tags=[], strip=True).strip()


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


# Public kiosk index is read constantly — templates/kiosk/news.html auto-
# reloads every 30s per device — but written rarely (an editor publishing/
# deleting a story), so it's cached and explicitly invalidated on write
# rather than re-scanning the whole table on every single request.
_NEWS_CACHE_KEY = "kiosk:news:index:v3"  # bump on projection changes to drop stale entries
_NEWS_CACHE_TTL = 300  # seconds — safety net only; writes invalidate explicitly.


def _news_item_to_dict(item, disk=None):
    """Plain, JSON-safe projection of a News model instance — the file
    cache driver json.dumps()s dict values, which a masoniteorm Model
    instance is not. Jinja2's `.` operator falls back to item access on
    dicts, so templates render this identically to the model instance."""
    published_at = getattr(item, "published_at", None)
    fallback_at = published_at or getattr(item, "created_at", None)
    image = getattr(item, "image", None)
    # Resolve the fast WebP variants once here (behind the projection cache),
    # not per request. variant_path falls back to the original if missing.
    image_large = variant_path(image, "large", disk) if (image and disk) else image
    image_thumb = variant_path(image, "thumb", disk) if (image and disk) else image
    return {
        "id": getattr(item, "id", None),
        "title": getattr(item, "title", None),
        "description": getattr(item, "description", None),
        "image": image,
        "image_large": image_large,
        "image_thumb": image_thumb,
        "source": getattr(item, "source", None),
        "location": getattr(item, "location", None),
        "dek": getattr(item, "dek", None),
        "image_caption": getattr(item, "image_caption", None),
        "image_credit": getattr(item, "image_credit", None),
        "layout_type": getattr(item, "layout_type", None),
        "priority": getattr(item, "priority", None),
        "status": getattr(item, "status", None),
        "published_at": published_at.isoformat() if hasattr(published_at, "isoformat") else None,
        # Pre-formatted for the kiosk dateline/folio — Jinja2 can't strftime an
        # ISO string, and the cache driver can't store a datetime.
        "published_label": fallback_at.strftime("%b %d, %Y") if hasattr(fallback_at, "strftime") else None,
        "published_iso": fallback_at.strftime("%Y-%m-%d") if hasattr(fallback_at, "strftime") else None,
    }


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
    def _build_news_payload(self):
        # Filtering/grouping stays on the real Model instances (unchanged
        # logic, getattr-based) — dict conversion happens last, only for
        # what actually goes into the cache. Converting earlier would
        # silently break group_news_slots/_news_is_public: getattr() on a
        # plain dict always returns the default, since dicts don't expose
        # their keys as attributes.
        news_items = [item for item in News.order_by("id", "desc").get() if _news_is_public(item)]
        slots = group_news_slots(news_items)

        # Resolve the public disk once; _news_item_to_dict uses it to pick the
        # WebP variant that exists on disk. This whole payload is cached, so
        # the existence checks run once per cache period, not per request.
        try:
            disk = StorageFacade.disk("public")
        except Exception:
            disk = None

        # Folio issue numbering, derived from the lead story's date (no
        # schema): Vol. counts publication years since founding (2026 → 1),
        # No. is the day-of-year — a plausible daily issue number that
        # changes with each edition date.
        issue_vol = None
        issue_no = None
        lead = slots["main_news"]
        lead_at = getattr(lead, "published_at", None) or getattr(lead, "created_at", None)
        if hasattr(lead_at, "timetuple"):
            issue_vol = max(1, lead_at.year - 2025)
            issue_no = lead_at.timetuple().tm_yday

        return {
            "news_items": [_news_item_to_dict(item, disk) for item in news_items],
            "main_news": _news_item_to_dict(slots["main_news"], disk) if slots["main_news"] else None,
            "secondary_news": [_news_item_to_dict(item, disk) for item in slots["secondary_news"]],
            "widget_news": [_news_item_to_dict(item, disk) for item in slots["widget_news"]],
            "issue_vol": issue_vol,
            "issue_no": issue_no,
        }

    def show(self, view: View):
        payload = Cache.remember(_NEWS_CACHE_KEY, lambda cache: cache.put(
            _NEWS_CACHE_KEY, self._build_news_payload(), seconds=_NEWS_CACHE_TTL
        ))

        return view.render(
            "kiosk/news",
            {
                "news_items": payload["news_items"],
                "featured_news": payload["main_news"],
                "recent_news": payload["secondary_news"],
                "main_news": payload["main_news"],
                "secondary_news": payload["secondary_news"],
                "widget_news": payload["widget_news"],
                "issue_vol": payload.get("issue_vol"),
                "issue_no": payload.get("issue_no"),
                "active_nav": "news",
            },
        )

    def store(self, request: Request, storage: Storage, response: Response):
        title = (request.input("title") or "").strip()
        description = _sanitize_news_html((request.input("description") or "").strip())
        source = (request.input("source") or "").strip()
        location = (request.input("location") or "").strip()
        # Editorial extras are plain text (like source/location) — strip any
        # markup that leaks in from the contenteditable regions.
        dek = _html_to_text(request.input("dek") or "").strip()
        image_caption = _html_to_text(request.input("image_caption") or "").strip()
        image_credit = _html_to_text(request.input("image_credit") or "").strip()
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

        if not title or not _html_to_text(description):
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

        article_id = (request.input("article_id") or "").strip()

        try:
            if image_file:
                public_disk = storage.disk("public")
                image_path = public_disk.put_file("news", image_file)

                # Generate fast WebP variants from the bytes already in memory
                # (no re-read). Never blocks publishing — serving falls back to
                # the original if this fails. See app/services/ImageDerivatives.
                try:
                    generate_variants(image_file.get_content(), image_path, public_disk)
                except Exception:
                    pass

            if article_id:
                existing = News.where("id", article_id).first()
                if not existing:
                    return _err(["Article not found."])
                existing.title = title
                existing.description = description
                existing.source = source or None
                existing.location = location or None
                existing.dek = dek or None
                existing.image_caption = image_caption or None
                existing.image_credit = image_credit or None
                existing.layout_type = layout_type
                existing.priority = priority
                existing.status = status
                if published_at is not None:
                    existing.published_at = published_at
                if image_path is not None:
                    existing.image = image_path
                existing.save()
                saved_news = existing
                is_new = False
            else:
                saved_news = News.create(
                    title=title,
                    description=description,
                    image=image_path,
                    published_at=published_at,
                    source=source or None,
                    location=location or None,
                    dek=dek or None,
                    image_caption=image_caption or None,
                    image_credit=image_credit or None,
                    layout_type=layout_type,
                    priority=priority,
                    status=status,
                )
                is_new = True

            try:
                NewNews(saved_news).fire()
            except Exception:
                pass

            Cache.forget(_NEWS_CACHE_KEY)

            if is_ajax:
                return json_success(response, payload={
                    "article": {
                        "id": getattr(saved_news, "id", None),
                        "title": title,
                        "layout_type": layout_type,
                        "status": status,
                        "image": getattr(saved_news, "image", None),
                        "is_new": is_new,
                    }
                }, messages=["News saved successfully."])

            return response.redirect(name="gears.dashboard").with_success([
                "News saved successfully.",
            ])
        except Exception as exception:
            traceback.print_exception(type(exception), exception, exception.__traceback__)
            return _err(["Could not save the news item. Please try again."])

    def destroy(self, request: Request, response: Response):
        is_ajax = wants_json(request)

        def _err(messages):
            if is_ajax:
                return json_errors(response, messages)
            return response.back().with_errors(messages)

        record = News.where("id", request.param("id")).first()
        if not record:
            return _err(["Article not found."])

        # Remove the uploaded image too, guarding against path traversal.
        image_path = getattr(record, "image", None)
        if image_path:
            try:
                full_path = absolute_path(image_path)
                if is_safe_path(image_path) and os.path.isfile(full_path):
                    os.remove(full_path)
            except OSError:
                pass

        try:
            record.delete()
        except Exception as exception:
            traceback.print_exception(type(exception), exception, exception.__traceback__)
            return _err(["Could not delete the news item. Please try again."])

        Cache.forget(_NEWS_CACHE_KEY)

        if is_ajax:
            return json_success(response, payload={"id": request.param("id")}, messages=["News deleted."])
        return response.redirect(name="gears.dashboard", query_params={"page": "news"}).with_success([
            "News deleted.",
        ])