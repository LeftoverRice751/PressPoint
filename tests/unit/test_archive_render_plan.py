"""How big a rendered archive page should be.

The raster size used to be a fixed *zoom multiplier* over the PDF's own point
size (PAGE_RENDER_ZOOM = 3.0). That makes resolution a property of the upload,
not of the screen: a 432 pt scan came out at 1296 px -- below both the kiosk's
1536 device pixels *and* the 1742 px scan embedded in the PDF -- while a 1191 pt
tabloid came out at 3573 px. These tests pin the replacement: a target pixel
size on the long edge, capped at what the source can actually supply.

Two tiers per page:

  - fit    -- what the reader paints at fit-to-screen (FIT_LONG_EDGE).
  - detail -- what pinch-zoom swaps in (DETAIL_LONG_EDGE), rendered only when
              the source holds meaningfully more than the fit tier, because a
              scan upsampled past its native pixels is the same blur in more
              bytes.
"""

import io
import os
import tempfile

import fitz

from tests import TestCase

from app.services.ArchiveServices import (
    DETAIL_LONG_EDGE,
    DETAIL_MIN_RATIO,
    FIT_LONG_EDGE,
    MIN_FIT_LONG_EDGE,
    plan_page_zooms,
    scan_native_zoom,
)


def _png_bytes(width, height):
    from PIL import Image

    buffer = io.BytesIO()
    Image.new("RGB", (width, height), (200, 200, 200)).save(buffer, "PNG")
    return buffer.getvalue()


def _pdf_with_image(page_pt, image_px, image_rect=None):
    """One-page PDF with a raster placed on it; returns the open document."""
    doc = fitz.open()
    page = doc.new_page(width=page_pt[0], height=page_pt[1])
    rect = fitz.Rect(*image_rect) if image_rect else page.rect
    page.insert_image(rect, stream=_png_bytes(*image_px))
    return doc


class PlanPageZoomsTestCase(TestCase):
    """Pure math: (fit_zoom, detail_zoom) from page size and source zoom."""

    def test_fit_tier_targets_the_long_edge_in_pixels_not_a_fixed_multiplier(self):
        fit, _ = plan_page_zooms(432, 590)
        self.assertAlmostEqual(fit * 590, FIT_LONG_EDGE, places=3)

        fit, _ = plan_page_zooms(1191, 842)  # landscape: long edge is the width
        self.assertAlmostEqual(fit * 1191, FIT_LONG_EDGE, places=3)

    def test_vector_page_gets_the_full_detail_tier(self):
        fit, detail = plan_page_zooms(595, 842, native_zoom=None)
        self.assertIsNotNone(detail)
        self.assertAlmostEqual(detail * 842, DETAIL_LONG_EDGE, places=3)
        self.assertGreater(detail, fit)

    def test_scan_fit_tier_is_capped_at_the_scans_native_pixels(self):
        # 432x590 pt page holding a 1742x2377 scan: native zoom ~4.03, i.e.
        # 2377 px on the long edge -- under FIT_LONG_EDGE, so that is the cap.
        native = 2377 / 590
        fit, detail = plan_page_zooms(432, 590, native_zoom=native)
        self.assertAlmostEqual(fit, native, places=3)
        self.assertIsNone(detail, "no detail tier: the scan has nothing more to give")

    def test_scan_with_more_than_the_fit_tier_gets_a_detail_tier(self):
        # 648x864 pt page holding a 3497x4659 scan.
        native = 4659 / 864
        fit, detail = plan_page_zooms(648, 864, native_zoom=native)
        self.assertAlmostEqual(fit * 864, FIT_LONG_EDGE, places=3)
        self.assertIsNotNone(detail)
        self.assertAlmostEqual(detail, native, places=3)

    def test_detail_tier_is_capped_at_the_detail_ceiling(self):
        native = 9000 / 864
        _, detail = plan_page_zooms(648, 864, native_zoom=native)
        self.assertAlmostEqual(detail * 864, DETAIL_LONG_EDGE, places=3)

    def test_detail_tier_is_skipped_when_it_would_barely_exceed_fit(self):
        # Just under the ratio: not worth a second file.
        native = (FIT_LONG_EDGE * DETAIL_MIN_RATIO - 1) / 864
        _, detail = plan_page_zooms(648, 864, native_zoom=native)
        self.assertIsNone(detail)

        native = (FIT_LONG_EDGE * DETAIL_MIN_RATIO + 1) / 864
        _, detail = plan_page_zooms(648, 864, native_zoom=native)
        self.assertIsNotNone(detail)

    def test_a_tiny_scan_is_still_rendered_to_a_usable_floor(self):
        # A 600 px scan on an A4 page: rendering at 600 px would be unreadable
        # on any panel, so the floor wins even though it upsamples slightly.
        native = 600 / 842
        fit, detail = plan_page_zooms(595, 842, native_zoom=native)
        self.assertAlmostEqual(fit * 842, MIN_FIT_LONG_EDGE, places=3)
        self.assertIsNone(detail)


