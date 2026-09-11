"""The citizen's charter's split identity: an ordinary archive row that must
not behave like one on the public archives surface.

Two things are easy to get wrong and expensive when wrong:

  - The charter has to be *excluded* from the kiosk/mobile archives payload.
    kiosk-archives.js treats "folio" as a fallback category (anything not
    tabloid/magazine/newsletter), so a charter row does not quietly fail to
    match — it shows up under Folios on both surfaces, which share one payload
    builder.

  - The charter has to open with the Book (two-page foldable) adapter in the
    reader. That adapter is chosen from `is_tabloid` and `type`, so a charter
    typed in a way that collides with "tabloid" or "newsletter" would silently
    open as a zoomable broadsheet or a scroll instead of a spread.
"""

import math
import os
import re
from pathlib import Path
from unittest.mock import patch

from masonite.facades import View

from tests import TestCase

_REPO_ROOT = Path(__file__).resolve().parents[2]

from app.services.ArchiveServices import ArchiveServices
from app.services.CharterArchive import (
    CHARTER_MODEL_URL,
    CHARTER_PITCH,
    CHARTER_SCENE_ID,
    CHARTER_YAW,
    is_charter_type,
    latest_charter_entry,
)


class _Archive:
    def __init__(self, id=1, name="Charter", type="charter", file_path="Archives/c.pdf", date=None):
        self.id = id
        self.name = name
        self.type = type
        self.file_path = file_path
        self.date = date


class CharterTypeTestCase(TestCase):
    def test_matches_case_and_padding_insensitively(self):
        for raw in ("charter", "Charter", "CHARTER", "  charter  "):
            self.assertTrue(is_charter_type(raw), raw)

    def test_rejects_other_types_and_blanks(self):
        for raw in ("folio", "Tabloid", "newsletter", "", None, "charters"):
            self.assertFalse(is_charter_type(raw), raw)


class CharterEntryTestCase(TestCase):
    def test_returns_none_when_no_charter_uploaded(self):
        # The tour renders without the 3D model in this case rather than
        # erroring, so this branch is the whole "feature not configured" path.
        with patch("app.services.CharterArchive.Archives") as archives:
            archives.where.return_value.order_by.return_value.order_by.return_value \
                .limit.return_value.get.return_value = []
            self.assertIsNone(latest_charter_entry())

    def test_returns_built_entry_for_newest_charter(self):
        row = _Archive(id=7, name="LSPU Citizen's Charter 2026")
        with patch("app.services.CharterArchive.Archives") as archives:
            archives.where.return_value.order_by.return_value.order_by.return_value \
                .limit.return_value.get.return_value = [row]
            entry = latest_charter_entry()

        self.assertEqual(entry["id"], 7)
        self.assertEqual(entry["name"], "LSPU Citizen's Charter 2026")

    def test_charter_reads_as_a_book_not_a_tabloid_or_scroll(self):
        """Pins the reader-adapter contract in kiosk-archive-book.js
        pickAdapter(): isTabloid === '1' picks DeepZoom and a type containing
        'newsletter' picks Scroll. A charter must match neither."""
        entry = ArchiveServices().build_archive_entry(_Archive(type="charter"))
        self.assertFalse(entry["is_tabloid"])
        self.assertNotIn("newsletter", entry["type"].lower())


