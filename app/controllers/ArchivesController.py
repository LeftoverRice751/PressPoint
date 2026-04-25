from masonite.controllers import Controller
from masonite.request import Request
from masonite.filesystem import Storage
from masonite.response import Response
from masonite.utils.location import base_path
from app.models.Archives import Archives
import os

class ArchivesController(Controller):
    def upload(self, request: Request, storage: Storage, response: Response):
        name = (request.input("name") or "").strip()
        archive_type = (request.input("type") or "").strip()
        pdf_file = request.input("pdf_file")

        if not name or not archive_type:
            return response.json({"ok": False, "error": "Name and type are required."}, status=422)

        if not pdf_file:
            return response.json({"ok": False, "error": "Please upload a PDF file."}, status=422)

        if not hasattr(pdf_file, "get_content") or not hasattr(pdf_file, "extension"):
            return response.json({"ok": False, "error": "Please upload a valid PDF file."}, status=422)

        file_extension = (pdf_file.extension() or "").lower()
        if file_extension != ".pdf":
            return response.json({"ok": False, "error": "Only PDF files are allowed."}, status=422)

        try:
            path = storage.disk("public").put_file("archives", pdf_file)

            Archives.create(
                name=name,
                type=archive_type,
                file_path=path,
            )
        except Exception:
            saved_path = locals().get("path")
            if saved_path:
                full_path = base_path(os.path.join("storage/framework/public", saved_path))
                if full_path and os.path.exists(full_path):
                    os.remove(full_path)

            return response.json({
                "ok": False,
                "error": "Archive upload could not be saved. Please make sure the archives table exists and try again.",
            }, status=500)

        return response.json({"ok": True, "message": "Archive uploaded successfully."})
