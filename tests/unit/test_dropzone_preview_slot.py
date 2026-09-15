"""Every dashboard dropzone carries the slot the file preview renders into.

upload-meter.js fills `[data-dropzone-preview]` with a thumbnail, player, or
rendered PDF page once a file is chosen. A dropzone that omits the span still
works — the filename row shows as before — so a missing slot is invisible until
an editor wonders why one upload form previews and another does not. This pins
the contract at the source, since the panels render with too much context to
stand up here for a one-attribute check.
"""

import re
from pathlib import Path

from tests import TestCase

TEMPLATES = Path(__file__).resolve().parents[2] / "templates" / "gears"
DROPZONE = re.compile(r"<label[^>]*data-dropzone[^>]*>.*?</label>", re.DOTALL)


class DropzonePreviewSlotTestCase(TestCase):
    def test_every_dropzone_has_a_preview_slot(self):
        missing = []
        seen = 0
        for path in sorted(TEMPLATES.rglob("*.html")):
            for block in DROPZONE.findall(path.read_text(encoding="utf-8")):
                seen += 1
                if "data-dropzone-preview" not in block:
                    missing.append(str(path.relative_to(TEMPLATES.parent)))
        self.assertGreater(seen, 0, "expected to find dropzones under templates/gears")
        self.assertEqual(missing, [], f"dropzones without a preview slot: {missing}")
