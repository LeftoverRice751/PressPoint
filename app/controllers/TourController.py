import os

from masonite.controllers import Controller
from masonite.request import Request
from masonite.response import Response

from app.models.Locations import Locations
from app.models.TourScenes import TourScenes
from app.services.EquirectGenerator import generate_equirect
from app.services.TourScenesCatalog import TourScenesCatalog

_STORAGE_PUBLIC_ROOT = os.path.join(
    os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))),
    "storage",
    "public",
)


class TourController(Controller):
    def mappings(self, response: Response):
        """Public endpoint the kiosk tour calls on load.

        Returns every scene from the catalog merged with its saved
        mapping, plus the resolved location info so the client doesn't
        need a second round trip. Unmapped scenes still show up — they
        just have null location fields.
        """
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
        """Editor upserts a scene→location mapping from the dashboard.

        Idempotent on scene_id: a second submit replaces the prior row.
        Posting an empty location_id clears the mapping but keeps the
        display_name override around.
        """
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

    def equirect(self, request: Request, response: Response):
        """GET /pano/tiles/<scene_id>/equirect.jpg

        Lazily reprojects a cube-map scene's tiles into a single
        equirectangular JPEG on first request, caching the result next to
        the tiles. WhiteNoise serves the cached file directly on later
        requests without ever reaching this controller (see
        config/filesystem.py's storage/public static mount) — this action
        only ever runs on a cold cache.
        """
        scene_id = request.param("scene_id")
        scene = TourScenesCatalog.scene_by_id(scene_id)
        if not scene:
            return response.view("Not found", status=404)

        rel_path = generate_equirect(scene_id, scene.get("levels"))
        if not rel_path:
            return response.view("Equirect unavailable", status=500)

        full_path = os.path.realpath(os.path.join(_STORAGE_PUBLIC_ROOT, rel_path))
        if not full_path.startswith(_STORAGE_PUBLIC_ROOT) or not os.path.isfile(full_path):
            return response.view("Not found", status=404)

        response.header("Cache-Control", "public, max-age=31536000, immutable")
        return response.download("equirect.jpg", full_path, force=False)
