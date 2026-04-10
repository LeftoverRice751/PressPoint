from datetime import datetime

from masonite.controllers import Controller
from masonite.request import Request
from masonite.response import Response

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

        Events.create(
            title=title,
            description=description,
            event_date=event_date,
            location_id=location_id,
        )

        return response.redirect(name="gears.dashboard").with_success([
            "Event saved successfully.",
        ])