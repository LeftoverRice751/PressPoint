"""AboutController — kiosk + editor surfaces for the About LSPU page."""

import json
import os

from masonite.controllers import Controller
from masonite.request import Request
from masonite.response import Response
from masonite.views import View

from app.models.AboutMilestone import AboutMilestone
from app.models.AboutSection import AboutSection
from app.services import AboutValues
from app.services.AboutContent import AboutContent, SECTION_SLUGS
from app.services.AjaxResponses import wants_json, json_success, json_errors
from app.services.StorageRouter import gearsnas_base
from app.services.FileVerificationService import FileVerificationService
from app.services.ImageUploads import save_uploaded_image


_SEAL_NAS_SUBDIR = "About"
_MILESTONE_NAS_SUBDIR = "About/milestones"
MAX_AUDIO_BYTES = 20 * 1024 * 1024

#: Callouts on the university seal, as percentage positions within the artwork.
#: These are properties of the seal image itself, not editorial content, so they
#: live in code rather than the database — an editor replacing the seal file
#: keeps the same emblem and therefore the same anchor points. The template
#: positions each dot inside an aspect-ratio:1 wrapper, so the percentages
#: resolve against the artwork and stay glued to it at any size.
SEAL_HOTSPOTS = [
    {"key": "torch", "label": "Torch and flame", "x": 50, "y": 41,
     "note": "Enlightenment carried into the province."},
    {"key": "book", "label": "The open book", "x": 50, "y": 52,
     "note": "Instruction and research: the university teaches, and it publishes."},
    {"key": "agriculture", "label": "Agriculture", "x": 27, "y": 33,
     "note": "The rice stalk, for the farming towns the school was founded to serve."},
    {"key": "fisheries", "label": "Fisheries", "x": 72, "y": 31,
     "note": "The fish of Laguna de Bay, on whose shoreline the first campus opened."},
    {"key": "technology", "label": "Technology", "x": 50, "y": 73,
     "note": "Gear and earth — the polytechnic mandate in industry and the trades."},
    {"key": "founding", "label": "1952 · 2007", "x": 50, "y": 91,
     "note": "Founding year on the ring; 2007 at the centre, when R.A. 9402 made LSPU a university."},
]


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
                "seal_hotspots": SEAL_HOTSPOTS,
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
            relative, err = save_uploaded_image(file, _MILESTONE_NAS_SUBDIR, "milestone")
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
