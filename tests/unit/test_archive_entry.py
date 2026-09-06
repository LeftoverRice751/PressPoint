"""Contract between the archives page and the kiosk reader.

The reader paints the server's pre-rendered pages the moment an archive is
opened, so it needs to know how many of them actually exist before it can trust
them. Getting that count wrong is silently bad: too high and the reader paints
broken images, too low and it falls back to rasterising from a ~100 MB PDF on
the terminal's own CPU. These tests pin the counts against the real filesystem
layout.

Two counts, and they are not the same number:

  - `prewarmed_pages` — pages rendered under EITHER extension. This is what the
    reader may paint without the PDF.
  - `direct_pages` — of those, the run it may address at nginx by name, which
    means assuming the canonical extension. Lower than the first for an archive
    uploaded before the WebP switch.

There is deliberately no ceiling on either. Both used to be clamped to 20, and
that clamp — not the renderer — is what made later pages slow.
"""

import os
import tempfile
from unittest.mock import patch

from tests import TestCase

from app.services.ArchiveServices import ArchiveServices


class _Archive:
    def __init__(self, id=1, name="Folio", type="Magazine", file_path="Archives/doc.pdf", date=None):
        self.id = id
        self.name = name
        self.type = type
        self.file_path = file_path
        self.date = date


class PrewarmedPagesTestCase(TestCase):
    def setUp(self):
        super().setUp()
        self.root = tempfile.mkdtemp()
        # Point the service's path resolution at a scratch tree so the tests
        # exercise the real os.path.exists logic instead of mocking it away.
        patcher = patch.object(
            ArchiveServices,
            "_storage_public_path",
            lambda _self, relative: os.path.join(self.root, str(relative).replace("\\", "/")),
        )
        patcher.start()
        self.addCleanup(patcher.stop)
        self.services = ArchiveServices()

    def _write_pages(self, count, slug="doc", extension=".webp"):
        pages_dir = os.path.join(self.root, "Archives", "pages", slug)
        os.makedirs(pages_dir, exist_ok=True)
        for index in range(1, count + 1):
            with open(os.path.join(pages_dir, f"page-{index}{extension}"), "wb") as handle:
                handle.write(b"RIFF")

    def _entry(self, page_count):
        with patch.object(ArchiveServices, "get_page_count", return_value=page_count):
            return self.services.build_archive_entry(_Archive())

    def test_counts_only_pages_that_exist_on_disk(self):
        self._write_pages(5)

        self.assertEqual(self._entry(20)["prewarmed_pages"], 5)

    def test_is_zero_when_the_pages_directory_is_missing(self):
        # The common case for archives uploaded before prewarming existed. The
        # reader must fall back to loading the PDF rather than painting 404s.
        self.assertEqual(self._entry(20)["prewarmed_pages"], 0)

    def test_never_exceeds_the_documents_page_count(self):
        # Stale renders left behind by a replaced file must not make the reader
        # believe in pages the document no longer has.
        self._write_pages(9)

        self.assertEqual(self._entry(4)["prewarmed_pages"], 4)

    def test_stops_at_the_first_gap_rather_than_counting_total_files(self):
        # The reader treats the count as a contiguous run from page 1. A gap
        # (a render that failed mid-sweep) must cap the run, not be papered
        # over by a raw file tally.
        self._write_pages(3)
        pages_dir = os.path.join(self.root, "Archives", "pages", "doc")
        with open(os.path.join(pages_dir, "page-7.webp"), "wb") as handle:
            handle.write(b"RIFF")

        self.assertEqual(self._entry(20)["prewarmed_pages"], 3)

    def test_counts_well_past_the_old_twenty_page_ceiling(self):
        # THE regression this whole change exists to prevent. Both counts used
        # to be clamped to 20, so a fully-rendered 180-page issue reported 20
        # and the reader rasterised the other 160 pages itself, from the PDF,
        # one at a time. Any reintroduced cap fails here.
        self._write_pages(180)

        entry = self._entry(180)
        self.assertEqual(entry["prewarmed_pages"], 180)
        self.assertEqual(entry["direct_pages"], 180)

    def test_contiguity_still_holds_past_the_old_ceiling(self):
        # Removing the cap must not also remove the gap rule: a run that breaks
        # at page 25 of 40 is 24 pages, not 39.
        self._write_pages(24)
        pages_dir = os.path.join(self.root, "Archives", "pages", "doc")
        for index in range(26, 41):
            with open(os.path.join(pages_dir, f"page-{index}.webp"), "wb") as handle:
                handle.write(b"RIFF")

        self.assertEqual(self._entry(40)["prewarmed_pages"], 24)

    def test_legacy_png_pages_still_count_as_rendered(self):
        # An archive uploaded before the WebP switch is fully readable; it just
        # cannot be addressed at nginx by name until the backfill has run,
        # because the reader would have to guess the extension.
        self._write_pages(30, extension=".png")

        entry = self._entry(30)
        self.assertEqual(entry["prewarmed_pages"], 30)
        self.assertEqual(entry["direct_pages"], 0)

    def test_direct_pages_stops_at_the_first_legacy_page(self):
        # A half-migrated directory: the reader may address the WebP prefix
        # only as far as the first PNG, and takes the on-demand route beyond.
        self._write_pages(6)
        self._write_pages(12, extension=".png")

        entry = self._entry(12)
        self.assertEqual(entry["prewarmed_pages"], 12)
        self.assertEqual(entry["direct_pages"], 6)

    def test_page_url_base_is_still_published_for_the_on_demand_route(self):
        entry = self._entry(20)

        self.assertEqual(entry["page_url_base"], "/kiosk/archives/1/pages")

    def test_publishes_the_direct_storage_prefix_for_the_reader(self):
        # The reader builds `<base>/page-N<ext>` from these and hits nginx,
        # skipping the gunicorn round-trip the on-demand route costs.
        self._write_pages(4)

        entry = self._entry(4)
        self.assertEqual(entry["page_storage_base"], "/storage/Archives/pages/doc")
        self.assertEqual(entry["page_extension"], ".webp")


