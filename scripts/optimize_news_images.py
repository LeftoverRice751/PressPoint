#!/usr/bin/env python
"""One-time backfill: generate WebP derivatives for news images that were
uploaded before the derivative pipeline existed.

Run with the project's venv Python from the repo root:

    venv/bin/python scripts/optimize_news_images.py

Idempotent and re-runnable — generate_variants skips any variant that already
exists, so a second run is a no-op.

This reads existing originals straight from local disk, which is fine because
it is a migration against today's file storage. The encode + write it delegates
to app.services.ImageDerivatives goes through the disk API, so the derivatives
land wherever the `public` disk points.
"""

import os
import sys

# Make `app` importable when run as a plain script.
REPO_ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, REPO_ROOT)

from app.services.ImageDerivatives import generate_variants, variant_relpath, VARIANTS  # noqa: E402
from app.services.StorageRouter import public_base  # noqa: E402


class _LocalDisk:
    """Minimal disk shim so the script doesn't need to boot the full app
    container. Mirrors the put/exists methods generate_variants relies on,
    rooted at the same folder as the Masonite `public` file disk."""

    def __init__(self, root):
        self._root = root

    def _abs(self, path):
        return os.path.join(self._root, path.replace("\\", "/"))

    def exists(self, path):
        return os.path.exists(self._abs(path))

    def put(self, path, content):
        full = self._abs(path)
        os.makedirs(os.path.dirname(full), exist_ok=True)
        with open(full, "wb") as fh:
            fh.write(content)
        return path


def main():
    root = public_base()
    news_dir = os.path.join(root, "news")
    if not os.path.isdir(news_dir):
        print(f"No news image directory at {news_dir} — nothing to do.")
        return

    disk = _LocalDisk(root)
    originals = 0
    generated = 0
    skipped = 0

    for name in sorted(os.listdir(news_dir)):
        # Skip our own derivatives and non-files.
        if name.endswith(".webp") or "." not in name:
            continue
        full = os.path.join(news_dir, name)
        if not os.path.isfile(full):
            continue

        stored_path = f"news/{name}"
        originals += 1

        # Already fully derived? Skip the read entirely.
        if all(disk.exists(variant_relpath(stored_path, s)) for s, _ in VARIANTS):
            skipped += 1
            continue

        with open(full, "rb") as fh:
            data = fh.read()
        generate_variants(data, stored_path, disk)
        generated += 1
        print(f"  derived  {stored_path}")

    print(
        f"\nDone. {originals} originals scanned, "
        f"{generated} processed, {skipped} already up to date."
    )


if __name__ == "__main__":
    main()
