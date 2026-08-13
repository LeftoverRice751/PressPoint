"""Feature-id <-> location-id lookup for the 2.5D campus layer.

The kiosk swaps the flat campus-map.png picture for a self-contained Leaflet
plugin (`resources/js/campus-2.5d.layer.js`) that draws 45 extruded buildings
from an embedded GeoJSON. Each of those features carries its own string id
(e.g. "H", "17", "19b") and its own display name (e.g. "Gate H", "Block 17")
that don't line up with the numeric `locations.id` we already store.

`resources/geo/campus_25d_mapping.json` is a hand-authored bridge between the
two. Fill it in as you tour the campus and confirm which "Block N" is which
real building; entries you haven't confirmed yet are simply absent, and the JS
falls back to the layer's own name for them. Keys starting with an underscore
(e.g. `_docs`) are ignored so the file can carry its own documentation.
"""

import json
from pathlib import Path


_MAPPING_PATH = (
    Path(__file__).resolve().parents[2] / "resources" / "geo" / "campus_25d_mapping.json"
)


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