class ArchiveCardAttributesTestCase(TestCase):
    """The reader reads its instant-open contract off the archive card's data
    attributes. `data-first-page-url` was already published but unused; the
    reader now also needs the on-demand route base and the prewarmed count."""

    def _render(self, **overrides):
        from masonite.facades import View

        archive = {
            "id": 3,
            "name": "Folio 2026",
            "type": "Magazine",
            "year": 2026,
            "cover_url": "/storage/Archives/covers/doc-cover.png",
            "pdf_url": "/storage/Archives/doc.pdf",
            "page_count": 44,
            "is_tabloid": False,
            "first_page_url": "/storage/Archives/pages/doc/page-1.webp",
            "page_url_base": "/kiosk/archives/3/pages",
            "page_storage_base": "/storage/Archives/pages/doc",
            "page_extension": ".webp",
            "direct_pages": 44,
            "prewarmed_pages": 44,
        }
        archive.update(overrides)
        return View.render(
            "kiosk/archives",
            {"archives": [archive], "archives_by_year": {2026: [archive]}, "years": [2026]},
        ).get_content()

    def test_card_publishes_the_on_demand_page_route(self):
        self.assertIn('data-page-url-base="/kiosk/archives/3/pages"', self._render())

    def test_card_publishes_the_prewarmed_page_count(self):
        self.assertIn('data-prewarmed-pages="44"', self._render())

    def test_card_publishes_the_direct_storage_prefix(self):
        markup = self._render()
        self.assertIn('data-page-storage-base="/storage/Archives/pages/doc"', markup)
        self.assertIn('data-page-extension=".webp"', markup)
        self.assertIn('data-direct-pages="44"', markup)

    def test_kiosk_no_longer_forces_the_pdf_download_on_open(self):
        # data-reader-eager-pdf made the terminal pull the whole (~100 MB) PDF
        # the moment the reader opened, to paper over a soft preview raster.
        # The raster is sharp now, so the attribute is gone.
        self.assertNotIn('data-reader-eager-pdf', self._render())

    def test_card_still_publishes_the_first_page_url(self):
        # Pre-existing attribute the reader now actually consumes.
        self.assertIn('data-first-page-url=', self._render())


class ArchivePageRouteTestCase(TestCase):
    """`/kiosk/archives/<id>/pages/<n>` is the reader's fallback path: it is
    what serves any page the reader cannot address at nginx directly (a legacy
    .png archive, or one still being swept). It must redirect to whichever
    extension is actually on disk, render on demand only when neither is, and
    never 500 on bad input."""

    def _call(self, archive, page="1", archive_id="7", on_disk=".webp", render_creates=None):
        from unittest.mock import Mock
        from app.controllers.kiosk.ArchivesController import ArchivesController

        request = Mock()
        request.param.side_effect = lambda key, default="": {
            "id": archive_id, "page": page,
        }.get(key, default)
        response = Mock()
        response.redirect.return_value = "redirected"
        response.view.return_value = "notfound"

        state = {"extension": on_disk}

        def _resolve(self_, file_path, page_index):
            if not state["extension"]:
                return ""
            return self_._page_relative_path(file_path, page_index, state["extension"])

        def _build(_file_path, _index):
            if render_creates:
                state["extension"] = render_creates
            return ""

        with patch("app.controllers.kiosk.ArchivesController.Archives") as archives_mock, patch.object(
            ArchiveServices, "resolve_page_relative", _resolve
        ), patch.object(ArchiveServices, "build_page_preview", side_effect=_build) as build_mock:
            archives_mock.find.return_value = archive
            result = ArchivesController().page(request, response)
        return result, response, build_mock

    def test_redirects_to_the_cached_storage_file_without_rerendering(self):
        result, response, build_mock = self._call(_Archive(file_path="Archives/doc.pdf"))

        self.assertEqual(result, "redirected")
        response.redirect.assert_called_once_with("/storage/Archives/pages/doc/page-1.webp")
        build_mock.assert_not_called()

    def test_serves_a_legacy_png_page_without_rerendering_it(self):
        # A pre-WebP archive must not pay a full raster on every request just
        # because the canonical extension changed underneath it.
        result, response, build_mock = self._call(
            _Archive(file_path="Archives/doc.pdf"), on_disk=".png"
        )

        self.assertEqual(result, "redirected")
        response.redirect.assert_called_once_with("/storage/Archives/pages/doc/page-1.png")
        build_mock.assert_not_called()

    def test_renders_on_demand_when_the_page_is_not_yet_rasterised(self):
        result, response, build_mock = self._call(
            _Archive(file_path="Archives/doc.pdf"), page="9", on_disk="", render_creates=".webp"
        )

        build_mock.assert_called_once()
        self.assertEqual(result, "redirected")
        response.redirect.assert_called_once_with("/storage/Archives/pages/doc/page-9.webp")

    def test_404s_when_the_page_cannot_be_rendered(self):
        result, _response, _build = self._call(
            _Archive(file_path="Archives/doc.pdf"), page="9", on_disk="", render_creates=None
        )

        self.assertEqual(result, "notfound")

    def test_404s_on_a_non_numeric_page(self):
        result, _response, _build = self._call(_Archive(), page="../../etc/passwd")

        self.assertEqual(result, "notfound")
