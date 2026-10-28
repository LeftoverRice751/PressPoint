"""Duplicating a story must give it its OWN image files: NewsController
deletes the old file and its derivatives when an image is replaced, so a
shared path would let an edit to the copy destroy the published original's
photograph."""

import os
import tempfile
from unittest.mock import patch

from tests import TestCase

from app.services import ImageDerivatives as D


class ImageCopyTestCase(TestCase):
    def setUp(self):
        super().setUp()
        self.root = tempfile.mkdtemp()
        os.makedirs(os.path.join(self.root, "news"))
        self._p = [
            patch.object(D, "absolute_path", lambda rel: os.path.join(self.root, rel)),
            patch.object(D, "is_safe_path", lambda rel: ".." not in str(rel)),
        ]
        for p in self._p:
            p.start()

    def tearDown(self):
        for p in self._p:
            p.stop()
        super().tearDown()

    def _write(self, rel, data=b"x"):
        with open(os.path.join(self.root, rel), "wb") as fh:
            fh.write(data)

    def test_copies_original_and_both_variants_under_a_new_name(self):
        self._write("news/a.jpg", b"orig")
        self._write("news/a.large.webp", b"L")
        self._write("news/a.thumb.webp", b"T")
        new = D.copy_image_and_variants("news/a.jpg")
        self.assertTrue(new.startswith("news/") and new.endswith(".jpg"))
        self.assertNotEqual(new, "news/a.jpg")
        stem = new[:-4]
        for rel, data in ((new, b"orig"), (stem + ".large.webp", b"L"), (stem + ".thumb.webp", b"T")):
            with open(os.path.join(self.root, rel), "rb") as fh:
                self.assertEqual(fh.read(), data)
        self.assertTrue(os.path.isfile(os.path.join(self.root, "news/a.jpg")))

    def test_failed_variant_copy_removes_what_was_copied_and_raises(self):
        self._write("news/f.jpg", b"orig")
        self._write("news/f.large.webp", b"L")
        self._write("news/f.thumb.webp", b"T")
        real = D.shutil.copy2
        calls = []

        def flaky(src, dst):
            calls.append(dst)
            if len(calls) == 2:
                raise OSError("disk full")
            return real(src, dst)

        with patch.object(D.shutil, "copy2", flaky):
            with self.assertRaises(OSError):
                D.copy_image_and_variants("news/f.jpg")
        self.assertEqual(sorted(os.listdir(os.path.join(self.root, "news"))),
                         ["f.jpg", "f.large.webp", "f.thumb.webp"])

    def test_missing_variants_are_skipped(self):
        self._write("news/b.png")
        new = D.copy_image_and_variants("news/b.png")
        self.assertTrue(os.path.isfile(os.path.join(self.root, new)))

    def test_missing_source_returns_none(self):
        self.assertIsNone(D.copy_image_and_variants("news/gone.jpg"))

    def test_unsafe_or_empty_path_returns_none(self):
        self.assertIsNone(D.copy_image_and_variants("../etc/passwd"))
        self.assertIsNone(D.copy_image_and_variants(None))

    def test_delete_removes_original_and_variants(self):
        for rel in ("news/c.jpg", "news/c.large.webp", "news/c.thumb.webp"):
            self._write(rel)
        D.delete_image_and_variants("news/c.jpg")
        self.assertEqual(os.listdir(os.path.join(self.root, "news")), [])
