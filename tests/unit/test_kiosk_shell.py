"""The kiosk shell: one document, six sections, the carousel as navigation.

Guards the structural half of the direct-content rework — the half that fails
quietly. A missing embed route or a stale `kiosk_menus` reference does not
raise; it renders a kiosk whose content frame loads the shell inside itself,
or whose carousel is empty, and only a browser would notice.
"""

import re
from pathlib import Path

from masonite.tests import TestCase

from app.services import KioskSections

_REPO_ROOT = Path(__file__).resolve().parents[2]
_ROUTES = (_REPO_ROOT / "routes" / "public.py").read_text()

_JINJA_COMMENT = re.compile(r"\{#.*?#\}", re.DOTALL)
_HTML_COMMENT = re.compile(r"<!--.*?-->", re.DOTALL)
_BLOCK_COMMENT = re.compile(r"/\*.*?\*/", re.DOTALL)
_LINE_COMMENT = re.compile(r"^\s*//.*$", re.MULTILINE)


def markup(path):
    """A template with its commentary stripped.

    Every "X is gone" assertion below has to run against this rather than the
    raw file. Comments in this codebase explain *why*, usually by naming the
    thing that was removed and the bug that motivated removing it (see
    CLAUDE.md), so a plain substring search finds `wc-stage` in the very
    comment recording that `wc-stage` was deleted -- and would keep failing
    until someone "fixed" it by deleting the explanation, which is exactly
    backwards.
    """
    text = Path(path).read_text()
    for pattern in (_JINJA_COMMENT, _HTML_COMMENT, _BLOCK_COMMENT, _LINE_COMMENT):
        text = pattern.sub("", text)
    return text


_WELCOME = markup(_REPO_ROOT / "templates" / "welcome.html")


class KioskSectionsTest(TestCase):
    def test_every_section_has_both_paths_and_they_differ(self):
        # The shell is served at `path` so a deep link arrives with its section
        # active; the frame loads `embed_path`. If the two were ever equal the
        # frame would load the shell inside the shell, without end -- a hang
        # rather than an error, so it is worth asserting outright.
        for section in KioskSections.all_sections():
            self.assertTrue(section["path"].startswith("/kiosk/"), section)
            self.assertTrue(section["embed_path"].startswith("/kiosk/embed/"), section)
            self.assertNotEqual(section["path"], section["embed_path"], section)

    def test_ids_and_paths_are_unique(self):
        sections = KioskSections.all_sections()
        self.assertEqual(len({s["id"] for s in sections}), len(sections))
        self.assertEqual(len({s["path"] for s in sections}), len(sections))
        self.assertEqual(len({s["embed_path"] for s in sections}), len(sections))

    def test_resolve_maps_each_path_back_to_its_own_section(self):
        for section in KioskSections.all_sections():
            self.assertEqual(KioskSections.resolve(section["path"])["id"], section["id"])

    def test_resolve_tolerates_trailing_slash_and_query(self):
        # A kiosk URL can arrive from a QR code or a typed address; a stray
        # slash must not strand the terminal on the default section.
        self.assertEqual(KioskSections.resolve("/kiosk/campus-map/")["id"], "campus-map")
        self.assertEqual(KioskSections.resolve("/kiosk/campus-map?x=1")["id"], "campus-map")

    def test_unknown_paths_fall_back_to_the_default_section(self):
        # Unattended public terminal: the failure mode for a bad URL has to be
        # a working kiosk, never a 500.
        self.assertEqual(KioskSections.resolve("/kiosk")["id"], KioskSections.DEFAULT_SECTION_ID)
        self.assertEqual(KioskSections.resolve("/kiosk/gone")["id"], KioskSections.DEFAULT_SECTION_ID)
        self.assertEqual(KioskSections.resolve(None)["id"], KioskSections.DEFAULT_SECTION_ID)

    def test_index_of_matches_carousel_order(self):
        for position, section in enumerate(KioskSections.all_sections()):
            self.assertEqual(KioskSections.index_of(section["id"]), position)
        self.assertEqual(KioskSections.index_of("nope"), -1)

    def test_org_chart_keeps_the_existing_org_board_path(self):
        # The section id predates the table and keys the icon macro; the path
        # is the route the org board has always been served at. Renaming
        # either silently breaks the other.
        org = KioskSections.by_id("org-chart")
        self.assertEqual(org["path"], "/kiosk/org-board")


