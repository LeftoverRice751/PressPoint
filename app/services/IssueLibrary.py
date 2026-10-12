"""The Story Library's Published tab: an editor's own past newsletters, and
what can be done with one -- duplicate it as a new draft, or print it.

Ownership is issues.owner_id and "published" is derived from story statuses,
both exactly as the composer and kiosk already define them; nothing here adds
a column or a second notion of either.
"""

from config.database import DB

from app.models.Issue import Issue
from app.models.News import News
from app.services import Issues, NewsCategories
from app.services.ImageDerivatives import copy_image_and_variants, delete_image_and_variants


class NotFound(Exception):
    """Not the caller's issue, or no such issue -- deliberately the same."""


class NotPublished(Exception):
    """The caller's issue has nothing on the kiosk side of the review gate."""


class DraftInProgress(Exception):
    """The caller already has an open issue with stories in it."""

    def __init__(self, story_count):
        super().__init__(f"open draft has {story_count} stories")
        self.story_count = story_count


#: Carried over verbatim. NOT `content`: it is not in News.__fillable__ (the
#: body is `description`), so create() would drop it silently anyway.
COPIED_FIELDS = (
    "title", "description", "dek", "excerpt", "source", "location",
    "category_id", "layout_type", "priority", "headline_font",
    "image_caption", "image_credit",
)


def _source(user_id, issue_id):
    issue = Issues.owned_issue(user_id, issue_id)
    if issue is None:
        raise NotFound()
    stories = [s for s in Issues.stories_of(issue) if Issues.is_visible(s)]
    if not stories:
        raise NotPublished()
    return issue, stories


def _target_issue(user_id, discard):
    """The open issue to fill, or None to create one.

    Issues.current_for() treats the editor's newest unpublished issue as THE
    composer canvas, so a second one with stories would hide the first until
    the duplicate published. An empty open issue is reused instead of
    creating another, which would burn a number and leave a gap in No."""
    current = Issues.current_for(user_id)
    if current is None:
        return None
    existing = Issues.stories_of(current)
    if not existing:
        return current
    if not discard:
        raise DraftInProgress(len(existing))
    # Soft deletes, like NewsController.destroy: files stay, rows restorable.
    for story in existing:
        story.delete()
    current.delete()
    return None


def duplicate(user_id, issue_id, discard=False):
    source, stories = _source(user_id, issue_id)
    target = _target_issue(user_id, discard)

    live_categories = NewsCategories.names_by_id()
    fallback_category = NewsCategories.default_category_id()

    # Files are copied before the transaction, not inside it: a copy cannot be
    # rolled back, and NAS I/O does not belong inside an open MySQL
    # transaction. The loop sits inside the try so that a copy failing partway
    # still removes the copies already made.
    images = {}
    try:
        for s in stories:
            stored = getattr(s, "image", None)
            if stored:
                images[getattr(s, "id", None)] = copy_image_and_variants(stored)

        with DB.transaction():
            if target is None:
                # No `published_at` key: it is a __dates__ column and the ORM
                # turns None into now (see Issues.ensure_current_for).
                target = Issue.create({
                    "number": Issues.next_number(),
                    "owner_id": user_id,
                    "title": getattr(source, "title", None),
                })
            else:
                target.title = getattr(source, "title", None)
                target.save()

            for story in stories:
                data = {field: getattr(story, field, None) for field in COPIED_FIELDS}
                if data["category_id"] not in live_categories:
                    # Pointing a copy at a soft-deleted category blanks its
                    # kiosk label and hides it from the category modal.
                    data["category_id"] = fallback_category
                data.update({
                    "image": images.get(getattr(story, "id", None)),
                    "status": "draft",
                    "author_id": user_id,
                    "updated_by_id": user_id,
                    "issue_id": getattr(target, "id", None),
                })
                News.create(data)
    except Exception:
        for path in images.values():
            if path:
                delete_image_and_variants(path)
        raise

    return {
        "issue_id": getattr(target, "id", None),
        "number": int(getattr(target, "number", 0) or 0),
        "story_count": len(stories),
    }
