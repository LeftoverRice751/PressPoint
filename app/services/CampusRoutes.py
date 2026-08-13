"""Per-building walking routes, sourced from the QGIS network.

`resources/geo/campus_routes.geojson` is a small network of walkways drawn on
top of campus-map.png in QGIS. Each feature is one complete route that starts
at the same hub (Main Gate area) and ends at exactly one destination building.
This module hands those polylines to the app in the same pixel space Leaflet
draws in, and figures out which feature belongs to which building.

Coordinate space: QGIS writes sourceX/sourceY, with y negative and running
down from the top-left. Leaflet's CRS.Simple wants y running up from the
bottom-left, so we add the image height to flip: `leaflet_y = source_y +
MAP_IMAGE_HEIGHT`.

Location convention: `locations.latitude` holds the Leaflet y (map_y) and
`locations.longitude` holds the Leaflet x (map_x). The columns are named for
history; every consumer treats them as pixels.

Feature -> location matching is done by proximity: for each feature, the
location whose (map_x, map_y) is closest to the feature's last coordinate
gets that route. This means the routes stay in QGIS as the source of truth
and adding a route is: draw it in QGIS, export the geojson, redeploy.
"""

import json
from pathlib import Path


#: campus-map.png height in pixels. Matches the size the geojson was
#: georeferenced against — a re-export at a different resolution invalidates
#: the y-flip below and every stored pixel position.
MAP_IMAGE_HEIGHT = 1113


_ROUTES_PATH = (
    Path(__file__).resolve().parents[2] / "resources" / "geo" / "campus_routes.geojson"
)


def _load_features():
    """Parse the geojson into a list of {id, coords} with Leaflet-space coords.

    Each feature's MultiLineString is flattened to a single ordered list, so a
    caller that draws it as one polyline gets a continuous line.
    """
    if not _ROUTES_PATH.exists():
        return []

    with open(_ROUTES_PATH) as handle:
        data = json.load(handle)

    features = []
    for feature in data.get("features", []) or []:
        geometry = feature.get("geometry") or {}
        if geometry.get("type") != "MultiLineString":
            continue

        coords = []
        for line in geometry.get("coordinates", []) or []:
            for point in line:
                if len(point) < 2:
                    continue
                source_x = float(point[0])
                source_y = float(point[1])
                coords.append((source_x, source_y + MAP_IMAGE_HEIGHT))

        if len(coords) < 2:
            continue

        features.append(
            {
                "id": (feature.get("properties") or {}).get("id"),
                "coords": coords,
            }
        )

    return features


#: Parsed once at import — the geojson never changes at runtime.
_FEATURES = _load_features()


def _location_pixel(location):
    """Return (map_x, map_y) for a Locations row, or None if it has no coords.

    `longitude` is map_x, `latitude` is map_y — the pre-WGS84 storage
    convention this module targets.
    """
    latitude = getattr(location, "latitude", None)
    longitude = getattr(location, "longitude", None)
    if latitude is None or longitude is None:
        return None
    try:
        return float(longitude), float(latitude)
    except (ValueError, TypeError):
        return None


def build_location_route_map(locations):
    """Assign each feature to the nearest location by end-of-route proximity.

    Returns {location_id: [[y, x], ...]}. Locations without a nearby feature
    end up absent from the dict (callers treat a missing key as "no route
    available").
    """
    if not _FEATURES:
        return {}

    location_pixels = []
    for location in locations:
        pixel = _location_pixel(location)
        if pixel is None:
            continue
        location_pixels.append((getattr(location, "id", None), pixel[0], pixel[1]))

    if not location_pixels:
        return {}

    mapping = {}
    for feature in _FEATURES:
        end_x, end_y = feature["coords"][-1]
        best_id = None
        best_distance_squared = None
        for location_id, pixel_x, pixel_y in location_pixels:
            distance_squared = (pixel_x - end_x) ** 2 + (pixel_y - end_y) ** 2
            if best_distance_squared is None or distance_squared < best_distance_squared:
                best_distance_squared = distance_squared
                best_id = location_id

        if best_id is None:
            continue

        # Leaflet expects [y, x] pairs (CRS.Simple is y-first).
        mapping[best_id] = [[y, x] for (x, y) in feature["coords"]]

    return mapping
