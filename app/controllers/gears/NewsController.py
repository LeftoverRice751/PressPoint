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

from config.database import DB

from app.events.NewNews import NewNews
from app.models.News import News
from app.services import NewsCache, NewsCategories
from app.services.AjaxResponses import wants_json, json_success, json_errors
from app.services.DashboardContext import group_news_slots, section_stamp
from app.services.ImageDerivatives import generate_variants, variant_path, variant_relpath
from app.services.StorageRouter import absolute_path, is_safe_path


# The fonts an editor may choose. THIS LIST IS THE AUTHORITY: a ql-font-* class
# naming anything not in here is stripped on save, so adding a face to the CSS
# or the editor without adding it here means it silently vanishes on publish.
# Keep in sync with resources/css/newsletter-type.css and the FONTS array in
# resources/js/news-dashboard.js — the header comment in the CSS lists all four
# places that have to agree.
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
_NEWSLETTER_SIZES = ["small", "large", "huge"]  # "normal" is the absence of a class

# The story body is authored in a rich-text editor (Quill) and rendered as HTML
# on the kiosk news page, so it MUST be sanitized on write. Only this small,
# formatting-only allowlist survives; everything else (scripts, event handlers,
# style, iframes, etc.) is stripped.
_ALLOWED_TAGS = [
    "p", "br", "strong", "em", "u", "s", "h2", "h3", "blockquote", "ul", "ol", "li", "a",
    # Quill's carrier for an inline font/size run. It has no semantics of its
    # own and no attributes beyond the class filter below.
    "span",
]

# Every class Quill can legitimately emit, as an exact set. Building it here
# rather than matching a regex like r"ql-font-[\w-]+" means an attacker cannot
# invent `ql-font-anything` and have it survive: the value must be a member.
_ALLOWED_CLASSES = frozenset(
    [f"ql-font-{slug}" for slug in NEWSLETTER_FONTS]
    + [f"ql-size-{name}" for name in _NEWSLETTER_SIZES]
    + ["ql-align-center", "ql-align-right", "ql-align-justify"]
    + [f"ql-indent-{n}" for n in (1, 2, 3)]
)


def _allow_class(tag, name, value):
    """bleach attribute filter: permit only known Quill formatting classes.

    bleach hands us the raw attribute value, which for `class` may hold several
    space-separated names (Quill stacks them — `ql-font-bebas ql-size-huge`).
    bleach's filter API is all-or-nothing per attribute, so a single unknown
    name drops the whole attribute rather than being quietly filtered out of it;
    that is the conservative direction and it cannot be used to smuggle one in.
    """
    if name != "class":
        return False
    names = value.split()
    return bool(names) and all(n in _ALLOWED_CLASSES for n in names)


# `class` is allowed only on the elements Quill actually puts formatting on.
# Before this, no element allowed `class` at all, which meant alignment and
# indent were silently destroyed on every save even though the editor offered
# them. Note `style` is still allowed nowhere: fonts are carried by class, so
# there is no reason to accept inline CSS (and no need for bleach's optional
# tinycss2 dependency, which isn't installed).
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
    # Auto-link bare URLs. `nofollow` is an SEO hint, not a security control —
    # the actual safety here is that `target` is no longer an allowed attribute,
    # so a stored target="_blank" can't reach the kiosk without rel="noopener"
    # and hand the opened page a window.opener handle back to us.
    return bleach.linkify(cleaned, callbacks=[bleach.callbacks.nofollow]) if cleaned else cleaned


# The headline is authored in Quill too now (it replaced a "Headline font"
# dropdown), so `news.title` became an HTML column and the kiosk renders it with
# `| safe`. It gets its OWN, much smaller allowlist rather than reusing
# _ALLOWED_TAGS: a headline is one line of display type, and an <h2>, a list or
# a blockquote inside one would wreck the newspaper typography the composer
# exists to preview. Inline formatting only, no <a> (hence no linkify below —
# a link in a headline has nowhere to go on a touchscreen kiosk).
_HEADLINE_TAGS = ["strong", "em", "u", "s", "span"]
_HEADLINE_ATTRS = {"span": _allow_class}


def _sanitize_headline_html(raw_html):
    """Return a safe INLINE-only HTML subset for a story headline.

    `strip=True` unwraps rather than escapes, so Quill's block wrappers (it
    always emits at least one <p>) collapse to their contents and a headline
    stays one line even if something upstream sent several.
    """
    return bleach.clean(
        raw_html or "",
        tags=_HEADLINE_TAGS,
        attributes=_HEADLINE_ATTRS,
        strip=True,
    )


