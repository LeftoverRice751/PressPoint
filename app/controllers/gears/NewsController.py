from datetime import datetime
import html as html_module
import os
import traceback

import bleach

from masonite.controllers import Controller
from masonite.filesystem import Storage
from masonite.facades import Broadcast, Cache, Storage as StorageFacade
from masonite.request import Request
from masonite.response import Response
from masonite.views import View

from config.database import DB

from app.events.NewNews import NewNews
from app.models.Events import Events
from app.models.News import News
from app.services import Issues, KioskBroadcast, NewsCache, NewsCategories
from app.services.KioskBroadcast import pusher_configured as _pusher_configured  # noqa: F401
from app.services.AjaxResponses import wants_json, json_success, json_errors
from app.services.DashboardContext import (
    issue_identity_of,
    BLOCK_CAPACITY,
    BLOCK_TYPES,
    group_news_slots,
    issue_identity,
    section_stamp,
    upcoming_events,
)
from app.services.ImageDerivatives import generate_variants, variant_path, variant_relpath
from app.services.StorageRouter import absolute_path, is_safe_path


# Authoritative font list: unknown ql-font-* classes are stripped on save.
# Keep in sync with newsletter-type.css and FONTS in news-dashboard.js.
NEWSLETTER_FONTS = [
    "playfair",
    "lora",
    "tinos",
    "archivo-black",
    "bebas",
    "alfa-slab",
    "space-grotesk",
    "caveat",
    "jetbrains-mono",
]
_NEWSLETTER_SIZES = ["small", "large", "huge"]  # "normal" has no class

# Story bodies are Quill HTML rendered on the kiosk, so only this allowlist survives.
_ALLOWED_TAGS = [
    "p", "br", "strong", "em", "u", "s", "h2", "h3", "blockquote", "ul", "ol", "li", "a",
    "span",  # Quill's carrier for inline font/size runs
]

# Exact set, not a regex, so `ql-font-anything` cannot survive.
_ALLOWED_CLASSES = frozenset(
    [f"ql-font-{slug}" for slug in NEWSLETTER_FONTS]
    + [f"ql-size-{name}" for name in _NEWSLETTER_SIZES]
    + ["ql-align-center", "ql-align-right", "ql-align-justify"]
    + [f"ql-indent-{n}" for n in (1, 2, 3)]
)


def _allow_class(tag, name, value):
    """bleach attribute filter: keep `class` only if every name is a known Quill class."""
    if name != "class":
        return False
    names = value.split()
    return bool(names) and all(n in _ALLOWED_CLASSES for n in names)


# `class` only on elements Quill formats; `style` allowed nowhere (fonts ride on class).
_ALLOWED_ATTRS = {
    "a": ["href", "title", "rel"],
    "span": _allow_class,
    "p": _allow_class,
    "li": _allow_class,
    "h2": _allow_class,
    "h3": _allow_class,
    "blockquote": _allow_class,
}


def _sanitize_news_html(raw_html):
    """Return a safe HTML subset of the given rich-text body."""
    cleaned = bleach.clean(
        raw_html or "",
        tags=_ALLOWED_TAGS,
        attributes=_ALLOWED_ATTRS,
        protocols=["http", "https", "mailto"],
        strip=True,
    )
    # Auto-link bare URLs. `target` is not allowed, so no window.opener leak.
    return bleach.linkify(cleaned, callbacks=[bleach.callbacks.nofollow]) if cleaned else cleaned


# Headlines are Quill HTML too, but inline-only: a block element would wreck the typography.
_HEADLINE_TAGS = ["strong", "em", "u", "s", "span"]
_HEADLINE_ATTRS = {"span": _allow_class}


def _sanitize_headline_html(raw_html):
    """Safe inline-only HTML for a headline; `strip=True` collapses Quill's <p> wrapper."""
    return bleach.clean(
        raw_html or "",
        tags=_HEADLINE_TAGS,
        attributes=_HEADLINE_ATTRS,
        strip=True,
    )


def normalize_headline_font(value):
    """Font slug for the story's furniture, or None for the brand face."""
    slug = (value or "").strip().lower()
    return slug if slug in NEWSLETTER_FONTS else None


