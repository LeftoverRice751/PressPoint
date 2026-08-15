"""The bridge between our data and the 2.5D campus layer: ids and coordinates.

The kiosk swaps the flat campus-map.png picture for a self-contained Leaflet
plugin (`resources/js/campus-2.5d.layer.js`) that draws 45 extruded buildings
from an embedded GeoJSON. Each of those features carries its own string id
(e.g. "H", "17", "19b") and its own display name (e.g. "Gate H", "Block 17")
that don't line up with the numeric `locations.id` we already store.

`resources/geo/campus_25d_mapping.json` bridges the two. Entries that aren't
there yet are simply absent, and the JS falls back to the location's own
coordinates for them. Keys starting with an underscore (e.g. `_docs`) are
ignored so the file can carry its own documentation.

The other half of the bridge is the y axis, and it is the reason routes once
drew off the map entirely:

  - QGIS wrote the campus with y running *down* from the top-left, so its
    y values are negative. The 2.5D layer stores that convention as-written
    (its header says "pixel CRS: lng = x, lat = -y"), which puts every
    building at y in [-1065, -30].
  - `locations.latitude` holds the same digitisation already flipped to y-up
    by adding the image height — the convention the old flat imageOverlay
    needed, which put buildings at y in [+84, +1058].

Both are drawn in Leaflet's CRS.Simple, so mixing them puts a marker or a
route one whole image height away from the building it belongs to. Everything
that draws now converts through `to_layer_y()` / `layer_point()` here, so the
layer's space is the only one that reaches a client.
"""

import json
from pathlib import Path


_MAPPING_PATH = (
    Path(__file__).resolve().parents[2] / "resources" / "geo" / "campus_25d_mapping.json"
)

#: campus-map.png's height in pixels — the offset baked into every stored
#: `locations.latitude`. It matches the resolution the artwork was
#: georeferenced at; a re-export at a different size invalidates both this
#: constant and every coordinate in the database.
MAP_IMAGE_HEIGHT = 1113


def _load_mapping():
    """Return {feature_id: location_id} with docstring keys stripped out."""
    if not _MAPPING_PATH.exists():
        return {}

    with open(_MAPPING_PATH) as handle:
        data = json.load(handle) or {}

    mapping = {}
    for key, value in data.items():
        if key.startswith("_"):
            continue
        try:
            mapping[str(key)] = int(value)
        except (TypeError, ValueError):
            # Skip malformed entries rather than crashing the app on boot.
            continue
    return mapping


#: Parsed once at import — the mapping is user-edited, not runtime state.
_MAPPING = _load_mapping()

#: Reverse index for the location_id_for(feature_id) direction. Built once.
_REVERSE = {location_id: feature_id for feature_id, location_id in _MAPPING.items()}


def feature_id_for(location_id):
    """Return the 2.5D feature id backing this location, or None."""
    if location_id is None:
        return None
    return _REVERSE.get(int(location_id))


def location_id_for(feature_id):
    """Return the locations.id backing this 2.5D feature, or None."""
    if feature_id is None:
        return None
    return _MAPPING.get(str(feature_id))


def to_layer_y(stored_latitude):
    """Convert a stored `locations.latitude` into the 2.5D layer's y.

    See the module docstring: the column is y-up (image height already added),
    the layer is y-down-negative. Returns None for a value that isn't a
    number, so callers can treat "no coordinate" and "bad coordinate" alike.
    """
    if stored_latitude is None:
        return None
    try:
        return float(stored_latitude) - MAP_IMAGE_HEIGHT
    except (TypeError, ValueError):
        return None


def layer_point(location):
    """Return (x, y) for a Locations row in layer space, or None.

    `longitude` is x and needs no conversion; `latitude` is the y that does.
    """
    x = getattr(location, "longitude", None)
    y = to_layer_y(getattr(location, "latitude", None))
    if x is None or y is None:
        return None
    try:
        return float(x), y
    except (TypeError, ValueError):
        return None