class ScanNativeZoomTestCase(TestCase):
    """Detecting a scanned page and the zoom at which its raster is 1:1."""

    def test_full_bleed_image_is_a_scan_at_its_native_zoom(self):
        doc = _pdf_with_image((432, 590), (1742, 2377))
        self.addCleanup(doc.close)
        zoom = scan_native_zoom(doc[0])
        self.assertIsNotNone(zoom)
        self.assertAlmostEqual(zoom, 2377 / 590, places=2)

    def test_two_half_page_images_count_as_a_scan_by_combined_coverage(self):
        # A landscape spread scanned as two portrait halves: each covers 50%
        # of the page, together they cover all of it.
        doc = fitz.open()
        page = doc.new_page(width=1191, height=842)
        self.addCleanup(doc.close)
        page.insert_image(fitz.Rect(0, 0, 595.5, 842), stream=_png_bytes(1350, 1800))
        page.insert_image(fitz.Rect(595.5, 0, 1191, 842), stream=_png_bytes(1350, 1800))
        zoom = scan_native_zoom(page)
        self.assertIsNotNone(zoom)
        self.assertAlmostEqual(zoom, 1350 / 595.5, places=2)

    def test_native_zoom_comes_from_the_image_that_covers_the_page(self):
        # A full-page scan plus a tiny logo placed in a 5x5 pt box: the logo's
        # pixels-per-point is enormous and must not become the page's zoom.
        doc = _pdf_with_image((432, 590), (1742, 2377))
        self.addCleanup(doc.close)
        doc[0].insert_image(fitz.Rect(10, 10, 15, 15), stream=_png_bytes(200, 200))
        zoom = scan_native_zoom(doc[0])
        self.assertIsNotNone(zoom)
        self.assertAlmostEqual(zoom, 2377 / 590, places=2)

    def test_a_small_photo_on_a_text_page_is_not_a_scan(self):
        doc = _pdf_with_image((595, 842), (1140, 1311), image_rect=(50, 50, 300, 350))
        self.addCleanup(doc.close)
        doc[0].insert_text((50, 500), "Body copy set in vector text", fontsize=11)
        self.assertIsNone(scan_native_zoom(doc[0]))

    def test_a_page_with_no_images_is_not_a_scan(self):
        doc = fitz.open()
        self.addCleanup(doc.close)
        page = doc.new_page(width=595, height=842)
        page.insert_text((50, 100), "Vector only", fontsize=11)
        self.assertIsNone(scan_native_zoom(page))


