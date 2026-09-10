"""The kiosk's six destinations — the single source for both Python and Jinja.

The carousel in templates/welcome.html *is* the kiosk's navigation: swiping to
a section renders that section's content immediately, with no preview and no
View step. Three things therefore have to agree on the same six entries — the
carousel markup, the server-side resolution of a deep link like
/kiosk/campus-map, and the JS that pushes history — and this module is what
they all read.

It used to be a `{% set kiosk_menus = [...] %}` literal inside welcome.html.
That was fine while the list was only ever rendered, but the shell controller
now has to turn a request path back into a section, so the list has to exist in
Python. Two copies would drift the first time somebody adds a destination.

## The two paths per section, and why

`path` is what the visitor sees and what history.pushState() writes.
`embed_path` is what the content frame actually loads.

They must differ. The shell is served at `path` so that a deep link arrives
with its section already active (requirement §6); if the frame then loaded
`path` too, it would load the shell inside the shell, forever. `embed_path`
points at the same unchanged controller that used to serve `path` directly, so
no destination template or controller is duplicated — only route lines were
added. See routes/public.py.
"""

#: Ordered exactly as the carousel renders them; the first is the default.
#:
#: `id` keys the inline SVG macro in welcome.html (menu_icon) and the
#: data-menu-id attribute. `blurb` is no longer rendered as a stage preview —
#: the preview is gone — but it remains the accessible description on each
#: card, which is the only text a screen reader gets for an icon tile.
SECTIONS = (
    {
        "id": "latest-news",
        "title": "Latest News",
        "blurb": "Read recent updates from The Gears",
        "path": "/kiosk/latest-news",
        "embed_path": "/kiosk/embed/latest-news",
    },
    {
        "id": "campus-map",
        "title": "Campus Map",
        "blurb": "Find every building, office and route around campus",
        "path": "/kiosk/campus-map",
        "embed_path": "/kiosk/embed/campus-map",
    },
    {
        "id": "gears-archive",
        "title": "Gears Archive",
        "blurb": "Read published issues of The Gears",
        "path": "/kiosk/gears-archive",
        "embed_path": "/kiosk/embed/gears-archive",
    },
    {
        "id": "virtual-tour",
        "title": "Virtual Tour",
        "blurb": "Walk the campus in 360°",
        "path": "/kiosk/virtual-tour",
        "embed_path": "/kiosk/embed/virtual-tour",
    },
    {
        "id": "about-lspu",
        "title": "About LSPU",
        "blurb": "Mission, history, hymn and seal",
        "path": "/kiosk/about-lspu",
        "embed_path": "/kiosk/embed/about-lspu",
    },
    {
        # id stays "org-chart" (it keys the icon macro and predates the table),
        # but the path is /kiosk/org-board — the route the org board has always
        # been served at. /kiosk/org-chart still redirects there, untouched.
        "id": "org-chart",
        "title": "LSPU Org Chart",
        "blurb": "Who leads which office",
        "path": "/kiosk/org-board",
        "embed_path": "/kiosk/embed/org-board",
    },
)

#: Landing on /kiosk normalises to this section. First in the carousel, and the
#: cheapest of the six to render — the map, the archive and the tour all pull
#: substantial payloads, so none of them should be what an idle terminal sits
#: on by default.
DEFAULT_SECTION_ID = "latest-news"

_BY_ID = {section["id"]: section for section in SECTIONS}
_BY_PATH = {section["path"]: section for section in SECTIONS}


def all_sections():
    """Every section, in carousel order."""
    return SECTIONS


def default_section():
    return _BY_ID[DEFAULT_SECTION_ID]


def by_id(section_id):
    """Look up by id, or None. Used by the JS-facing payload and tests."""
    return _BY_ID.get((section_id or "").strip().lower())


def by_path(path):
    """Resolve a request path to its section, or None.

    Tolerates a trailing slash and a query string so that /kiosk/campus-map/
    and /kiosk/campus-map?foo=1 both resolve — a kiosk URL can arrive from a
    QR code or a typed address, and a 404 on a stray slash would be a dead
    terminal rather than a redirect.
    """
    if not path:
        return None
    cleaned = path.split("?", 1)[0].split("#", 1)[0].rstrip("/") or "/"
    return _BY_PATH.get(cleaned)


def index_of(section_id):
    """Carousel position, for Swiper's initialSlide. -1 when unknown."""
    for position, section in enumerate(SECTIONS):
        if section["id"] == section_id:
            return position
    return -1


def resolve(path):
    """The section a request for `path` should open on, never None.

    /kiosk itself, and anything unrecognised, falls back to the default rather
    than erroring: this is an unattended public terminal, so the failure mode
    for a bad URL has to be a working kiosk.
    """
    return by_path(path) or default_section()
