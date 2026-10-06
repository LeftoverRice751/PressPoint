from datetime import datetime

from masonite.controllers import Controller
from masonite.request import Request
from masonite.response import Response

from app.events.NewEvent import NewEvent
from app.services.AjaxResponses import wants_json, json_success, json_errors
from app.services.ArchiveServices import ArchiveServices
from app.services.FileVerificationService import FileVerificationService
from app.services.ImageUploads import save_uploaded_image
from app.models.Events import Events
from app.models.Locations import Locations


def _uploaded_image(value):
    """The file an editor actually attached, or None. An untouched file input
    still arrives as a truthy part with an empty filename."""
    if isinstance(value, list):
        value = value[0] if value else None
    if not value or not getattr(value, "filename", ""):
        return None
    return value


class EventController(Controller):
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

        # Optional image, saved last so a failed validation leaves no orphan on the NAS.
        event_image = None
        upload = _uploaded_image(request.input("event_image"))
        if upload is not None:
            event_image, upload_error = save_uploaded_image(upload, "Events", "event")
            if upload_error:
                return _err([upload_error])  # reject rather than silently drop the poster

        created_event = Events.create(
            title=title,
            description=description,
            event_date=event_date,
            location_id=location_id,
            event_image=event_image,
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
