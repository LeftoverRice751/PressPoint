"""An uploaded image's stored extension must come from its verified content.

`save_uploaded_image()` checked the file's *bytes* with libmagic but took the
stored *extension* straight from the filename the browser sent. The two
disagreeing is the whole bug: a file whose first bytes are a valid PNG header
passes `verify_buffer`, and if it was uploaded as "payload.html" it was saved as
`Profiles/avatar-<hex>.html`.

That matters because nginx serves those NAS folders directly
(`location ~ ^/storage/((?:Archives|Videos|About|Branding|Profiles)/.*)$`) and
derives Content-Type from the extension, with no nosniff header and no CSP. So
the file came back as text/html on the application's own origin, and any script
in it ran with the session of whoever opened the link. Every caller of this
function is an `auth`-only route, so a plain editor could plant one and send it
to an admin -- an editor-to-admin privilege escalation.

The sibling upload paths in this codebase (NewsController, OrgBoardController,
AboutController.upload_hymn_audio) all gate the extension. This one did not.
"""

import os
import struct
import tempfile
import zlib
from unittest import TestCase
from unittest.mock import Mock, patch

from app.services import ImageUploads


def _png_chunk(kind, payload):
    body = kind + payload
    return struct.pack(">I", len(payload)) + body + struct.pack(">I", zlib.crc32(body))


def _real_png_bytes():
    """A genuinely valid 1x1 PNG, so libmagic reports image/png for real rather
    than us mocking the verification we are trying to test around."""
    raw = zlib.compress(b"\x00\x00\x00\x00")
    return (
        b"\x89PNG\r\n\x1a\n"
        + _png_chunk(b"IHDR", struct.pack(">IIBBBBB", 1, 1, 8, 0, 0, 0, 0))
        + _png_chunk(b"IDAT", raw)
        + _png_chunk(b"IEND", b"")
    )


def _polyglot_bytes():
    """Valid PNG header, script payload appended after IEND. libmagic keys off
    the header, so this is reported as image/png."""
    return _real_png_bytes() + b"<script>alert(document.domain)</script>"


def _upload(filename, content):
    upload = Mock()
    upload.filename = filename
    upload.content = content
    upload.extension.return_value = os.path.splitext(filename)[1]
    return upload


class UploadExtensionTestCase(TestCase):
    def _save(self, filename, content):
        with tempfile.TemporaryDirectory() as tmp:
            with patch.object(ImageUploads, "gearsnas_base", return_value=tmp):
                stored, error = ImageUploads.save_uploaded_image(
                    _upload(filename, content), "Profiles", "avatar"
                )
            return stored, error

    def test_polyglot_named_html_is_not_stored_as_html(self):
        """The exploit primitive. The bytes are a real PNG; only the name is
        hostile, and the name is what nginx would have keyed Content-Type on."""
        stored, error = self._save("payload.html", _polyglot_bytes())

        if stored is not None:
            self.assertFalse(
                stored.lower().endswith(".html"),
                "an uploaded file was stored with an attacker-chosen .html extension",
            )

    def test_script_extension_is_not_honoured(self):
        stored, error = self._save("payload.js", _real_png_bytes())

        if stored is not None:
            self.assertFalse(stored.lower().endswith(".js"))

    def test_svg_extension_is_not_honoured(self):
        """SVG is script-capable in a browser, so it is the same class of sink
        as .html even though it sounds like an image format."""
        stored, error = self._save("payload.svg", _real_png_bytes())

        if stored is not None:
            self.assertFalse(stored.lower().endswith(".svg"))

    def test_png_content_is_stored_with_a_png_extension(self):
        """The extension has to follow the verified content type."""
        stored, error = self._save("payload.html", _real_png_bytes())

        self.assertIsNone(error)
        self.assertIsNotNone(stored)
        self.assertTrue(
            stored.lower().endswith(".png"),
            f"expected the verified type to pick the extension, got {stored}",
        )

    def test_honest_png_upload_still_works(self):
        stored, error = self._save("photo.png", _real_png_bytes())

        self.assertIsNone(error)
        self.assertTrue(stored.startswith("Profiles/"))
        self.assertTrue(stored.lower().endswith(".png"))

    def test_non_image_content_is_still_rejected(self):
        """The existing magic-byte gate must survive the change."""
        stored, error = self._save("notes.png", b"just some plain text, not an image")

        self.assertIsNone(stored)
        self.assertIsNotNone(error)