def _html_to_text(html):
    """Plain-text projection, so `<p><br></p>` counts as empty."""
    return bleach.clean(html or "", tags=[], strip=True).strip()


def _flash_text(value):
    """Flatten stored HTML for the kiosk ticker: decode entities, collapse to one line."""
    return " ".join(html_module.unescape(_html_to_text(value)).split())


# Required fields per block: exactly what the kiosk prints for it. Unlisted blocks
# need title and description.
_BLOCK_REQUIRES = {
    "lead": ("title", "description"),
    "editorial": ("title", "description"),
    "quote": ("description",),  # the body is the quote
    "brief": ("title",),
    "notice": ("title",),
    "photo_essay": ("image",),
}

# How much of a quote stands in for its title in the Story Library.
_DERIVED_TITLE_CHARS = 60


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


def _apply_scheduling(status, published_at):
    """Turn a publish-intent status into 'scheduled' when published_at is in the future."""
    if not published_at or status not in ("approved", "published"):
        return status

    now_reference = (
        datetime.now(published_at.tzinfo) if getattr(published_at, "tzinfo", None) else datetime.now()
    )
    if published_at > now_reference:
        return "scheduled"
    return status


# Everything layout() accepts. `unassigned` is the story library: real, but no capacity.
_NEWS_LAYOUT_TYPES = set(BLOCK_TYPES) | {"unassigned"}

# Per-bucket capacity, enforced inside layout()'s transaction. Same source as
# group_news_slots(), so a story cannot read as placed while being sliced off the kiosk.
_NEWS_SLOT_CAPACITY = dict(BLOCK_CAPACITY)


class _LayoutConflict(Exception):
    """The canvas that produced this batch is behind the database (→ 409)."""


class _SlotOverflow(Exception):
    """Applying this batch would leave a bucket over its capacity."""


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
    if not image_path:
        return

    candidates = [image_path] + [
        variant_relpath(image_path, variant) for variant in ("large", "thumb")
    ]
    for relative_path in candidates:
        try:
            full_path = absolute_path(relative_path)
            if is_safe_path(relative_path) and os.path.isfile(full_path):
                os.remove(full_path)
        except OSError:
            pass


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


