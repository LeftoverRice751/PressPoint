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

It also brings every archive up to the current render plan. Rasters used to
be a fixed zoom multiplier over the PDF's point size, so a half-size scan came
out at 1296 px -- softer than both the kiosk panel and the scan inside the
PDF. The plan is now a target pixel size capped at the scan's native
resolution, plus a `@2x` detail tier for pinch-zoom when the scan has the
headroom (see ArchiveServices.plan_page_zooms). An archive whose pages on disk
do not match that plan -- wrong size, missing detail tier, legacy .png -- has
its pages directory removed and is swept again. While that runs the reader
falls back to pdf.js for that one archive, so run it off-hours.

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

    if service.is_rendered_to_plan(file_path, page_count):
        print(f"  {label}: already {page_count}/{page_count} pages to plan — nothing to do")
        return

    direct = service.count_direct_pages(file_path, page_count)
    legacy = _legacy_pages(service, file_path, page_count)
    reason = "not yet rendered" if direct == 0 and not legacy else "off-plan (re-rendering)"

    print(f"  {label}: {page_count} pages — {reason}, {len(legacy)} legacy PNG to drop")
    if dry_run:
        return

    # Start clean. prewarm_archive_pages() treats a page already on disk as
    # done — under either extension — so anything left behind would pin those
    # pages at the old raster and leave the directory mixed, which caps
    # count_direct_pages() at the first mismatch and sends the reader back
    # through the Python route for the whole document. Removing the directory
    # also drops the completion markers, so the counts are honest mid-sweep.
    if direct or legacy:
        service.cleanup_archive_assets(file_path)

    started = time.time()

    def progress(done, total):
        if done % 25 == 0 or done == total:
            print(f"    {done}/{total} pages ({time.time() - started:.0f}s)", flush=True)

    service.prewarm_archive_pages(file_path, progress=progress)

    rendered = service.count_direct_pages(file_path, page_count)
    detail = service.count_detail_pages(file_path, page_count)
    directory = service._storage_public_path(service._page_directory_relative(file_path))
    megabytes = _directory_bytes(directory) / 1024 / 1024
    status = "ok" if service.is_rendered_to_plan(file_path, page_count) else "INCOMPLETE"
    print(f"    {status}: {rendered}/{page_count} pages, {detail} with detail tier, "
          f"{megabytes:.1f} MB, {time.time() - started:.0f}s")


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

    print(f"{len(archives)} archive(s); rendering {PAGE_EXTENSION} to the current plan"
          + (" [dry run]" if args.dry_run else ""))
    for archive in archives:
        process(archive, service, args.dry_run)


if __name__ == "__main__":
    main()
