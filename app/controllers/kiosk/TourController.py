from masonite.controllers import Controller
from masonite.request import Request
from masonite.response import Response

from app.models.Locations import Locations
from app.models.TourScenes import TourScenes
from app.services.TourScenesCatalog import TourScenesCatalog


class TourController(Controller):
    def mappings(self, response: Response):
        """Every catalog scene merged with its saved mapping; unmapped scenes have null location fields."""
        catalog = TourScenesCatalog.all_scenes()
        rows = list(TourScenes.all() or [])
        rows_by_scene = {
            (getattr(row, "scene_id", "") or ""): row for row in rows
        }

        location_ids = {
            getattr(row, "location_id", None)
            for row in rows
            if getattr(row, "location_id", None) is not None
        }
        locations_by_id = {}
        if location_ids:
            for location in Locations.where_in("id", list(location_ids)).get():
                locations_by_id[getattr(location, "id", None)] = location

        payload = []
        for entry in catalog:
            scene_id = entry["scene_id"]
            mapping = rows_by_scene.get(scene_id)
            location_id = getattr(mapping, "location_id", None) if mapping else None
            location = locations_by_id.get(location_id) if location_id else None

            payload.append(
                {
                    "scene_id": scene_id,
                    "scene_name": entry["name"],
                    "location_id": location_id,
                    "location_name": getattr(location, "name", None) if location else None,
                    "is_routable": bool(getattr(location, "is_routable", False)) if location else False,
                    "display_name": (getattr(mapping, "display_name", None) if mapping else None) or None,
                }
            )

        return response.json(payload)

    def store(self, request: Request, response: Response):
        """Upsert a scene→location mapping. An empty location_id clears it but keeps display_name."""
        scene_id = (request.input("scene_id") or "").strip()
        if not scene_id:
            return response.redirect(
                name="gears.dashboard", query_params={"page": "tour-mapping"}
            ).with_errors(["Missing scene id."])

        location_raw = (request.input("location_id") or "").strip()
        try:
            location_id = int(location_raw) if location_raw else None
        except (TypeError, ValueError):
            location_id = None

        display_name = (request.input("display_name") or "").strip() or None

        existing = TourScenes.where("scene_id", scene_id).first()
        if existing:
            existing.location_id = location_id
            existing.display_name = display_name
            existing.save()
        else:
            TourScenes.create(
                {
                    "scene_id": scene_id,
                    "location_id": location_id,
                    "display_name": display_name,
                }
            )

        return response.redirect(
            name="gears.dashboard", query_params={"page": "tour-mapping"}
        ).with_success(["Scene mapping saved."])