class KioskRoutesTest(TestCase):
    def test_every_section_path_serves_the_shell(self):
        for section in KioskSections.all_sections():
            self.assertIn(
                f'Route.get("{section["path"]}", "kiosk.KioskShellController@show")',
                _ROUTES,
                f'{section["path"]} must serve the shell so a deep link keeps the carousel',
            )

    def test_every_embed_path_is_routed_to_a_real_controller(self):
        for section in KioskSections.all_sections():
            match = re.search(
                r'Route\.get\("%s",\s*"([^"]+)"\)' % re.escape(section["embed_path"]),
                _ROUTES,
            )
            self.assertIsNotNone(match, f'{section["embed_path"]} is not routed')
            # ...and NOT back at the shell, which is the recursion this split exists to avoid.
            self.assertNotIn("KioskShellController", match.group(1))

    def test_kiosk_root_serves_the_shell(self):
        self.assertIn('Route.get("/kiosk", "kiosk.KioskShellController@show")', _ROUTES)

    def test_org_chart_alias_still_redirects(self):
        self.assertIn(
            'Route.get("/kiosk/org-chart", "kiosk.WelcomeController@org_chart")', _ROUTES
        )


class WelcomeTemplateTest(TestCase):
    def test_the_preview_stage_is_gone(self):
        # Not merely hidden: the whole browse-then-commit layer is removed.
        for marker in (
            "wc-stage",
            "data-wc-title",
            "data-wc-blurb",
            "data-wc-icon",
            "wc-view",
            "data-wc-view",
            "wc-viewport",
            "data-wc-viewport",
        ):
            self.assertNotIn(marker, _WELCOME, f"{marker} is part of the removed preview stage")

    def test_no_view_button_text_remains(self):
        self.assertNotRegex(_WELCOME, r">\s*View\s*<")

    def test_content_frame_is_server_rendered_with_the_active_section(self):
        # src comes from the server so a deep link paints its content on the
        # first frame rather than flashing an empty shell.
        self.assertIn("data-kiosk-content", _WELCOME)
        self.assertIn("data-kiosk-frame", _WELCOME)
        self.assertIn('src="{{ active_section.embed_path }}"', _WELCOME)
        self.assertIn('name="kiosk-content"', _WELCOME)

    def test_carousel_renders_from_the_python_section_table(self):
        self.assertIn("{% for m in kiosk_sections %}", _WELCOME)
        self.assertNotIn("kiosk_menus", _WELCOME)
        self.assertIn('data-menu-embed="{{ m.embed_path }}"', _WELCOME)

    def test_swiper_start_index_comes_from_the_url(self):
        self.assertIn('data-active-index="{{ active_index }}"', _WELCOME)

    def test_menu_drawer_is_wired(self):
        # The toggle and the carousel are not adjacent in the DOM, so the only
        # thing connecting them for a screen reader is aria-controls -> id.
        self.assertIn('data-wc-nav-toggle', _WELCOME)
        self.assertIn('aria-controls="kiosk-menu"', _WELCOME)
        self.assertIn('id="kiosk-menu"', _WELCOME)
        # Server-rendered in the expanded state, so the kiosk always boots with
        # its menu up regardless of what the last visitor did.
        self.assertIn('data-nav="expanded"', _WELCOME)
        self.assertIn('aria-expanded="true"', _WELCOME)

    def test_menu_handle_sits_on_top_of_the_menu(self):
        # Inside the carousel band, above the track. That placement is what
        # makes the drawer free: the band collapses to the handle's height
        # instead of to zero, so the handle is always pressable while the
        # expanded layout is unchanged. A handle in a band of its own would
        # cost the content its height permanently.
        carousel = _WELCOME.split('class="wc-carousel"', 1)[1].split("</section>", 1)[0]
        self.assertIn("data-wc-nav-toggle", carousel)
        self.assertLess(
            carousel.index("data-wc-nav-toggle"),
            carousel.index('id="kiosk-menu"'),
            "the handle must come before the track it collapses",
        )

    def test_the_handle_is_not_inside_the_part_that_goes_inert(self):
        # #kiosk-menu is marked inert while collapsed. A toggle inside it would
        # go inert too and could never be pressed to undo the collapse.
        track = _WELCOME.split('id="kiosk-menu"', 1)[1].split("</section>", 1)[0]
        self.assertNotIn("data-wc-nav-toggle", track)

    def test_menu_toggle_is_labelled_by_what_it_does(self):
        self.assertIn('aria-label="Hide the kiosk menu"', _WELCOME)
        self.assertIn(">Menu<", _WELCOME)

    def test_the_drawer_is_driven_by_shared_tokens(self):
        # The swiper's height is pinned in px rather than 100%, which is what
        # stops every card flattening to zero as the band animates shut. That
        # only stays correct while the band, the track and the swiper all
        # derive from the same two tokens -- so assert the wiring, not one
        # particular calc() spelling.
        css = (_REPO_ROOT / "resources" / "css" / "welcome-screen.css").read_text()
        self.assertIn("--wc-carousel-h:", css)
        self.assertIn("--wc-nav-handle-h:", css)
        self.assertIn("flex: 0 0 var(--wc-carousel-h)", css)

        swiper = css.split(".wc-swiper {", 1)[1].split("}", 1)[0]
        self.assertIn("var(--wc-carousel-h)", swiper)
        self.assertIn("var(--wc-nav-handle-h)", swiper)
        self.assertNotIn("height: 100%", swiper)

        # Collapses to the handle, never to zero -- the handle is inside the
        # band and is the only way to bring the menu back.
        collapsed = css.split('[data-nav="collapsed"] .wc-carousel {', 1)[1].split("}", 1)[0]
        self.assertIn("flex-basis: var(--wc-nav-handle-h)", collapsed)

    def test_prefetch_targets_embed_paths_not_the_shell(self):
        # .feature-card hrefs are section paths, and every one serves this same
        # shell -- prefetching them would cache six copies of the menu.
        self.assertNotIn('"selector_matches": ".feature-card"', _WELCOME)
        self.assertIn("m.embed_path", _WELCOME)

    def test_attract_frames_the_embed_path(self):
        # /kiosk/latest-news is the shell now; framing it nests the kiosk in
        # its own attract overlay. Read raw: this is the assignment itself,
        # not an absence check, so stripping comments would be pointless.
        js = (_REPO_ROOT / "resources" / "js" / "welcome-screen.js").read_text()
        self.assertIn('ATTRACT_SRC = "/kiosk/embed/latest-news"', js)


