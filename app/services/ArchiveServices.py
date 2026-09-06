import contextlib
import os
import re
import shutil

import fitz

try:
    from PIL import Image
except ImportError:  # Pillow missing -> pages fall back to PNG (see _write_pixmap)
    Image = None

from app.services.StorageRouter import absolute_path, gearsnas_base


# Match the upload path: anything we render onto the NAS must be
# group-writable so the SMB-mapped editor accounts can prune/replace it.
_NAS_UMASK = 0o002
_NAS_FILE_MODE = 0o664
_NAS_DIR_MODE = 0o775


@contextlib.contextmanager
def _group_writable_umask():
    previous = os.umask(_NAS_UMASK)
    try:
        yield
    finally:
        os.umask(previous)


def _is_under_nas(path):
    try:
        nas_root = os.path.realpath(gearsnas_base())
        resolved = os.path.realpath(path)
    except OSError:
        return False
    return resolved == nas_root or resolved.startswith(nas_root + os.sep)


# Per-page raster zoom. The kiosk panel is 768x1024 at DPR 2, so a full-bleed
# page wants roughly 1536x2048 device pixels; 3.0 yields 1512x2160 on a normal
# A4-ish page. This used to be 1.8 (908x1296), which is visibly soft on the
# terminal -- and that softness is the entire reason the kiosk template used to
# carry `data-reader-eager-pdf` to force a ~100 MB PDF download on open just so
# pdf.js could re-rasterise pages the server had already rendered.
PAGE_RENDER_ZOOM = 3.0

# Pages are stored as WebP, not PNG. These are photographic newspaper scans, so
# lossless costs a fortune for nothing: measured on a real 180-page archive,
# page 1 is 1758 KB as PNG at zoom 1.8 and 185 KB as WebP at zoom 3.0 -- both
# sharper AND ~9x smaller. Same trade ImageDerivatives.py makes for news images.
PAGE_EXTENSION = ".webp"
LEGACY_PAGE_EXTENSION = ".png"
_WEBP_QUALITY = 82
_WEBP_METHOD = 4

# How many pages are rasterised *synchronously*, inside the upload request.
# The rest of the document is swept in the background (see
# ArchivesController.store) because a 180-page sweep is ~70s of CPU and no
# editor should watch an upload spinner for that long. This slice only has to
# cover what a reader sees before the sweep catches up.
EAGER_PAGE_LIMIT = 6

# Written into the pages directory once a sweep has rendered the whole
# document, so count_prewarmed_pages() can answer without stat-ing every page.
_RENDERED_SIDECAR = "rendered.txt"


