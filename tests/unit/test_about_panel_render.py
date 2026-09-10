"""Markup contract between the About LSPU editor panel and the kiosk page.

Everything the kiosk draws on /kiosk/about-lspu is supposed to be editable from
the dashboard. The strings below used to be literals — a `tile_meta` map in
templates/kiosk/about-lspu.html and a SEAL_HOTSPOTS constant in
AboutController — so fixing a typo on the campus terminal needed a deploy.

Both templates now read the same `meta` bag, and the two halves fail silently
if they drift: an editor field whose `data-meta-key` is renamed still renders,
still saves, and simply never reaches the kiosk. So this pins both directions —
the field exists in the panel, and the value reaches the kiosk pane.

Rendering goes through the View facade so the real Jinja environment is in play.
"""

from masonite.facades import View

from app.services.AboutContent import AboutContent, DEFAULT_META, SECTION_SLUGS
from tests import TestCase


class _EmptyBag:
    """Stand-in for Masonite's session error bag, which is bound per request."""

    def any(self):
        return False

    def messages(self, *args, **kwargs):
        return []


class _Section:
    """Enough of an AboutSection row for either template."""

    def __init__(self, slug, **overrides):
        self.slug = slug
        self.title = overrides.get("title", slug.title())
        self.body_html = overrides.get("body_html", "<p>Body.</p>")
        self.subsections = overrides.get("subsections")
        self.image_path = overrides.get("image_path")
        self.audio_path = overrides.get("audio_path")
        self.video_path = overrides.get("video_path")
        self.lyric_timings = overrides.get("lyric_timings")
        self.meta = overrides.get("meta")


def _meta(overrides=None):
    meta = {slug: AboutContent.meta_for(slug) for slug in DEFAULT_META}
    for slug, values in (overrides or {}).items():
        meta[slug].update(values)
    return meta


class AboutPanelRenderTestCase(TestCase):
    def _render(self, meta=None, sections=None, milestones=()):
        meta = meta or _meta()
        return View.render(
            "gears/partials/panel-about-lspu",
            {
                "sections": sections if sections is not None
                else {slug: _Section(slug) for slug in SECTION_SLUGS},
                "ordered_slugs": SECTION_SLUGS,
                "milestones": list(milestones),
                "about_meta": meta,
                "about_page": meta["page"],
                "bag": _EmptyBag,
                "csrf_field": "",
            },
        ).rendered_template

    def test_the_panel_still_renders(self):
        # A Jinja error here 500s the whole editor dashboard, not just this panel.
        self.assertIn('data-page-panel="about-lspu"', self._render())

    def test_the_hub_header_is_editable(self):
        html = self._render()

        self.assertIn('action="/gears/about-lspu/sections/page"', html)
        for key in ("kicker", "title", "lead"):
            self.assertIn('data-meta-key="%s"' % key, html)

    def test_every_section_can_set_its_hub_hint_and_short_label(self):
        html = self._render()

        # One pair per section, plus nothing extra: these drive the hub index
        # rows and the prev/next pager on the kiosk.
        self.assertEqual(html.count('data-meta-key="hint"'), len(SECTION_SLUGS))
        self.assertEqual(html.count('data-meta-key="short"'), len(SECTION_SLUGS))

    def test_the_section_chrome_strings_are_editable(self):
        html = self._render()

        for key in ("core_band", "pledge_label", "footer_left", "footer_right", "cue"):
            self.assertIn('data-meta-key="%s"' % key, html)

    def test_every_form_that_carries_meta_fields_can_post_them(self):
        html = self._render()

        # A data-meta-key input in a form with no hidden payload is a field that
        # silently discards what the editor typed.
        self.assertGreaterEqual(
            html.count('class="js-meta-payload"'), 7
        )

    def test_seal_callouts_are_listed_as_editable_rows(self):
        html = self._render()

        self.assertEqual(
            html.count("data-hotspot-row"),
            len(DEFAULT_META["seal"]["hotspots"]),
        )
        self.assertIn("Torch and flame", html)
        self.assertIn("js-hotspot-x", html)
        self.assertIn("data-add-hotspot", html)

    def test_milestones_can_carry_a_photo(self):
        milestone = type("M", (), {
            "id": 3, "year": "1952", "heading": "Founded",
            "body_html": "<p>x</p>", "image_path": "About/milestones/m.webp",
        })()
        html = self._render(milestones=[milestone])

        # The update endpoint has always accepted a file; the form did not.
        self.assertIn('enctype="multipart/form-data"', html)
        self.assertIn('name="remove_image"', html)
        self.assertIn("/storage/About/milestones/m.webp", html)


