import html as html_module
import json
import os
import traceback
from datetime import datetime, timezone

import bleach

from masonite.controllers import Controller
from masonite.filesystem import Storage
from masonite.facades import Cache, Storage as StorageFacade
from masonite.request import Request
from masonite.response import Response
from masonite.views import View

from app.models.News import News
from app.services import (
    ImageUploads,
    Issues,
    KioskBroadcast,
    NewsCache,
    NewsCategories,
    Posts,
)
from app.services.KioskBroadcast import pusher_configured as _pusher_configured  # noqa: F401
from app.services.FileVerificationService import FileVerificationService
from app.services.AjaxResponses import wants_json, json_success, json_errors
from app.services.ImageDerivatives import delete_image_and_variants, generate_variants, variant_path


def _html_to_text(html):
    """Plain-text projection, so `<p><br></p>` counts as empty."""
    return bleach.clean(html or "", tags=[], strip=True).strip()


def _flash_text(value):
    """Flatten stored HTML for the kiosk ticker: decode entities, collapse to one line."""
    return " ".join(html_module.unescape(_html_to_text(value)).split())


_NEWS_STATUS_ALIASES = {
    "pending": "review",
    "reviewing": "review",
    "publish": "published",
    "live": "published",
}
_NEWS_VISIBLE_STATUSES = {"approved", "scheduled", "published"}
_NEWS_ALLOWED_STATUSES = {"draft", "review", "approved", "scheduled", "published", "archived"}


def _normalize_news_status(raw_status, default="draft"):
    """Resolve a status string; unknown values fail closed to an invisible status."""
    status = (raw_status or default or "draft").strip().lower()
    status = _NEWS_STATUS_ALIASES.get(status, status)
    if status not in _NEWS_ALLOWED_STATUSES:
        return default or "draft"
    return status


# Only an admin may write one of these; everyone else's attempt becomes "review".
_PUBLISH_INTENT_STATUSES = {"approved", "scheduled", "published"}


def _actor_is_admin(request):
    """True when the signed-in account may approve and publish (`admin` only)."""
    try:
        user = request.user() if callable(getattr(request, "user", None)) else None
    except Exception:
        return False
    return (getattr(user, "role", "") or "").strip().lower() == "admin"


def _resolve_status_for_actor(status, request):
    """Downgrade a non-admin's publish intent to `review`. Draft stays draft."""
    if status in _PUBLISH_INTENT_STATUSES and not _actor_is_admin(request):
        return "review"
    return status


def _may_change_story(request, record):
    """An admin, the story's author, or the owner of the issue it sits in.

    The composer has shown editors only their own issue since the per-editor
    work, but that only scoped what they see: every write route still took any
    id. A story with neither an author nor an issue is admin-only rather than
    open to everyone.
    """
    if _actor_is_admin(request):
        return True
    user_id = _current_user_id(request)
    if not user_id:
        return False
    if _int_or_none(getattr(record, "author_id", None)) == user_id:
        return True
    issue_id = _int_or_none(getattr(record, "issue_id", None))
    return bool(issue_id and Issues.owned_issue(user_id, issue_id))


def _int_or_none(value):
    """A real integer id, or None (test Mocks are truthy, so `if issue_id` is not enough)."""
    if isinstance(value, bool):
        return None
    try:
        return int(value) or None
    except (TypeError, ValueError):
        return None


def _current_user_id(request):
    """users.id of the signed-in account, or None (guests and test doubles)."""
    try:
        user = request.user() if callable(getattr(request, "user", None)) else None
    except Exception:
        return None
    return getattr(user, "id", None) or None


def _delete_image_files(image_path):
    """Remove an uploaded news image and its .large/.thumb derivatives, safely."""
    delete_image_and_variants(image_path)


def _news_is_public(news_item):
    # Expired posts leave the kiosk by themselves; no job has to flip their status.
    if Posts.is_expired(news_item):
        return False
    status = _normalize_news_status(getattr(news_item, "status", None), default="draft")
    if status not in _NEWS_VISIBLE_STATUSES:
        return False

    published_at = getattr(news_item, "published_at", None)
    if status == "scheduled":
        if not published_at or not hasattr(published_at, "timestamp"):
            return False

        now = datetime.now(published_at.tzinfo) if getattr(published_at, "tzinfo", None) else datetime.now()
        return published_at <= now

    return True


# Kiosk index is read every 30s per device and written rarely, so it is cached and
# invalidated on write. Key lives in NewsCache so category writes can invalidate too;
# these aliases stay because tests patch them.
_NEWS_CACHE_KEY = NewsCache.KEY
_NEWS_CACHE_TTL = NewsCache.TTL