class SweepTiersTestCase(TestCase):
    """prewarm_archive_pages writes the planned tiers and advertises them."""

    def setUp(self):
        super().setUp()
        self.root = tempfile.mkdtemp()
        from unittest.mock import patch

        from app.services import ArchiveServices as module

        patcher = patch.object(
            module.ArchiveServices,
            "_storage_public_path",
            lambda _self, relative: os.path.join(self.root, str(relative).replace("\\", "/")),
        )
        patcher.start()
        self.addCleanup(patcher.stop)
        self.services = module.ArchiveServices()
        self.module = module

    def _save_pdf(self, doc, name="doc.pdf"):
        directory = os.path.join(self.root, "Archives")
        os.makedirs(directory, exist_ok=True)
        path = os.path.join(directory, name)
        doc.save(path)
        doc.close()
        return "Archives/" + name

    def _size(self, relative):
        from PIL import Image

        with Image.open(os.path.join(self.root, relative)) as image:
            return image.size

    def _assert_size(self, relative, expected):
        # Native zoom is taken from the dominant axis, so the other axis can
        # land a few pixels over when the placed image's aspect is not exactly
        # the page's. A tolerance keeps the test about the *tier*, not rounding.
        actual = self._size(relative)
        for got, want in zip(actual, expected):
            self.assertAlmostEqual(got, want, delta=4, msg=f"{relative}: {actual} != {expected}")

    def test_scan_with_headroom_gets_fit_and_detail_tiers(self):
        # 648x864 pt page, 3497x4659 scan -> fit 2400 tall, detail 4659 tall.
        file_path = self._save_pdf(_pdf_with_image((648, 864), (3497, 4659)))
        self.services.prewarm_archive_pages(file_path)

        self._assert_size("Archives/pages/doc/page-1.webp", (1800, FIT_LONG_EDGE))
        self._assert_size("Archives/pages/doc/page-1@2x.webp", (3497, 4659))
        self.assertEqual(self.services.count_detail_pages(file_path, 1), 1)

    def test_scan_without_headroom_gets_only_the_fit_tier_at_native_size(self):
        file_path = self._save_pdf(_pdf_with_image((432, 590), (1742, 2377)))
        self.services.prewarm_archive_pages(file_path)

        self._assert_size("Archives/pages/doc/page-1.webp", (1742, 2377))
        self.assertFalse(os.path.exists(os.path.join(self.root, "Archives/pages/doc/page-1@2x.webp")))
        self.assertEqual(self.services.count_detail_pages(file_path, 1), 0)

    def test_detail_count_is_a_contiguous_run_of_detail_files(self):
        pages_dir = os.path.join(self.root, "Archives", "pages", "doc")
        os.makedirs(pages_dir)
        for index in (1, 2, 4):  # page 3 missing: the run stops at 2
            with open(os.path.join(pages_dir, f"page-{index}@2x.webp"), "wb") as handle:
                handle.write(b"RIFF")
        self.assertEqual(self.services.count_detail_pages("Archives/doc.pdf", 4), 2)
        self.assertEqual(self.services.count_detail_pages("Archives/doc.pdf", 1), 1)

    def test_archive_entry_publishes_the_detail_tier(self):
        file_path = self._save_pdf(_pdf_with_image((648, 864), (3497, 4659)))
        self.services.prewarm_archive_pages(file_path)

        class _Archive:
            id = 7
            name = "Issue"
            type = "Tabloid"
            date = None

        _Archive.file_path = file_path
        entry = self.services.build_archive_entry(_Archive())
        self.assertEqual(entry["detail_pages"], 1)
        self.assertEqual(entry["detail_suffix"], "@2x")

    def test_on_demand_page_render_uses_the_plan_too(self):
        file_path = self._save_pdf(_pdf_with_image((432, 590), (1742, 2377)))
        path = self.services.build_page_preview(file_path, 0)
        self.assertTrue(path.endswith("page-1.webp"))
        self._assert_size("Archives/pages/doc/page-1.webp", (1742, 2377))


class RenderedToPlanTestCase(SweepTiersTestCase):
    """The backfill script asks one question per archive: is what is on disk
    what the current plan would produce? Anything else gets re-rendered."""

    def test_fresh_sweep_matches_the_plan(self):
        file_path = self._save_pdf(_pdf_with_image((648, 864), (3497, 4659)))
        self.services.prewarm_archive_pages(file_path)
        self.assertTrue(self.services.is_rendered_to_plan(file_path, 1))

    def test_nothing_rendered_does_not_match(self):
        file_path = self._save_pdf(_pdf_with_image((648, 864), (3497, 4659)))
        self.assertFalse(self.services.is_rendered_to_plan(file_path, 1))

    def test_old_fixed_zoom_raster_does_not_match(self):
        # What the previous PAGE_RENDER_ZOOM = 3.0 left on the NAS for a
        # 432x590 pt scan: 1296x1770. The plan now wants the scan's 1742x2377.
        file_path = self._save_pdf(_pdf_with_image((432, 590), (1742, 2377)))
        from PIL import Image

        pages_dir = os.path.join(self.root, "Archives", "pages", "doc")
        os.makedirs(pages_dir)
        Image.new("RGB", (1296, 1770)).save(os.path.join(pages_dir, "page-1.webp"), "WEBP")
        self.assertFalse(self.services.is_rendered_to_plan(file_path, 1))

    def test_missing_detail_tier_does_not_match_when_the_plan_wants_one(self):
        file_path = self._save_pdf(_pdf_with_image((648, 864), (3497, 4659)))
        self.services.prewarm_archive_pages(file_path)
        os.remove(os.path.join(self.root, "Archives", "pages", "doc", "page-1@2x.webp"))
        os.remove(os.path.join(self.root, "Archives", "pages", "doc", "detail.txt"))
        self.assertFalse(self.services.is_rendered_to_plan(file_path, 1))

    def test_legacy_png_pages_do_not_match(self):
        file_path = self._save_pdf(_pdf_with_image((432, 590), (1742, 2377)))
        from PIL import Image

        pages_dir = os.path.join(self.root, "Archives", "pages", "doc")
        os.makedirs(pages_dir)
        Image.new("RGB", (1742, 2380)).save(os.path.join(pages_dir, "page-1.png"), "PNG")
        self.assertFalse(self.services.is_rendered_to_plan(file_path, 1))