class AboutKioskRenderTestCase(TestCase):
    """The other half: what the panel saves has to reach the kiosk pane."""

    def _render(self, meta=None, sections=None):
        meta = meta or _meta()
        sections = sections if sections is not None else {
            slug: _Section(slug) for slug in SECTION_SLUGS
        }
        return View.render(
            "kiosk/about-lspu",
            {
                "sections": sections,
                "ordered_slugs": SECTION_SLUGS,
                "milestones": [],
                "active_nav": "about",
                "group_values": [],
                "core_acrostic": [{"letter": "S", "rest": "pirited"}],
                "pledge_lines": [],
                "core_html": "",
                "pledge_html": "",
                "quality_statement": "A statement.",
                "quality_support": "",
                "hymn_lines": ["Line one"],
                "tile_meta": meta,
                "page": meta["page"],
                "seal_hotspots": meta["seal"].get("hotspots") or [],
            },
        ).rendered_template

    def test_edited_hub_header_reaches_the_kiosk(self):
        html = self._render(_meta({"page": {
            "kicker": "Kicker copy", "title": "Our University", "lead": "Lead copy.",
        }}))

        self.assertIn("Kicker copy", html)
        self.assertIn("Our University", html)
        self.assertIn("Lead copy.", html)

    def test_edited_hints_and_short_labels_reach_the_kiosk(self):
        html = self._render(_meta({
            "mission": {"hint": "Chartered purpose"},
            "hymn": {"short": "Anthem"},
        }))

        self.assertIn("Chartered purpose", html)
        self.assertIn("Anthem", html)

    def test_edited_chrome_strings_reach_the_kiosk(self):
        html = self._render(_meta({
            "values": {"core_band": "Band copy", "pledge_label": "Pledge copy"},
            "quality": {"footer_left": "Left copy", "footer_right": "Right copy"},
            "seal": {"cue": "Cue copy"},
        }))

        for expected in ("Band copy", "Pledge copy", "Left copy",
                        "Right copy", "Cue copy"):
            self.assertIn(expected, html)

    def test_edited_seal_callouts_reach_both_the_dots_and_the_legend(self):
        html = self._render(_meta({"seal": {"hotspots": [
            {"key": "k", "label": "Custom mark", "note": "Custom note.",
             "x": 12.5, "y": 87.5},
        ]}}))

        self.assertEqual(html.count('data-key="k"'), 2)  # the dot and its card
        self.assertIn("Custom mark", html)
        self.assertIn("Custom note.", html)
        self.assertIn("left: 12.5%", html)

    def test_clearing_the_callouts_empties_the_legend(self):
        html = self._render(_meta({"seal": {"hotspots": []}}))

        self.assertNotIn("data-seal-dot", html)
        self.assertNotIn("Torch and flame", html)

    def test_the_seal_description_is_rendered_rather_than_dropped(self):
        # The editor has had this field since the panel was written and the
        # kiosk never drew it, so the copy went nowhere.
        sections = {slug: _Section(slug) for slug in SECTION_SLUGS}
        sections["seal"] = _Section("seal", body_html="<p>What the marks mean.</p>")
        html = self._render(sections=sections)

        self.assertIn("What the marks mean.", html)

    def test_meta_text_is_escaped_not_injected(self):
        html = self._render(_meta({"page": {"title": "<script>alert(1)</script>"}}))

        self.assertNotIn("<script>alert(1)</script>", html)
