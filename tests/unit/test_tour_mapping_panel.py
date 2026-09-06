"""Markup contract for the Tour Mapping panel's scene previews.

The panel asks an editor to pick a building for each of 205 panoramas. Before
this, it showed them nothing but an opaque scene id (`0-jst-1`), so mapping was
guesswork and a wrong mapping silently misroutes tour search and wayfinding.

Two halves are pinned here, both of which fail quietly:

  1. The thumbnail is a CSS crop of preview.jpg -- a 256x1536 strip of the six
     cube faces, not a photo. If `--face` stops reaching the markup the strip
     renders as a 1:6 totem pole, which looks broken but throws nothing.
  2. The preview button carries the scene id, its opening view, and the shared
     tile geometry as data attributes. resources/js/tour-preview.js reads all
     three; a renamed attribute leaves the button inert with no console error.

Rendering goes through the View facade so the real Jinja environment is in play.
"""

import json
import re

from masonite.facades import View

from app.services import DashboardContext
from tests import TestCase


class _EmptyBag:
    """Stand-in for Masonite's session error bag, which is bound per request.

    A real object rather than a Mock because the template branches on
    `bag().any()` and a Mock's truthy return would take the error branch.
    """

    def any(self):
        return False

    def messages(self, *args, **kwargs):
        return []


def _row(scene_id="0-jst-1", **overrides):
    fields = {
        "scene_id": scene_id,
        "scene_name": "JST-1",
        "location_id": 4,
        "display_name": "",
        "preview_url": "/pano/tiles/{}/preview.jpg".format(scene_id),
        "preview_face": 3,
        "initial_view": {"yaw": -1.772, "pitch": 0.09, "fov": 1.51},
    }
    fields.update(overrides)
    return fields


class TourMappingPanelTestCase(TestCase):
    def _render(self, rows=(), geometry=None):
        return View.render(
            "gears/partials/panel-tour-mapping",
            {
                "tour_scene_rows": list(rows),
                "tour_geometry": geometry
                if geometry is not None
                else {"levels": [{"tileSize": 512, "size": 512}], "face_size": 750},
                "locations": [],
                "bag": _EmptyBag,
                "csrf_field": "",
            },
        ).rendered_template

    def test_the_panel_still_renders(self):
        # A Jinja error here 500s the whole editor dashboard, not just this panel.
        html = self._render([_row()])

        self.assertIn("data-page-panel=\"tour-mapping\"", html)

    def test_each_row_carries_a_thumbnail_cropped_to_its_face(self):
        html = self._render([_row(preview_face=3)])

        self.assertIn("/pano/tiles/0-jst-1/preview.jpg", html)
        # The crop is driven entirely by this custom property; without it the
        # 256x1536 cube strip renders as six stacked squares.
        self.assertIn("--face: 3", html)

    def test_thumbnails_are_lazy(self):
        # 205 rows x 48 KB is ~10 MB if they all load at once.
        html = self._render([_row(scene_id="a"), _row(scene_id="b")])

        self.assertEqual(html.count('loading="lazy"'), 2)

    def test_the_preview_button_hands_the_viewer_what_it_needs(self):
        html = self._render([_row()])

        for attribute in (
            "data-tour-preview-open",
            'data-scene-id="0-jst-1"',
            "data-scene-view=",
        ):
            self.assertIn(attribute, html)

    def test_the_opening_view_survives_json_encoding(self):
        html = self._render([_row(initial_view={"yaw": -1.772, "pitch": 0.0, "fov": 1.5})])

        raw = re.search(r"data-scene-view='([^']*)'", html).group(1)
        # tojson HTML-escapes, which is why the attribute is single-quoted;
        # what matters is that JSON.parse on the browser side gets the yaw back.
        self.assertAlmostEqual(json.loads(raw.replace("\\u0027", "'"))["yaw"], -1.772)

    def test_the_tile_geometry_is_emitted_once_not_per_row(self):
        html = self._render([_row(scene_id="a"), _row(scene_id="b"), _row(scene_id="c")])

        # Per-row copies would add ~25 KB of duplicated JSON across 205 rows.
        self.assertEqual(html.count("data-tour-geometry="), 1)

    def test_unmapped_scenes_are_badged(self):
        html = self._render([_row(scene_id="a", location_id=None), _row(scene_id="b")])

        self.assertEqual(html.count("tour-mapping-row__badge"), 1)

    def test_a_preview_button_never_submits_the_row(self):
        # The button sits inside the row's <form>; a default type of "submit"
        # would save a half-chosen building on every preview click.
        html = self._render([_row()])

        self.assertIn('<button type="button" class="tour-mapping-row__preview"', html)

    def test_the_panel_renders_with_no_scenes(self):
        html = self._render([])

        self.assertIn("No tour scenes detected", html)


class TourMappingContextTestCase(TestCase):
    def test_context_supplies_everything_the_panel_reads(self):
        # tour_context() is what feeds the template on a real page render, so
        # the two must not drift apart.
        context = DashboardContext.tour_context()

        self.assertIn("tour_geometry", context)
        self.assertTrue(context["tour_scene_rows"])

        row = context["tour_scene_rows"][0]
        for key in ("preview_url", "preview_face", "initial_view"):
            self.assertIn(key, row)

        self.assertEqual(row["preview_url"], "/pano/tiles/0-jst-1/preview.jpg")
