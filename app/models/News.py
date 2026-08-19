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
        ]
    pass
