import contextlib
import os
import re
import shutil

import fitz

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


# Per-page raster zoom. Kiosk runs at 768x1024 with retina-grade DPR; this
# yields sharp text at native zoom and around 2x device pixels.
PAGE_RENDER_ZOOM = 1.8

# Number of pages eagerly rasterised on upload. Anything past this is
# rendered the moment the kiosk requests it (see ArchivesController.page).
PREWARM_PAGE_LIMIT = 20


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

    def _page_relative_path(self, file_path, page_index):
        slug = self._archive_slug(file_path)
        if not slug:
            return ""
        # 1-indexed on disk so the URL `/storage/Archives/pages/<slug>/page-1.png`
        # matches the page number a reader sees.
        return os.path.join("Archives", "pages", slug, f"page-{page_index + 1}.png").replace("\\", "/")

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
                with _group_writable_umask():
                    pixmap.save(preview_path)

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

        page_relative = self._page_relative_path(normalized_path, page_index)
        if not page_relative:
            return ""

        page_path = self._storage_public_path(page_relative)
        return self._render_preview(source_path, page_path, page_index, zoom=zoom)

    def prewarm_archive_pages(self, file_path, max_pages=PREWARM_PAGE_LIMIT, zoom=PAGE_RENDER_ZOOM):
        """Render the first `max_pages` pages in one fitz session.

        Cheaper than calling build_page_preview N times because the document
        is opened once. Also writes the page-count sidecar so the kiosk
        page-render path doesn't have to crack the PDF every visit.
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
                limit = min(doc.page_count, max_pages)
                matrix = fitz.Matrix(zoom, zoom)
                for index in range(limit):
                    page_relative = self._page_relative_path(normalized_path, index)
                    page_path = self._storage_public_path(page_relative)

                    if os.path.exists(page_path):
                        rendered.append(page_relative)
                        continue

                    self._ensure_parent_directory(page_path)
                    try:
                        page = doc.load_page(index)
                        pixmap = page.get_pixmap(matrix=matrix, alpha=False)
                        with _group_writable_umask():
                            pixmap.save(page_path)
                        if _is_under_nas(page_path):
                            try:
                                os.chmod(page_path, _NAS_FILE_MODE)
                            except OSError:
                                pass
                        rendered.append(page_relative)
                    except Exception:
                        continue
        except Exception:
            pass

        return rendered

    def _write_page_count(self, file_path, page_count):
        sidecar_relative = self._page_count_sidecar_relative(file_path)
        if not sidecar_relative:
            return

        sidecar_path = self._storage_public_path(sidecar_relative)
        self._ensure_parent_directory(sidecar_path)
        try:
            with _group_writable_umask():
                with open(sidecar_path, "w") as handle:
                    handle.write(str(int(page_count)))
            if _is_under_nas(sidecar_path):
                try:
                    os.chmod(sidecar_path, _NAS_FILE_MODE)
                except OSError:
                    pass
        except Exception:
            pass

    def get_page_count(self, file_path):
        """Page count via sidecar; falls back to fitz when missing.

        Computing the count on every archives page render adds up over many
        archives (each fitz.open touches the NAS). The sidecar is written
        at upload; for legacy archives we crack the PDF once and cache.
        """
        normalized_path = self._normalized_archive_path(file_path)
        if not normalized_path:
            return 0

        sidecar_relative = self._page_count_sidecar_relative(normalized_path)
        sidecar_path = self._storage_public_path(sidecar_relative)
        if os.path.exists(sidecar_path):
            try:
                with open(sidecar_path, "r") as handle:
                    return int((handle.read() or "").strip() or 0)
            except Exception:
                pass

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

    def build_page_two_preview(self, file_path):
        normalized_path = self._normalized_archive_path(file_path)
        if not normalized_path:
            return ""

        return "/storage/" + normalized_path + "#page=2"

    def prewarm_archive_previews(self, file_path):
        return {
            "cover_path": self.build_cover_preview(file_path),
            "rendered_pages": self.prewarm_archive_pages(file_path),
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
            page_relative = self._page_relative_path(file_path, page_index)
            page_full = self._storage_public_path(page_relative)
            if os.path.exists(page_full):
                return "/storage/" + page_relative
            if archive_id is not None:
                return f"/kiosk/archives/{archive_id}/pages/{page_index + 1}"
            return ""

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
            "page_url_base": f"/kiosk/archives/{archive_id}/pages" if archive_id is not None else "",
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
