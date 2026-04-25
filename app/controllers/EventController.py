from datetime import datetime
from masonite.controllers import Controller
from masonite.request import Request
from masonite.response import Response
from app.events.NewEvent import NewEvent
from app.services.ArchiveServices import ArchiveServices
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

        if not title or not description or not event_date_value:
            return response.back().with_errors([
                "Title, description, and event date are required.",
            ])

        try:
            event_date = datetime.fromisoformat(event_date_value)
        except ValueError:
            return response.back().with_errors([
                "Event date must be a valid date and time.",
            ])

        location_id = None
        if location_id_value:
            if not location_id_value.isdigit():
                return response.back().with_errors([
                    "Please choose a valid location.",
                ])

            location = Locations.find(int(location_id_value))
            if not location:
                return response.back().with_errors([
                    "Please choose a valid location.",
                ])

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
            # Event should still be saved even when realtime broadcasting is unavailable.
            pass

        return response.redirect(name="gears.dashboard").with_success([
            "Event saved successfully.",
        ])
        
    def extract_from_pdf(self, request: Request, response: Response):
        pdf_file = request.files("pdf_file")

        if not pdf_file:
            return response.back().with_errors([
                "Please upload a PDF file.",
            ])

        if pdf_file.mimetype != "application/pdf":
            return response.back().with_errors([
                "Only PDF files are allowed.",
            ])

        archive_services = ArchiveServices()
        extracted_data = archive_services.extract_data(pdf_file.path)

        if not extracted_data.get("event_date"):
            return response.back().with_errors([
                "The archive must contain an event date.",
            ])

        try:
            event_date = datetime.strptime(extracted_data["event_date"], "%B %d, %Y")
        except ValueError:
            return response.back().with_errors([
                "The archive event date could not be parsed.",
            ])

        created_event = Events.create(
            title=extracted_data["title"],
            description=extracted_data["description"],
            event_date=event_date,
            location_id=None,
            is_archive=True,
        )

        try:
            NewEvent(created_event).fire()
        except Exception:
            # Event should still be saved even when realtime broadcasting is unavailable.
            pass

        return response.json(extracted_data)