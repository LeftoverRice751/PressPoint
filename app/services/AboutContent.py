"""About LSPU content helpers.

Owns:
- sanitisation of editor-supplied HTML before persistence
- loading the six sections + milestones in one shape ready for templates

Keeping this out of the controller makes sanitisation easy to unit-test
without spinning up the request/response cycle.
"""

import copy
from urllib.parse import urlparse

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


# Display order for the kiosk rail and the editor accordion.
SECTION_SLUGS = ["mission", "values", "history", "quality", "hymn", "seal"]

#: The page row (the rail header's title; historically also a hub hero's
#: kicker and lead) is authored as a row too, but it is deliberately *not* in
#: SECTION_SLUGS: `ordered_slugs` drives the rail and the panes on the kiosk,
#: so a seventh entry there would render an empty seventh pane. load_all()
#: still returns it in `sections`, keyed "page".
PAGE_SLUG = "page"
EDITABLE_SLUGS = SECTION_SLUGS + [PAGE_SLUG]


#: Callouts on the university seal, as percentage positions within the artwork.
#: The template positions each dot inside an aspect-ratio:1 wrapper, so the
#: percentages resolve against the seal image and stay glued to it at any size.
#: This is the *default* only — an editor who replaces the seal with different
#: artwork can move, rename, and re-word every dot from the dashboard.
DEFAULT_SEAL_HOTSPOTS = [
    {"key": "torch", "label": "Torch and flame", "x": 50, "y": 41,
     "note": "Enlightenment carried into the province."},
    {"key": "book", "label": "The open book", "x": 50, "y": 52,
     "note": "Instruction and research: the university teaches, and it publishes."},
    {"key": "agriculture", "label": "Agriculture", "x": 27, "y": 33,
     "note": "The rice stalk, for the farming towns the school was founded to serve."},
    {"key": "fisheries", "label": "Fisheries", "x": 72, "y": 31,
     "note": "The fish of Laguna de Bay, on whose shoreline the first campus opened."},
    {"key": "technology", "label": "Technology", "x": 50, "y": 73,
     "note": "Gear and earth — the polytechnic mandate in industry and the trades."},
    {"key": "founding", "label": "1952 · 2007", "x": 50, "y": 91,
     "note": "Founding year on the ring; 2007 at the centre, when R.A. 9402 made "
             "LSPU a university."},
]


#: Short display strings the kiosk renders around the authored bodies. These
#: used to be a `tile_meta` literal in templates/kiosk/about-lspu.html plus a
#: SEAL_HOTSPOTS constant in AboutController, i.e. a developer had to ship a
#: commit to fix a typo on the kiosk. They are defaults now: `meta` on the row
#: overrides a key, an absent or empty key falls back to what is written here,
#: and any key not listed for a slug is dropped on save.
DEFAULT_META = {
    PAGE_SLUG: {
        # `kicker` and `lead` have no kiosk surface since the hub view was
        # removed. Kept so a row saved with them still passes sanitize_meta.
        "kicker": "Six sections · tap to read",
        "title": "About LSPU",
        "lead": "The university’s charter, its values, and the seventy years "
                "behind the name on the gate.",
    },
    "mission": {
        "short": "Mission",
        "hint": "What the university is chartered to do",
        "sources": [],
    },
    "values": {
        "short": "Values",
        "hint": "Integrity, professionalism, innovation",
        "core_band": "Core values — LSPU develops",
        "pledge_label": "Performance pledge",
        "sources": [],
    },
    "history": {
        "short": "History",
        "hint": "1952 to now, milestone by milestone",
        "sources": [],
    },
    "quality": {
        "short": "Quality",
        "hint": "The commitment, in one statement",
        "footer_left": "Quality management system",
        "footer_right": "ISO 9001:2015 certified",
        "sources": [],
    },
    "hymn": {
        "short": "Hymn",
        "hint": "Play it, and follow the words",
        "sources": [],
    },
    "seal": {
        "short": "Seal",
        "hint": "Every mark on it, explained",
        "cue": "Tap a symbol",
        "hotspots": DEFAULT_SEAL_HOTSPOTS,
        "sources": [],
    },
}

#: Per-key length caps. Everything in `meta` renders as plain text into a fixed
#: kiosk layout, so an unbounded string is a broken pane rather than a long one.
_META_MAX = {
    "kicker": 80, "title": 80, "lead": 240,
    "short": 20, "hint": 90,
    "core_band": 80, "pledge_label": 40,
    "footer_left": 60, "footer_right": 60,
    "cue": 40,
}

MAX_HOTSPOTS = 12

#: Attribution rows per section. Eight is well past what any About pane cites
#: and keeps the kiosk's footer from growing past the fold on a 768x1024 pane.
MAX_SOURCES = 8

