import os
import re

import fitz

from masonite.utils.location import base_path

class ArchiveServices:
    def _storage_public_path(self, relative_path):
        return base_path(os.path.join("storage/framework/public", str(relative_path).replace("\\", "/")))

    def _normalized_archive_path(self, file_path):
        return str(file_path or "").replace("\\", "/").lstrip("/")

    def _preview_relative_path(self, file_path, page_number):
        normalized_path = self._normalized_archive_path(file_path)
        if not normalized_path:
            return ""

        base_name = os.path.splitext(os.path.basename(normalized_path))[0]
        suffix = "cover" if page_number == 0 else f"page-{page_number + 1}"
        return os.path.join("archives-covers", f"{base_name}-{suffix}.png").replace("\\", "/")

    def _ensure_parent_directory(self, file_path):
        parent_directory = os.path.dirname(file_path)
        if parent_directory:
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
                pixmap.save(preview_path)

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

    def build_page_two_preview(self, file_path):
        normalized_path = self._normalized_archive_path(file_path)
        if not normalized_path:
            return ""

        return "/storage/" + normalized_path + "#page=2"

    def prewarm_archive_previews(self, file_path):
        return {
            "cover_path": self.build_cover_preview(file_path),
        }

    def build_archive_entry(self, archive):
        archive_date = getattr(archive, "date", None)
        archive_year = getattr(archive_date, "year", None)
        file_path = self._normalized_archive_path(getattr(archive, "file_path", "") or "")
        cover_path = self._preview_relative_path(file_path, 0)
        cover_path_exists = bool(cover_path) and os.path.exists(self._storage_public_path(cover_path))

        return {
            "id": getattr(archive, "id", None),
            "name": getattr(archive, "name", None) or "Untitled archive",
            "type": getattr(archive, "type", None) or "Archive",
            "date": archive_date,
            "year": archive_year,
            "file_path": file_path,
            "cover_path": cover_path if cover_path_exists else "",
            "cover_url": "/storage/" + cover_path if cover_path_exists else "",
            "page_two_url": "/storage/" + file_path + "#page=2" if file_path else "",
            "pdf_url": "/storage/" + file_path if file_path else "",
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