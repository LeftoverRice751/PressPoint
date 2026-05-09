"""About LSPU content helpers.

Owns:
- sanitisation of editor-supplied HTML before persistence
- loading the six sections + milestones in one shape ready for templates

Keeping this out of the controller makes sanitisation easy to unit-test
without spinning up the request/response cycle.
"""

import bleach

from app.models.AboutMilestone import AboutMilestone
from app.models.AboutSection import AboutSection


# Allowed HTML the WYSIWYG can produce. Tightly scoped because this is a
# production deployment and editors should not be able to inject script
# or arbitrary embeds via the About surface.
ALLOWED_TAGS = [
    "p", "br", "strong", "em", "u",
    "ul", "ol", "li",
    "a",
    "h3", "h4",
    "blockquote",
]
ALLOWED_ATTRS = {
    "a": ["href", "title", "rel"],
}
ALLOWED_PROTOCOLS = ["http", "https", "mailto"]


# Display order for the kiosk hub and the editor accordion.
SECTION_SLUGS = ["mission", "values", "history", "quality", "hymn", "seal"]


class AboutContent:
    @staticmethod
    def sanitize_html(value):
        """Run bleach with the About allowlist. None/empty returns ''."""
        if not value:
            return ""
        return bleach.clean(
            value,
            tags=ALLOWED_TAGS,
            attributes=ALLOWED_ATTRS,
            protocols=ALLOWED_PROTOCOLS,
            strip=True,
        )

    @staticmethod
    def sanitize_subsections(subsections):
        """Sanitize a list of {heading, body_html} dicts."""
        if not subsections:
            return []
        cleaned = []
        for entry in subsections:
            if not isinstance(entry, dict):
                continue
            cleaned.append({
                "heading": (entry.get("heading") or "").strip()[:200],
                "body_html": AboutContent.sanitize_html(entry.get("body_html")),
            })
        return cleaned

    @staticmethod
    def load_all():
        """Return {sections, ordered_slugs, milestones} for templates."""
        rows = list(AboutSection.all() or [])
        sections = {row.slug: row for row in rows}
        milestones = list(
            AboutMilestone.order_by("sort_order", "asc")
                          .order_by("id", "asc")
                          .get() or []
        )
        return {
            "sections": sections,
            "ordered_slugs": SECTION_SLUGS,
            "milestones": milestones,
        }
