"""Per-section attribution on About LSPU.

`sources` is a list of {label, url} on each section row's JSON `meta`, authored
on the dashboard and printed under the section on the kiosk. It rides in `meta`
rather than a new column for the same reason the seal callouts do: `meta` is
already a JSON column whitelisted per slug by AboutContent.sanitize_meta, so a
repeatable list needs no migration and cannot become a dumping ground.

The URL is the part that has to be defended. The kiosk paints it into a real
`href` on an unauthenticated public terminal and never runs it through
sanitize_html -- it is stored as plain text and placed in an attribute by Jinja
-- so scheme validation on write is the only thing standing between an editor
account and stored XSS on the campus kiosk.
"""

import re
from pathlib import Path

from masonite.facades import View

from tests import TestCase

from app.services.AboutContent import (
    DEFAULT_META,
    MAX_SOURCES,
    SECTION_SLUGS,
    AboutContent,
)

_REPO_ROOT = Path(__file__).resolve().parents[2]


class _Section:
    """Stands in for an AboutSection row without touching the database."""

    def __init__(self, meta=None, slug="mission", title="Mission"):
        self.slug = slug
        self.title = title
        self.meta = meta
        self.body_html = ""
        self.subsections = []


class SourcesAreDeclaredTestCase(TestCase):
    def test_every_content_section_can_carry_sources(self):
        """Mission through Seal -- the six panes an editor authors."""
        for slug in SECTION_SLUGS:
            self.assertIn(
                "sources",
                DEFAULT_META[slug],
                "{} cannot store sources; sanitize_meta drops any key not "
                "listed in DEFAULT_META for the slug".format(slug),
            )

    def test_the_hub_carries_no_sources(self):
        """`page` is the index screen: a kicker, a title and a lead. It states
        nothing that needs citing, and a sources block there would render above
        the six tiles with nothing to attribute."""
        self.assertNotIn("sources", DEFAULT_META["page"])

    def test_default_is_empty_not_seeded_copy(self):
        for slug in SECTION_SLUGS:
            self.assertEqual(DEFAULT_META[slug]["sources"], [])


class SourceUrlTestCase(TestCase):
    """AboutContent.sanitize_source_url -- the scheme allowlist."""

    def test_http_and_https_survive(self):
        for url in ("http://lspu.edu.ph/about", "https://lspu.edu.ph/about"):
            self.assertEqual(AboutContent.sanitize_source_url(url), url)

    def test_mailto_survives(self):
        self.assertEqual(
            AboutContent.sanitize_source_url("mailto:records@lspu.edu.ph"),
            "mailto:records@lspu.edu.ph",
        )

    def test_javascript_scheme_is_dropped(self):
        """The reason this function exists: the kiosk renders the value into an
        href, so this would run on tap on a public unauthenticated terminal."""
        self.assertEqual(AboutContent.sanitize_source_url("javascript:alert(1)"), "")

    def test_javascript_scheme_is_dropped_regardless_of_case(self):
        self.assertEqual(AboutContent.sanitize_source_url("JaVaScRiPt:alert(1)"), "")

    def test_data_uri_is_dropped(self):
        self.assertEqual(
            AboutContent.sanitize_source_url("data:text/html;base64,PHNjcmlwdD4="), ""
        )

    def test_file_scheme_is_dropped(self):
        self.assertEqual(AboutContent.sanitize_source_url("file:///etc/passwd"), "")

    def test_bare_host_is_promoted_to_https(self):
        """A schemeless href resolves against the current page, so pasting what
        is in the address bar would link to /kiosk/about-lspu/lspu.edu.ph."""
        self.assertEqual(
            AboutContent.sanitize_source_url("lspu.edu.ph/about"),
            "https://lspu.edu.ph/about",
        )

    def test_prose_is_not_promoted_to_a_link(self):
        """"Office of the President" is a label, not a URL."""
        self.assertEqual(AboutContent.sanitize_source_url("Office of the President"), "")

    def test_empty_and_none_are_empty(self):
        self.assertEqual(AboutContent.sanitize_source_url(""), "")
        self.assertEqual(AboutContent.sanitize_source_url(None), "")

    def test_markup_in_a_url_is_stripped(self):
        self.assertNotIn("<", AboutContent.sanitize_source_url("<b>lspu.edu.ph</b>"))


