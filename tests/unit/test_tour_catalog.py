"""Guards on the virtual tour catalog and the tile set it points at.

The Marzipano capture is a three-part thing that can drift apart silently:
`resources/js/data.js` (the scene graph), `storage/public/pano/tiles/` (the
imagery, deployed by rsync and deliberately not in git), and the `tour_scenes`
table (editor wiring). A scene whose tiles never got synced renders as a black
panorama with no error, and a hotspot pointing at a scene that no longer exists
is a dead end the visitor can walk into. Both are cheap to catch here.

These tests read the real catalog rather than a fixture — the point is to
verify the capture that actually ships, not our ability to parse a sample.
"""

import json
import re
import unittest
from pathlib import Path

from app.services.TourScenesCatalog import TourScenesCatalog
from tests import TestCase

_REPO_ROOT = Path(__file__).resolve().parents[2]
_TILES_DIR = _REPO_ROOT / "storage" / "public" / "pano" / "tiles"
_DATA_JS = _REPO_ROOT / "resources" / "js" / "data.js"


def _raw_payload():
    """Parse data.js the same way TourScenesCatalog does, but keep the whole
    payload — the catalog service only exposes ids and names."""
    contents = _DATA_JS.read_text(encoding="utf-8")
    contents = re.sub(r"^\s*/\*.*?\*/\s*", "", contents, count=1, flags=re.DOTALL)
    contents = re.sub(
        r"^\s*(?:window\.)?(?:var\s+)?APP_DATA\s*=\s*", "", contents, count=1
    ).strip()
    return json.loads(contents.rstrip(";"))


class TourCatalogTestCase(TestCase):
    def test_catalog_parses_the_shipped_capture(self):
        scenes = TourScenesCatalog.all_scenes()

        self.assertTrue(scenes, "data.js failed to parse — the tour would render empty")
        self.assertEqual(scenes[0]["scene_id"], "0-jst-1")
        self.assertEqual(scenes[-1]["scene_id"], "204-jst-212")
        self.assertEqual(len(scenes), 205)

    def test_every_scene_id_is_unique(self):
        ids = [scene["scene_id"] for scene in TourScenesCatalog.all_scenes()]

        # tour_scenes.scene_id is UNIQUE, so a duplicate here would make one
        # of the two scenes unmappable in the dashboard.
        self.assertEqual(len(ids), len(set(ids)))

    def test_scene_ids_fit_the_tour_scenes_column(self):
        # tour_scenes.scene_id is string(32); a longer id would be silently
        # truncated on save and never match the catalog again.
        for scene in TourScenesCatalog.all_scenes():
            self.assertLessEqual(len(scene["scene_id"]), 32, scene["scene_id"])

    @unittest.skipUnless(
        _TILES_DIR.is_dir(),
        "pano tiles are gitignored (~360 MB, deployed by rsync) -- this guard only "
        "runs where they are actually synced, e.g. a dev box or the deploy host",
    )
    def test_every_scene_has_tiles_on_disk(self):
        missing = [
            scene["scene_id"]
            for scene in TourScenesCatalog.all_scenes()
            if not (_TILES_DIR / scene["scene_id"] / "preview.jpg").is_file()
        ]

        self.assertEqual(
            missing, [], "scenes in data.js with no tiles synced under storage/public/pano/tiles"
        )

    def test_no_hotspot_points_at_a_missing_scene(self):
        payload = _raw_payload()
        known = {scene["id"] for scene in payload["scenes"]}

        dangling = [
            (scene["id"], hotspot["target"])
            for scene in payload["scenes"]
            for hotspot in scene.get("linkHotspots") or []
            if hotspot.get("target") not in known
        ]

        self.assertEqual(dangling, [], "link hotspots pointing at scenes that don't exist")

    def test_prefix_regex_accepts_both_assignment_forms(self):
        # We rewrite the Tool's `var APP_DATA` to `window.APP_DATA` on import,
        # but the parser tolerates a raw re-export dropped in unedited.
        from app.services import TourScenesCatalog as module

        for source in ("window.APP_DATA = ", "var APP_DATA = ", "APP_DATA = "):
            self.assertEqual(
                module._PREFIX_RE.sub("", source + "{}", count=1).strip(),
                "{}",
                source,
            )

    def test_catalog_is_readable_by_the_kiosk_and_the_dashboard(self):
        # Both surfaces render off the same list; the tour's scene drawer keys
        # on scene_id and labels on name, so neither may come back blank.
        for scene in TourScenesCatalog.all_scenes():
            self.assertTrue(scene["scene_id"])
            self.assertTrue(scene["name"])