def normalize_headline_font(value):
    """Slug for the per-story furniture font, or None for the brand face.

    Validated against the same list the sanitizer uses, so the control that
    sets it and the body allowlist can never drift apart. The editor-side
    dropdown is gone — news-dashboard.js derives this from the font Quill
    applied to the headline — but the column and its `story-font-<slug>` render
    both stay, so stories published before that change keep their face.
    """
    slug = (value or "").strip().lower()
    return slug if slug in NEWSLETTER_FONTS else None


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


def _normalize_news_status(raw_status, default="draft"):
    """Resolve a status string, falling back to something INVISIBLE.

    The default used to be "approved", which is one of the publicly visible
    statuses — so an unrecognised or missing status published to the campus
    kiosk. That is the wrong direction to fail in: a story wrongly left as a
    draft is a phone call, a story wrongly on a public screen is a retraction.
    """
    status = (raw_status or default or "draft").strip().lower()
    status = _NEWS_STATUS_ALIASES.get(status, status)
    if status not in _NEWS_ALLOWED_STATUSES:
        return default or "draft"
    return status


def _apply_scheduling(status, published_at):
    """Upgrade a default publish-intent status to 'scheduled' when the
    given published_at is still in the future.

    The composer's hidden status field is hardcoded to "published" today
    (frontend work lands in later tasks), so without this the "schedule for
    later" flow silently published immediately. Only the default
    publish-intent statuses ("approved"/"published") are eligible — an
    editor who explicitly chose "draft"/"review"/"archived" is left alone,
    and an already-"scheduled" status is left alone too. _news_is_public's
    gate (scheduled goes live once published_at <= now) is untouched."""
    if not published_at or status not in ("approved", "published"):
        return status

    now_reference = (
        datetime.now(published_at.tzinfo) if getattr(published_at, "tzinfo", None) else datetime.now()
    )
    if published_at > now_reference:
        return "scheduled"
    return status


_NEWS_LAYOUT_TYPES = {"main", "secondary", "widget", "unassigned"}

#: How many rows each front-page bucket can hold. These are the same numbers
#: group_news_slots() truncates to with [:4]/[:2]; enforcing them here means a
#: story can no longer read as "placed" in the composer while being silently
#: sliced off the kiosk render.
_NEWS_SLOT_CAPACITY = {"main": 1, "secondary": 4, "widget": 2}


class _LayoutConflict(Exception):
    """The canvas that produced this batch is behind the database.

    Raised inside layout()'s transaction so the rollback is the normal path,
    and turned into a 409 (not a 422) by the caller: nothing about the request
    is malformed, it just lost a race.
    """


class _SlotOverflow(Exception):
    """Applying this batch would leave a bucket over its capacity."""


#: Statuses that put a story in front of the public. Only an admin may write
#: one of these directly; everyone else's publish attempt becomes "review".
_PUBLISH_INTENT_STATUSES = {"approved", "scheduled", "published"}


def _actor_is_admin(request):
    """True when the signed-in account may approve and publish.

    `admin` only — superadmin manages accounts, not editorial. Normalised the
    way every other role check in the app is, because the live `role` column
    holds values with stray casing (see UserController._is_editor).
    """
    try:
        user = request.user() if callable(getattr(request, "user", None)) else None
    except Exception:
        return False
    return (getattr(user, "role", "") or "").strip().lower() == "admin"


def _resolve_status_for_actor(status, request):
    """Downgrade a non-admin's publish intent to `review`.

    Called on every write path an editor can reach, so the gate holds for a
    hand-crafted POST as much as for the composer's buttons. Draft stays draft:
    submitting is a deliberate act, and silently promoting a save to a
    submission would put half-written stories in the admin's queue.
    """
    if status in _PUBLISH_INTENT_STATUSES and not _actor_is_admin(request):
        return "review"
    return status


def _current_user_id(request):
    """users.id of the signed-in account, or None.

    Defensive because `request.user()` is False (not None) for a guest in
    Masonite, and because the unit tests drive these controllers with request
    doubles that have no user at all.
    """
    try:
        user = request.user() if callable(getattr(request, "user", None)) else None
    except Exception:
        return None
    return getattr(user, "id", None) or None


