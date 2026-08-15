"""Guards on the walkway graph the kiosk routes over.

The kiosk used to draw a straight line through every building between the
visitor and their destination, because only 11 of 37 locations had a digitised
route. `resources/geo/campus_graph.json` replaced that with a real network,
baked out of QGIS by `scripts/build_campus_graph.py`.

Two things can silently break it, and both are cheap to catch here:

  - **The space.** Everything drawn must land in the 2.5D layer's pixel space,
    where the campus occupies negative y. The old flat imageOverlay used the
    same digitisation flipped positive, and mixing the two put routes one whole
    image height off the map. A node at positive y means that flip is back.
  - **Connectivity.** A graph that has fragmented into islands does not raise;
    it just answers "no route" for whichever half the visitor asked about, and
    the kiosk quietly falls back to the straight lines this replaced.

The layer's own extent is the yardstick for the first, since it was produced
outside this codebase — agreeing with it is corroboration, not arithmetic
checked against itself.
"""

from app.services import Campus25dMapping, MapWayfinderService
from tests import TestCase
from tests.unit.test_campus_layer_space import _layer_bounds, _seeded_locations


#: The kiosk's start, matching MapController.KIOSK_START_LOCATION_NAME.
START_ID = 2

#: Locations the walkways do not reach, by name. These keep the kiosk's
#: straight-line fallback until someone draws a spur to them in QGIS. Listed
#: rather than counted so that a *different* location dropping out is a
#: failure, not an accepted new total.
UNREACHED = {
    "College of Criminal Justice and Education Academic Building (CCJE)",
    "CFOSH Bakery",
    "Activity Center (AC)",
}

#: The start has no route to itself, so it is absent from the route map too.
NO_ROUTE = UNREACHED | {"Student Services Building"}