def _news_item_to_dict(item, disk=None, category_names=None):
    """JSON-safe projection of a News row (the file cache driver json.dumps values)."""
    published_at = getattr(item, "published_at", None)
    fallback_at = published_at or getattr(item, "created_at", None)
    image = getattr(item, "image", None)
    # Resolve WebP variants once here, behind the cache; falls back to the original.
    image_large = variant_path(image, "large", disk) if (image and disk) else image
    image_thumb = variant_path(image, "thumb", disk) if (image and disk) else image
    category_id = getattr(item, "category_id", None)
    return {
        "id": getattr(item, "id", None),
        "category_id": category_id,
        "category": (category_names or {}).get(category_id),
        "title": getattr(item, "title", None),
        "description": getattr(item, "description", None),
        "image": image,
        "image_large": image_large,
        "image_thumb": image_thumb,
        "source": getattr(item, "source", None),
        "location": getattr(item, "location", None),
        "dek": getattr(item, "dek", None),
        "excerpt": getattr(item, "excerpt", None),
        "image_caption": getattr(item, "image_caption", None),
        "image_credit": getattr(item, "image_credit", None),
        "layout_type": getattr(item, "layout_type", None),
        "headline_font": getattr(item, "headline_font", None),
        "priority": getattr(item, "priority", None),
        "status": getattr(item, "status", None),
        "published_at": published_at.isoformat() if hasattr(published_at, "isoformat") else None,
        # Pre-formatted: Jinja can't strftime an ISO string and the cache can't hold a datetime.
        "published_label": fallback_at.strftime("%b %d, %Y") if hasattr(fallback_at, "strftime") else None,
        "published_iso": fallback_at.strftime("%Y-%m-%d") if hasattr(fallback_at, "strftime") else None,
    }


def _build_flash_payload(news_item):
    reference_at = getattr(news_item, "published_at", None) or getattr(news_item, "created_at", None)
    return {
        # Plain text: welcome-screen.js escapes this, so HTML would show literally.
        "headline": _flash_text(getattr(news_item, "title", None)) or "News update",
        "date": reference_at.strftime("%b %d, %Y") if hasattr(reference_at, "strftime") else "",
        "copy": _flash_text(getattr(news_item, "description", None)),
        "kind": "news",
        "occured_on": reference_at.date().isoformat() if hasattr(reference_at, "date") else "",
        "today_key": datetime.now().date().isoformat(),
    }


# Logos land beside the other site branding on the NAS. Deletion is confined to this
# folder so a tampered logo_path can never point the cleanup at another branding file.
LOGO_FOLDER = "Branding/posts"
MAX_PHOTO_BYTES = 8 * 1024 * 1024


def _delete_logo_file(logo_path):
    """Remove a post's own logo, only if it sits in the posts logo folder."""
    path = (logo_path or "").replace("\\", "/").strip().lstrip("/")
    if path.startswith(LOGO_FOLDER + "/"):
        delete_image_and_variants(path)


def _first_upload(value):
    """One upload object (or None) from whatever the framework handed back."""
    if isinstance(value, list):
        value = value[0] if value else None
    return value or None


class _UploadedImageAdapter:
    """Gives a filename/stream style upload the extension()/get_content() pair."""

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


def _truthy(value):
    return str(value or "").strip().lower() in ("1", "true", "yes", "on")


