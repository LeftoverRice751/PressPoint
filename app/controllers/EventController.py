from datetime import datetime

from masonite.controllers import Controller
from masonite.request import Request
from masonite.response import Response

from app.events.NewEvent import NewEvent
from app.services.AjaxResponses import wants_json, json_success, json_errors
from app.services.ArchiveServices import ArchiveServices
from app.services.FileVerificationService import FileVerificationService
from app.models.Events import Events
from app.models.Locations import Locations


class EventController(Controller):
    def show(self, view):
        return view.render("welcome")

    def store(self, request: Request, response: Response):
        title = (request.input("title") or "").strip()
        description = (request.input("description") or "").strip()
        event_date_value = (request.input("event_date") or "").strip()
        location_id_value = (request.input("location_id") or "").strip()

        is_ajax = wants_json(request)

        def _err(messages):
            if is_ajax:
                return json_errors(response, messages)
            return response.back().with_errors(messages)

        if not title or not description or not event_date_value:
            return _err(["Title, description, and event date are required."])

        try:
            event_date = datetime.fromisoformat(event_date_value)
        except ValueError:
            return _err(["Event date must be a valid date and time."])

        location_id = None
        if location_id_value:
            if not location_id_value.isdigit():
                return _err(["Please choose a valid location."])

            location = Locations.find(int(location_id_value))
            if not location:
                return _err(["Please choose a valid location."])

            location_id = location.id

        created_event = Events.create(
            title=title,
            description=description,
            event_date=event_date,
            location_id=location_id,
            is_archive=False,
        )

        try:
            NewEvent(created_event).fire()
        except Exception:
            pass

        if is_ajax:
            return json_success(response, payload={
                "event": {
                    "id": getattr(created_event, "id", None),
                    "title": title,
                    "location_id": location_id,
                }
            }, messages=["Event saved successfully."])

        return response.redirect(name="gears.dashboard").with_success([
            "Event saved successfully.",
        ])

    def extract_from_pdf(self, request: Request, response: Response):
        is_ajax = wants_json(request)

        def _err(messages):
            if is_ajax:
                return json_errors(response, messages)
            return response.back().with_errors(messages)

        pdf_file = request.files("pdf_file")

        if not pdf_file:
            return _err(["Please upload a PDF file."])

        if pdf_file.extension().lower() != "pdf":
            return _err(["Only PDF files are allowed."])

        if not FileVerificationService.verify_file_type(pdf_file.path, "pdf"):
            return _err(["The uploaded file is not a valid PDF."])

        archive_services = ArchiveServices()
        extracted_data = archive_services.extract_data(pdf_file.path)

        if not extracted_data.get("event_date"):
            return _err(["The archive must contain an event date."])

        try:
            event_date = datetime.strptime(extracted_data["event_date"], "%B %d, %Y")
        except ValueError:
            return _err(["The archive event date could not be parsed."])

        Events.create(
            title=extracted_data["title"],
            description=extracted_data["description"],
            event_date=event_date,
            location_id=None,
            is_archive=True,
        )

        if is_ajax:
            return json_success(response, payload={"event": extracted_data},
                                messages=["Event extracted from the archive."])

        return response.json(extracted_data)