def _delete_image_files(image_path):
    """Remove an uploaded news image and its generated .large/.thumb WebP
    derivatives from disk, guarding against path traversal. Shared by
    destroy() and by store()'s "remove featured image" path so the two can't
    drift — missing the derivatives orphans them on disk forever."""
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
#
# The key itself moved to app/services/NewsCache.py, because a CATEGORY write
# also has to invalidate this: renaming a category changes a label the kiosk
# renders while touching zero `news` rows, so no news-side invalidation would
# ever fire for it. These aliases stay because the existing tests patch and
# assert against these names.
_NEWS_CACHE_KEY = NewsCache.KEY
_NEWS_CACHE_TTL = NewsCache.TTL


def _news_item_to_dict(item, disk=None, category_names=None):
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
    # Category label, resolved from a {id: name} dict built ONCE per payload
    # rather than per story — same shape as DashboardContext.author_names().
    # Deliberately not an ORM relationship: with ~20 stories and well under 20
    # categories there is no N+1 to avoid, and a relationship would be another
    # thing to configure and keep in sync.
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
        # Pre-formatted for the kiosk dateline/folio — Jinja2 can't strftime an
        # ISO string, and the cache driver can't store a datetime.
        "published_label": fallback_at.strftime("%b %d, %Y") if hasattr(fallback_at, "strftime") else None,
        "published_iso": fallback_at.strftime("%Y-%m-%d") if hasattr(fallback_at, "strftime") else None,
    }


