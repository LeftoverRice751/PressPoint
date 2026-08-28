""" News Model """

from masoniteorm.models import Model


class News(Model):
    """News Model"""
    __fillable__ = [
        "title",
        "description",
        "image",
        "published_at",
        "source",
        "location",
        "layout_type",
        "priority",
        "status",
        "dek",
        "image_caption",
        "image_credit",
        "excerpt",
        # Slug for the per-story furniture font (NULL = the brand face).
        # Validated against NEWSLETTER_FONTS in NewsController.
        "headline_font",
        # Who wrote it, and who touched it last. Both users.id, both nullable
        # (ON DELETE SET NULL) so removing a staff account never removes their
        # stories. `author_id` is set once on create; `updated_by_id` is
        # rewritten by every save, including a drag on the layout endpoint.
        "author_id",
        "updated_by_id",
        # Why an admin sent this story back. Set on reject, cleared on
        # resubmit. Column already existed in MySQL, left over from the
        # abandoned chief-editor flow -- this is the first code to read it.
        "rejection_reason",
        ]
    pass
