from datetime import date, datetime
import random
import traceback

from masonite.controllers import Controller
from masonite.filesystem import Storage
from masonite.request import Request
from masonite.response import Response
from masonite.views import View

from app.models.Archives import Archives
from app.services.ArchiveServices import ArchiveServices


class ArchivesController(Controller):
    def show(self, view: View):
        archive_services = ArchiveServices()
        archives = sorted(list(Archives.all() or []), key=lambda item: getattr(item, "id", 0), reverse=True)
        archive_entries = [archive_services.build_archive_entry(archive) for archive in archives]
        archive_years = sorted(
            {entry["year"] for entry in archive_entries if entry.get("year") is not None},
            reverse=True,
        )
        selected_year = random.choice(archive_years) if archive_years else None

        return view.render(
            "kiosk/archives",
            {
                "archives": archive_entries,
                "archive_years": archive_years,
                "selected_year": selected_year,
            },
        )
    
    def store(self, request: Request, storage: Storage, response: Response):
        request.validate({
            "name": "required",
            "type": "required",
            "year_published": "required",
            "file": "required|file"
        })

        file = request.input("file")
        if isinstance(file, list):
            file = file[0] if file else None

        year_value = (request.input("year_published") or request.input("date") or "").strip()

        if not year_value:
            return response.back().with_errors([
                "Year published is required.",
            ])

        try:
            published_year = int(year_value[:4])
            archive_date = date(published_year, 1, 1)
        except (TypeError, ValueError):
            return response.back().with_errors([
                "Year published must be a valid year.",
            ])

        try:
            file_path = storage.disk("public").put_file("archives", file)

            Archives.create(
                name=(request.input("name") or "").strip(),
                type=(request.input("type") or "").strip(),
                date=archive_date,
                file_path=file_path,
            )

            archive_services = ArchiveServices()
            archive_services.build_cover_preview(file_path)

            return response.redirect(name="gears.dashboard", query_params={"page": "archives"}).with_success([
                "Archive saved successfully.",
            ])
        except Exception as exception:
            traceback.print_exception(type(exception), exception, exception.__traceback__)
            return response.back().with_errors([
                "Could not save the archive. Please try again.",
            ])
