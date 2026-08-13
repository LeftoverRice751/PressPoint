"""Contract between the archives page and the kiosk reader.

The reader paints the server's pre-rendered page PNGs the moment an archive is
opened, so it needs to know how many of them actually exist before it can trust
them. Getting that count wrong is silently bad: too high and the reader paints
broken images, too low and it falls back to downloading a ~100 MB PDF for
nothing. These tests pin the count against the real filesystem layout.
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

    def _write_pages(self, count, slug="doc"):
        pages_dir = os.path.join(self.root, "Archives", "pages", slug)
        os.makedirs(pages_dir, exist_ok=True)
        for index in range(1, count + 1):
            with open(os.path.join(pages_dir, f"page-{index}.png"), "wb") as handle:
                handle.write(b"\x89PNG")

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
        # (a render that failed mid-prewarm) must cap the run, not be papered
        # over by a raw file tally.
        self._write_pages(3)
        pages_dir = os.path.join(self.root, "Archives", "pages", "doc")
        with open(os.path.join(pages_dir, "page-7.png"), "wb") as handle:
            handle.write(b"\x89PNG")

        self.assertEqual(self._entry(20)["prewarmed_pages"], 3)

    def test_page_url_base_is_still_published_for_the_on_demand_route(self):
        entry = self._entry(20)

        self.assertEqual(entry["page_url_base"], "/kiosk/archives/1/pages")


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
            "first_page_url": "/storage/Archives/pages/doc/page-1.png",
            "page_url_base": "/kiosk/archives/3/pages",
            "prewarmed_pages": 20,
        }
        archive.update(overrides)
        return View.render(
            "kiosk/archives",
            {"archives": [archive], "archives_by_year": {2026: [archive]}, "years": [2026]},
        ).get_content()

    def test_card_publishes_the_on_demand_page_route(self):
        self.assertIn('data-page-url-base="/kiosk/archives/3/pages"', self._render())

    def test_card_publishes_the_prewarmed_page_count(self):
        self.assertIn('data-prewarmed-pages="20"', self._render())

    def test_card_still_publishes_the_first_page_url(self):
        # Pre-existing attribute the reader now actually consumes.
        self.assertIn('data-first-page-url=', self._render())


class ArchivePageRouteTestCase(TestCase):
    """`/kiosk/archives/<id>/pages/<n>` is now on the reader's critical path:
    every instantly-painted page is fetched through it. It must redirect to the
    cached /storage/ file, render on demand only when the file is missing, and
    never 500 on bad input."""

    def _call(self, archive, page="1", archive_id="7", exists=True, render_creates=False):
        from unittest.mock import Mock
        from app.controllers.ArchivesController import ArchivesController

        request = Mock()
        request.param.side_effect = lambda key, default="": {
            "id": archive_id, "page": page,
        }.get(key, default)
        response = Mock()
        response.redirect.return_value = "redirected"
        response.view.return_value = "notfound"

        state = {"exists": exists}

        def _exists(_path):
            return state["exists"]

        def _build(_file_path, _index):
            if render_creates:
                state["exists"] = True
            return ""

        with patch("app.controllers.ArchivesController.Archives") as archives_mock, patch(
            "app.controllers.ArchivesController.os.path.exists", side_effect=_exists
        ), patch.object(ArchiveServices, "build_page_preview", side_effect=_build) as build_mock:
            archives_mock.find.return_value = archive
            result = ArchivesController().page(request, response)
        return result, response, build_mock

    def test_redirects_to_the_cached_storage_file_without_rerendering(self):
        result, response, build_mock = self._call(_Archive(file_path="Archives/doc.pdf"))

        self.assertEqual(result, "redirected")
        response.redirect.assert_called_once_with("/storage/Archives/pages/doc/page-1.png")
        build_mock.assert_not_called()

    def test_renders_on_demand_when_the_page_is_not_yet_rasterised(self):
        result, response, build_mock = self._call(
            _Archive(file_path="Archives/doc.pdf"), page="9", exists=False, render_creates=True
        )

        build_mock.assert_called_once()
        self.assertEqual(result, "redirected")
        response.redirect.assert_called_once_with("/storage/Archives/pages/doc/page-9.png")

    def test_404s_when_the_page_cannot_be_rendered(self):
        result, _response, _build = self._call(
            _Archive(file_path="Archives/doc.pdf"), page="9", exists=False, render_creates=False
        )

        self.assertEqual(result, "notfound")

    def test_404s_on_a_non_numeric_page(self):
        result, _response, _build = self._call(_Archive(), page="../../etc/passwd")

        self.assertEqual(result, "notfound")
