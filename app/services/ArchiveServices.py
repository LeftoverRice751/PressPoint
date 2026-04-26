import os
import re

import fitz

from masonite.utils.location import base_path

class ArchiveServices:
    def _storage_public_path(self, relative_path):
        return base_path(os.path.join("storage/framework/public", str(relative_path).replace("\\", "/")))

    def _ensure_parent_directory(self, file_path):
        parent_directory = os.path.dirname(file_path)
        if parent_directory:
            os.makedirs(parent_directory, exist_ok=True)

    def build_cover_preview(self, file_path):
        normalized_path = str(file_path or "").replace("\\", "/").lstrip("/")
        if not normalized_path:
            return ""

        source_path = self._storage_public_path(normalized_path)
        if not os.path.exists(source_path):
            return ""

        cover_name = os.path.splitext(os.path.basename(normalized_path))[0] + ".png"
        cover_relative_path = os.path.join("archives-covers", cover_name).replace("\\", "/")
        cover_path = self._storage_public_path(cover_relative_path)

        if os.path.exists(cover_path):
            return cover_relative_path

        self._ensure_parent_directory(cover_path)

        try:
            with fitz.open(source_path) as doc:
                if doc.page_count <= 0:
                    return ""

                page = doc.load_page(0)
                pixmap = page.get_pixmap(matrix=fitz.Matrix(1.8, 1.8), alpha=False)
                pixmap.save(cover_path)

            return cover_relative_path
        except Exception:
            return ""

    def build_archive_entry(self, archive):
        archive_date = getattr(archive, "date", None)
        archive_year = getattr(archive_date, "year", None)
        file_path = getattr(archive, "file_path", "") or ""
        cover_path = self.build_cover_preview(file_path)

        return {
            "id": getattr(archive, "id", None),
            "name": getattr(archive, "name", None) or "Untitled archive",
            "type": getattr(archive, "type", None) or "Archive",
            "date": archive_date,
            "year": archive_year,
            "file_path": file_path,
            "cover_path": cover_path,
            "cover_url": "/storage/" + cover_path if cover_path else "",
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