"""AboutController — kiosk + editor surfaces for the About LSPU page."""

import json
import os
import secrets

from masonite.controllers import Controller
from masonite.request import Request
from masonite.response import Response
from masonite.views import View

from app.models.AboutMilestone import AboutMilestone
from app.models.AboutSection import AboutSection
from app.services.AboutContent import AboutContent, SECTION_SLUGS
from app.services.AjaxResponses import wants_json, json_success, json_errors
from app.services.StorageRouter import gearsnas_base
from app.services.FileVerificationService import FileVerificationService


MAX_IMAGE_BYTES = 4 * 1024 * 1024
_SEAL_NAS_SUBDIR = "About"
_MILESTONE_NAS_SUBDIR = "About/milestones"
MAX_AUDIO_BYTES = 20 * 1024 * 1024


def _editor_redirect(response: Response):
    """Helper: every editor save endpoint redirects back to the editor page."""
    return response.redirect(name="gears.dashboard", query_params={"page": "about-lspu"})


def _save_uploaded_image(file, nas_subdir, prefix):
    """Validate and persist an uploaded image to NAS. Returns (stored_path, error).

    stored_path uses the NAS-relative form (e.g. 'About/seal-abc.png') so that
    StorageRouter.absolute_path resolves it to the correct NAS mount.
    """
    if isinstance(file, list):
        file = file[0] if file else None
    if not file:
        return None, "Upload must be a JPEG, PNG, or WEBP image."

    content = getattr(file, "content", None)
    if content is None and hasattr(file, "stream") and callable(file.stream):
        s = file.stream()
        content = s.read() if hasattr(s, "read") else s
    elif content is None and hasattr(file, "stream"):
        content = file.stream.read()
    if content is None:
        return None, "Could not read uploaded file."

    # Verify by actual content (magic bytes), not just the extension.
    if not FileVerificationService.verify_buffer(content, "image"):
        return None, "Upload must be a JPEG, PNG, or WEBP image."

    if len(content) > MAX_IMAGE_BYTES:
        return None, "Image must be 4 MB or smaller."

    # Masonite file objects expose .filename, not .mime_type — the extension is
    # only used to name the stored file, not to validate it.
    raw_filename = getattr(file, "filename", "") or ""
    ext = os.path.splitext(raw_filename)[1].lower()
    if hasattr(file, "extension") and callable(file.extension):
        ext = (file.extension() or ext).lower()
    if ext and not ext.startswith("."):
        ext = "." + ext
    if ext == ".jpeg":
        ext = ".jpg"

    filename = f"{prefix}-{secrets.token_hex(8)}{ext}"
    target_dir = os.path.join(gearsnas_base(), nas_subdir)

    old_mask = os.umask(0o002)
    try:
        os.makedirs(target_dir, mode=0o775, exist_ok=True)
        target_path = os.path.join(target_dir, filename)
        with open(target_path, "wb") as fh:
            fh.write(content)
        os.chmod(target_path, 0o664)
    finally:
        os.umask(old_mask)

    stored_path = f"{nas_subdir}/{filename}"
    return stored_path, None


class AboutController(Controller):
    # ===== Kiosk =====

    def kiosk(self, view: View):
        data = AboutContent.load_all()
        return view.render(
            "kiosk/about-lspu",
            {
                "sections": data["sections"],
                "ordered_slugs": data["ordered_slugs"],
                "milestones": data["milestones"],
                "active_nav": "about",
            },
        )

    # ===== Editor =====

    def editor(self, response: Response):
        return response.redirect(name="gears.dashboard", query_params={"page": "about-lspu"})

    def save_section(self, slug, request: Request, response: Response):
        if slug not in SECTION_SLUGS:
            if wants_json(request):
                return json_errors(response, ["Unknown section."])
            return _editor_redirect(response).with_errors(["Unknown section."])

        section = AboutSection.where("slug", slug).first()
        if not section:
            if wants_json(request):
                return json_errors(response, ["Section not found."])
            return _editor_redirect(response).with_errors(["Section not found."])

        if slug in ("mission", "values"):
            raw = request.input("subsections") or "[]"
            try:
                parsed = json.loads(raw)
            except (TypeError, ValueError):
                parsed = []
            section.subsections = AboutContent.sanitize_subsections(parsed)
            section.body_html = None
        else:
            section.body_html = AboutContent.sanitize_html(
                request.input("body_html") or ""
            )

        title = (request.input("title") or section.title).strip()
        if title:
            section.title = title[:150]

        try:
            user = request.user() if callable(getattr(request, "user", None)) else None
            section.updated_by_id = getattr(user, "id", None)
        except Exception:
            section.updated_by_id = None

        section.save()
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

        last = AboutMilestone.order_by("sort_order", "desc").first()
        next_order = (getattr(last, "sort_order", 0) or 0) + 1

        m = AboutMilestone.create({
            "year": year,
            "heading": heading,
            "body_html": body_html,
            "image_path": None,
            "sort_order": next_order,
        })
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

        # Optional image upload swap-in.
        file = request.input("file")
        if file:
            relative, err = _save_uploaded_image(file, _MILESTONE_NAS_SUBDIR, "milestone")
            if err:
                return _editor_redirect(response).with_errors([err])
            row.image_path = relative

        row.save()
        if wants_json(request):
            return json_success(response, messages=["Milestone updated."])
        return _editor_redirect(response).with_success(["Milestone updated."])

    def delete_milestone(self, id, request: Request, response: Response):
        row = AboutMilestone.where("id", id).first()
        if row:
            row.delete()
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
        if wants_json(request):
            return json_success(response, messages=["Order updated."])
        return _editor_redirect(response).with_success(["Order updated."])

    # ===== Seal image =====

    def upload_seal(self, request: Request, response: Response):
        file = request.input("file")
        stored_path, err = _save_uploaded_image(file, _SEAL_NAS_SUBDIR, "seal")
        is_ajax = wants_json(request)
        if err:
            if is_ajax:
                return json_errors(response, [err])
            return _editor_redirect(response).with_errors([err])

        section = AboutSection.where("slug", "seal").first()
        if section:
            section.image_path = stored_path
            section.save()

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

        if wants_json(request):
            return json_success(response, messages=["Hymn audio uploaded."])
        return _editor_redirect(response).with_success(["Hymn audio uploaded."])