class NewsController(Controller):
    def _build_news_payload(self):
        """Every live photo post, newest published first, as card_context dicts.

        Filtering runs on Model instances (so _news_is_public sees real attributes and
        expiry); projection to dicts happens last, because the file cache driver
        json.dumps its values.
        """
        try:
            disk = StorageFacade.disk("public")
        except Exception:
            disk = None

        # Ordered by the database, not News.all() + sorted(): see "Dashboard liveness"
        # in CLAUDE.md. expires_at IS NOT NULL is in SQL on purpose: every post
        # published through the photo-post flow stores an expiry, so a public row
        # without one is a legacy newsletter story that would otherwise sit on the
        # kiosk forever as a malformed card. Status aliases and aware-UTC expiry
        # cannot be filtered safely in SQL, so _news_is_public still runs after.
        rows = (
            News.where_not_null("expires_at")
            .order_by("published_at", "desc")
            .order_by("id", "desc")
            .get()
        )
        live = [item for item in (rows or []) if _news_is_public(item)]
        return {"posts": [Posts.card_context(item, disk) for item in live]}

    def show(self, view: View):
        payload = Cache.remember(_NEWS_CACHE_KEY, lambda cache: cache.put(
            _NEWS_CACHE_KEY, self._build_news_payload(), seconds=_NEWS_CACHE_TTL
        ))

        return view.render(
            "kiosk/news",
            {
                "posts": payload.get("posts") or [],
                "empty_heading": Posts.EMPTY_HEADING,
                "empty_line": Posts.EMPTY_LINE,
                "active_nav": "news",
            },
        )

    def store(self, request: Request, storage: Storage, response: Response):
        """Create or update one photo post.

        Plain text only: nothing here stores markup, so the templates' autoescape is
        the whole defence on render. `body` lands in `description` because the flash
        ticker reads that column.
        """
        is_ajax = wants_json(request)

        def _err(messages, status=422):
            if is_ajax:
                return json_errors(response, messages, status=status)
            return response.back().with_errors(messages)

        post_id = str(request.input("id") or "").strip()
        existing = None
        # Before any upload below, so a refused request leaves no orphaned file.
        if post_id:
            existing = News.where("id", post_id).first()
            if not existing or not _may_change_story(request, existing):
                # One answer for "missing" and "not yours": a guessed id confirms nothing.
                return _err(["Article not found."], status=404)

        kicker = Posts.clean_text(request.input("kicker"), Posts.KICKER_MAX)
        headline = Posts.clean_text(request.input("headline"), Posts.HEADLINE_MAX)
        body = Posts.clean_text(request.input("body"), Posts.BODY_MAX, keep_newlines=True)
        # Fail closed (a missing status must not publish), then the server-side gate.
        status = _resolve_status_for_actor(
            _normalize_news_status(request.input("status"), default="draft"), request
        )

        try:
            expires_at = Posts.parse_local_expiry(request.input("expires_at"))
        except ValueError as problem:
            return _err([str(problem)])

        image_file = _first_upload(request.input("image"))
        if image_file and not hasattr(image_file, "name") and hasattr(image_file, "filename"):
            image_file = _UploadedImageAdapter(image_file)
        if image_file:
            if not hasattr(image_file, "get_content") or not hasattr(image_file, "extension"):
                return _err(["Please upload a valid image file."])
            if (image_file.extension() or "").lower() not in {
                ".jpg", ".jpeg", ".png", ".gif", ".webp"
            }:
                return _err(["Please upload a valid image file."])
            # The extension is only what the browser claimed.
            photo_bytes = image_file.get_content()
            if not FileVerificationService.verify_buffer(photo_bytes, "photo"):
                return _err(["Please upload a valid image file."])
            # Under nginx's 10M body cap, so this JSON 422 wins over its HTML 413.
            if len(photo_bytes) > MAX_PHOTO_BYTES:
                return _err(["Photo is too large (max 8 MB)"])

        # Drafts may be half-written (an empty title satisfies NOT NULL); anything
        # headed for review or the kiosk, by an admin too, needs its headline and photo.
        if status == "review" or status in _PUBLISH_INTENT_STATUSES:
            if not headline:
                return _err(["Add a headline."])
            if not (image_file or (existing and getattr(existing, "image", None))):
                return _err(["Add a photo before submitting"])

        logo_file = _first_upload(request.input("logo"))
        remove_logo = _truthy(request.input("remove_logo"))
        actor_id = _current_user_id(request)
        crop = json.dumps(Posts.parse_crop(request.input("image_crop")))
        source_lines = json.dumps(Posts.parse_source_lines(request.input("source_lines")))

        old_image = getattr(existing, "image", None) if existing else None
        old_logo = getattr(existing, "logo_path", None) if existing else None
        new_image = None
        new_logo = None

        try:
            if logo_file:
                # Magic-byte verified and named server-side; never the browser's filename.
                new_logo, logo_error = ImageUploads.save_uploaded_image(
                    logo_file, LOGO_FOLDER, "logo"
                )
                if logo_error:
                    return _err([logo_error])

            if image_file:
                public_disk = storage.disk("public")
                new_image = public_disk.put_file("news", image_file)
                # WebP derivatives never block saving; serving falls back to the original.
                try:
                    generate_variants(image_file.get_content(), new_image, public_disk)
                except Exception:
                    pass

            logo_path = new_logo or (None if remove_logo else old_logo)
            now = datetime.now(timezone.utc)
            publishing = status in _PUBLISH_INTENT_STATUSES
            clear_expiry = False
            current_expiry = getattr(existing, "expires_at", None) if existing else None
            if not isinstance(current_expiry, datetime):
                current_expiry = None
            if expires_at is None:
                if current_expiry is not None and (
                    publishing or (existing is not None and _news_is_public(existing))
                ):
                    # A blank field is "no change" for a live post; resetting it would
                    # silently move the end date.
                    pass
                elif publishing:
                    # Unset at approval means a week from now, stored so it is visible.
                    expires_at = Posts.default_expiry(now)
                else:
                    clear_expiry = current_expiry is not None

            if existing:
                existing.title = headline
                existing.description = body
                existing.kicker = kicker or None
                existing.image_crop = crop
                existing.source_lines = source_lines
                # masonite-orm turns None into *now* for a __dates__ column (the
                # setter and cast_values both call get_new_datetime_string), which
                # would store the save time and expire the post at birth. So None is
                # never assigned; a real clear is a separate NULL write below.
                if expires_at is not None:
                    existing.expires_at = expires_at
                existing.logo_path = logo_path
                # Whatever the editor asked for applies, so saving a live post as a
                # draft or resubmission takes it off the kiosk until re-approved.
                existing.status = status
                if actor_id is not None:
                    existing.updated_by_id = actor_id
                # Resubmitting clears a rejection the editor has already answered.
                if status == "review":
                    existing.rejection_reason = None
                if publishing and not getattr(existing, "published_at", None):
                    existing.published_at = now
                if new_image is not None:
                    existing.image = new_image
                existing.save()
                if clear_expiry:
                    # cast=False binds a real None (checked via to_qmark), unlike save().
                    News.where("id", existing.id).update({"expires_at": None}, cast=False)
                saved = existing
            else:
                fields = dict(
                    title=headline,
                    description=body,
                    kicker=kicker or None,
                    image=new_image,
                    logo_path=logo_path,
                    image_crop=crop,
                    source_lines=source_lines,
                    status=status,
                    author_id=actor_id,  # set once; updated_by_id moves on later edits
                    updated_by_id=actor_id,
                )
                if publishing:
                    fields["published_at"] = now
                if expires_at is not None:
                    # Omitted when unset: create() would turn None into now (see above).
                    fields["expires_at"] = expires_at
                saved = News.create(**fields)
        except Exception as exception:
            traceback.print_exception(type(exception), exception, exception.__traceback__)
            # The row never changed, so the files written for it are orphans.
            if new_image:
                _delete_image_files(new_image)
            _delete_logo_file(new_logo)
            return _err(["Could not save the post. Please try again."])

        # Only now that the row points at the new files may the replaced ones go.
        if new_image and old_image and old_image != new_image:
            _delete_image_files(old_image)
        if old_logo and old_logo != logo_path:
            _delete_logo_file(old_logo)

        Cache.forget(_NEWS_CACHE_KEY)
        # Forgetting the cache and telling the kiosk are the same fact; always do both.
        KioskBroadcast.section_changed("latest-news")

        if is_ajax:
            try:
                disk = StorageFacade.disk("public")
            except Exception:
                disk = None
            return json_success(
                response,
                payload={
                    "id": getattr(saved, "id", None),
                    "status": status,
                    "card": Posts.card_context(saved, disk),
                },
                messages=["Post saved."],
            )
        return response.redirect(name="gears.dashboard").with_success(["Post saved."])

    def destroy(self, request: Request, response: Response):
        is_ajax = wants_json(request)

        def _err(messages):
            if is_ajax:
                return json_errors(response, messages)
            return response.back().with_errors(messages)

        record = News.where("id", request.param("id")).first()
        if not record or not _may_change_story(request, record):
            return _err(["Article not found."])

        image, logo = getattr(record, "image", None), getattr(record, "logo_path", None)
        # A hard delete: posts have no restore UI, so a soft-deleted row would keep its
        # photo and logo on the NAS forever. Row first, files after, so a failed delete
        # never leaves a live post pointing at files that are gone.
        try:
            News.where("id", record.id).force_delete()
        except Exception as exception:
            traceback.print_exception(type(exception), exception, exception.__traceback__)
            return _err(["Could not delete the post. Please try again."])

        _delete_image_files(image)
        _delete_logo_file(logo)

        Cache.forget(_NEWS_CACHE_KEY)
        KioskBroadcast.section_changed("latest-news")

        if is_ajax:
            return json_success(response, payload={"id": request.param("id")}, messages=["Post deleted."])
        return response.redirect(name="gears.dashboard", query_params={"page": "news"}).with_success([
            "Post deleted.",
        ])
