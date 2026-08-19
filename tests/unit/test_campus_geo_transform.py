"""Guards on the WGS84 <-> campus-pixel transform used for live GPS tracking.

`app/services/CampusGeoTransform.py` is the only place this projective
transform is derived. If the four ground control points ever change, or the
homography solve regresses, these should be the first thing to fail.
"""

from app.services import CampusGeoTransform
from tests import TestCase


class CampusGeoTransformTestCase(TestCase):
    def test_ground_control_points_round_trip_through_pixel_space(self):
        # Each GCPS row is (pixel_x, pixel_y, wgs84_lng, wgs84_lat). Feeding
        # the real coordinate back through wgs84_to_layer_point should land
        # back on (within QGIS's own reported residual of the pixel it
        # started from -- these are exact by construction, four points
        # pinning down eight unknowns with nothing left over.
        for pixel_x, pixel_y, lng, lat in CampusGeoTransform.GCPS:
            x, y = CampusGeoTransform.wgs84_to_layer_point(lat, lng)
            self.assertAlmostEqual(x, pixel_x, places=2)
            self.assertAlmostEqual(y, pixel_y, places=2)

    def test_layer_point_round_trips_back_to_wgs84(self):
        for pixel_x, pixel_y, lng, lat in CampusGeoTransform.GCPS:
            round_tripped_lat, round_tripped_lng = CampusGeoTransform.layer_point_to_wgs84(
                pixel_x, pixel_y
            )
            self.assertAlmostEqual(round_tripped_lat, lat, places=6)
            self.assertAlmostEqual(round_tripped_lng, lng, places=6)

    def test_pixel_matrix_is_a_plain_3x3_list_safe_to_serialize(self):
        matrix = CampusGeoTransform.wgs84_to_pixel_matrix()

        self.assertEqual(len(matrix), 3)
        for row in matrix:
            self.assertEqual(len(row), 3)
            for value in row:
                self.assertIsInstance(value, float)

        # Returned copy, not the live module state -- mutating it must not
        # corrupt the matrix every other caller gets.
        matrix[0][0] = 0.0
        self.assertNotEqual(CampusGeoTransform.wgs84_to_pixel_matrix()[0][0], 0.0)

    def test_haversine_of_a_point_against_itself_is_zero(self):
        self.assertEqual(CampusGeoTransform.haversine_meters(14.26, 121.40, 14.26, 121.40), 0.0)

    def test_haversine_matches_a_known_short_distance(self):
        # ~0.001 degrees of latitude at the equator is close to 111 meters;
        # this is just a sanity check that the formula's scale is right, not
        # a precise geodesy assertion.
        meters = CampusGeoTransform.haversine_meters(14.2600, 121.4000, 14.2610, 121.4000)
        self.assertGreater(meters, 90)
        self.assertLess(meters, 130)
