"""The archive broadcast fires only once the issue is readable.

store() renders the cover and the first EAGER_PAGE_LIMIT pages on the request
thread and sweeps the rest in a background thread; ArchivesController.page
renders on demand past that. So the point right after the eager pre-warm is
the first moment a kiosk refresh would open onto real pages rather than a
shelf card with nothing behind it.
"""

import tempfile
from unittest import TestCase
from unittest.mock import Mock, patch

from app.controllers.kiosk import ArchivesController as module


def _ajax_request(inputs=None, params=None):
    inputs = inputs or {}
    params = params or {}
    request = Mock()
    request.input.side_effect = lambda key, default=None: inputs.get(key, default)
    request.param.side_effect = lambda key, default=None: params.get(key, default)
    request.header.side_effect = (
        lambda name: "XMLHttpRequest" if name == "X-Requested-With" else None
    )
    return request


def _response():
    response = Mock()
    response.json.side_effect = lambda payload, status=200: payload
    return response


class ArchivesLiveBroadcastTestCase(TestCase):
    def test_store_broadcasts_after_eager_prewarm(self):
        order = []
        services = Mock()
        services.prewarm_archive_previews.side_effect = lambda *a, **k: order.append("prewarm")

        upload = Mock()
        upload.extension.return_value = "pdf"
        storage = Mock()
        storage.disk.return_value.put_file.return_value = "Archives/issue.pdf"

        with tempfile.TemporaryDirectory() as nas:
            with patch.object(module, "gearsnas_base", return_value=nas), patch.object(
                module, "absolute_path", side_effect=lambda rel: f"{nas}/{rel}"
            ), patch.object(
                module.FileVerificationService, "verify_file_type", return_value=True
            ), patch.object(module.Archives, "create", return_value=Mock(id=9)), patch.object(
                module, "ArchiveServices", return_value=services
            ), patch.object(module, "_sweep_archive_pages_in_background"), patch.object(
                module, "Cache"
            ), patch.object(
                module.KioskBroadcast, "section_changed", side_effect=lambda s: order.append(s)
            ):
                result = module.ArchivesController().store(
                    _ajax_request(
                        {"name": "Vol 1", "type": "Tabloid", "year_published": "2026", "file": upload}
                    ),
                    storage,
                    _response(),
                )

        self.assertTrue(result["ok"], result)
        self.assertEqual(order, ["prewarm", "gears-archive"])

    def test_a_rejected_upload_broadcasts_nothing(self):
        upload = Mock()
        upload.extension.return_value = "docx"
        with patch.object(module.KioskBroadcast, "section_changed") as changed:
            module.ArchivesController().store(
                _ajax_request({"name": "x", "type": "y", "year_published": "2026", "file": upload}),
                Mock(),
                _response(),
            )
        changed.assert_not_called()

    def test_destroy_broadcasts_gears_archive(self):
        archive = Mock(id=9)
        archive.delete = Mock()
        services = Mock()
        services.build_archive_entry.return_value = {"file_path": "", "cover_path": ""}

        with patch.object(module.Archives, "find", return_value=archive), patch.object(
            module, "ArchiveServices", return_value=services
        ), patch.object(module, "Cache"), patch.object(
            module.KioskBroadcast, "section_changed"
        ) as changed:
            result = module.ArchivesController().destroy(
                _ajax_request(params={"id": "9"}), Mock(), _response()
            )

        self.assertTrue(result["ok"], result)
        archive.delete.assert_called_once()
        changed.assert_called_once_with("gears-archive")