class SourceListTestCase(TestCase):
    """sanitize_meta's `sources` branch."""

    def _clean(self, rows, slug="mission"):
        return AboutContent.sanitize_meta(slug, {"sources": rows}).get("sources")

    def test_label_and_url_are_kept(self):
        self.assertEqual(
            self._clean([{"label": "R.A. 9402", "url": "https://lspu.edu.ph/charter"}]),
            [{"label": "R.A. 9402", "url": "https://lspu.edu.ph/charter"}],
        )

    def test_label_alone_is_a_valid_source(self):
        """Who the information came from is the whole point of the field; not
        every provenance has something to link to."""
        self.assertEqual(
            self._clean([{"label": "Interview: VP Academic Affairs", "url": ""}]),
            [{"label": "Interview: VP Academic Affairs", "url": ""}],
        )

    def test_url_alone_is_a_valid_source(self):
        self.assertEqual(
            self._clean([{"label": "", "url": "https://lspu.edu.ph"}]),
            [{"label": "", "url": "https://lspu.edu.ph"}],
        )

    def test_wholly_empty_row_is_dropped(self):
        """The repeater posts every row it renders, including one an editor
        added and then left blank."""
        self.assertEqual(self._clean([{"label": "  ", "url": ""}]), [])

    def test_row_whose_only_content_was_a_rejected_url_is_dropped(self):
        self.assertEqual(self._clean([{"label": "", "url": "javascript:alert(1)"}]), [])

    def test_label_is_capped(self):
        row = self._clean([{"label": "x" * 400, "url": ""}])
        self.assertLessEqual(len(row[0]["label"]), 160)

    def test_list_is_capped(self):
        rows = [{"label": "Source {}".format(i), "url": ""} for i in range(40)]
        self.assertEqual(len(self._clean(rows)), MAX_SOURCES)

    def test_non_list_is_ignored(self):
        self.assertEqual(self._clean("not a list"), [])
        self.assertEqual(self._clean({"label": "x"}), [])

    def test_junk_entries_are_skipped_without_failing_the_save(self):
        self.assertEqual(
            self._clean(["a string", None, {"label": "Real", "url": ""}]),
            [{"label": "Real", "url": ""}],
        )

    def test_markup_in_a_label_is_stripped(self):
        row = self._clean([{"label": "<script>alert(1)</script>Records", "url": ""}])
        self.assertNotIn("<", row[0]["label"])

    def test_every_content_slug_accepts_the_key(self):
        for slug in SECTION_SLUGS:
            self.assertEqual(
                self._clean([{"label": "Cited", "url": ""}], slug),
                [{"label": "Cited", "url": ""}],
                "{} silently discards sources".format(slug),
            )

    def test_the_hub_discards_sources(self):
        self.assertIsNone(
            AboutContent.sanitize_meta("page", {"sources": [{"label": "x"}]}).get("sources")
        )


class SourcesMergeTestCase(TestCase):
    """meta_for: what a stored row overrides, and what it does not."""

    def test_stored_sources_replace_the_empty_default(self):
        stored = [{"label": "R.A. 9402", "url": ""}]
        merged = AboutContent.meta_for("mission", _Section({"sources": stored}))
        self.assertEqual(merged["sources"], stored)

    def test_clearing_every_source_is_honoured(self):
        """Unlike the text keys, an empty list must not fall back to the
        default -- an editor who deleted every citation meant to."""
        merged = AboutContent.meta_for("mission", _Section({"sources": []}))
        self.assertEqual(merged["sources"], [])

    def test_a_row_that_never_stored_sources_reads_as_empty(self):
        merged = AboutContent.meta_for("mission", _Section(None))
        self.assertEqual(merged["sources"], [])

    def test_sources_do_not_leak_between_sections(self):
        """meta_for deepcopies DEFAULT_META; a shallow copy would hand every
        request the same list object to mutate."""
        first = AboutContent.meta_for("mission", _Section(None))
        first["sources"].append({"label": "leaked", "url": ""})
        second = AboutContent.meta_for("values", _Section(None))
        self.assertEqual(second["sources"], [])


