#!/usr/bin/env python
"""One-time backfill: rasterise EVERY page of every archive onto the NAS.

Why this exists
---------------
The kiosk reader has two page sources: images the server rasterised onto
GearsNAS (served straight by nginx, instant) and pdf.js rendering the source
PDF in the browser. ArchiveServices used to stop rendering at 20 pages, so
every page past 20 fell to pdf.js: range-fetch from a ~100 MB PDF, decode,
canvas-rasterise and re-encode, on the terminal's own CPU, one page at a time.
That is what "later pages take forever to load" was.

The cap is gone from the code, but that only helps archives uploaded from now
on. This script is what fixes the ones already on the NAS.

It also moves pages from PNG to WebP at the new PAGE_RENDER_ZOOM. That is not
cosmetic: measured on a real 180-page issue, page 1 is 1758 KB as PNG at zoom
1.8 and 185 KB as WebP at zoom 3.0 -- sharper AND ~9x smaller. Legacy PNGs are
deleted as each archive is re-rendered, because a directory holding both
extensions is only partially addressable by the reader (see
ArchiveServices.count_direct_pages).

Run with the project's venv Python from the repo root:

    venv/bin/python scripts/prewarm_archive_pages.py --dry-run
    venv/bin/python scripts/prewarm_archive_pages.py

Idempotent: an archive already fully rendered as WebP is skipped in one stat.
Expect roughly 0.3-0.5s of CPU per page on first run, so a 180-page issue takes
about a minute and lands ~14 MB on the NAS.
"""

import argparse
import os
import sys
import time

# Make `app` importable when run as a plain script.
REPO_ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, REPO_ROOT)

import config.database  # noqa: F401,E402  (binds the ORM connection resolver)

from app.models.Archives import Archives  # noqa: E402
from app.services.ArchiveServices import (  # noqa: E402
    ArchiveServices,
    LEGACY_PAGE_EXTENSION,
    PAGE_EXTENSION,
    PAGE_RENDER_ZOOM,
)


def _legacy_pages(service, file_path, page_count):
    """Absolute paths of pre-WebP page renders for this archive."""
    found = []
    for index in range(page_count):
        relative = service._page_relative_path(file_path, index, LEGACY_PAGE_EXTENSION)
        if not relative:
            continue
        absolute = service._storage_public_path(relative)
        if os.path.exists(absolute):
            found.append(absolute)
    return found


def _directory_bytes(path):
    total = 0
    for root, _dirs, files in os.walk(path):
        for name in files:
            try:
                total += os.path.getsize(os.path.join(root, name))
            except OSError:
                pass
    return total


def process(archive, service, dry_run):
    file_path = service._normalized_archive_path(getattr(archive, "file_path", "") or "")
    label = f"#{getattr(archive, 'id', '?')} {getattr(archive, 'name', '') or file_path}"

    if not file_path:
        print(f"  {label}: no file_path — skipped")
        return

    if not os.path.exists(service._storage_public_path(file_path)):
        print(f"  {label}: PDF missing from the NAS — skipped")
        return

    page_count = service.get_page_count(file_path)
    if page_count <= 0:
        print(f"  {label}: page count unreadable — skipped")
        return

    direct = service.count_direct_pages(file_path, page_count)
    if direct >= page_count:
        print(f"  {label}: already {page_count}/{page_count} WebP — nothing to do")
        return

    legacy = _legacy_pages(service, file_path, page_count)
    missing = page_count - direct

    print(f"  {label}: {page_count} pages — {missing} to render, {len(legacy)} legacy PNG to drop")
    if dry_run:
        return

    # Delete the PNGs *first*. prewarm_archive_pages() treats a page present
    # under either extension as done, so leaving them would pin those pages at
    # the old soft raster and leave the directory mixed — which caps
    # count_direct_pages() at the first PNG and sends the reader back through
    # the Python route for the whole document.
    for path in legacy:
        try:
            os.remove(path)
        except OSError as error:
            print(f"    could not remove {path}: {error}")

    started = time.time()

    def progress(done, total):
        if done % 25 == 0 or done == total:
            print(f"    {done}/{total} pages ({time.time() - started:.0f}s)", flush=True)

    service.prewarm_archive_pages(file_path, zoom=PAGE_RENDER_ZOOM, progress=progress)

    rendered = service.count_direct_pages(file_path, page_count)
    directory = service._storage_public_path(service._page_directory_relative(file_path))
    megabytes = _directory_bytes(directory) / 1024 / 1024
    status = "ok" if rendered >= page_count else "INCOMPLETE"
    print(f"    {status}: {rendered}/{page_count} pages, {megabytes:.1f} MB, "
          f"{time.time() - started:.0f}s")


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--dry-run", action="store_true",
                        help="report what would be rendered without writing anything")
    parser.add_argument("--id", type=int, action="append",
                        help="limit to these archive ids (repeatable)")
    args = parser.parse_args()

    service = ArchiveServices()
    archives = Archives.all()
    if args.id:
        wanted = set(args.id)
        archives = [a for a in archives if getattr(a, "id", None) in wanted]

    print(f"{len(archives)} archive(s); rendering {PAGE_EXTENSION} at zoom {PAGE_RENDER_ZOOM}"
          + (" [dry run]" if args.dry_run else ""))
    for archive in archives:
        process(archive, service, args.dry_run)


if __name__ == "__main__":
    main()
