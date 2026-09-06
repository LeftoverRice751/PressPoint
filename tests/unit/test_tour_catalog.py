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
import math
import re
import unittest
from pathlib import Path

from app.services.TourScenesCatalog import TourScenesCatalog, preview_face_index
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


# Strip index of each cube face inside preview.jpg, which stacks the six faces
# vertically in Marzipano's default 'bdflru' order.
BACK, DOWN, FRONT, LEFT, RIGHT, UP = range(6)


class TourPreviewFaceTestCase(TestCase):
    """The Tour Mapping thumbnails crop one band out of preview.jpg.

    preview.jpg is not a photo -- it is a 256x1536 strip of the six cube faces.
    Which band we crop decides whether an editor sees the building or a blank
    wall, so the yaw -> face mapping is worth pinning down exactly.
    """

    def test_cardinal_yaws_pick_the_matching_face(self):
        # Marzipano yaw 0 looks at the front face and grows clockwise.
        self.assertEqual(preview_face_index({"yaw": 0.0}), FRONT)
        self.assertEqual(preview_face_index({"yaw": math.pi / 2}), RIGHT)
        self.assertEqual(preview_face_index({"yaw": math.pi}), BACK)
        self.assertEqual(preview_face_index({"yaw": -math.pi / 2}), LEFT)

    def test_yaw_wraps_around_the_circle(self):
        # data.js yaws are unnormalised radians straight out of the Marzipano
        # Tool, so a value outside [-pi, pi) is ordinary input, not a bug.
        self.assertEqual(preview_face_index({"yaw": 3 * math.pi}), BACK)
        self.assertEqual(preview_face_index({"yaw": -3.2}), BACK)
        self.assertEqual(preview_face_index({"yaw": 2 * math.pi}), FRONT)

    def test_the_opening_scene_crops_its_left_face(self):
        # 0-jst-1 opens at yaw -1.772 rad (~ -101 deg). This is the case the
        # whole function exists for: a fixed "front" crop would show an editor
        # a wall, not the building the panorama is of. A regression to a
        # constant face fails right here.
        opening = next(
            scene
            for scene in TourScenesCatalog.all_scenes()
            if scene["scene_id"] == "0-jst-1"
        )

        self.assertAlmostEqual(opening["initial_view"]["yaw"], -1.7720201955843162)
        self.assertEqual(opening["preview_face"], LEFT)

    def test_a_missing_or_unusable_yaw_falls_back_to_front(self):
        # A hand-edited data.js should not 500 the dashboard over a thumbnail.
        self.assertEqual(preview_face_index({}), FRONT)
        self.assertEqual(preview_face_index(None), FRONT)
        self.assertEqual(preview_face_index({"yaw": "north"}), FRONT)

    def test_every_scene_carries_a_face_and_an_opening_view(self):
        for scene in TourScenesCatalog.all_scenes():
            self.assertIn(scene["preview_face"], range(6), scene["scene_id"])
            # int, not just float: a scene captured looking dead ahead lands an
            # exact `"yaw": 0` in data.js (70-jst-72 does), and JSON keeps that
            # an int. The face maths coerces, so this only guards the shape.
            self.assertIsInstance(
                scene["initial_view"].get("yaw"), (int, float), scene["scene_id"]
            )

    def test_never_picks_a_floor_or_ceiling_face(self):
        # We deliberately ignore pitch: the horizontal faces are the only ones
        # that show a building. Down/up must never be croppable.
        for scene in TourScenesCatalog.all_scenes():
            self.assertNotIn(scene["preview_face"], (DOWN, UP), scene["scene_id"])


class TourGeometryTestCase(TestCase):
    def test_the_capture_is_geometrically_uniform(self):
        # geometry() reads levels/faceSize off the FIRST scene and the dashboard
        # preview modal reuses them for every scene. That shortcut is only
        # sound while the capture is uniform, so a re-export that mixes tile
        # sizes has to fail loudly here rather than render half the previews
        # at the wrong resolution.
        payload = _raw_payload()

        levels = {json.dumps(s["levels"], sort_keys=True) for s in payload["scenes"]}
        face_sizes = {s["faceSize"] for s in payload["scenes"]}

        self.assertEqual(len(levels), 1, "scenes no longer share one tile pyramid")
        self.assertEqual(len(face_sizes), 1, "scenes no longer share one faceSize")

    def test_geometry_matches_the_shipped_capture(self):
        geometry = TourScenesCatalog.geometry()
        payload = _raw_payload()

        self.assertEqual(geometry["levels"], payload["scenes"][0]["levels"])
        self.assertEqual(geometry["face_size"], payload["scenes"][0]["faceSize"])
        # The viewer builds a CubeGeometry from this; an empty list renders black.
        self.assertTrue(geometry["levels"])
