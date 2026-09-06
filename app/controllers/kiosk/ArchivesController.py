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
from app.services.FileVerificationService import FileVerificationService


# Public kiosk index is read constantly (every kiosk device, plus visitors)
# but written rarely (an editor publishing/deleting an archive), so it's
# cached and explicitly invalidated on write rather than re-scanning the
# whole table + re-touching the NAS filesystem on every single request.
_ARCHIVES_CACHE_KEY = "kiosk:archives:index"
_ARCHIVES_CACHE_TTL = 300  # seconds — safety net only; writes invalidate explicitly.


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


def _sweep_archive_pages_in_background(file_path):
    """Rasterise the rest of an archive off the request thread.

    Every page of an archive is rendered server-side so the kiosk never has to
    fall back to rasterising from the PDF itself (see
    ArchiveServices.prewarm_archive_pages). For a 180-page issue that is ~70s
    of CPU, which no editor should spend watching an upload spinner — so the
    request renders only the first EAGER_PAGE_LIMIT pages and this finishes the
    job afterwards.

    A plain daemon thread, matching app/providers/RosFusionProvider.py: this app
    has no queue worker (config/queue.py is the `async` driver and nothing
    consumes it). It swallows everything — a failed sweep degrades to the
    on-demand route in page() below, and must never take a gunicorn worker with
    it.
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
        # The citizen's charter is an ordinary archive row (type "charter") so
        # that editors upload it through this same form, but it is not part of
        # the publication back-catalogue and belongs to the virtual tour, which
        # opens it from its 3D model. It has to be filtered *out* explicitly:
        # kiosk-archives.js treats "folio" as the fallback category (anything
        # not tabloid/magazine/newsletter), so a charter would otherwise appear
        # under Folios — and, since both surfaces share this payload builder,
        # on the phone as well.
        archive_entries = [
            archive_services.build_archive_entry(archive)
            for archive in archives
            if not is_charter_type(getattr(archive, "type", None))
        ]
        # Newest first, deterministically: year desc, then upload id desc.
        # DOM order then matches coverflow order with no client-side sorting.
        archive_entries.sort(
            key=lambda entry: (entry.get("year") or 0, entry.get("id") or 0),
            reverse=True,
        )
        archive_years = sorted(
            {entry["year"] for entry in archive_entries if entry.get("year") is not None},
            reverse=True,
        )
        selected_year = archive_years[0] if archive_years else None

        # JSON-safe copy for the cache: build_archive_entry()'s "date" is a
        # raw date object, which json.dumps() (used by the file cache driver)
        # can't serialize. The kiosk template never reads this field (only
        # the derived "year"), so converting it here is safe and doesn't
        # touch build_archive_entry() itself — every other caller of that
        # method (the dashboard, destroy()) is unaffected.
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
        # The kiosk offers a QR handoff to the phone page. Built from APP_URL,
        # never the request host -- the scanning phone is not on the kiosk's
        # network path. See app/services/PublicUrl.py.
        return self._render_index(
            view,
            "kiosk/archives",
            {"mobile_archives_url": public_url("/m/archives")},
        )

    def mobile(self, view: View):
        # Same data, same cache entry, different skin. The kiosk template is
        # laid out for a 768x1024 terminal; this one is for a phone held in
        # one hand. Keeping both on one payload builder means an editor's
        # upload can never appear on one surface and not the other.
        return self._render_index(view, "mobile/archives")

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
            # Cover + the opening pages inline so the archive is readable the
            # moment the card appears; the remaining pages follow in the
            # background. Both write to the same NAS directory, and
            # prewarm_archive_pages() skips pages that already exist, so the
            # overlap between the two is free.
            archive_services.prewarm_archive_previews(file_path, max_pages=EAGER_PAGE_LIMIT)
            _sweep_archive_pages_in_background(file_path)

            Cache.forget(_ARCHIVES_CACHE_KEY)

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
        # resolve_page_relative, not _page_relative_path: an archive uploaded
        # before the WebP switch still has .png pages on the NAS and must not
        # be re-rendered on every request.
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

            if is_ajax:
                return json_success(response, messages=["Archive deleted successfully."])
            return response.redirect(name="gears.dashboard", query_params={"page": "archives"}).with_success([
                "Archive deleted successfully.",
            ])
        except Exception as exception:
            traceback.print_exception(type(exception), exception, exception.__traceback__)
            return _err(["Could not delete the archive. Please try again."], status=500)
