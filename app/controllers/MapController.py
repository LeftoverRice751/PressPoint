from masonite.controllers import Controller
from masonite.response import Response
from masonite.views import View

from app.models.Locations import Locations


class MapController(Controller):
    def show(self, view: View):
        return view.render("kiosk/campus-map")

    def get_locations(self, response: Response):
        locations = Locations.all()

        payload = [
            {
                "name": getattr(location, "name", ""),
                "type": getattr(location, "type", ""),
                "latitude": float(getattr(location, "latitude", 0) or 0),
                "longitude": float(getattr(location, "longitude", 0) or 0),
                "is_routable": bool(getattr(location, "is_routable", False)),
                "is_start": str(getattr(location, "name", "") or "").strip().lower() == "student services building",
            }
            for location in locations
        ]

        return response.json(payload)