class CharterModelAssetTestCase(TestCase):
    """The model is three things that drift apart silently: a file in the repo,
    a URL the tour renders, and an nginx location. Miss the last one and the
    tour still works in dev and quietly streams 1.4 MB out of a gunicorn worker
    in production — the exact failure the /pano/ block was added to stop."""

    def test_the_model_file_ships_with_the_code(self):
        # Not under storage/framework/public: that path is a symlink to the NAS
        # (/mnt/gearsnas), so a model placed there is a hand-deployed artifact
        # on a network mount, not a versioned file. The hotspot is meaningless
        # without the model, so the two travel together.
        path = _REPO_ROOT / "storage" / "public" / "models"
        self.assertTrue(path.is_dir(), "storage/public/models/ is missing")
        self.assertTrue(
            (path / os.path.basename(CHARTER_MODEL_URL)).is_file(),
            f"{CHARTER_MODEL_URL} has no file behind it in storage/public/models/",
        )

    def test_nginx_serves_the_model_directly(self):
        conf = (_REPO_ROOT / "deploy" / "nginx-presspoint.conf").read_text(encoding="utf-8")
        prefix = os.path.dirname(CHARTER_MODEL_URL) + "/"
        self.assertIn(
            f"location {prefix}",
            conf,
            f"no nginx location for {prefix} — the model would stream out of gunicorn",
        )


def _scene(scene_id):
    """The raw scene entry from resources/js/data.js, parsed the way
    TourScenesCatalog parses it (which is why the file may carry no comments
    inside the object and no trailing commas)."""
    import json
    import re

    src = (_REPO_ROOT / "resources" / "js" / "data.js").read_text(encoding="utf-8")
    src = re.sub(r"^\s*/\*.*?\*/\s*", "", src, count=1, flags=re.DOTALL)
    src = re.sub(r"^\s*(?:window\.)?(?:var\s+)?APP_DATA\s*=\s*", "", src, count=1).strip()
    payload = json.loads(src.rstrip(";"))
    for scene in payload["scenes"]:
        if scene["id"] == scene_id:
            return scene
    return None


class CharterPlacementTestCase(TestCase):
    """Where the book hangs is derived from the scene, not chosen by eye, so a
    tour re-export that changes JST-1's heading should fail here rather than
    silently leave the charter facing a wall or sitting on the exit arrow."""

    # The view limiter in kiosk-tour.js clamps FOV to 100-120 degrees, so the
    # narrowest opening frame still has 50 degrees of half-width.
    MIN_HALF_FOV = math.radians(50)

    def setUp(self):
        super().setUp()
        self.scene = _scene(CHARTER_SCENE_ID)
        if self.scene is None:
            self.fail(f"{CHARTER_SCENE_ID} is not in resources/js/data.js any more")

    def test_the_scene_the_charter_is_pinned_to_still_exists(self):
        self.assertEqual(self.scene["id"], CHARTER_SCENE_ID)

    def test_the_book_is_inside_the_opening_frame(self):
        opening_yaw = self.scene["initialViewParameters"]["yaw"]
        # Shortest angular distance, so a placement that straddles +/-pi still
        # measures correctly.
        offset = abs((CHARTER_YAW - opening_yaw + math.pi) % (2 * math.pi) - math.pi)
        self.assertLess(
            offset,
            self.MIN_HALF_FOV,
            "the charter is outside the opening frame — a visitor would have to "
            "hunt for it instead of seeing it when the tour starts",
        )

    def test_the_book_does_not_sit_on_the_scenes_exit_arrow(self):
        # 0-jst-1's only hotspot is the way out of the scene. A model drawn over
        # it would make the tour a dead end, and nothing else would report that.
        for hotspot in self.scene.get("linkHotspots", []):
            yaw_gap = abs(
                (CHARTER_YAW - hotspot["yaw"] + math.pi) % (2 * math.pi) - math.pi
            )
            pitch_gap = abs(CHARTER_PITCH - hotspot["pitch"])
            self.assertGreater(
                math.hypot(yaw_gap, pitch_gap),
                math.radians(25),
                f"the charter overlaps the link hotspot to {hotspot['target']}",
            )

    def test_the_book_sits_below_the_horizon(self):
        # Pitch is positive-DOWN in Marzipano's frame, and the charter's is
        # positive on purpose: the book is meant to rest on JST-1's floor
        # tiles. This assertion used to be the exact opposite — the model was
        # first placed above the horizon, presented to the visitor like a
        # placard — so a failure here is most likely someone restoring that
        # older framing without noticing it also needs the downward camera
        # orbit and the contact shadow in tour-charter.js. The three only work
        # together.
        self.assertGreater(CHARTER_PITCH, 0)

    def test_the_book_is_not_pitched_into_the_visitors_feet(self):
        # A floor placement is a range, not a point: too shallow and the book
        # floats again, too steep and it lands under the camera where the
        # opening frame cannot hold it. 10-35 deg below the horizon is the
        # band that reads as "on the floor, a few metres away".
        self.assertGreater(math.degrees(CHARTER_PITCH), 10)
        self.assertLess(math.degrees(CHARTER_PITCH), 35)


