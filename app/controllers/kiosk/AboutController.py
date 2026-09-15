"""AboutController — kiosk + editor surfaces for the About LSPU page."""

import json
import os

from masonite.controllers import Controller
from masonite.request import Request
from masonite.response import Response
from masonite.views import View

from app.models.AboutMilestone import AboutMilestone
from app.models.AboutSection import AboutSection
from app.services import AboutValues, KioskBroadcast
from app.services.AboutContent import (
    AboutContent,
    EDITABLE_SLUGS,
    PAGE_SLUG,
    SECTION_SLUGS,
)
from app.services.AjaxResponses import wants_json, json_success, json_errors
from app.services.StorageRouter import gearsnas_base
from app.services.FileVerificationService import FileVerificationService
from app.services.ImageUploads import save_uploaded_image


_SEAL_NAS_SUBDIR = "About"
_MILESTONE_NAS_SUBDIR = "About/milestones"
MAX_AUDIO_BYTES = 20 * 1024 * 1024

# The hymn video is buffered whole in memory before it is written, and
# production runs five gunicorn processes against one box, so this cap is a
# memory guard rather than a disk one. 100 MB is a comfortable 720p hymn.
MAX_VIDEO_BYTES = 100 * 1024 * 1024

# Narrower than FileVerificationService's shared "video" set, which also allows
# .mov and .ogg. Those upload and verify happily and then fail to decode in the
# kiosk browser, and a video that does not decode reports nothing at all -- the
# pane just shows a black rectangle. Rejecting at upload time is the only point
# where anyone is around to read the error.
HYMN_VIDEO_EXTENSIONS = (".mp4", ".webm", ".m4v")


def _drop_stale_hymn_videos(nas_dir, keep):
    """Delete the previous hymn video when a re-upload changed the container.

    The stored name carries the extension, so uploading a .webm over a .mp4
    writes a second file and `video_path` points at only one of them. Nothing in
    the dashboard lists the NAS folder, so the loser is invisible -- and at up
    to MAX_VIDEO_BYTES each they accumulate silently. Only the names this
    endpoint itself writes are candidates, and a failure here must never fail an
    upload that already succeeded.
    """
    for ext in HYMN_VIDEO_EXTENSIONS:
        name = f"hymn_video{ext}"
        if name == keep:
            continue
        try:
            os.remove(os.path.join(nas_dir, name))
        except OSError:
            pass


def _about_changed():
    # Every About write ends here. The kiosk's About page is served
    # stale-while-revalidate by sw-kiosk.js, so without this a saved section
    # would show up one visit late.
    KioskBroadcast.section_changed("about-lspu")


def _editor_redirect(response: Response):
    """Helper: every editor save endpoint redirects back to the editor page."""
    return response.redirect(name="gears.dashboard", query_params={"page": "about-lspu"})


