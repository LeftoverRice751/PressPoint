"""An editor's own photo posts: the library list and "duplicate as new draft".

Rules live here so the controller stays thin; the visibility gate is
NewsController._news_is_public, imported lazily because NewsController imports
this module.
"""

from masonite.facades import Storage as StorageFacade

from app.models.News import News
from app.services import Posts
from app.services.ImageDerivatives import copy_image_and_variants, delete_image_and_variants


def _disk():
    try:
        return StorageFacade.disk("public")
    except Exception:
        return None


def post_state(post):
    """draft | review | live | expired | rejected, in that precedence order of intent."""
    from app.controllers.gears.NewsController import (
        _NEWS_VISIBLE_STATUSES, _news_is_public, _normalize_news_status,
    )

    status = _normalize_news_status(getattr(post, "status", None), default="draft")
    if status == "draft":
        return "rejected" if (getattr(post, "rejection_reason", None) or "").strip() else "draft"
    if status == "review":
        return "review"
    if _news_is_public(post):
        return "live"
    if status in _NEWS_VISIBLE_STATUSES and Posts.is_expired(post):
        return "expired"
    # Approved but not yet visible (a scheduled time still ahead): not on the kiosk.
    return "draft"


def library_rows(user_id):
    """The caller's posts, newest edit first, each a card_context plus `state`."""
    if not user_id:
        return []
    # Ordered by the database, not News.all() + sorted(): see "Dashboard liveness".
    posts = (
        News.where("author_id", user_id)
        .order_by("updated_at", "desc")
        .order_by("id", "desc")
        .get()
    )
    disk = _disk()
    return [
        {**Posts.card_context(post, disk), "state": post_state(post)} for post in (posts or [])
    ]


def _owned(user_id, post_id):
    post = News.where("id", post_id).first() if user_id else None
    try:
        mine = post is not None and int(getattr(post, "author_id", None)) == int(user_id)
    except (TypeError, ValueError):
        mine = False
    if not mine:
        # One answer for "missing" and "not yours": a guessed id confirms nothing.
        raise LookupError("post not found")
    return post


def duplicate(user_id, post_id):
    """Copy one of the caller's posts into a fresh draft and return the new row."""
    source = _owned(user_id, post_id)

    # Files first, outside any row write: a copy cannot be rolled back, so every
    # copy made is tracked and removed if a later step fails. Copied, never shared,
    # because deleting a post deletes its files.
    copies = []
    try:
        image = copy_image_and_variants(getattr(source, "image", None))
        if image:
            copies.append(image)
        # A missing source logo file yields None: the copy simply uses the default logo.
        logo = copy_image_and_variants(getattr(source, "logo_path", None))
        if logo:
            copies.append(logo)

        # No expires_at / published_at / rejection_reason keys at all: masonite-orm
        # turns a None handed to a __dates__ column into now(), which would expire
        # the copy at birth. Omitted, they stay NULL.
        return News.create(
            title=getattr(source, "title", None) or "",
            description=getattr(source, "description", None) or "",
            kicker=getattr(source, "kicker", None),
            image=image,
            logo_path=logo,
            image_crop=getattr(source, "image_crop", None),
            source_lines=getattr(source, "source_lines", None),
            status="draft",
            author_id=user_id,
            updated_by_id=user_id,
        )
    except Exception:
        for path in copies:
            try:
                delete_image_and_variants(path)
            except OSError:
                # One failed cleanup must not mask the original error or skip the rest.
                pass
        raise
