from datetime import date, datetime
import contextlib
import os
import threading
import traceback
from masonite.controllers import Controller
from masonite.facades import Cache
from masonite.filesystem import Storage
from masonite.request import Request
from masonite.response import Response
from masonite.views import View
from app.models.Archives import Archives
from app.services.ArchiveServices import ArchiveServices, EAGER_PAGE_LIMIT
from app.services.CharterArchive import is_charter_type
from app.services.StorageRouter import absolute_path, gearsnas_base
from app.services.PublicUrl import public_url
from app.services.AjaxResponses import wants_json, json_success, json_errors
from app.services import KioskBroadcast
from app.services.FileVerificationService import FileVerificationService


# Kiosk index is read constantly and written rarely, so it is cached and invalidated on write.
_ARCHIVES_CACHE_KEY = "kiosk:archives:index"
_ARCHIVES_CACHE_TTL = 300  # safety net only; writes invalidate explicitly


# NAS files must be group-writable so SMB-mapped editors (www-data group) can manage them.
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


def _sweep_archive_pages_in_background(file_path):
    """Rasterise the remaining pages off the request thread.

    A daemon thread because the app has no queue worker. Swallows everything:
    a failed sweep degrades to on-demand rendering in page().
    """
    def run():
        try:
            ArchiveServices().prewarm_archive_pages(file_path)
        except Exception as exception:
            traceback.print_exception(type(exception), exception, exception.__traceback__)

    thread = threading.Thread(target=run, name="archive-prewarm", daemon=True)
    thread.start()
    return thread


class ArchivesController(Controller):
    def _build_archives_payload(self):
        archive_services = ArchiveServices()
        archives = Archives.order_by("id", "desc").get()
        # The charter belongs to the virtual tour; without this filter the kiosk
        # would file it under Folios (its fallback category).
        archive_entries = [
            archive_services.build_archive_entry(archive)
            for archive in archives
            if not is_charter_type(getattr(archive, "type", None))
        ]
        # Newest first: year desc, then id desc. DOM order matches coverflow order.
        archive_entries.sort(
            key=lambda entry: (entry.get("year") or 0, entry.get("id") or 0),
            reverse=True,
        )
        archive_years = sorted(
            {entry["year"] for entry in archive_entries if entry.get("year") is not None},
            reverse=True,
        )
        selected_year = archive_years[0] if archive_years else None

        # JSON-safe copy for the file cache: "date" is a raw date object.
        cache_entries = []
        for entry in archive_entries:
            cache_entry = dict(entry)
            raw_date = cache_entry.get("date")
            cache_entry["date"] = raw_date.isoformat() if hasattr(raw_date, "isoformat") else None
            cache_entries.append(cache_entry)

        return {
            "archives": cache_entries,
            "archive_years": archive_years,
            "selected_year": selected_year,
        }

    def _cached_payload(self):
        return Cache.remember(_ARCHIVES_CACHE_KEY, lambda cache: cache.put(
            _ARCHIVES_CACHE_KEY, self._build_archives_payload(), seconds=_ARCHIVES_CACHE_TTL
        ))

    def _render_index(self, view: View, template, extra=None):
        payload = self._cached_payload()

        context = {
            "archives": payload["archives"],
            "archive_years": payload["archive_years"],
            "selected_year": payload["selected_year"],
            "active_nav": "archives",
        }
        context.update(extra or {})

        return view.render(template, context)

    def show(self, view: View):
        # QR handoff URL is built from APP_URL, not the request host, so the phone can reach it.
        return self._render_index(
            view,
            "kiosk/archives",
            {"mobile_archives_url": public_url("/m/archives")},
        )

    def mobile(self, view: View):
        # Same payload and cache entry as the kiosk, phone-sized template.
        return self._render_index(view, "mobile/archives")

    def store(self, request: Request, storage: Storage, response: Response):
        # Failures redirect to the dashboard GET, not back(): the form posts to a
        # POST-only URL, so back() would 405.
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

        archive_file = request.input("file")
        if isinstance(archive_file, list):
            archive_file = archive_file[0] if archive_file else None

        if not archive_file:
            return _err(["Please upload a PDF file."])

        if archive_file.extension().lower() not in ("pdf", ".pdf"):
            return _err(["The uploaded file must be a PDF."])

        year_value = (request.input("year_published") or request.input("date") or "").strip()

        if not year_value:
            return _err(["Year published is required."])

        try:
            published_year = int(year_value[:4])
            archive_date = date(published_year, 1, 1)
        except (TypeError, ValueError):
            return _err(["Year published must be a valid year."])

        try:
            # PDFs live on the NAS under Archives/ so editors can manage them over SMB.
            archives_root = os.path.join(gearsnas_base(), "Archives")
            try:
                os.makedirs(archives_root, mode=_NAS_DIR_MODE, exist_ok=True)
                os.chmod(archives_root, _NAS_DIR_MODE)
            except OSError:
                pass

            with _group_writable_umask():
                file_path = storage.disk("gearsnas").put_file("Archives", archive_file)

            try:
                os.chmod(absolute_path(file_path), _NAS_FILE_MODE)
            except OSError:
                pass

            if not FileVerificationService.verify_file_type(absolute_path(file_path), "pdf"):
                try:
                    storage.disk("gearsnas").delete(file_path)
                except Exception:
                    pass
                return _err(["The uploaded file is not a valid PDF."])

            archive = Archives.create(
                name=(request.input("name") or "").strip(),
                type=(request.input("type") or "").strip(),
                date=archive_date,
                file_path=file_path,
            )

            archive_services = ArchiveServices()
            # Cover and opening pages inline; the rest sweep in the background.
            archive_services.prewarm_archive_previews(file_path, max_pages=EAGER_PAGE_LIMIT)
            _sweep_archive_pages_in_background(file_path)

            Cache.forget(_ARCHIVES_CACHE_KEY)
            # After the eager pre-warm, so a kiosk refresh opens onto readable pages.
            KioskBroadcast.section_changed("gears-archive")

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
        # resolve_page_relative finds legacy .png pages too, so they are not re-rendered.
        page_relative = archive_services.resolve_page_relative(file_path, page_index)
        if not page_relative:
            archive_services.build_page_preview(file_path, page_index)
            page_relative = archive_services.resolve_page_relative(file_path, page_index)

        if not page_relative:
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

            Cache.forget(_ARCHIVES_CACHE_KEY)
            KioskBroadcast.section_changed("gears-archive")

            if is_ajax:
                return json_success(response, messages=["Archive deleted successfully."])
            return response.redirect(name="gears.dashboard", query_params={"page": "archives"}).with_success([
                "Archive deleted successfully.",
            ])
        except Exception as exception:
            traceback.print_exception(type(exception), exception, exception.__traceback__)
            return _err(["Could not delete the archive. Please try again."], status=500)
