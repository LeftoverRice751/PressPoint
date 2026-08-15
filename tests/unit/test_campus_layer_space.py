"""Guards on the one coordinate conversion the campus map depends on.

Everything the kiosk draws — markers, route lines, camera moves — has to land
in the 2.5D layer's pixel space, where the campus occupies negative y. The
database stores the same digitisation flipped to positive y, left over from
the flat imageOverlay the layer replaced. Mixing the two put every route one
whole image height off the map, which is the bug these tests exist to catch
coming back.

The layer's own extent is the yardstick: it was produced outside this codebase,
so agreeing with it is real corroboration rather than checking our arithmetic
against itself.

The same guards applied to routes live in `test_campus_wayfinding.py`, which
reuses `_layer_bounds` and `_seeded_locations` from here.
"""

import json
import re
from pathlib import Path

from app.services import Campus25dMapping
from tests import TestCase


_LAYER_JS = Path(__file__).resolve().parents[2] / "resources" / "js" / "campus-2.5d.layer.js"


def _layer_bounds():
    """(min_x, max_x, min_y, max_y) of every footprint the 2.5D layer draws."""
    source = _LAYER_JS.read_text()
    start = source.index("{", source.index("const CAMPUS ="))
    depth = 0
    for offset, character in enumerate(source[start:]):
        if character == "{":
            depth += 1
        elif character == "}":
            depth -= 1
            if depth == 0:
                end = start + offset + 1
                break

    points = []

    def walk(node):
        if isinstance(node[0], (int, float)):
            points.append(node)
        else:
            for child in node:
                walk(child)

    for feature in json.loads(source[start:end])["features"]:
        walk(feature["geometry"]["coordinates"])

    xs = [point[0] for point in points]
    ys = [point[1] for point in points]
    return min(xs), max(xs), min(ys), max(ys)


class _Location:
    """Stand-in for a Locations row — only the coordinate attrs are read."""

    def __init__(self, id, latitude, longitude, name=""):
        self.id = id
        self.latitude = latitude
        self.longitude = longitude
        self.name = name


def _seeded_locations():
    """The seeder's 37 rows, as fake model objects with sequential ids.

    The ids are the seeder's row order, which is also what the live table
    holds — `campus_graph.json` keys its anchors by those ids, so the two
    have to stay in step for the wayfinding tests to mean anything.
    """
    seeder = (
        Path(__file__).resolve().parents[2]
        / "databases" / "seeds" / "locations_table_seeder.py"
    ).read_text()

    rows = re.findall(
        r'"name":\s*"([^"]+)".*?"latitude":\s*(-?[\d.]+),\s*"longitude":\s*(-?[\d.]+)',
        seeder,
        re.DOTALL,
    )
    return [
        _Location(index + 1, float(latitude), float(longitude), name)
        for index, (name, latitude, longitude) in enumerate(rows)
    ]


class CampusLayerSpaceTestCase(TestCase):
    def test_stored_latitude_converts_to_the_layers_negative_y(self):
        # Main Gate as the seeder stores it: y-up, one image height too high.
        self.assertAlmostEqual(Campus25dMapping.to_layer_y(111.0), -1002.0)
        self.assertAlmostEqual(Campus25dMapping.to_layer_y("141.05"), -971.95, places=2)

    def test_missing_or_junk_coordinates_convert_to_none(self):
        self.assertIsNone(Campus25dMapping.to_layer_y(None))
        self.assertIsNone(Campus25dMapping.to_layer_y("north-ish"))
        self.assertIsNone(Campus25dMapping.layer_point(_Location(1, None, 620.0)))

    def test_layer_point_keeps_x_and_converts_y(self):
        point = Campus25dMapping.layer_point(_Location(1, 111.0, 620.0))

        self.assertEqual(point, (620.0, -1002.0))

    def test_every_seeded_location_lands_inside_the_layers_extent(self):
        # The seeder is the full 37-row digitisation; if the conversion is
        # wrong in either direction, points fall outside the drawn campus.
        min_x, max_x, min_y, max_y = _layer_bounds()
        locations = _seeded_locations()
        self.assertGreater(len(locations), 30, "seeder rows not parsed")

        for location in locations:
            point = Campus25dMapping.layer_point(location)
            self.assertTrue(
                min_x <= point[0] <= max_x and min_y <= point[1] <= max_y,
                f"{location.name} at {point} is outside the campus "
                f"({min_x}..{max_x}, {min_y}..{max_y})",
            )