class ArchiveServices:
    # Kept as `_storage_public_path` to avoid churning callers, but now
    # resolves NAS paths (Archives/...) via the StorageRouter. Anything
    # else still falls through to the local public storage root.
    def _storage_public_path(self, relative_path):
        return absolute_path(str(relative_path).replace("\\", "/"))

    def _normalized_archive_path(self, file_path):
        return str(file_path or "").replace("\\", "/").lstrip("/")

    def _archive_slug(self, file_path):
        normalized = self._normalized_archive_path(file_path)
        if not normalized:
            return ""
        return os.path.splitext(os.path.basename(normalized))[0]

    def _preview_relative_path(self, file_path, page_number):
        normalized_path = self._normalized_archive_path(file_path)
        if not normalized_path:
            return ""

        base_name = os.path.splitext(os.path.basename(normalized_path))[0]
        suffix = "cover" if page_number == 0 else f"page-{page_number + 1}"
        # Covers live under Archives/covers/ on the NAS so the whole
        # archive (PDF + thumbnails) is co-located on one volume and
        # editors don't see a stray top-level covers folder over SMB.
        return os.path.join("Archives", "covers", f"{base_name}-{suffix}.png").replace("\\", "/")

    def _page_relative_path(self, file_path, page_index, extension=PAGE_EXTENSION):
        slug = self._archive_slug(file_path)
        if not slug:
            return ""
        # 1-indexed on disk so the URL `/storage/Archives/pages/<slug>/page-1.webp`
        # matches the page number a reader sees.
        return os.path.join(
            "Archives", "pages", slug, f"page-{page_index + 1}{extension}"
        ).replace("\\", "/")

    def resolve_page_relative(self, file_path, page_index):
        """Relative path of a page that actually exists, or "".

        Pages were PNG before the WebP switch, and an archive uploaded then is
        still perfectly readable -- the backfill script re-renders them, but
        until it has run (or if it is interrupted halfway) both extensions can
        be present in one directory. Every "is this page rendered?" question
        goes through here so a half-migrated archive never reads as missing.
        """
        for extension in (PAGE_EXTENSION, LEGACY_PAGE_EXTENSION):
            relative = self._page_relative_path(file_path, page_index, extension)
            if relative and os.path.exists(self._storage_public_path(relative)):
                return relative
        return ""

    def _page_directory_relative(self, file_path):
        slug = self._archive_slug(file_path)
        if not slug:
            return ""
        return os.path.join("Archives", "pages", slug).replace("\\", "/")

    def _page_count_sidecar_relative(self, file_path):
        directory = self._page_directory_relative(file_path)
        if not directory:
            return ""
        return f"{directory}/count.txt"

    def _ensure_parent_directory(self, file_path):
        parent_directory = os.path.dirname(file_path)
        if not parent_directory:
            return
        on_nas = _is_under_nas(parent_directory)
        if on_nas:
            with _group_writable_umask():
                os.makedirs(parent_directory, mode=_NAS_DIR_MODE, exist_ok=True)
            # makedirs only honors the mode argument for newly-created
            # leaves, so walk the tree and align each segment under the
            # NAS root with the shared 0o775 mode.
            try:
                nas_root = os.path.realpath(gearsnas_base())
                walker = os.path.realpath(parent_directory)
                while walker.startswith(nas_root + os.sep):
                    try:
                        os.chmod(walker, _NAS_DIR_MODE)
                    except OSError:
                        break
                    walker = os.path.dirname(walker)
            except OSError:
                pass
        else:
            os.makedirs(parent_directory, exist_ok=True)

    def _write_pixmap(self, pixmap, target_path):
        """Encode a fitz pixmap to `target_path`, honouring its extension.

        WebP has no encoder in PyMuPDF -- Pixmap.save() infers the format from
        the extension and only speaks PNG/PNM/PSD/PS -- so WebP goes through
        Pillow, the same way ImageDerivatives.py encodes news images. Covers
        are still PNG and keep taking the fitz path.

        Without Pillow we write PNG beside the WebP name rather than failing:
        resolve_page_relative() finds either, so the reader keeps working on a
        box with a broken install, just with fatter files.
        """
        if target_path.endswith(PAGE_EXTENSION):
            if Image is None:
                target_path = target_path[: -len(PAGE_EXTENSION)] + LEGACY_PAGE_EXTENSION
            else:
                image = Image.frombytes("RGB", (pixmap.width, pixmap.height), pixmap.samples)
                with _group_writable_umask():
                    image.save(
                        target_path, "WEBP", quality=_WEBP_QUALITY, method=_WEBP_METHOD
                    )
                return target_path

        with _group_writable_umask():
            pixmap.save(target_path)
        return target_path

    def _render_preview(self, source_path, preview_path, page_number, zoom=1.4):
        if os.path.exists(preview_path):
            return preview_path

        self._ensure_parent_directory(preview_path)

        try:
            with fitz.open(source_path) as doc:
                if doc.page_count <= page_number:
                    return ""

                page = doc.load_page(page_number)
                pixmap = page.get_pixmap(matrix=fitz.Matrix(zoom, zoom), alpha=False)
                preview_path = self._write_pixmap(pixmap, preview_path)

            if _is_under_nas(preview_path):
                try:
                    os.chmod(preview_path, _NAS_FILE_MODE)
                except OSError:
                    pass

            return preview_path
        except Exception:
            return ""

    def build_cover_preview(self, file_path):
        normalized_path = self._normalized_archive_path(file_path)
        if not normalized_path:
            return ""

        source_path = self._storage_public_path(normalized_path)
        if not os.path.exists(source_path):
            return ""

        cover_relative_path = self._preview_relative_path(normalized_path, 0)
        cover_path = self._storage_public_path(cover_relative_path)
        return self._render_preview(source_path, cover_path, 0)

    def build_page_preview(self, file_path, page_index, zoom=PAGE_RENDER_ZOOM):
        """Render a single page on-demand. Returns absolute path or '' on failure."""
        normalized_path = self._normalized_archive_path(file_path)
        if not normalized_path:
            return ""

        source_path = self._storage_public_path(normalized_path)
        if not os.path.exists(source_path):
            return ""

        # A page already on disk under either extension is done -- rendering a
        # WebP over a perfectly good legacy PNG would make the on-demand route
        # pay full raster cost on every request for a pre-migration archive.
        existing = self.resolve_page_relative(normalized_path, page_index)
        if existing:
            return self._storage_public_path(existing)

        page_relative = self._page_relative_path(normalized_path, page_index)
        if not page_relative:
            return ""

        page_path = self._storage_public_path(page_relative)
        return self._render_preview(source_path, page_path, page_index, zoom=zoom)

    def prewarm_archive_pages(self, file_path, max_pages=None, zoom=PAGE_RENDER_ZOOM,
                              start_index=0, progress=None):
        """Rasterise pages in one fitz session. `max_pages=None` means all of them.

        This used to stop at 20 pages, which was the whole bug behind "later
        pages take forever to load": pages past the limit had no server render
        at all, so the kiosk fell back to downloading the (often ~100 MB) PDF
        and rasterising each page itself, sequentially, on the terminal's CPU.
        Rendering the whole document costs ~70s of background CPU once and
        ~14 MB on the NAS, and every reader afterwards gets pages straight off
        nginx. Do not reintroduce a cap here.

        One fitz session for the lot: cheaper than N build_page_preview calls
        because the document is opened once. Also writes the page-count sidecar
        so the kiosk page-render path doesn't have to crack the PDF every visit.
        """
        normalized_path = self._normalized_archive_path(file_path)
        if not normalized_path:
            return []

        source_path = self._storage_public_path(normalized_path)
        if not os.path.exists(source_path):
            return []

        rendered = []
        try:
            with fitz.open(source_path) as doc:
                self._write_page_count(normalized_path, doc.page_count)
                limit = doc.page_count if max_pages is None else min(doc.page_count, start_index + max_pages)
                matrix = fitz.Matrix(zoom, zoom)
                for index in range(start_index, limit):
                    existing = self.resolve_page_relative(normalized_path, index)
                    if existing:
                        rendered.append(existing)
                        continue

                    page_relative = self._page_relative_path(normalized_path, index)
                    page_path = self._storage_public_path(page_relative)
                    self._ensure_parent_directory(page_path)
                    try:
                        page = doc.load_page(index)
                        pixmap = page.get_pixmap(matrix=matrix, alpha=False)
                        page_path = self._write_pixmap(pixmap, page_path)
                        if _is_under_nas(page_path):
                            try:
                                os.chmod(page_path, _NAS_FILE_MODE)
                            except OSError:
                                pass
                        rendered.append(page_relative)
                    except Exception:
                        continue
                    if progress:
                        progress(index + 1, doc.page_count)

                # Only a gapless sweep of the whole document may claim it is
                # complete. The marker short-circuits the per-page scan in
                # count_prewarmed_pages(), so writing it after a partial sweep
                # -- or one where a page failed to render -- would advertise
                # pages that aren't there and paint the reader a broken image.
                canonical = all(entry.endswith(PAGE_EXTENSION) for entry in rendered)
                if (start_index == 0 and limit >= doc.page_count
                        and len(rendered) == doc.page_count and canonical):
                    self._write_rendered_marker(normalized_path, doc.page_count)
        except Exception:
            pass

        return rendered

    def _rendered_marker_relative(self, file_path):
        directory = self._page_directory_relative(file_path)
        if not directory:
            return ""
        return f"{directory}/{_RENDERED_SIDECAR}"

    def _write_sidecar(self, sidecar_relative, value):
        if not sidecar_relative:
            return

        sidecar_path = self._storage_public_path(sidecar_relative)
        self._ensure_parent_directory(sidecar_path)
        try:
            with _group_writable_umask():
                with open(sidecar_path, "w") as handle:
                    handle.write(str(int(value)))
            if _is_under_nas(sidecar_path):
                try:
                    os.chmod(sidecar_path, _NAS_FILE_MODE)
                except OSError:
                    pass
        except Exception:
            pass

    def _write_page_count(self, file_path, page_count):
        self._write_sidecar(self._page_count_sidecar_relative(file_path), page_count)

    def _write_rendered_marker(self, file_path, rendered_count):
        self._write_sidecar(self._rendered_marker_relative(file_path), rendered_count)

    def _read_sidecar(self, sidecar_relative):
        if not sidecar_relative:
            return None
        sidecar_path = self._storage_public_path(sidecar_relative)
        if not os.path.exists(sidecar_path):
            return None
        try:
            with open(sidecar_path, "r") as handle:
                return int((handle.read() or "").strip() or 0)
        except Exception:
            return None

    def get_page_count(self, file_path):
        """Page count via sidecar; falls back to fitz when missing.

        Computing the count on every archives page render adds up over many
        archives (each fitz.open touches the NAS). The sidecar is written
        at upload; for legacy archives we crack the PDF once and cache.
        """
        normalized_path = self._normalized_archive_path(file_path)
        if not normalized_path:
            return 0

        cached = self._read_sidecar(self._page_count_sidecar_relative(normalized_path))
        if cached is not None:
            return cached

        source_path = self._storage_public_path(normalized_path)
        if not os.path.exists(source_path):
            return 0

        try:
            with fitz.open(source_path) as doc:
                count = doc.page_count
        except Exception:
            return 0

        self._write_page_count(normalized_path, count)
        return count

    def count_prewarmed_pages(self, file_path, page_count):
        """How many pages, counting from page 1, are already rasterised.

        The kiosk reader paints these images the instant an archive is opened,
        before pdf.js has fetched the (often ~100 MB) source document, so the
        count has to be honest: it is a CONTIGUOUS run from page 1, not a file
        tally. A gap left by a render that failed mid-sweep caps the run —
        otherwise the reader would paint a broken image for the missing page.
        Returns 0 when nothing has been rendered, which is the signal to fall
        back to loading the PDF immediately.

        There is deliberately NO ceiling here any more. It used to be clamped
        to PREWARM_PAGE_LIMIT (20), so even a fully-rendered document reported
        20 and the reader rasterised every later page itself off the PDF. The
        clamp, not the renderer, is what made later pages slow — see
        prewarm_archive_pages().
        """
        normalized_path = self._normalized_archive_path(file_path)
        if not normalized_path or page_count <= 0:
            return 0

        directory_relative = self._page_directory_relative(normalized_path)
        if not directory_relative:
            return 0

        if not os.path.isdir(self._storage_public_path(directory_relative)):
            return 0

        return self._contiguous_pages(normalized_path, page_count, canonical_only=False)

    def count_direct_pages(self, file_path, page_count):
        """Contiguous run from page 1 that exists under the CANONICAL extension.

        The reader addresses these straight at nginx, which means building the
        URL itself — and that means assuming the extension. This is the run for
        which that assumption is safe.

        It exists because it is NOT the same as count_prewarmed_pages(): an
        archive uploaded before the WebP switch has .png pages on disk, so it
        is fully prewarmed and yet zero of it is directly addressable until the
        backfill script has run. Those pages still load fast — they go through
        the on-demand route, which resolves either extension and 302s — they
        just cost a Python round-trip each until then.
        """
        normalized_path = self._normalized_archive_path(file_path)
        if not normalized_path or page_count <= 0:
            return 0
        if not self._page_directory_relative(normalized_path):
            return 0
        return self._contiguous_pages(normalized_path, page_count, canonical_only=True)

    def _contiguous_pages(self, normalized_path, page_count, canonical_only):
        # A completed sweep leaves a marker, and it is only written when the
        # sweep covered the whole document with no gaps and no legacy files —
        # so it settles both counts at once. That makes the common case (every
        # archive, once backfilled) one stat instead of one per page, which
        # matters because this runs per archive on the index render and the
        # pages directory lives on an SMB mount in production.
        complete = self._read_sidecar(self._rendered_marker_relative(normalized_path))
        if complete is not None and complete >= int(page_count):
            return int(page_count)

        found = 0
        for index in range(int(page_count)):
            if canonical_only:
                relative = self._page_relative_path(normalized_path, index)
                present = bool(relative) and os.path.exists(self._storage_public_path(relative))
            else:
                present = bool(self.resolve_page_relative(normalized_path, index))
            if not present:
                break
            found += 1

        return found

    def build_page_two_preview(self, file_path):
        normalized_path = self._normalized_archive_path(file_path)
        if not normalized_path:
            return ""

        return "/storage/" + normalized_path + "#page=2"

    def prewarm_archive_previews(self, file_path, max_pages=None):
        """Cover + pages. `max_pages` bounds the page sweep for the caller that
        runs inside the upload request (ArchivesController.store); the
        background sweep that follows it passes None for the whole document."""
        return {
            "cover_path": self.build_cover_preview(file_path),
            "rendered_pages": self.prewarm_archive_pages(file_path, max_pages=max_pages),
        }

    def cleanup_archive_assets(self, file_path):
        """Remove rendered pages + sidecar for this archive. Used on delete."""
        directory_relative = self._page_directory_relative(file_path)
        if not directory_relative:
            return

        directory_path = self._storage_public_path(directory_relative)
        if os.path.isdir(directory_path):
            try:
                shutil.rmtree(directory_path)
            except Exception:
                pass

    def build_archive_entry(self, archive):
        archive_date = getattr(archive, "date", None)
        archive_year = getattr(archive_date, "year", None)
        archive_id = getattr(archive, "id", None)
        archive_type = getattr(archive, "type", None) or "Archive"
        file_path = self._normalized_archive_path(getattr(archive, "file_path", "") or "")
        cover_path = self._preview_relative_path(file_path, 0)
        cover_path_exists = bool(cover_path) and os.path.exists(self._storage_public_path(cover_path))

        page_count = self.get_page_count(file_path) if file_path else 0
        slug = self._archive_slug(file_path)
        is_tabloid = "tabloid" in archive_type.lower()

        # First-spread URLs use /storage/ when the page is already rasterised
        # so the browser can cache it directly. For pages not yet rendered we
        # hand the kiosk the on-demand route, which renders + redirects.
        def page_url(page_index):
            if not file_path or page_index >= page_count or not slug:
                return ""
            existing = self.resolve_page_relative(file_path, page_index)
            if existing:
                return "/storage/" + existing
            if archive_id is not None:
                return f"/kiosk/archives/{archive_id}/pages/{page_index + 1}"
            return ""

        # Prefix the reader builds every rendered page URL from, hitting nginx
        # directly. The reader used to route ALL of its page images through
        # `page_url_base` below, i.e. a gunicorn round-trip that 302s straight
        # back here -- a Python worker per image, rate-limited at 30/min per IP
        # (the `archive-pages` limiter), and uncacheable by sw-archives.js,
        # which only caches /storage/Archives/. Pages within `prewarmed_pages`
        # are known to exist, so the client can address them without asking.
        page_storage_base = f"/storage/Archives/pages/{slug}" if slug else ""

        return {
            "id": archive_id,
            "name": getattr(archive, "name", None) or "Untitled archive",
            "type": archive_type,
            "date": archive_date,
            "year": archive_year,
            "file_path": file_path,
            "cover_path": cover_path if cover_path_exists else "",
            "cover_url": "/storage/" + cover_path if cover_path_exists else "",
            "page_two_url": "/storage/" + file_path + "#page=2" if file_path else "",
            "pdf_url": "/storage/" + file_path if file_path else "",
            "page_count": page_count,
            "is_tabloid": is_tabloid,
            "first_page_url": page_url(0),
            "second_page_url": page_url(1),
            "page_storage_base": page_storage_base,
            "page_extension": PAGE_EXTENSION,
            # How far the reader may skip the Python route entirely.
            "direct_pages": self.count_direct_pages(file_path, page_count),
            "page_url_base": f"/kiosk/archives/{archive_id}/pages" if archive_id is not None else "",
            # Tells the reader how far it can paint instantly without the PDF.
            "prewarmed_pages": self.count_prewarmed_pages(file_path, page_count),
        }

    def group_archives_by_year(self, archives):
        grouped_archives = {}

        for archive in archives:
            entry = self.build_archive_entry(archive)
            year = entry["year"]
            if year is None:
                continue

            grouped_archives.setdefault(year, []).append(entry)

        for year_entries in grouped_archives.values():
            year_entries.sort(key=lambda item: item["id"] or 0, reverse=True)

        return grouped_archives

    def extract_data(self, file_path):
        extracted_text = ""

        with fitz.open(file_path) as doc:
            for page in doc:
                extracted_text += page.get_text()

        lines = extracted_text.splitlines()

        title = next((line.strip() for line in lines if line.strip()), "Untitled Document")

        date_match = re.search(r'\b(?:January|February|March|April|May|June|July|August|September|October|November|December)[a-z]* \d{1,2}, \d{4}\b', extracted_text)
        event_date = date_match.group(0) if date_match else None

        location_match = re.search(r'Location:\s*(.*)', extracted_text)
        location = location_match.group(1).strip() if location_match else None

        description_source = extracted_text[:200].replace('\n', ' ').strip()
        description = f"{description_source}..." if description_source and len(extracted_text) > 200 else description_source or "No description available."

        return {
            "title": title,
            "description": description,
            "event_date": event_date,
            "location": location,
            "is_archive": True,
        }