class EditorFormTestCase(TestCase):
    """The dashboard form. The macro is called once per section, so the check
    that matters is that all six call it -- not that the markup exists once."""

    def _markup(self):
        return (
            _REPO_ROOT / "templates" / "gears" / "partials" / "panel-about-lspu.html"
        ).read_text()

    def test_the_macro_is_defined_once(self):
        self.assertEqual(self._markup().count("{% macro sources_editor(slug) %}"), 1)

    def test_every_content_section_renders_the_editor(self):
        markup = self._markup()
        for slug in SECTION_SLUGS:
            self.assertIn(
                "{{ sources_editor('%s') }}" % slug,
                markup,
                "the {} tab has no Sources form".format(slug),
            )

    def test_the_hub_does_not_render_the_editor(self):
        self.assertNotIn("sources_editor('page')", self._markup())

    def test_the_editor_offers_a_label_and_a_link_field(self):
        markup = self._markup()
        self.assertIn("js-source-label", markup)
        self.assertIn("js-source-url", markup)

    def test_rows_are_addable_and_removable(self):
        markup = self._markup()
        self.assertIn("data-add-source", markup)
        self.assertIn("data-remove-source", markup)

    def test_every_sources_editor_sits_in_a_form_that_posts_meta(self):
        """The values ride in the hidden `meta` input, collected by
        serializeMeta(). A call placed in a form without that input would render
        fields that silently save nothing."""
        markup = self._markup()
        for match in re.finditer(r"\{\{ sources_editor\('(\w+)'\) \}\}", markup):
            after = markup[match.end():]
            form_end = after.index("</form>")
            self.assertIn(
                'class="js-meta-payload"',
                after[:form_end],
                "sources_editor('{}') is not inside a form that posts meta".format(
                    match.group(1)
                ),
            )


class EditorScriptTestCase(TestCase):
    def _script(self):
        return (_REPO_ROOT / "resources" / "js" / "about-lspu-editor.js").read_text()

    def test_sources_are_serialized_into_the_meta_payload(self):
        self.assertIn("meta.sources", self._script())

    def test_the_key_is_only_sent_by_a_form_that_renders_the_repeater(self):
        """The seal tab has three forms all posting to the same endpoint, and
        save_section *merges* meta. Without this guard the callout form would
        post sources: [] and wipe the citations it never rendered."""
        self.assertIn("form.querySelector('[data-sources]')", self._script())

    def test_the_entry_is_built_by_webpack(self):
        """A resources/js file does nothing until webpack.mix.js names it."""
        mix = (_REPO_ROOT / "webpack.mix.js").read_text()
        self.assertIn("about-lspu-editor.js", mix)


class KioskRenderTestCase(TestCase):
    """The kiosk pane. Rendered through Jinja, not asserted as source text, so
    an escaping or fallback mistake shows up as wrong output."""

    def _render(self, sources, slug="mission"):
        from app.services.AboutContent import DEFAULT_META as _DM

        meta = {s: dict(_DM[s]) for s in SECTION_SLUGS}
        meta[slug] = dict(meta[slug], sources=sources)
        return View.render(
            "kiosk/about-lspu",
            {
                "sections": {slug: _Section(slug=slug)},
                "ordered_slugs": SECTION_SLUGS,
                "milestones": [],
                "tile_meta": meta,
                "page": DEFAULT_META["page"],
                "seal_hotspots": [],
                "value_pillars": [],
            },
        ).rendered_template

    def test_a_linked_source_renders_an_anchor_to_its_url(self):
        html = self._render([{"label": "R.A. 9402", "url": "https://lspu.edu.ph/charter"}])

        self.assertIn('href="https://lspu.edu.ph/charter"', html)
        self.assertIn("R.A. 9402", html)

    def test_an_unlinked_source_renders_as_plain_text(self):
        html = self._render([{"label": "Office of the President", "url": ""}])

        self.assertIn("Office of the President", html)
        self.assertNotIn('<a class="about-sources__link" href=""', html)

    def test_a_source_with_only_a_url_prints_the_url(self):
        """Otherwise the row renders as an empty bullet."""
        html = self._render([{"label": "", "url": "https://lspu.edu.ph"}])

        self.assertIn("https://lspu.edu.ph", html)

    def test_a_section_that_cites_nothing_renders_no_block(self):
        """No empty heading and no stray hairline above the pager."""
        self.assertNotIn("about-sources__title", self._render([]))

    def test_links_do_not_hand_the_referrer_or_window_to_the_target(self):
        html = self._render([{"label": "x", "url": "https://example.org"}])

        self.assertIn("noopener", html)
        self.assertIn("noreferrer", html)

    def test_a_label_is_escaped_not_rendered_as_markup(self):
        """The block prints `source.label` without |safe. Values are stripped on
        write too, but the template must not depend on that: rows predating the
        sanitiser would render as live markup on the kiosk."""
        html = self._render([{"label": "<img src=x onerror=alert(1)>", "url": ""}])

        self.assertNotIn("<img src=x", html)
        self.assertIn("&lt;img", html)
