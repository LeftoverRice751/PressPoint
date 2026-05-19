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


ALLOWED_IMAGE_MIMES = {"image/jpeg", "image/png", "image/webp"}
MAX_IMAGE_BYTES = 4 * 1024 * 1024
SEAL_DIR = "storage/about"
MILESTONE_DIR = "storage/about/milestones"
EXT_BY_MIME = {"image/jpeg": ".jpg", "image/png": ".png", "image/webp": ".webp"}


def _editor_redirect(response: Response):
    """Helper: every editor save endpoint redirects back to the editor page."""
    return response.redirect(name="gears.dashboard", query_params={"page": "about-lspu"})


def _save_uploaded_image(file, target_dir, prefix):
    """Validate and persist an uploaded image. Returns (relative_path, error)."""
    if isinstance(file, list):
        file = file[0] if file else None

    mime = getattr(file, "mime_type", None) or getattr(file, "mimetype", None)
    if not file or mime not in ALLOWED_IMAGE_MIMES:
        return None, "Upload must be a JPEG, PNG, or WEBP image."

    content = getattr(file, "content", None)
    if content is None and hasattr(file, "stream"):
        content = file.stream.read()
    if content is None:
        return None, "Could not read uploaded file."
    if len(content) > MAX_IMAGE_BYTES:
        return None, "Image must be 4 MB or smaller."

    ext = EXT_BY_MIME[mime]
    name = f"{prefix}-{secrets.token_hex(8)}{ext}"
    os.makedirs(target_dir, exist_ok=True)
    target_path = os.path.join(target_dir, name)
    with open(target_path, "wb") as fh:
        fh.write(content)

    # Return path relative to the storage/ route prefix (the route is
    # /storage/@path:any served by VideoController@serve_storage).
    relative = os.path.relpath(target_path, "storage")
    return relative, None


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
            },
        )

    # ===== Editor =====

    def editor(self, response: Response):
        return response.redirect(name="gears.dashboard", query_params={"page": "about-lspu"})

    def save_section(self, slug, request: Request, response: Response):
        if slug not in SECTION_SLUGS:
            return _editor_redirect(response).with_errors(["Unknown section."])

        section = AboutSection.where("slug", slug).first()
        if not section:
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

        AboutMilestone.create({
            "year": year,
            "heading": heading,
            "body_html": body_html,
            "image_path": None,
            "sort_order": next_order,
        })
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
            relative, err = _save_uploaded_image(file, MILESTONE_DIR, "milestone")
            if err:
                return _editor_redirect(response).with_errors([err])
            row.image_path = relative

        row.save()
        return _editor_redirect(response).with_success(["Milestone updated."])

    def delete_milestone(self, id, response: Response):
        row = AboutMilestone.where("id", id).first()
        if row:
            row.delete()
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
        return _editor_redirect(response).with_success(["Order updated."])

    # ===== Seal image =====

    def upload_seal(self, request: Request, response: Response):
        file = request.input("file")
        relative, err = _save_uploaded_image(file, SEAL_DIR, "seal")
        is_ajax = wants_json(request)
        if err:
            if is_ajax:
                return json_errors(response, [err])
            return _editor_redirect(response).with_errors([err])

        section = AboutSection.where("slug", "seal").first()
        if section:
            section.image_path = relative
            section.save()

        if is_ajax:
            return json_success(response, payload={
                "seal_url": "/storage/" + str(relative).replace("\\", "/").lstrip("/")
            }, messages=["Seal image uploaded."])

        return _editor_redirect(response).with_success(["Seal image uploaded."])