def _render_tour(charter):
    """Renders the real tour template through the real Jinja environment, so
    the {% include %} path and the custom globals (site_logo, route) are in
    play rather than stubbed."""
    from app.services.CharterArchive import (
        CHARTER_MODEL_URL,
        CHARTER_PITCH,
        CHARTER_SCENE_ID,
        CHARTER_YAW,
    )

    return View.render(
        "kiosk/kiosk-tour",
        {
            "active_nav": "tour",
            "tour_scenes": [],
            "charter": charter,
            "charter_model_url": CHARTER_MODEL_URL,
            "charter_scene_id": CHARTER_SCENE_ID,
            "charter_yaw": CHARTER_YAW,
            "charter_pitch": CHARTER_PITCH,
        },
    ).rendered_template


class TourTemplateTestCase(TestCase):
    """The tour page is a standalone <html> document with no layout to hook, so
    nothing structural catches a broken include or a missing context key — it
    surfaces as a 500 on the campus terminal."""

    ENTRY = {
        "id": 7,
        "name": "LSPU Citizen's Charter 2026",
        "type": "charter",
        "year": 2026,
        "cover_url": "/storage/Archives/covers/charter.png",
        "pdf_url": "/storage/Archives/charter.pdf",
        "page_count": 48,
        "first_page_url": "/storage/Archives/pages/charter/page-1.png",
        "page_url_base": "/kiosk/archives/7/pages",
        "prewarmed_pages": 20,
    }

    def test_renders_the_model_and_the_reader_when_a_charter_exists(self):
        html = _render_tour(self.ENTRY)

        self.assertIn("data-tour-charter", html)
        self.assertIn(f'data-charter-model-url="{CHARTER_MODEL_URL}"', html)
        self.assertIn("data-charter-scene-id=\"0-jst-1\"", html)
        # The reader binds to [data-archive-shell] and needs its markup on the
        # page; without both, tapping the model dispatches into the void.
        self.assertIn("data-archive-shell", html)
        self.assertIn("data-archive-book", html)
        self.assertIn("js/tour-charter.js", html)
        self.assertIn("js/kiosk-archive-book.js", html)

    def test_charter_carries_the_detail_tier_contract(self):
        html = _render_tour({**self.ENTRY, "detail_pages": 12, "detail_suffix": "@2x"})
        self.assertIn('data-charter-detail-pages="12"', html)
        self.assertIn('data-charter-detail-suffix="@2x"', html)
        # Absent from an older entry dict -> 0, never a blank attribute.
        self.assertIn('data-charter-detail-pages="0"', _render_tour(self.ENTRY))

    def test_renders_the_plain_tour_when_no_charter_exists(self):
        html = _render_tour(None)

        self.assertNotIn("data-tour-charter", html)
        self.assertNotIn("data-archive-shell", html)
        self.assertNotIn("js/tour-charter.js", html)
        # ~1 MB of WebGL library and the reader bundle must not be paid for by
        # a tour that has no model to show.
        self.assertNotIn("js/kiosk-archive-book.js", html)
        # Still a working tour.
        self.assertIn('id="pano"', html)


