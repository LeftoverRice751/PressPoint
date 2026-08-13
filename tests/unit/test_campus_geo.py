"""Guards on the campus-map georeferencing.

These pin the transform to two things that were established outside this
codebase: the control points QGIS produced, and the bounds of the
georeferenced raster it exported (resources/geo/lspu_campus.gpkg). If someone
re-georeferences the map and pastes new GCPS, these tests say whether the new
numbers still describe the same campus.
"""

import math

from app.services import CampusGeo
from tests import TestCase


#: Bounds of resources/geo/lspu_campus.gpkg, per its gpkg_contents row. This
#: raster was exported by QGIS from the same georeferencing but by a separate
#: code path, so agreeing with it is real corroboration rather than checking
#: our own arithmetic against itself.
GPKG_BOUNDS = {
    "west": 121.395546019999998,
    "south": 14.260961249,
    "east": 121.399417711,
    "north": 14.264500294,
}

#: Rough metres-per-degree at the campus's latitude. Only used to state
#: tolerances in metres, so approximate is fine.
METRES_PER_DEGREE_LAT = 110574
METRES_PER_DEGREE_LNG = 111320 * math.cos(math.radians(14.2627))


def _image_corners():
    return [
        (0, 0),
        (CampusGeo.MAP_IMAGE_WIDTH, 0),
        (CampusGeo.MAP_IMAGE_WIDTH, CampusGeo.MAP_IMAGE_HEIGHT),
        (0, CampusGeo.MAP_IMAGE_HEIGHT),
    ]


class CampusGeoTest(TestCase):
    def test_control_points_map_to_their_surveyed_coordinates(self):
        """Every GCP must land on the coordinate QGIS recorded for it."""
        for source_x, source_y, expected_lng, expected_lat in CampusGeo.GCPS:
            map_y = CampusGeo._from_source(source_y)
            lat, lng = CampusGeo.to_wgs84(source_x, map_y)

            # ~0.1 mm. The fit is exact, so this only catches a botched solve.
            self.assertAlmostEqual(lat, expected_lat, places=9)
            self.assertAlmostEqual(lng, expected_lng, places=9)

    def test_pixel_to_wgs84_and_back_is_lossless(self):
        """to_pixel must undo to_wgs84 across the whole image, not just near
        the control points, since locations sit all over the map."""
        probes = _image_corners() + [(620, 111), (300, 800), (900, 450)]

        for map_x, map_y in probes:
            lat, lng = CampusGeo.to_wgs84(map_x, map_y)
            back_x, back_y = CampusGeo.to_pixel(lat, lng)

            self.assertAlmostEqual(back_x, map_x, places=6)
            self.assertAlmostEqual(back_y, map_y, places=6)

    def test_inverse_matrix_is_a_true_inverse(self):
        """Multiplying the two matrices must give the identity.

        Not merely cosmetic: a scaled 'inverse' still round-trips correctly
        through _apply, so this is the only check that catches one.
        """
        product = [
            [
                sum(
                    CampusGeo.PIXEL_TO_WGS84[row][k] * CampusGeo.WGS84_TO_PIXEL[k][col]
                    for k in range(3)
                )
                for col in range(3)
            ]
            for row in range(3)
        ]

        for row in range(3):
            for col in range(3):
                self.assertAlmostEqual(product[row][col], 1.0 if row == col else 0.0, places=9)

    def test_image_corners_reproduce_the_georeferenced_raster_bounds(self):
        """Independent corroboration against the QGIS-exported raster.

        One raster pixel is ~0.28 m, so a 1 m tolerance is a little over three
        pixels — tight enough to catch a wrong transform, loose enough to
        absorb the rounding in the export.
        """
        corners = [CampusGeo.to_wgs84(x, y) for x, y in _image_corners()]
        lats = [lat for lat, _ in corners]
        lngs = [lng for _, lng in corners]

        deltas_m = {
            "west": (min(lngs) - GPKG_BOUNDS["west"]) * METRES_PER_DEGREE_LNG,
            "east": (max(lngs) - GPKG_BOUNDS["east"]) * METRES_PER_DEGREE_LNG,
            "south": (min(lats) - GPKG_BOUNDS["south"]) * METRES_PER_DEGREE_LAT,
            "north": (max(lats) - GPKG_BOUNDS["north"]) * METRES_PER_DEGREE_LAT,
        }

        for edge, delta in deltas_m.items():
            self.assertLess(abs(delta), 1.0, f"{edge} edge is off by {delta:.2f} m")

    def test_known_location_keeps_its_coordinate(self):
        """Main Gate, as a plain regression anchor on the whole pipeline.

        Its pre-migration pixel position was (620, 111); this is the value the
        migration wrote to the database for it.
        """
        lat, lng = CampusGeo.to_wgs84(620, 111)

        self.assertAlmostEqual(lat, 14.2617464, places=7)
        self.assertAlmostEqual(lng, 121.3979071, places=7)

    def test_every_point_on_the_map_lands_inside_the_campus_bounds(self):
        """Sweep the image and confirm nothing projects somewhere absurd."""
        for map_x in range(0, CampusGeo.MAP_IMAGE_WIDTH + 1, 203):
            for map_y in range(0, CampusGeo.MAP_IMAGE_HEIGHT + 1, 371):
                lat, lng = CampusGeo.to_wgs84(map_x, map_y)

                self.assertTrue(14.2605 < lat < 14.2650, f"lat {lat} at {map_x},{map_y}")
                self.assertTrue(121.3950 < lng < 121.4000, f"lng {lng} at {map_x},{map_y}")