def _build_flash_payload(news_item):
    reference_at = getattr(news_item, "published_at", None) or getattr(news_item, "created_at", None)
    return {
        # Plain text, not the stored HTML: welcome-screen.js renders this
        # through escapeHtml(), so a headline carrying Quill's formatting spans
        # would show as literal `<span class="ql-font-…">` in the kiosk ticker.
        "headline": _html_to_text(getattr(news_item, "title", None) or "") or "News update",
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

        # One query for every live category name, resolved behind this cache
        # so a rename costs nothing per request. A story whose category was
        # soft-deleted resolves to None here — but it cannot reach this point
        # anyway, because deleting a category cascades a soft-delete to its
        # stories and the global scope has already excluded them above.
        category_names = NewsCategories.names_by_id()

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

        def project(item):
            return _news_item_to_dict(item, disk, category_names)

        # Slide 1 of the kiosk carousel is the broadsheet — the lead plus the
        # secondary and widget slots, exactly as before. `carousel_news` is
        # every OTHER public story, one per slide after it, so nothing is
        # shown twice and nothing that is approved is unreachable.
        #
        # Identity comparison against the slot objects, not id equality: these
        # are the same model instances group_news_slots was handed, and an id
        # set would need the None-lead case special-cased.
        on_front_page = [slots["main_news"], *slots["secondary_news"], *slots["widget_news"]]
        carousel_items = [
            item for item in news_items if not any(item is placed for placed in on_front_page)
        ]

        return {
            "news_items": [project(item) for item in news_items],
            "main_news": project(slots["main_news"]) if slots["main_news"] else None,
            "secondary_news": [project(item) for item in slots["secondary_news"]],
            "widget_news": [project(item) for item in slots["widget_news"]],
            "carousel_news": [project(item) for item in carousel_items],
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
                # .get(), not [] — a cache entry written before carousel_news
                # existed would KeyError here. The version bump on
                # NewsCache.KEY should make that unreachable; this is the
                # belt to that braces.
                "carousel_news": payload.get("carousel_news") or [],
                "issue_vol": payload.get("issue_vol"),
                "issue_no": payload.get("issue_no"),
                "active_nav": "news",
            },
        )

    def store(self, request: Request, storage: Storage, response: Response):
        # The headline is rich text now and the kiosk renders it with `| safe`,
        # so it MUST be sanitized on write exactly like the body is — through
        # the inline-only headline allowlist, not the body's.
        title = _sanitize_headline_html((request.input("title") or "").strip()).strip()
        description = _sanitize_news_html((request.input("description") or "").strip())
        source = (request.input("source") or "").strip()
        location = (request.input("location") or "").strip()
        # Editorial extras are plain text (like source/location) — strip any
        # markup that leaks in from the contenteditable regions.
        dek = _html_to_text(request.input("dek") or "").strip()
        # Front-page excerpt (Task 1 column, wired into the composer in Task
        # 5): plain text like dek/caption/credit — strips markup that leaks
        # in from the contenteditable region. Optional; the front page falls
        # back to a truncated body when it's blank (kiosk/_news_slots.html).
        excerpt = _html_to_text(request.input("excerpt") or "").strip()
        # Unrecognised slugs normalise to None (the brand face) rather than
        # erroring — the dropdown is the only legitimate source, so a bad value
        # means a stale form, not something worth failing an editor's publish over.
        headline_font = normalize_headline_font(request.input("headline_font"))
        image_caption = _html_to_text(request.input("image_caption") or "").strip()
        image_credit = _html_to_text(request.input("image_credit") or "").strip()
        layout_type = (request.input("layout_type") or "secondary").strip().lower() or "secondary"
        category_id = (request.input("category_id") or "").strip()
        actor_id = _current_user_id(request)
        # Fail closed. The old default here was "approved", which is publicly
        # visible — so a request that simply omitted `status` (a stale form, a
        # replayed POST, a caller that forgot the field) published straight to
        # the campus kiosk. `draft` is invisible and recoverable; a wrong
        # `approved` is a story on a public screen that nobody chose to put there.
        status = _normalize_news_status(request.input("status"), default="draft")
        # An editor cannot publish. Whatever status the request carries, an
        # account that is not an admin gets its publish-intent downgraded to
        # `review` so an admin has to look at it first. This is enforced here
        # rather than in the UI because the UI is just a form: posting
        # status=published by hand has to fail too.
        status = _resolve_status_for_actor(status, request)
        published_at_value = (request.input("published_at") or "").strip()
        priority_value = request.input("priority")
        image_file = request.input("image")
        article_id = (request.input("article_id") or "").strip()
        # The composer's Featured Image "Remove" action. An absent upload
        # means "keep the current photo" (so a text-only edit doesn't wipe
        # it), so clearing one has to be asked for explicitly.
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

        # `_html_to_text(title)`, not `title`: the headline is HTML now, and an
        # empty Quill editor still serialises to markup — `<p><br></p>`, or a
        # bare formatting span with nothing in it. A truthiness check on the raw
        # string would wave those through and publish a blank headline.
        if not _html_to_text(title) or not _html_to_text(description):
            return _err(["Title and description are required."])

        try:
            priority = int(priority_value or 0)
        except (TypeError, ValueError):
            return _err(["Priority must be a valid number."])

        # A category is required, and it is enforced HERE rather than only in
        # the composer's submit modal — for the same reason
        # _resolve_status_for_actor is enforced server-side. The UI is just a
        # form; a hand-crafted POST that omits the field has to fail too.
        #
        # Validated against a LIVE category: the id has to exist AND not be a
        # tombstone. Pointing a story at a soft-deleted category would blank
        # its label on the kiosk, and the FK alone cannot catch that (a
        # tombstone is still a real row).
        if not category_id:
            return _err(["Please choose a category for this story."])
        if not NewsCategories.find_live(category_id):
            return _err(["That category no longer exists. Pick another one."])

        # Ascending priority now means "lower number = earlier slot" (see
        # DashboardContext.group_news_slots). A brand-new story with no
        # explicit priority — the composer always posts priority=0 today —
        # would otherwise land below zero, i.e. ahead of every existing
        # story, and instantly steal the lead slot. Append it to the end of
        # the current order instead; editors can still reposition it later.
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
                    # The lookup above is soft-delete scoped, so a story that
                    # was deleted underneath this editor — most likely by
                    # someone deleting its whole category — reads as missing.
                    # Say which it is: falling through to the create branch
                    # would silently fork a second row, and a bare "not found"
                    # sends the editor looking for a typo that isn't there.
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
                # Resubmitting clears the last rejection: the reason described
                # a version of the story that no longer exists, and leaving it
                # set would keep showing the editor a complaint they have
                # already answered.
                if status == "review":
                    existing.rejection_reason = None
                if published_at is not None:
                    existing.published_at = published_at
                if image_path is not None:
                    existing.image = image_path
                elif remove_image:
                    # Drop the files too — destroy() is careful about this and
                    # leaving them behind orphans them on disk forever.
                    _delete_image_files(getattr(existing, "image", None))
                    existing.image = None
                existing.save()
                saved_news = existing
                is_new = False
            else:
                saved_news = News.create(
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
                    # Set once, never rewritten — `updated_by_id` is what moves
                    # when someone else edits the story later.
                    author_id=actor_id,
                    updated_by_id=actor_id,
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

    def layout(self, request: Request, response: Response):
        """Bulk slot/order save — writes ONLY layout_type and priority for
        many rows in one request. This is what drag-reorder and slot
        assignment call; it must never touch body/title/status/published_at.

        Payload: JSON body `{"items": [{"id": 1, "layout_type": "main",
        "priority": 0}, ...]}`. Read via request.all() rather than
        request.input("items") — Masonite's InputBag.get() silently
        unwraps a length-1 list to its single element, which would corrupt
        a single-card reorder; request.all() returns the raw parsed value
        with no such unwrapping.
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

        # Optional so a plain form post (and every existing caller) still
        # works; when absent the conflict check is skipped rather than
        # failing closed, because refusing an unversioned write would break
        # the non-AJAX degradation path this endpoint is required to keep.
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
            # All-or-nothing: without this, a mid-batch failure (item 4 of 7
            # raises) would leave items 1-3 committed while the cache is
            # never invalidated below — the kiosk keeps serving the
            # pre-change layout for up to _NEWS_CACHE_TTL seconds while the
            # table itself holds a half-applied order. Sharing one
            # transaction across every row means a failure rolls the whole
            # batch back, so the (unchanged) cache stays correct with no
            # invalidation needed on the error path.
            updated_ids = []
            with DB.transaction():
                # Optimistic concurrency. The composer rebuilds the ENTIRE
                # canvas from its own DOM on every drag (currentCanvasBatch in
                # news-dashboard.js), so a tab that loaded an hour ago does not
                # send "move card 7" — it sends its whole stale front page.
                # Without this check the stale tab wins and the other editor's
                # work is gone with no error on either side.
                #
                # The token is the section stamp the liveness poll already
                # computes, so there is no new column and no new query shape.
                # It is table-wide, which means an unrelated body save also
                # trips it; the cost of that false positive is one forced
                # canvas refresh, against the cost of a silent total overwrite.
                if base_stamp is not None:
                    current_stamp = section_stamp(News)
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

                # Counted across the whole table AFTER applying, not across the
                # batch: a batch legitimately carries only one bucket
                # (buildBucketBatch), so checking the payload alone would miss
                # a main that another editor added between this tab's last
                # refresh and this write.
                for slot, capacity in _NEWS_SLOT_CAPACITY.items():
                    if News.where("layout_type", slot).count() > capacity:
                        raise _SlotOverflow(slot)

            Cache.forget(_NEWS_CACHE_KEY)

            if is_ajax:
                return json_success(
                    response,
                    payload={"updated": updated_ids, "stamp": section_stamp(News)},
                    messages=["Layout saved."],
                )
            return response.redirect(name="gears.dashboard").with_success(["Layout saved."])
        except _LayoutConflict:
            # 409, not 422 — the payload was fine, it just lost a race. The
            # composer reloads the canvas on this status rather than showing a
            # validation error.
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
        """Saves ONLY the sanitized article body (`description`)."""
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

            # `description` is the column the kiosk renders, so rewriting it is
            # a content change like any other and has to face the same gate
            # store() applies. Without this an editor could get a story
            # approved, then swap its text for anything -- on any story in the
            # table -- and it would go straight to the campus terminal on the
            # next cache miss. Admins are the approvers, so their edit stays put.
            record.status = _resolve_status_for_actor(
                _normalize_news_status(getattr(record, "status", None)), request
            )

            body_editor_id = _current_user_id(request)
            if body_editor_id is not None:
                record.updated_by_id = body_editor_id
            record.save()

            Cache.forget(_NEWS_CACHE_KEY)

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

    def unassign(self, request: Request, response: Response):
        """Sets layout_type = "unassigned". Does not delete the story and
        does not change its status."""
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

        # NOTE: this deliberately does NOT delete the image files any more.
        #
        # `record.delete()` is a SOFT delete now (News mixes in
        # SoftDeletesMixin), so the row is recoverable — but its image would
        # not be. A restored story would render a broken <img> with its
        # .large/.thumb WebP derivatives gone for good, which is a worse
        # outcome than leaving a few files on disk.
        #
        # This also fixes an existing bug in passing: the unlink used to run
        # BEFORE record.delete() succeeded, so a failing delete already
        # orphaned the derivatives while keeping the row.
        #
        # The hard purge belongs to a path that does not exist yet — a Trash
        # panel's "Delete permanently", or a maintenance command walking
        # News.only_trashed() — and would pair force_delete() with
        # _delete_image_files(). Until then, the cost of this change is that
        # a deleted story's images stay on disk indefinitely.

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
