from datetime import date, datetime
import contextlib
import random
import os
import traceback
from masonite.controllers import Controller
from masonite.filesystem import Storage
from masonite.request import Request
from masonite.response import Response
from masonite.views import View
from app.models.Archives import Archives
from app.services.ArchiveServices import ArchiveServices
from app.services.StorageRouter import absolute_path, gearsnas_base
from app.services.AjaxResponses import wants_json, json_success, json_errors


# Files written to the NAS need to be group-writable so the web user and
# the SMB-mapped editor accounts (both in the `www-data` group) can both
# manage them. Default umask 022 produces 0644 files and 0755 dirs, which
# locks editors out and surfaces as "permission denied" the next time
# anything on the share touches the upload.
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
                "active_nav": "archives",
            },
        )
    
    def store(self, request: Request, storage: Storage, response: Response):
        # Failures redirect to the dashboard GET route, not `back()`. The
        # form posts to /archives/dashboard, which is POST-only — without an
        # explicit __back hidden field, response.back() would 302 to that
        # POST-only URL and the browser's follow-up GET hits a 405.
        is_ajax = wants_json(request)

        archives_dashboard = lambda: response.redirect(
            name="gears.dashboard", query_params={"page": "archives"}
        )

        def _err(messages):
            if is_ajax:
                return json_errors(response, messages)
            return archives_dashboard().with_errors(messages)

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
            return _err(["Year published is required."])

        try:
            published_year = int(year_value[:4])
            archive_date = date(published_year, 1, 1)
        except (TypeError, ValueError):
            return _err(["Year published must be a valid year."])

        try:
            # Archive PDFs live on GearsNAS under /Archives so the Gears
            # editors can see/manage them via SMB. The returned path is
            # already prefixed with "Archives/" — store it verbatim.
            archives_root = os.path.join(gearsnas_base(), "Archives")
            try:
                os.makedirs(archives_root, mode=_NAS_DIR_MODE, exist_ok=True)
                os.chmod(archives_root, _NAS_DIR_MODE)
            except OSError:
                pass

            with _group_writable_umask():
                file_path = storage.disk("gearsnas").put_file("Archives", file)

            try:
                os.chmod(absolute_path(file_path), _NAS_FILE_MODE)
            except OSError:
                pass

            archive = Archives.create(
                name=(request.input("name") or "").strip(),
                type=(request.input("type") or "").strip(),
                date=archive_date,
                file_path=file_path,
            )

            archive_services = ArchiveServices()
            archive_services.prewarm_archive_previews(file_path)

            if is_ajax:
                return json_success(response, payload={
                    "archive": {
                        "id": getattr(archive, "id", None),
                        "name": (request.input("name") or "").strip(),
                        "type": (request.input("type") or "").strip(),
                        "year": published_year,
                        "file_path": file_path,
                    }
                }, messages=["Archive saved successfully."])

            return response.redirect(name="gears.dashboard", query_params={"page": "archives"}).with_success([
                "Archive saved successfully.",
            ])
        except Exception as exception:
            traceback.print_exception(type(exception), exception, exception.__traceback__)
            return _err(["Could not save the archive. Please try again."])

    def page(self, request: Request, response: Response):
        archive_id_value = str(request.param("id") or "").strip()
        page_value = str(request.param("page") or "").strip()

        if not archive_id_value.isdigit() or not page_value.isdigit():
            return response.view("Not found", status=404)

        archive = Archives.find(int(archive_id_value))
        if not archive:
            return response.view("Not found", status=404)

        page_number = int(page_value)
        if page_number < 1:
            return response.view("Not found", status=404)

        archive_services = ArchiveServices()
        file_path = archive_services._normalized_archive_path(getattr(archive, "file_path", "") or "")
        if not file_path:
            return response.view("Not found", status=404)

        page_index = page_number - 1
        page_relative = archive_services._page_relative_path(file_path, page_index)
        if not page_relative:
            return response.view("Not found", status=404)

        page_full = archive_services._storage_public_path(page_relative)
        if not os.path.exists(page_full):
            archive_services.build_page_preview(file_path, page_index)

        if not os.path.exists(page_full):
            return response.view("Not found", status=404)

        # Hand the storage path back so the browser can cache it directly.
        return response.redirect("/storage/" + page_relative)

    def destroy(self, request: Request, storage: Storage, response: Response):
        is_ajax = wants_json(request)
        archives_dashboard = lambda: response.redirect(
            name="gears.dashboard", query_params={"page": "archives"}
        )

        def _err(messages, status=400):
            if is_ajax:
                return json_errors(response, messages, status=status)
            return archives_dashboard().with_errors(messages)

        archive_id_value = str(request.param("id") or "").strip()

        if not archive_id_value or not archive_id_value.isdigit():
            return _err(["Please choose a valid archive to delete."])

        archive = Archives.find(int(archive_id_value))
        if not archive:
            return _err(["Please choose a valid archive to delete."], status=404)

        try:
            archive_services = ArchiveServices()
            archive_entry = archive_services.build_archive_entry(archive)

            file_path = archive_entry.get("file_path")
            cover_path = archive_entry.get("cover_path")
            legacy_page_two_path = archive_services._preview_relative_path(file_path, 1) if file_path else ""

            def delete_if_exists(relative_path):
                if not relative_path:
                    return

                full_path = archive_services._storage_public_path(relative_path)
                if os.path.exists(full_path):
                    try:
                        storage.disk("gearsnas").delete(relative_path)
                    except Exception as exception:
                        traceback.print_exception(type(exception), exception, exception.__traceback__)

            delete_if_exists(file_path)
            delete_if_exists(cover_path)
            delete_if_exists(legacy_page_two_path)
            try:
                archive_services.cleanup_archive_assets(file_path)
            except Exception as exception:
                traceback.print_exception(type(exception), exception, exception.__traceback__)

            archive.delete()

            if is_ajax:
                return json_success(response, messages=["Archive deleted successfully."])
            return response.redirect(name="gears.dashboard", query_params={"page": "archives"}).with_success([
                "Archive deleted successfully.",
            ])
        except Exception as exception:
            traceback.print_exception(type(exception), exception, exception.__traceback__)
            return _err(["Could not delete the archive. Please try again."], status=500)