#: Schemes a source link may carry. `javascript:` and `data:` are the reason
#: this is an allowlist and not a blocklist -- the kiosk renders these as real
#: <a href>, so an unchecked scheme is stored XSS on a public terminal.
SOURCE_PROTOCOLS = ("http", "https", "mailto")


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
    def sanitize_text(value, limit=200):
        """Plain text for a `meta` value: tags stripped, whitespace collapsed.

        These strings are rendered by Jinja *without* |safe, so escaping already
        protects the page; stripping tags here keeps a pasted `<b>` from showing
        up as literal angle brackets on the kiosk.
        """
        if value is None:
            return ""
        text = bleach.clean(str(value), tags=[], attributes={}, strip=True)
        return " ".join(text.split())[:limit]

    @staticmethod
    def _sanitize_hotspots(raw):
        """Validate the seal callout list: label + note + a position on the art.

        A hotspot outside 0–100% would render its dot off the seal, so both
        coordinates are clamped rather than rejected — an editor dragging past
        the edge gets a dot on the edge, not a save that silently drops a row.
        """
        if not isinstance(raw, list):
            return []
        out = []
        for index, entry in enumerate(raw):
            if not isinstance(entry, dict):
                continue
            label = AboutContent.sanitize_text(entry.get("label"), 80)
            note = AboutContent.sanitize_text(entry.get("note"), 240)
            if not label and not note:
                continue

            def _pct(value, fallback=50.0):
                try:
                    return max(0.0, min(100.0, round(float(value), 2)))
                except (TypeError, ValueError):
                    return fallback

            key = AboutContent.sanitize_text(entry.get("key"), 40)
            out.append({
                # `key` pairs a dot with its legend card in about-lspu-kiosk.js.
                # It is never shown, so an editor-added row just gets an index.
                "key": key or "spot-{}".format(index + 1),
                "label": label,
                "note": note,
                "x": _pct(entry.get("x")),
                "y": _pct(entry.get("y")),
            })
            if len(out) >= MAX_HOTSPOTS:
                break
        return out

    @staticmethod
    def sanitize_source_url(value):
        """An editor-supplied source link, or "" if it is not one we will render.

        Two things happen here that a bare strip() would not do:

        - The scheme is checked against SOURCE_PROTOCOLS. The kiosk paints these
          as real anchors, so `javascript:` or `data:` in an href is stored XSS
          on an unauthenticated public terminal. bleach does not help: the URL
          is stored as plain text and put into the attribute by Jinja, never
          run through sanitize_html.
        - A bare host ("lspu.edu.ph/about") gets an https:// prefix. Editors
          paste what they copied out of the address bar, and a schemeless href
          is resolved *relative to the current page*, so the citation would
          quietly link to /kiosk/about-lspu/lspu.edu.ph/about.
        """
        text = AboutContent.sanitize_text(value, 500)
        if not text:
            return ""

        parsed = urlparse(text)
        if parsed.scheme:
            return text if parsed.scheme.lower() in SOURCE_PROTOCOLS else ""

        # No scheme. Only assume https for something that actually looks like a
        # host; "Office of the President" belongs in the label, not the link.
        host = text.split("/", 1)[0]
        if "." in host and " " not in text:
            return "https://" + text
        return ""

    @staticmethod
    def _sanitize_sources(raw):
        """Validate the attribution list: who/what/where, plus an optional link.

        A row needs a label *or* a link to survive -- an editor who typed only a
        URL still gets a citation (the template falls back to showing the link
        itself), and one who names a person with nothing to link to is the whole
        point of the field.
        """
        if not isinstance(raw, list):
            return []
        out = []
        for entry in raw:
            if not isinstance(entry, dict):
                continue
            label = AboutContent.sanitize_text(entry.get("label"), 160)
            url = AboutContent.sanitize_source_url(entry.get("url"))
            if not label and not url:
                continue
            out.append({"label": label, "url": url})
            if len(out) >= MAX_SOURCES:
                break
        return out

    @staticmethod
    def sanitize_meta(slug, raw):
        """Whitelist `raw` against DEFAULT_META[slug] and clean every value.

        Returns only the keys that slug actually renders; anything else posted
        is discarded, so `meta` cannot become a dumping ground that later reads
        of the row have to defend against.
        """
        allowed = DEFAULT_META.get(slug)
        if not allowed or not isinstance(raw, dict):
            return {}
        cleaned = {}
        for key in allowed:
            if key not in raw:
                continue
            if key == "hotspots":
                cleaned[key] = AboutContent._sanitize_hotspots(raw.get(key))
                continue
            if key == "sources":
                cleaned[key] = AboutContent._sanitize_sources(raw.get(key))
                continue
            value = AboutContent.sanitize_text(raw.get(key), _META_MAX.get(key, 200))
            if value:
                cleaned[key] = value
        return cleaned

    @staticmethod
    def meta_for(slug, section=None):
        """Defaults for `slug`, overridden by whatever the row stores.

        Empty values do not override: a cleared field falls back to the default
        copy instead of leaving a blank strip on the kiosk. The two list keys —
        `hotspots` and `sources` — are the exception: an editor who deletes
        every callout, or every citation, means it, and there is no sensible
        default copy to fall back to.
        """
        # deepcopy, not dict(): `hotspots` is a nested list, and a shallow copy
        # would hand every request the same one to mutate.
        merged = copy.deepcopy(DEFAULT_META.get(slug) or {})
        stored = getattr(section, "meta", None) if section is not None else None
        if isinstance(stored, dict):
            for key, value in stored.items():
                if key not in merged:
                    continue
                if key in ("hotspots", "sources"):
                    if isinstance(value, list):
                        merged[key] = value
                elif value:
                    merged[key] = value
        return merged

    @staticmethod
    def load_all():
        """Return {sections, ordered_slugs, milestones, meta, page} for templates."""
        rows = list(AboutSection.all() or [])
        sections = {row.slug: row for row in rows}
        milestones = list(
            AboutMilestone.order_by("sort_order", "asc")
                          .order_by("id", "asc")
                          .get() or []
        )
        meta = {
            slug: AboutContent.meta_for(slug, sections.get(slug))
            for slug in EDITABLE_SLUGS
        }
        return {
            "sections": sections,
            "ordered_slugs": SECTION_SLUGS,
            "milestones": milestones,
            "meta": meta,
            "page": meta[PAGE_SLUG],
        }
