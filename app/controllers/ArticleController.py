from datetime import datetime

from masonite.controllers import Controller
from masonite.request import Request
from masonite.response import Response

from app.models.Locations import Locations
from app.models.Posts import Posts


class ArticleController(Controller):
    def store(self, request: Request, response: Response):
        title = (request.input("title") or "").strip()
        description = (request.input("description") or "").strip()
        event_date_value = (request.input("event_date") or "").strip()
        location_id_value = (request.input("location_id") or "").strip()

        if not title or not description or not event_date_value or not location_id_value:
            return response.back().with_errors([
                "Title, description, event date, and location are required.",
            ])

        event_date = None
        for date_format in ("%m-%d-%Y", "%Y-%m-%d"):
            try:
                event_date = datetime.strptime(event_date_value, date_format)
                break
            except ValueError:
                continue

        if not event_date:
            return response.back().with_errors([
                "Event date must be entered as MM-DD-YYYY.",
            ])

        if not location_id_value.isdigit():
            return response.back().with_errors([
                "Please choose a valid location.",
            ])

        location = Locations.find(int(location_id_value))
        if not location:
            return response.back().with_errors([
                "Please choose a valid location.",
            ])

        Posts.create(
            title=title,
            description=description,
            content=description,
            event_date=event_date,
            location_id=location.id,
            status="draft",
        )

        return response.redirect(name="gears.dashboard")