class AboutController(Controller):
    # ===== Kiosk =====

    def kiosk(self, view: View):
        data = AboutContent.load_all()
        sections = data["sections"]

        # The kiosk lays these sections out as structured objects (a values
        # strip, an acrostic grid, a pull quote, sung lines) while the editor
        # authors them as free Quill HTML. AboutValues derives the shapes; each
        # one degrades to empty and the template falls back to the raw HTML, so
        # reformatting in the editor never breaks the pane.
        values = sections.get("values")
        value_subs = (values.subsections or []) if values else []
        core_html = value_subs[0].get("body_html") if len(value_subs) > 0 else ""
        pledge_html = value_subs[1].get("body_html") if len(value_subs) > 1 else ""

        quality = sections.get("quality")
        statement, support = AboutValues.split_statement(
            quality.body_html if quality else ""
        )

        hymn = sections.get("hymn")

        return view.render(
            "kiosk/about-lspu",
            {
                "sections": sections,
                "ordered_slugs": data["ordered_slugs"],
                "milestones": data["milestones"],
                "active_nav": "about",
                "group_values": AboutValues.group_values(core_html),
                "core_acrostic": AboutValues.acrostic(core_html, "STUDENTS"),
                "pledge_lines": AboutValues.pledge_lines(pledge_html),
                "core_html": core_html,
                "pledge_html": pledge_html,
                "quality_statement": statement,
                "quality_support": support,
                "hymn_lines": AboutValues.hymn_lines(hymn.body_html if hymn else ""),
                # Short display copy (hub hero, index hints, section chrome, and
                # the seal callouts) comes from each row's `meta`, falling back
                # to AboutContent.DEFAULT_META. It used to be a `tile_meta`
                # literal in the template and a constant in this file, so a typo
                # on the kiosk needed a deploy to fix.
                "tile_meta": data["meta"],
                "page": data["page"],
                "seal_hotspots": data["meta"]["seal"].get("hotspots") or [],
            },
        )

    # ===== Editor =====

    def editor(self, response: Response):
        return response.redirect(name="gears.dashboard", query_params={"page": "about-lspu"})

    def save_section(self, slug, request: Request, response: Response):
        if slug not in EDITABLE_SLUGS:
            if wants_json(request):
                return json_errors(response, ["Unknown section."])
            return _editor_redirect(response).with_errors(["Unknown section."])

        section = AboutSection.where("slug", slug).first()
        if not section and slug == PAGE_SLUG:
            # The six section rows are seeded; the hub row was introduced with
            # `meta` and has no seed behind it on an existing install, so create
            # it on first save rather than making the migration carry data.
            section = AboutSection.create({"slug": PAGE_SLUG, "title": "About LSPU"})
        if not section:
            if wants_json(request):
                return json_errors(response, ["Section not found."])
            return _editor_redirect(response).with_errors(["Section not found."])

        raw_meta = request.input("meta")
        if raw_meta:
            try:
                parsed_meta = json.loads(raw_meta)
            except (TypeError, ValueError):
                parsed_meta = None
            if parsed_meta is not None:
                # Merge, don't replace: each editor form posts only the keys it
                # renders, and the seal's two forms both target this endpoint.
                merged = dict(section.meta or {})
                merged.update(AboutContent.sanitize_meta(slug, parsed_meta))
                section.meta = merged

        # Only touch a body field the posted form actually carries. The seal tab
        # now has three forms (image, description, callouts) all aimed at this
        # endpoint, so a blind `input("body_html") or ""` would let the callout
        # save blank the description it never rendered.
        if slug in ("mission", "values"):
            raw = request.input("subsections", None)
            if raw is not None:
                try:
                    parsed = json.loads(raw or "[]")
                except (TypeError, ValueError):
                    parsed = []
                section.subsections = AboutContent.sanitize_subsections(parsed)
                section.body_html = None
        elif slug != PAGE_SLUG:
            # The hub row is hero copy in `meta` and has no body of its own.
            raw_body = request.input("body_html", None)
            if raw_body is not None:
                section.body_html = AboutContent.sanitize_html(raw_body)

        # Tap-to-sync timings ride on the hymn's lyrics form -- they are matched
        # to lines by index, so they must land in the same save as the text.
        # Same rule as the body: only a form that rendered the widget posts the
        # field, so the audio/video upload forms cannot blank it.
        if slug == "hymn":
            raw_timings = request.input("lyric_timings", None)
            if raw_timings is not None:
                try:
                    parsed_timings = json.loads(raw_timings or "[]")
                except (TypeError, ValueError):
                    parsed_timings = []
                section.lyric_timings = AboutContent.sanitize_lyric_timings(parsed_timings)

        title = (request.input("title") or section.title).strip()
        if title:
            section.title = title[:150]

        try:
            user = request.user() if callable(getattr(request, "user", None)) else None
            section.updated_by_id = getattr(user, "id", None)
        except Exception:
            section.updated_by_id = None

        section.save()
        _about_changed()
        if wants_json(request):
            return json_success(response, messages=["Section saved."])
        return _editor_redirect(response).with_success(["Section saved."])

    # ===== Milestones =====

    def create_milestone(self, request: Request, response: Response):
        year = (request.input("year") or "").strip()[:20]
        heading = (request.input("heading") or "").strip()[:200]
        body_html = AboutContent.sanitize_html(request.input("body_html") or "")
        if not year or not heading:
            return _editor_redirect(response).with_errors(
                ["Year and heading are required."]
            )

        image_path = None
        file = request.input("file")
        if isinstance(file, list):
            file = file[0] if file else None
        if file:
            image_path, err = save_uploaded_image(file, _MILESTONE_NAS_SUBDIR, "milestone")
            if err:
                if wants_json(request):
                    return json_errors(response, [err])
                return _editor_redirect(response).with_errors([err])

        last = AboutMilestone.order_by("sort_order", "desc").first()
        next_order = (getattr(last, "sort_order", 0) or 0) + 1

        m = AboutMilestone.create({
            "year": year,
            "heading": heading,
            "body_html": body_html,
            "image_path": image_path,
            "sort_order": next_order,
        })
        _about_changed()
        if wants_json(request):
            return json_success(response, payload={
                "milestone": {"id": m.id, "year": m.year, "heading": m.heading}
            }, messages=["Milestone added."])
        return _editor_redirect(response).with_success(["Milestone added."])

    def update_milestone(self, id, request: Request, response: Response):
        row = AboutMilestone.where("id", id).first()
        if not row:
            return _editor_redirect(response).with_errors(["Milestone not found."])

        year = (request.input("year") or "").strip()[:20]
        heading = (request.input("heading") or "").strip()[:200]
        if year:
            row.year = year
        if heading:
            row.heading = heading
        body_html = request.input("body_html")
        if body_html is not None:
            row.body_html = AboutContent.sanitize_html(body_html)

        # Optional image upload swap-in. The endpoint has always accepted this;
        # the dashboard grew the file input alongside it, so a milestone photo
        # on the kiosk's history pager is now editable rather than seed-only.
        file = request.input("file")
        if isinstance(file, list):
            file = file[0] if file else None
        if file:
            relative, err = save_uploaded_image(file, _MILESTONE_NAS_SUBDIR, "milestone")
            if err:
                if wants_json(request):
                    return json_errors(response, [err])
                return _editor_redirect(response).with_errors([err])
            row.image_path = relative
        elif str(request.input("remove_image") or "").strip() in ("1", "true", "on"):
            row.image_path = None

        row.save()
        _about_changed()
        if wants_json(request):
            return json_success(response, messages=["Milestone updated."])
        return _editor_redirect(response).with_success(["Milestone updated."])

    def delete_milestone(self, id, request: Request, response: Response):
        row = AboutMilestone.where("id", id).first()
        if row:
            row.delete()
            _about_changed()
        if wants_json(request):
            return json_success(response, payload={"id": int(id)}, messages=["Milestone removed."])
        return _editor_redirect(response).with_success(["Milestone removed."])

    def reorder_milestone(self, id, request: Request, response: Response):
        # direction = 'up' (smaller sort_order) or 'down' (larger).
        # Swap sort_order with the adjacent neighbour.
        direction = (request.input("direction") or "").strip()
        row = AboutMilestone.where("id", id).first()
        if not row or direction not in ("up", "down"):
            return _editor_redirect(response).with_errors(["Cannot reorder."])

        comparator = "<" if direction == "up" else ">"
        order_dir = "desc" if direction == "up" else "asc"
        neighbour = (
            AboutMilestone.where("sort_order", comparator, row.sort_order)
                          .order_by("sort_order", order_dir)
                          .first()
        )
        if neighbour:
            row.sort_order, neighbour.sort_order = neighbour.sort_order, row.sort_order
            row.save()
            neighbour.save()
            _about_changed()
        if wants_json(request):
            return json_success(response, messages=["Order updated."])
        return _editor_redirect(response).with_success(["Order updated."])

    # ===== Seal image =====

    def upload_seal(self, request: Request, response: Response):
        file = request.input("file")
        stored_path, err = save_uploaded_image(file, _SEAL_NAS_SUBDIR, "seal")
        is_ajax = wants_json(request)
        if err:
            if is_ajax:
                return json_errors(response, [err])
            return _editor_redirect(response).with_errors([err])

        section = AboutSection.where("slug", "seal").first()
        if section:
            section.image_path = stored_path
            section.save()
            _about_changed()

        if is_ajax:
            return json_success(response, payload={
                "seal_url": "/storage/" + stored_path.replace("\\", "/")
            }, messages=["Seal image uploaded."])

        return _editor_redirect(response).with_success(["Seal image uploaded."])

    def upload_hymn_audio(self, request: Request, response: Response):
        file = request.input("file")
        if isinstance(file, list):
            file = file[0] if file else None

        if not file:
            err = "No audio file provided."
            if wants_json(request):
                return json_errors(response, [err])
            return _editor_redirect(response).with_errors([err])

        # Masonite file objects expose .filename, not .mime_type — use extension.
        raw_filename = getattr(file, "filename", "") or ""
        ext = os.path.splitext(raw_filename)[1].lower()
        if hasattr(file, "extension") and callable(file.extension):
            ext = (file.extension() or ext).lower()
        if ext and not ext.startswith("."):
            ext = "." + ext

        if not FileVerificationService.verify_extension(ext, "audio"):
            err = "Upload must be an MP3, OGG, WAV, or M4A audio file."
            if wants_json(request):
                return json_errors(response, [err])
            return _editor_redirect(response).with_errors([err])

        # stream() is a callable in Masonite, not a plain property.
        content = getattr(file, "content", None)
        if content is None and hasattr(file, "stream") and callable(file.stream):
            s = file.stream()
            content = s.read() if hasattr(s, "read") else s
        if not content:
            err = "Could not read uploaded file."
            if wants_json(request):
                return json_errors(response, [err])
            return _editor_redirect(response).with_errors([err])
        if len(content) > MAX_AUDIO_BYTES:
            err = "Audio file must be 20 MB or smaller."
            if wants_json(request):
                return json_errors(response, [err])
            return _editor_redirect(response).with_errors([err])

        nas_dir = os.path.join(gearsnas_base(), "About")
        filename = f"hymn_audio{ext}"
        target = os.path.join(nas_dir, filename)

        old_mask = os.umask(0o002)
        try:
            os.makedirs(nas_dir, mode=0o775, exist_ok=True)
            with open(target, "wb") as fh:
                fh.write(content)
            os.chmod(target, 0o664)
        finally:
            os.umask(old_mask)

        relative = f"About/{filename}"
        section = AboutSection.where("slug", "hymn").first()
        if section:
            section.audio_path = relative
            section.save()
            _about_changed()

        if wants_json(request):
            return json_success(response, messages=["Hymn audio uploaded."])
        return _editor_redirect(response).with_success(["Hymn audio uploaded."])

    def upload_hymn_video(self, request: Request, response: Response):
        """The hymn's video, which the kiosk prefers over the audio file.

        Gated twice on purpose. The extension allowlist is what keeps the
        stored *name* safe -- nginx serves About/ directly and derives
        Content-Type from the extension, so a stored .html would come back as
        markup on this origin (the escalation documented in
        tests/unit/test_upload_extension_binding.py). The libmagic check is what
        keeps the stored *bytes* honest, since the filename comes from the
        browser and the editor is only an `auth` role away from an admin.
        """
        file = request.input("file")
        if isinstance(file, list):
            file = file[0] if file else None

        def fail(message):
            if wants_json(request):
                return json_errors(response, [message])
            return _editor_redirect(response).with_errors([message])

        if not file:
            return fail("No video file provided.")

        # Masonite file objects expose .filename, not .mime_type -- use extension.
        raw_filename = getattr(file, "filename", "") or ""
        ext = os.path.splitext(raw_filename)[1].lower()
        if hasattr(file, "extension") and callable(file.extension):
            ext = (file.extension() or ext).lower()
        if ext and not ext.startswith("."):
            ext = "." + ext

        if ext not in HYMN_VIDEO_EXTENSIONS:
            return fail("Upload must be an MP4, WEBM, or M4V video file.")

        # stream() is a callable in Masonite, not a plain property.
        content = getattr(file, "content", None)
        if content is None and hasattr(file, "stream") and callable(file.stream):
            s = file.stream()
            content = s.read() if hasattr(s, "read") else s
        if not content:
            return fail("Could not read uploaded file.")
        if len(content) > MAX_VIDEO_BYTES:
            return fail("Video file must be 100 MB or smaller.")
        if not FileVerificationService.verify_buffer(content, "video"):
            return fail("That file is not a playable video.")

        nas_dir = os.path.join(gearsnas_base(), "About")
        filename = f"hymn_video{ext}"
        target = os.path.join(nas_dir, filename)

        old_mask = os.umask(0o002)
        try:
            os.makedirs(nas_dir, mode=0o775, exist_ok=True)
            with open(target, "wb") as fh:
                fh.write(content)
            os.chmod(target, 0o664)
            _drop_stale_hymn_videos(nas_dir, filename)
        finally:
            os.umask(old_mask)

        relative = f"About/{filename}"
        section = AboutSection.where("slug", "hymn").first()
        if section:
            section.video_path = relative
            section.save()
            _about_changed()

        if wants_json(request):
            return json_success(response, messages=["Hymn video uploaded."])
        return _editor_redirect(response).with_success(["Hymn video uploaded."])