class BackControlsTest(TestCase):
    #: The six destinations. About is the one allowed to keep a control, and
    #: only its in-content one.
    DESTINATIONS = (
        "news.html",
        "campus-map.html",
        "archives.html",
        "kiosk-tour.html",
        "about-lspu.html",
        "org-board.html",
    )

    def _template(self, name):
        return markup(_REPO_ROOT / "templates" / "kiosk" / name)

    def test_no_destination_carries_a_kiosk_menu_control(self):
        for name in self.DESTINATIONS:
            body = self._template(name)
            self.assertNotIn("back_href", body, f"{name} still links back to a kiosk menu")
            self.assertNotIn("Kiosk menu", body, name)

    def test_about_keeps_its_own_pane_control(self):
        # Explicitly protected: it returns to About's hub, a view of the same
        # URL, which the carousel knows nothing about.
        body = self._template("about-lspu.html")
        self.assertIn("back_action='hub'", body)

    def test_the_back_partial_no_longer_renders_a_link(self):
        partial = markup(_REPO_ROOT / "templates" / "partials" / "kiosk-back.html")
        self.assertNotIn("back_href", partial)
        self.assertNotIn("data-back-history", partial)
        self.assertIn("data-back=", partial)

    def test_every_destination_carries_the_frame_bridge(self):
        # Without it a framed page cannot report activity, and the shell
        # attracts over a visitor who is actively using it.
        for name in self.DESTINATIONS:
            self.assertIn("partials/kiosk-frame.html", self._template(name), name)

    def test_no_destination_still_includes_the_removed_bar(self):
        # The include itself, not just its arguments: a stray
        # {% include 'partials/kiosk-back.html' %} with no back_action would
        # now render a button labelled nothing, pointing at 'hub'.
        for name in self.DESTINATIONS:
            if name == "about-lspu.html":
                continue
            self.assertNotIn("partials/kiosk-back.html", self._template(name), name)

    def test_the_bridge_matches_the_frame_name_the_shell_renders(self):
        bridge = markup(_REPO_ROOT / "templates" / "partials" / "kiosk-frame.html")
        self.assertIn("window.name === 'kiosk-content'", bridge)
        self.assertIn('name="kiosk-content"', _WELCOME)
