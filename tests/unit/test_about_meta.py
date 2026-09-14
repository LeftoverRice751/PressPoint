"""Guards for the About LSPU `meta` bag.

`meta` is what made the kiosk's short strings editable: the rail header, the crumb
hint and rail label per section, the quality footer, the values band, the
seal cue, and the seal's numbered callouts (which were a Python constant in
AboutController). Two properties have to hold or the kiosk breaks in ways an
editor cannot undo from the dashboard:

- an unknown key never lands in the row, and
- a missing or blank value falls back to DEFAULT_META rather than rendering
  an empty strip.
"""

from tests import TestCase

from app.services.AboutContent import (
    AboutContent,
    DEFAULT_META,
    MAX_HOTSPOTS,
    PAGE_SLUG,
    SECTION_SLUGS,
)


class _Row:
    """Stand-in for an AboutSection row — meta_for only reads `.meta`."""

    def __init__(self, meta):
        self.meta = meta


class AboutMetaSanitiseTestCase(TestCase):
    def test_drops_keys_the_slug_does_not_render(self):
        cleaned = AboutContent.sanitize_meta(
            "quality", {"footer_left": "QMS", "hotspots": [], "role": "admin"}
        )
        self.assertEqual(cleaned, {"footer_left": "QMS"})

    def test_unknown_slug_yields_nothing(self):
        self.assertEqual(AboutContent.sanitize_meta("nope", {"hint": "x"}), {})

    def test_non_dict_payload_is_ignored(self):
        self.assertEqual(AboutContent.sanitize_meta("hymn", "hint=x"), {})

    def test_strips_markup_from_plain_text_values(self):
        cleaned = AboutContent.sanitize_meta(
            PAGE_SLUG, {"title": "<b>About</b> <script>alert(1)</script>LSPU"}
        )
        self.assertEqual(cleaned["title"], "About alert(1)LSPU")

    def test_clamps_value_length(self):
        cleaned = AboutContent.sanitize_meta("mission", {"short": "x" * 200})
        self.assertEqual(len(cleaned["short"]), 20)

    def test_blank_value_is_not_stored(self):
        self.assertEqual(AboutContent.sanitize_meta("mission", {"hint": "   "}), {})


class AboutHotspotSanitiseTestCase(TestCase):
    def test_clamps_coordinates_into_the_artwork(self):
        cleaned = AboutContent.sanitize_meta("seal", {"hotspots": [
            {"label": "Torch", "note": "n", "x": -40, "y": 900},
        ]})
        self.assertEqual(cleaned["hotspots"][0]["x"], 0.0)
        self.assertEqual(cleaned["hotspots"][0]["y"], 100.0)

    def test_non_numeric_coordinate_falls_back_to_centre(self):
        cleaned = AboutContent.sanitize_meta("seal", {"hotspots": [
            {"label": "Torch", "note": "n", "x": "", "y": "abc"},
        ]})
        self.assertEqual(cleaned["hotspots"][0]["x"], 50.0)
        self.assertEqual(cleaned["hotspots"][0]["y"], 50.0)

    def test_assigns_a_key_when_the_editor_adds_a_row(self):
        cleaned = AboutContent.sanitize_meta("seal", {"hotspots": [
            {"label": "New mark", "note": "", "x": 10, "y": 10},
        ]})
        self.assertTrue(cleaned["hotspots"][0]["key"])

    def test_drops_a_row_with_neither_label_nor_note(self):
        cleaned = AboutContent.sanitize_meta("seal", {"hotspots": [
            {"label": "", "note": "", "x": 10, "y": 10},
            {"label": "Kept", "note": "", "x": 10, "y": 10},
        ]})
        self.assertEqual(len(cleaned["hotspots"]), 1)
        self.assertEqual(cleaned["hotspots"][0]["label"], "Kept")

    def test_caps_the_number_of_callouts(self):
        rows = [{"label": "L%d" % i, "note": "", "x": 1, "y": 1} for i in range(40)]
        cleaned = AboutContent.sanitize_meta("seal", {"hotspots": rows})
        self.assertEqual(len(cleaned["hotspots"]), MAX_HOTSPOTS)

    def test_non_list_hotspots_becomes_empty(self):
        cleaned = AboutContent.sanitize_meta("seal", {"hotspots": "torch"})
        self.assertEqual(cleaned["hotspots"], [])


class AboutMetaFallbackTestCase(TestCase):
    def test_every_section_has_a_short_label_and_hint(self):
        # The kiosk renders the short label unconditionally on the rail, so a
        # missing default is a blank button on the terminal.
        for slug in SECTION_SLUGS:
            meta = AboutContent.meta_for(slug)
            self.assertTrue(meta.get("short"), slug)
            self.assertTrue(meta.get("hint"), slug)

    def test_no_row_yields_the_defaults(self):
        self.assertEqual(AboutContent.meta_for("hymn"), DEFAULT_META["hymn"])

    def test_stored_value_overrides_the_default(self):
        meta = AboutContent.meta_for("hymn", _Row({"hint": "Sing along"}))
        self.assertEqual(meta["hint"], "Sing along")
        self.assertEqual(meta["short"], DEFAULT_META["hymn"]["short"])

    def test_blank_stored_value_falls_back_rather_than_rendering_empty(self):
        meta = AboutContent.meta_for("hymn", _Row({"hint": ""}))
        self.assertEqual(meta["hint"], DEFAULT_META["hymn"]["hint"])

    def test_unknown_stored_key_is_not_surfaced(self):
        meta = AboutContent.meta_for("hymn", _Row({"role": "admin"}))
        self.assertNotIn("role", meta)

    def test_emptying_the_hotspots_is_honoured(self):
        # Unlike the text keys, an editor who deletes every callout means it —
        # falling back to the defaults would resurrect rows they just removed.
        meta = AboutContent.meta_for("seal", _Row({"hotspots": []}))
        self.assertEqual(meta["hotspots"], [])

    def test_hotspot_defaults_sit_on_the_artwork(self):
        for spot in DEFAULT_META["seal"]["hotspots"]:
            self.assertTrue(0 <= spot["x"] <= 100, spot)
            self.assertTrue(0 <= spot["y"] <= 100, spot)
            self.assertTrue(spot["label"] and spot["note"], spot)

    def test_meta_is_not_a_shared_mutable(self):
        # meta_for hands its result straight to a template; mutating it must not
        # edit DEFAULT_META for every later request in the same worker.
        meta = AboutContent.meta_for("hymn")
        meta["hint"] = "mutated"
        self.assertNotEqual(DEFAULT_META["hymn"]["hint"], "mutated")