class CampusWayfindingTestCase(TestCase):
    def test_every_graph_node_lands_inside_the_layers_extent(self):
        # The flip-regression guard: under the old +1113 offset every node
        # here sits a full image height above the drawn campus.
        min_x, max_x, min_y, max_y = _layer_bounds()
        nodes = MapWayfinderService.nodes()

        self.assertGreater(len(nodes), 50, "graph did not load")
        for index, (x, y) in enumerate(nodes):
            self.assertTrue(
                min_x <= x <= max_x and min_y <= y <= max_y,
                f"node {index} at ({x}, {y}) is outside the campus "
                f"({min_x}..{max_x}, {min_y}..{max_y})",
            )

    def test_the_graph_is_one_connected_network(self):
        # Every anchored building has to be walkable from every other one.
        # Islands do not raise anywhere — they just return None forever.
        self.assertEqual(
            MapWayfinderService.component_count(), 1,
            "the walkway graph has fragmented; rebuild with a larger --snap",
        )

    def test_a_route_runs_between_two_anchored_buildings(self):
        locations = _seeded_locations()
        by_name = {location.name: location for location in locations}
        start = by_name["Student Services Building"]
        destination = by_name["College of Computer Studies (CCS)"]

        path = MapWayfinderService.route_between(start.id, destination.id)

        self.assertIsNotNone(path, "no route between two anchored buildings")
        self.assertGreaterEqual(len(path), 2, "a route needs at least two points")

        # The path is [y, x] because Leaflet's CRS.Simple is y-first — getting
        # this backwards draws the route mirrored across the campus diagonal.
        nodes = MapWayfinderService.nodes()
        start_node = nodes[MapWayfinderService.anchor_for(start.id)]
        end_node = nodes[MapWayfinderService.anchor_for(destination.id)]
        self.assertAlmostEqual(path[0][1], start_node[0], places=2)
        self.assertAlmostEqual(path[0][0], start_node[1], places=2)
        self.assertAlmostEqual(path[-1][1], end_node[0], places=2)
        self.assertAlmostEqual(path[-1][0], end_node[1], places=2)

    def test_a_route_bends_instead_of_cutting_straight_across(self):
        # The whole point of the feature. A straight line between these two
        # would pass through the middle of campus; the walkway does not.
        locations = _seeded_locations()
        by_name = {location.name: location for location in locations}
        path = MapWayfinderService.route_between(
            by_name["Student Services Building"].id,
            by_name["College of Engineering New Building (COE)"].id,
        )

        self.assertIsNotNone(path)
        self.assertGreater(len(path), 2, "route is a single straight segment")

        walked = sum(
            ((path[i][0] - path[i + 1][0]) ** 2 + (path[i][1] - path[i + 1][1]) ** 2) ** 0.5
            for i in range(len(path) - 1)
        )
        direct = (
            (path[0][0] - path[-1][0]) ** 2 + (path[0][1] - path[-1][1]) ** 2
        ) ** 0.5
        self.assertGreater(
            walked, direct * 1.05,
            "the walked path is as short as the straight line, so it is one",
        )

    def test_route_vertices_stay_in_the_layers_extent(self):
        min_x, max_x, min_y, max_y = _layer_bounds()
        routes = MapWayfinderService.build_location_route_map(_seeded_locations(), START_ID)

        self.assertTrue(routes, "no routes built; the graph or anchoring broke")
        for location_id, path in routes.items():
            for y, x in path:
                self.assertTrue(
                    min_x <= x <= max_x and min_y <= y <= max_y,
                    f"route for location {location_id} has a vertex ({y}, {x}) off the campus",
                )

    def test_every_route_ends_at_the_building_it_belongs_to(self):
        # Comparing both sides in layer space is what the old flip broke —
        # under it every distance here was ~1113.
        #
        # The assertion is "unambiguously the nearest building", not a pixel
        # budget: the walkways were digitised by hand and some stop short of
        # the building's stored point. What must never happen is a route
        # ending nearer to some *other* building.
        locations = _seeded_locations()
        by_id = {location.id: location for location in locations}
        routes = MapWayfinderService.build_location_route_map(locations, START_ID)

        for location_id, path in routes.items():
            location = by_id[location_id]
            end_y, end_x = path[-1]

            distances = sorted(
                (
                    (
                        (Campus25dMapping.layer_point(other)[0] - end_x) ** 2
                        + (Campus25dMapping.layer_point(other)[1] - end_y) ** 2
                    ) ** 0.5,
                    other.name,
                )
                for other in locations
            )
            nearest, nearest_name = distances[0]

            # Two pairs of neighbours share a walkway terminus (I.G.P with the
            # Second Gate, UDRRMO with the PDNC Computer Lab), so "nearest" is
            # a genuine tie there rather than a mis-assignment.
            self.assertIn(
                location.name, {nearest_name, distances[1][1]},
                f"route assigned to {location.name} ends at {nearest_name}",
            )
            # Coarse guard against a whole-space regression: any offset error
            # like the old flip puts this in the hundreds or thousands.
            self.assertLess(nearest, 150, f"route ends {nearest:.0f}px from {location.name}")

    def test_coverage_does_not_silently_shrink(self):
        # A bad regeneration drops walkways without failing anything. The old
        # per-building geojson covered 11 locations; this must stay far above.
        locations = _seeded_locations()
        routes = MapWayfinderService.build_location_route_map(locations, START_ID)

        self.assertGreaterEqual(
            len(routes), 33,
            f"route coverage fell to {len(routes)} locations; rebuild the graph",
        )

        missing = {
            location.name for location in locations if location.id not in routes
        }
        self.assertEqual(
            missing, NO_ROUTE,
            "the set of locations without a walkway changed",
        )

    def test_unanchored_locations_get_no_route_rather_than_a_wrong_one(self):
        locations = _seeded_locations()
        bakery = next(location for location in locations if location.name == "CFOSH Bakery")

        # None, not an exception and not a guessed path: the kiosk's
        # straight-line fallback is honest about being a guess.
        self.assertIsNone(MapWayfinderService.anchor_for(bakery.id))
        self.assertIsNone(MapWayfinderService.route_between(2, bakery.id))
        self.assertIsNone(MapWayfinderService.route_between(bakery.id, 2))

    def test_unknown_ids_are_survivable(self):
        self.assertIsNone(MapWayfinderService.route_between(None, 2))
        self.assertIsNone(MapWayfinderService.route_between(2, 99999))

    def test_a_building_sharing_its_anchor_with_the_start_has_no_route(self):
        # Main Gate and the Student Services Building sit either side of the
        # hub. When start and destination resolve to the same node there is no
        # polyline to draw, and a one-point "route" would break the client.
        same = MapWayfinderService.route_between(2, 2)

        self.assertIsNone(same)