class NewsController(Controller):
    def _build_news_payload(self):
        """Every current issue, newest first, each with its own blocks (one kiosk slide per issue).

        Filtering runs on Model instances; dict conversion happens last, because
        getattr() on a dict always returns the default.
        """
        try:
            disk = StorageFacade.disk("public")
        except Exception:
            disk = None
        category_names = NewsCategories.names_by_id()

        def project(item):
            return _news_item_to_dict(item, disk, category_names)

        issues = []
        # current_issues(), not published_issues(): an issue leaves the kiosk at 08:00 next day.
        for issue in Issues.current_issues():
            stories = [item for item in getattr(issue, "stories", []) if _news_is_public(item)]
            if not stories:
                continue
            slots = group_news_slots(stories)
            identity = issue_identity_of(issue)
            issues.append({
                "id": getattr(issue, "id", None),
                "number": int(getattr(issue, "number", 0) or 0),
                "title": getattr(issue, "title", None) or "",
                "published_label": (
                    issue.published_at.strftime("%b %d, %Y")
                    if hasattr(getattr(issue, "published_at", None), "strftime") else None
                ),
                "blocks": {
                    block: [project(item) for item in slots[block]] for block in BLOCK_TYPES
                },
                "issue_vol": identity["issue_vol"],
                "issue_no": identity["issue_no"],
                "news_items": [project(item) for item in stories],
            })

        # Newest issue also exposed flat for readers of the old top-level keys.
        first = issues[0] if issues else None
        return {
            "issues": issues,
            "news_items": first["news_items"] if first else [],
            "blocks": first["blocks"] if first else {block: [] for block in BLOCK_TYPES},
            "issue_vol": first["issue_vol"] if first else None,
            "issue_no": first["issue_no"] if first else None,
        }

    def _upcoming_events(self):
        """Calendar rows, shared with the composer via DashboardContext."""
        return upcoming_events()

    def show(self, view: View):
        payload = Cache.remember(_NEWS_CACHE_KEY, lambda cache: cache.put(
            _NEWS_CACHE_KEY, self._build_news_payload(), seconds=_NEWS_CACHE_TTL
        ))

        return view.render(
            "kiosk/news",
            {
                # `.get()` with fallback: a cache entry from before this key would KeyError.
                "issues": payload.get("issues") or [],
                "news_items": payload["news_items"],
                "blocks": payload["blocks"],
                "issue_vol": payload.get("issue_vol"),
                "issue_no": payload.get("issue_no"),
                "events": self._upcoming_events(),  # not cached on purpose
                "active_nav": "news",
            },
        )

    def store(self, request: Request, storage: Storage, response: Response):
        # Headline and body are rendered with `| safe`, so both are sanitized on write.
        title = _sanitize_headline_html((request.input("title") or "").strip()).strip()
        description = _sanitize_news_html((request.input("description") or "").strip())
        source = (request.input("source") or "").strip()
        location = (request.input("location") or "").strip()
        # Editorial extras are plain text; strip markup from the contenteditable regions.
        dek = _html_to_text(request.input("dek") or "").strip()
        excerpt = _html_to_text(request.input("excerpt") or "").strip()
        headline_font = normalize_headline_font(request.input("headline_font"))
        image_caption = _html_to_text(request.input("image_caption") or "").strip()
        image_credit = _html_to_text(request.input("image_credit") or "").strip()
        layout_type = (request.input("layout_type") or "brief").strip().lower() or "brief"
        category_id = (request.input("category_id") or "").strip()
        actor_id = _current_user_id(request)
        # Fail closed: a missing status must not publish to the kiosk.
        status = _normalize_news_status(request.input("status"), default="draft")
        # Server-side gate: a non-admin's publish intent becomes `review`.
        status = _resolve_status_for_actor(status, request)
        published_at_value = (request.input("published_at") or "").strip()
        priority_value = request.input("priority")
        image_file = request.input("image")
        article_id = (request.input("article_id") or "").strip()
        # No upload means "keep the current photo", so clearing must be explicit.
        remove_image = str(request.input("remove_image") or "").strip().lower() in (
            "1",
            "true",
            "yes",
            "on",
        )

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

        # Required fields depend on the block; check text content, since an empty
        # Quill editor still serialises to `<p><br></p>`.
        required = _BLOCK_REQUIRES.get(layout_type, ("title", "description"))
        present = {
            "title": bool(_html_to_text(title)),
            "description": bool(_html_to_text(description)),
            "image": bool(request.input("image")),  # validated properly further down
        }
        missing = [name for name in required if not present[name]]
        if missing:
            labels = {"title": "a headline", "description": "the text", "image": "a photograph"}
            return _err(["This block needs " + " and ".join(labels[m] for m in missing) + "."])

        # `title` is NOT NULL and the Story Library lists by it; a quote borrows its opening.
        if not _html_to_text(title) and _html_to_text(description):
            title = _html_to_text(description)[:_DERIVED_TITLE_CHARS].strip()

        try:
            priority = int(priority_value or 0)
        except (TypeError, ValueError):
            return _err(["Priority must be a valid number."])

        # Category is required and must be live: a soft-deleted one would blank the
        # kiosk label, and the FK alone cannot catch a tombstone.
        if not category_id:
            return _err(["Please choose a category for this story."])
        if not NewsCategories.find_live(category_id):
            return _err(["That category no longer exists. Pick another one."])

        # Lower priority renders first, so a new story at 0 would steal the lead.
        # Append it to the end of the current order instead.
        if not article_id and priority == 0:
            current_max = News.max("priority").get()
            current_max_priority = (
                getattr(current_max[0], "priority", None) if current_max else None
            )
            priority = int(current_max_priority or 0) + 1

        published_at = None
        if published_at_value:
            try:
                published_at = datetime.fromisoformat(published_at_value)
            except ValueError:
                return _err(["Published at must be a valid date and time."])

        status = _apply_scheduling(status, published_at)

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
                public_disk = storage.disk("public")
                image_path = public_disk.put_file("news", image_file)

                # WebP derivatives never block publishing; serving falls back to the original.
                try:
                    generate_variants(image_file.get_content(), image_path, public_disk)
                except Exception:
                    pass

            if article_id:
                existing = News.where("id", article_id).first()
                if not existing:
                    # Lookup is soft-delete scoped: tell the editor if the story was
                    # trashed under them instead of silently creating a second row.
                    if News.with_trashed().where("id", article_id).first():
                        return _err([
                            "That story was deleted while you were editing it. "
                            "Restore it from its category before saving again.",
                        ])
                    return _err(["Article not found."])
                existing.category_id = category_id
                existing.title = title
                existing.description = description
                existing.source = source or None
                existing.location = location or None
                existing.dek = dek or None
                existing.excerpt = excerpt or None
                existing.headline_font = headline_font
                existing.image_caption = image_caption or None
                existing.image_credit = image_credit or None
                existing.layout_type = layout_type
                existing.priority = priority
                existing.status = status
                if actor_id is not None:
                    existing.updated_by_id = actor_id
                # Resubmitting clears a rejection the editor has already answered.
                if status == "review":
                    existing.rejection_reason = None
                if published_at is not None:
                    existing.published_at = published_at
                if image_path is not None:
                    existing.image = image_path
                elif remove_image:
                    _delete_image_files(getattr(existing, "image", None))
                    existing.image = None
                existing.save()
                saved_news = existing
                is_new = False
            else:
                # A new story is filed into the author's open issue, creating one if needed.
                issue = Issues.ensure_current_for(actor_id)
                saved_news = News.create(
                    issue_id=getattr(issue, "id", None),
                    category_id=category_id,
                    title=title,
                    description=description,
                    image=image_path,
                    published_at=published_at,
                    source=source or None,
                    location=location or None,
                    dek=dek or None,
                    excerpt=excerpt or None,
                    headline_font=headline_font,
                    image_caption=image_caption or None,
                    image_credit=image_credit or None,
                    layout_type=layout_type,
                    priority=priority,
                    status=status,
                    author_id=actor_id,  # set once; updated_by_id moves on later edits
                    updated_by_id=actor_id,
                )
                is_new = True

            try:
                NewNews(saved_news).fire()
            except Exception:
                pass

            Cache.forget(_NEWS_CACHE_KEY)
            # Forgetting the cache and telling the kiosk are the same fact; always do both.
            KioskBroadcast.section_changed("latest-news")

            if is_ajax:
                return json_success(response, payload={
                    # Post-write stamp, so the composer's next layout save doesn't 409 on its own write.
                    "stamp": Issues.stamp_for(_int_or_none(getattr(saved_news, "issue_id", None)))
                    if _int_or_none(getattr(saved_news, "issue_id", None)) else section_stamp(News),
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

    def layout(self, request: Request, response: Response):
        """Bulk slot/order save: writes only layout_type and priority.

        Payload is `{"items": [{"id", "layout_type", "priority"}, ...]}`, read via
        request.all() because request.input() unwraps a length-1 list to its element.
        """
        is_ajax = wants_json(request)

        def _err(messages, status=422):
            if is_ajax:
                return json_errors(response, messages, status=status)
            return response.back().with_errors(messages)

        payload = request.all() or {}

        items = payload.get("items")
        if not isinstance(items, list) or not items:
            return _err(["No layout changes were provided."])

        # Optional so plain form posts still work; absent means skip the conflict check.
        base_stamp = payload.get("base_stamp")
        if base_stamp is not None and not isinstance(base_stamp, str):
            base_stamp = str(base_stamp)

        updates = []
        for raw in items:
            if not isinstance(raw, dict):
                return _err(["Invalid layout payload."])

            try:
                item_id = int(raw.get("id"))
            except (TypeError, ValueError):
                return _err(["Invalid layout payload."])

            layout_type = str(raw.get("layout_type") or "").strip().lower()
            if layout_type not in _NEWS_LAYOUT_TYPES:
                return _err(["Invalid layout type."])

            try:
                priority = int(raw.get("priority") or 0)
            except (TypeError, ValueError):
                return _err(["Invalid priority."])

            updates.append((item_id, layout_type, priority))

        editor_id = _current_user_id(request)

        try:
            # One transaction: a mid-batch failure rolls everything back, so the
            # (unchanged) cache stays correct with no invalidation on the error path.
            updated_ids = []
            with DB.transaction():
                # Optimistic concurrency, scoped to the first item's issue. The composer
                # sends its whole canvas on every drag, so a stale tab would otherwise
                # silently overwrite another editor's work.
                first = News.where("id", int(items[0].get("id") or 0)).first() if items else None
                issue_id = _int_or_none(getattr(first, "issue_id", None) if first else None)

                if base_stamp is not None:
                    current_stamp = Issues.stamp_for(issue_id) if issue_id else section_stamp(News)
                    if current_stamp != base_stamp:
                        raise _LayoutConflict(current_stamp)

                for item_id, layout_type, priority in updates:
                    record = News.where("id", item_id).first()
                    if not record:
                        continue
                    record.layout_type = layout_type
                    record.priority = priority
                    if editor_id is not None:
                        record.updated_by_id = editor_id
                    record.save()
                    updated_ids.append(item_id)

                # Count the whole issue after applying, not just the batch, to catch a
                # story another editor placed since this tab last refreshed.
                for slot, capacity in _NEWS_SLOT_CAPACITY.items():
                    occupied = News.where("layout_type", slot)
                    if issue_id:
                        occupied = occupied.where("issue_id", issue_id)
                    if occupied.count() > capacity:
                        raise _SlotOverflow(slot)

            Cache.forget(_NEWS_CACHE_KEY)
            KioskBroadcast.section_changed("latest-news")

            if is_ajax:
                return json_success(
                    response,
                    payload={
                        "updated": updated_ids,
                        "stamp": Issues.stamp_for(issue_id) if issue_id else section_stamp(News),
                    },
                    messages=["Layout saved."],
                )
            return response.redirect(name="gears.dashboard").with_success(["Layout saved."])
        except _LayoutConflict:
            # 409, not 422: the payload was fine, it just lost a race. The composer reloads.
            if is_ajax:
                return json_errors(
                    response,
                    ["Someone else changed the front page while you were editing."],
                    status=409,
                )
            return response.back().with_errors([
                "Someone else changed the front page while you were editing. "
                "Reload and try again.",
            ])
        except _SlotOverflow as overflow:
            slot = str(overflow) or "layout"
            return _err([
                f"That change would put too many stories in the {slot} slot "
                f"(limit {_NEWS_SLOT_CAPACITY.get(slot, '?')}). Nothing was saved.",
            ])
        except Exception as exception:
            traceback.print_exception(type(exception), exception, exception.__traceback__)
            return _err(["Could not save layout changes. Please try again."])

    def body(self, request: Request, response: Response):
        """Saves only the sanitized article body (`description`)."""
        is_ajax = wants_json(request)

        def _err(messages, status=422):
            if is_ajax:
                return json_errors(response, messages, status=status)
            return response.back().with_errors(messages)

        record = News.where("id", request.param("id")).first()
        if not record:
            return _err(["Article not found."], status=404)

        sanitized = _sanitize_news_html((request.input("description") or "").strip())
        if not _html_to_text(sanitized):
            return _err(["Description is required."])

        try:
            record.description = sanitized

            # Rewriting the body is a content change, so it faces store()'s publish gate.
            record.status = _resolve_status_for_actor(
                _normalize_news_status(getattr(record, "status", None)), request
            )

            body_editor_id = _current_user_id(request)
            if body_editor_id is not None:
                record.updated_by_id = body_editor_id
            record.save()

            Cache.forget(_NEWS_CACHE_KEY)
            KioskBroadcast.section_changed("latest-news")

            if is_ajax:
                return json_success(
                    response,
                    payload={"id": record.id, "description": sanitized},
                    messages=["Body saved."],
                )
            return response.redirect(name="gears.dashboard").with_success(["Body saved."])
        except Exception as exception:
            traceback.print_exception(type(exception), exception, exception.__traceback__)
            return _err(["Could not save the body. Please try again."])

    def autosave(self, request: Request, response: Response):
        """Persist an in-progress draft's text. Never publishes anything.

        Refuses to touch a public story: silently pulling a live story back to
        `review` in the background is worse than the problem it solves, so the
        editor is told to use Publish. Never writes status or invalidates the kiosk.
        """
        is_ajax = wants_json(request)

        def _err(messages, status=422):
            if is_ajax:
                return json_errors(response, messages, status=status)
            return response.back().with_errors(messages)

        record = News.where("id", request.param("id")).first()
        if not record:
            return _err(["Article not found."], status=404)

        if _normalize_news_status(getattr(record, "status", None)) in _NEWS_VISIBLE_STATUSES:
            # 409: well-formed request, inapplicable state. The composer shows it as a hint.
            return _err(["This story is live. Use Publish to change what the kiosk shows."], status=409)

        # Same sanitizers as store(); a laxer path here would bypass the allowlist.
        fields = {
            "title": _sanitize_headline_html((request.input("title") or "").strip()).strip(),
            "description": _sanitize_news_html((request.input("description") or "").strip()),
            "source": (request.input("source") or "").strip(),
            "location": (request.input("location") or "").strip(),
            "dek": _html_to_text(request.input("dek") or "").strip(),
            "excerpt": _html_to_text(request.input("excerpt") or "").strip(),
            "image_caption": _html_to_text(request.input("image_caption") or "").strip(),
            "image_credit": _html_to_text(request.input("image_credit") or "").strip(),
        }

        try:
            # One at a time: __fillable__ includes `status`, so a mass assignment could publish.
            for column, value in fields.items():
                setattr(record, column, value)

            actor_id = _current_user_id(request)
            if actor_id is not None:
                record.updated_by_id = actor_id
            record.save()

            saved_at = datetime.now().strftime("%H:%M")
            if is_ajax:
                return json_success(
                    response,
                    payload={"id": record.id, "saved_at": saved_at},
                    messages=["Draft saved."],
                )
            return response.back().with_success(["Draft saved."])
        except Exception as exception:
            traceback.print_exception(type(exception), exception, exception.__traceback__)
            return _err(["Could not save the draft."])

    def unassign(self, request: Request, response: Response):
        """Sets layout_type = "unassigned" without deleting or changing status."""
        is_ajax = wants_json(request)

        def _err(messages, status=422):
            if is_ajax:
                return json_errors(response, messages, status=status)
            return response.back().with_errors(messages)

        record = News.where("id", request.param("id")).first()
        if not record:
            return _err(["Article not found."], status=404)

        try:
            record.layout_type = "unassigned"
            record.save()

            Cache.forget(_NEWS_CACHE_KEY)
            KioskBroadcast.section_changed("latest-news")

            if is_ajax:
                return json_success(
                    response,
                    payload={"id": record.id, "layout_type": "unassigned"},
                    messages=["Story unassigned."],
                )
            return response.redirect(name="gears.dashboard").with_success(["Story unassigned."])
        except Exception as exception:
            traceback.print_exception(type(exception), exception, exception.__traceback__)
            return _err(["Could not unassign the story. Please try again."])

    def destroy(self, request: Request, response: Response):
        is_ajax = wants_json(request)

        def _err(messages):
            if is_ajax:
                return json_errors(response, messages)
            return response.back().with_errors(messages)

        record = News.where("id", request.param("id")).first()
        if not record:
            return _err(["Article not found."])

        # Soft delete only: image files stay so a restored story still renders.
        # A future hard purge would pair force_delete() with _delete_image_files().
        try:
            record.delete()
        except Exception as exception:
            traceback.print_exception(type(exception), exception, exception.__traceback__)
            return _err(["Could not delete the news item. Please try again."])

        Cache.forget(_NEWS_CACHE_KEY)
        KioskBroadcast.section_changed("latest-news")

        if is_ajax:
            return json_success(response, payload={"id": request.param("id")}, messages=["News deleted."])
        return response.redirect(name="gears.dashboard", query_params={"page": "news"}).with_success([
            "News deleted.",
        ])