class CharterUploadPathTestCase(TestCase):
    """An editor must actually be able to create a charter row.

    The type is free text in the database, so nothing structural stops the
    dashboard's <select> and the reserved type drifting apart — and when they
    do, the failure is invisible: uploads keep working, the tour just never
    shows a model because no row of that type can ever exist."""

    def test_the_dashboard_offers_the_charter_type(self):
        panel = (
            _REPO_ROOT / "templates" / "gears" / "partials" / "panel-archives.html"
        ).read_text(encoding="utf-8")

        options = re.findall(r'<option value="([^"]*)"', panel)
        self.assertTrue(
            any(is_charter_type(value) for value in options),
            f"no option in the archive type <select> resolves to a charter: {options}",
        )

    def test_the_css_does_not_fight_marzipano_for_the_transform(self):
        """Marzipano writes `transform` on the hotspot element every frame
        (util/positionAbsolutely.js), so centring the model with a transform is
        silently overwritten and the book hangs down-right of its yaw/pitch.
        Centring must use negative margins, as .link-hotspot does."""
        css = (
            _REPO_ROOT / "resources" / "css" / "tour-charter.css"
        ).read_text(encoding="utf-8")

        block = css.split(".tour-charter {")[1].split("}")[0]
        # Strip comments first — this rule's comment necessarily *talks* about
        # the transform it must not declare.
        block = re.sub(r"/\*.*?\*/", "", block, flags=re.DOTALL)
        self.assertNotIn("transform:", block)
        self.assertIn("margin-left: -", block)
        self.assertIn("margin-top: -", block)

    def test_the_hidden_inspection_overlay_cannot_swallow_the_tour(self):
        """`hidden` is only a USER-AGENT rule (`[hidden] { display: none }`),
        and an author `display` beats the user-agent origin outright —
        specificity never enters into it. .charter-inspect is a fixed,
        full-viewport, z-index 300 element that the template renders with
        `hidden`, so declaring `display` on it without a `[hidden]` guard
        cancels the attribute and leaves the overlay laid out over the whole
        page for the life of the tour. `opacity: 0` hides it but does NOT
        remove it from hit-testing: it then eats every tap meant for the
        panorama, the charter hotspot and the search bar, leaving only the back
        bar at z-index 9000 working. That is exactly how this shipped once.

        .archive-book-overlay carries the same guard for the same reason; see
        kiosk-archive-book.css."""
        css = (
            _REPO_ROOT / "resources" / "css" / "tour-charter.css"
        ).read_text(encoding="utf-8")
        css = re.sub(r"/\*.*?\*/", "", css, flags=re.DOTALL)

        base = css.split(".charter-inspect {")[1].split("}")[0]
        if "display:" not in base:
            # No `display` declared, so the UA rule stands on its own and the
            # guard is not needed. Nothing to assert.
            return

        guard = re.search(
            r"\.charter-inspect\[hidden\]\s*\{([^}]*)\}", css
        )
        self.assertIsNotNone(
            guard,
            ".charter-inspect declares `display`, which overrides the [hidden] "
            "attribute — it needs a `.charter-inspect[hidden]` rule or the "
            "overlay covers the whole tour permanently",
        )
        declaration = guard.group(1).replace(" ", "")
        self.assertIn("display:none!important", declaration)


class ArchivesPayloadExclusionTestCase(TestCase):
    def test_charter_is_kept_out_of_the_public_archives_payload(self):
        from app.controllers.kiosk.ArchivesController import ArchivesController

        rows = [
            _Archive(id=3, name="Folio 2026", type="Folio", file_path="Archives/f.pdf"),
            _Archive(id=4, name="Charter 2026", type="charter", file_path="Archives/c.pdf"),
        ]
        with patch("app.controllers.kiosk.ArchivesController.Archives") as archives:
            archives.order_by.return_value.get.return_value = rows
            payload = ArchivesController()._build_archives_payload()

        names = [entry["name"] for entry in payload["archives"]]
        self.assertIn("Folio 2026", names)
        self.assertNotIn("Charter 2026", names)
