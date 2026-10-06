"""Bake `resources/geo/lspu-data.gpkg` into the kiosk's walkway graph.

The kiosk used to draw a straight line from the start to whatever building the
visitor tapped, straight through every wall in between, because
`campus_routes.geojson` only covered 11 of 37 locations and everything else
fell back to a single segment. The walkways to fix that were digitised in QGIS
long ago and sat unused in `lspu-data.gpkg`: 34 LineStrings in real WGS84.

They went unused because the app had no way to read them. `locations` and the
2.5D layer live in pixel space, the gpkg lives on the globe, and the module
that converted between the two -- `app/services/CampusGeo.py` -- was deleted in
commit 36fed26 when the flat imageOverlay went away. The transform came back
to life in `app/services/CampusGeoTransform.py`; this script just imports it
to bake the walkway graph offline, by hand, never on the request path. (The
mobile route page now applies the same transform live, client-side, to place
a phone's GPS reading against the route -- see that module's docstring.)

    venv/bin/python scripts/build_campus_graph.py           # print the table only
    venv/bin/python scripts/build_campus_graph.py --write   # ...and save the graph

Nothing is written without --write. Read the table first: the flagged rows are
the script guessing which building a walkway was meant to reach, not knowing.

Output is `resources/geo/campus_graph.json` in the 2.5D layer's space, which is
the only space that reaches a client (see app/services/Campus25dMapping.py).
"""

import argparse
import json
import math
import os
import sqlite3
import struct
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from wsgi import application  # noqa: E402,F401  (boots the container + env)

from app.models.Locations import Locations  # noqa: E402
from app.services import Campus25dMapping  # noqa: E402
from app.services.CampusGeoTransform import _to_layer  # noqa: E402


_ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
_GPKG_PATH = os.path.join(_ROOT, "resources", "geo", "lspu-data.gpkg")
_OUTPUT_PATH = os.path.join(_ROOT, "resources", "geo", "campus_graph.json")

#: Vertices this close together are the same node. The walkways were drawn by
#: hand without topological editing, so the 34 lines meet at *nearly* the same
#: points rather than exactly: at 1.0 the network falls into 8 disconnected
#: islands, at 3.0 it welds into one. Anything under ~3px is digitising slop,
#: and the narrowest real walkway on campus is far wider than that.
DEFAULT_SNAP = 3.0

#: A walkway whose last vertex is further than this from the building it got
#: assigned to is flagged for review rather than trusted. Roughly half the
#: width of a typical block: close enough that "the path ends at the door" is
#: plausible, far enough that a wrong assignment stands out.
ANCHOR_REVIEW_DISTANCE = 60.0

#: Doors the terminus match cannot find on its own, by location name, as a
#: point in layer space. Each location here is anchored to that point: on the
#: network if a walkway already reaches it, otherwise via a straight spur from
#: the nearest point on any walkway. Without these, the three buildings below
#: sat over ANCHOR_REVIEW_DISTANCE from every terminus and got the kiosk's
#: straight-line fallback, which reads as "the routing is broken".
#:
#: Prefer drawing the path in QGIS; this is for doors the gpkg cannot express
#: (a pin far from its own entrance, a building with no path of its own).
DOORS = {
    # The ROTC walkway runs along this block's south face, ~30px below it, but
    # only *ends* at the ROTC building. A short spur north reaches its door.
    "College of Criminal Justice and Education Academic Building (CCJE)": (222.0, -255.0),
    # A walkway already ends at its south face; the pin was just placed at the
    # block's south-east corner, 62px away, two pixels past the review cutoff.
    "Activity Center (AC)": (734.39, -542.55),
    # Directly behind COE Old with no path drawn around it, so it shares COE
    # Old's door. The route ends nearer COE Old, on purpose.
    "CFOSH Bakery": (951.81, -264.92),
}

#: A door further than this from every walkway is a typo, not a spur: a long
#: straight leg would cut through buildings, which is the bug DOORS fixes.
MAX_SPUR_LENGTH = 40.0


# --------------------------------------------------------------------------
# Reading the GeoPackage
# --------------------------------------------------------------------------

def _wkb_linestrings(blob):
    """Pull the LineStrings out of one GeoPackage geometry blob.

    A .gpkg is a SQLite database whose geometry column holds a small binary
    header followed by standard WKB. Parsed by hand because neither GDAL nor
    shapely is in this venv, and adding a compiled geo stack to run a script
    four times a year is a poor trade.

    Layout: magic "GP", version, flags, srs_id, an optional envelope whose
    size the flags encode, then the WKB itself.
    """
    if blob[:2] != b"GP":
        raise ValueError("Not a GeoPackage geometry blob.")

    envelope_bytes = {0: 0, 1: 32, 2: 48, 3: 48, 4: 64}[(blob[3] >> 1) & 0x07]
    wkb = blob[8 + envelope_bytes:]

    endian = "<" if wkb[0] == 1 else ">"
    # The %1000 drops the Z/M dimension flags; we only ever want x and y.
    geometry_type = struct.unpack(endian + "I", wkb[1:5])[0] % 1000

    def read_points(buffer, offset, order):
        count = struct.unpack(order + "I", buffer[offset:offset + 4])[0]
        offset += 4
        points = [
            struct.unpack(order + "dd", buffer[offset + 16 * i:offset + 16 + 16 * i])
            for i in range(count)
        ]
        return points, offset + 16 * count

    if geometry_type == 2:  # LineString
        points, _ = read_points(wkb, 5, endian)
        return [points]

    if geometry_type == 5:  # MultiLineString
        count = struct.unpack(endian + "I", wkb[5:9])[0]
        lines = []
        cursor = 9
        for _ in range(count):
            # Each part carries its own byte order and type header.
            part_endian = "<" if wkb[cursor] == 1 else ">"
            points, cursor = read_points(wkb, cursor + 5, part_endian)
            lines.append(points)
        return lines

    return []


def load_walkways():
    """Return the gpkg's walkways as lists of (x, y) in layer space."""
    if not os.path.exists(_GPKG_PATH):
        raise SystemExit("Missing %s -- nothing to build from." % _GPKG_PATH)

    connection = sqlite3.connect(_GPKG_PATH)
    try:
        cursor = connection.cursor()
        table, column = cursor.execute(
            "select table_name, column_name from gpkg_geometry_columns"
        ).fetchone()
        rows = cursor.execute('select "%s" from "%s"' % (column, table)).fetchall()
    finally:
        connection.close()

    walkways = []
    for (blob,) in rows:
        for points in _wkb_linestrings(blob):
            converted = [_to_layer(lng, lat) for lng, lat in points]
            if len(converted) >= 2:
                walkways.append(converted)
    return walkways


# --------------------------------------------------------------------------
# Building the graph
# --------------------------------------------------------------------------

def build_graph(walkways, snap):
    """Weld nearby vertices into shared nodes and return (nodes, edges).

    Welding is what turns 34 separate polylines into a network: without it
    every walkway is its own island and a path can never leave the one it
    started on. The grid buckets keep this from being an O(n^2) scan, though
    at 231 vertices that is a courtesy to the reader more than the CPU.
    """
    nodes = []
    buckets = {}

    def node_for(point):
        x, y = point
        cell_x, cell_y = int(math.floor(x / snap)), int(math.floor(y / snap))
        # A point can be within `snap` of a node in any of the 9 cells around
        # it, not just its own -- checking one cell would miss welds across a
        # cell boundary, which is most of them.
        best_index, best_distance = None, None
        for dx in (-1, 0, 1):
            for dy in (-1, 0, 1):
                for index in buckets.get((cell_x + dx, cell_y + dy), ()):
                    distance = math.hypot(nodes[index][0] - x, nodes[index][1] - y)
                    if distance <= snap and (best_distance is None or distance < best_distance):
                        best_index, best_distance = index, distance
        if best_index is not None:
            return best_index

        nodes.append((x, y))
        buckets.setdefault((cell_x, cell_y), []).append(len(nodes) - 1)
        return len(nodes) - 1

    edges = {}
    for walkway in walkways:
        indices = [node_for(point) for point in walkway]
        for a, b in zip(indices, indices[1:]):
            if a == b:
                continue  # a segment shorter than the snap tolerance
            cost = math.hypot(nodes[a][0] - nodes[b][0], nodes[a][1] - nodes[b][1])
            edges[(min(a, b), max(a, b))] = cost

    return nodes, [[a, b, cost] for (a, b), cost in sorted(edges.items())]


def connected_components(node_count, edges):
    """Return the node index sets that can reach each other."""
    parent = list(range(node_count))

    def find(a):
        while parent[a] != a:
            parent[a] = parent[parent[a]]
            a = parent[a]
        return a

    for a, b, _ in edges:
        root_a, root_b = find(a), find(b)
        if root_a != root_b:
            parent[root_a] = root_b

    groups = {}
    for index in range(node_count):
        groups.setdefault(find(index), []).append(index)
    return list(groups.values())


def resolve_anchors(nodes, walkways, locations):
    """Attach each location to the node a walkway terminates on.

    Matching is by terminus proximity: a walkway was drawn *between* places, so
    its first and last vertices say which buildings it serves. Only termini are
    candidates -- matching against every node would let a building claim a
    walkway that merely passes by on its way somewhere else.

    Both ends count, not just the last. All 34 walkways radiate from one hub
    near the Main Gate, so that hub is only ever a *first* vertex: considering
    last vertices alone left Main Gate anchored 43px away on the Student
    Services Building's node instead of on the hub at its own doorstep.

    Returns (anchors, report_rows) where report_rows carries the distances so
    the caller can show its work.
    """
    terminus_nodes = set()
    for walkway in walkways:
        for terminus in (walkway[0], walkway[-1]):
            best_index, best_distance = None, None
            for index, (x, y) in enumerate(nodes):
                distance = math.hypot(x - terminus[0], y - terminus[1])
                if best_distance is None or distance < best_distance:
                    best_index, best_distance = index, distance
            terminus_nodes.add(best_index)

    anchors = {}
    rows = []
    for location in locations:
        point = Campus25dMapping.layer_point(location)
        if point is None:
            rows.append((location, None, None))
            continue

        best_node, best_distance = None, None
        for node_index in sorted(terminus_nodes):
            x, y = nodes[node_index]
            distance = math.hypot(x - point[0], y - point[1])
            if best_distance is None or distance < best_distance:
                best_node, best_distance = node_index, distance

        if best_node is None or best_distance > ANCHOR_REVIEW_DISTANCE:
            # Kept out of the graph rather than anchored to a walkway that
            # plainly does not serve it: the kiosk's straight-line fallback is
            # honest about being a guess, a wrong route is not.
            rows.append((location, best_node, best_distance))
            continue

        anchors[str(location.id)] = best_node
        rows.append((location, best_node, best_distance))

    return anchors, rows


def attach_doors(nodes, edges, anchors, rows, locations, snap):
    """Anchor each DOORS location to its door, adding a spur where needed.

    The door joins the network at the nearest point on any edge, splitting
    that edge there -- welding only joins vertices, so a door beside the middle
    of a walkway would otherwise have nothing to attach to. Mutates nodes,
    edges, anchors and rows in place.
    """
    by_name = {location.name: location for location in locations}

    def cost(a, b):
        return math.hypot(nodes[a][0] - nodes[b][0], nodes[a][1] - nodes[b][1])

    for name, door in DOORS.items():
        location = by_name.get(name)
        if location is None:
            # A renamed row would otherwise quietly drop back to a straight line.
            raise SystemExit("DOORS names %r, but no location has that name." % name)

        best = None
        for position, (a, b, _) in enumerate(edges):
            (ax, ay), (bx, by) = nodes[a], nodes[b]
            dx, dy = bx - ax, by - ay
            t = ((door[0] - ax) * dx + (door[1] - ay) * dy) / ((dx * dx + dy * dy) or 1.0)
            t = max(0.0, min(1.0, t))
            point = (ax + t * dx, ay + t * dy)
            distance = math.hypot(point[0] - door[0], point[1] - door[1])
            if best is None or distance < best[0]:
                best = (distance, position, point)

        distance, position, point = best
        if distance > MAX_SPUR_LENGTH:
            raise SystemExit(
                "Door for %r is %.1fpx from every walkway (max %.0f). "
                "Draw its path in QGIS instead." % (name, distance, MAX_SPUR_LENGTH)
            )

        a, b, _ = edges[position]
        if math.hypot(nodes[a][0] - point[0], nodes[a][1] - point[1]) <= snap:
            junction = a
        elif math.hypot(nodes[b][0] - point[0], nodes[b][1] - point[1]) <= snap:
            junction = b
        else:
            nodes.append(point)
            junction = len(nodes) - 1
            edges[position] = [a, junction, cost(a, junction)]
            edges.append([junction, b, cost(junction, b)])

        target = junction
        if distance > snap:
            nodes.append(door)
            target = len(nodes) - 1
            edges.append([junction, target, cost(junction, target)])

        anchors[str(location.id)] = target
        point = Campus25dMapping.layer_point(location)
        door_distance = math.hypot(point[0] - nodes[target][0], point[1] - nodes[target][1])
        rows[:] = [row for row in rows if row[0].id != location.id]
        rows.append((location, target, door_distance))


def print_report(walkways, nodes, edges, components, anchors, rows, snap):
    print("source      : %s" % os.path.relpath(_GPKG_PATH, _ROOT))
    print("walkways    : %d" % len(walkways))
    print("snap        : %.1f px" % snap)
    print("nodes/edges : %d / %d" % (len(nodes), len(edges)))
    print("components  : %d%s" % (
        len(components),
        "" if len(components) == 1 else "  <-- FRAGMENTED, will not write",
    ))

    xs = [x for x, _ in nodes]
    ys = [y for _, y in nodes]
    print("extent      : x %.1f..%.1f   y %.1f..%.1f" % (min(xs), max(xs), min(ys), max(ys)))
    print()

    print("%-52s %8s  %s" % ("location", "dist px", "anchor"))
    print("-" * 76)
    for location, node_index, distance in sorted(rows, key=lambda r: -(r[2] or 0)):
        name = (location.name or "")[:52]
        if node_index is None:
            print("%-52s %8s  %s" % (name, "-", "no coordinate -> straight-line fallback"))
        elif str(location.id) not in anchors:
            print("%-52s %8.1f  %s" % (name, distance, "TOO FAR -> straight-line fallback"))
        else:
            flag = "review" if distance > ANCHOR_REVIEW_DISTANCE / 2 else ""
            print("%-52s %8.1f  node %-5d %s" % (name, distance, node_index, flag))

    print()
    claimed = {}
    for location_id, node_index in anchors.items():
        claimed.setdefault(node_index, []).append(location_id)
    shared = {k: v for k, v in claimed.items() if len(v) > 1}
    if shared:
        print("nodes serving more than one location: %s" % shared)
    print("anchored    : %d / %d locations" % (len(anchors), len(rows)))


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--write", action="store_true", help="save campus_graph.json")
    parser.add_argument("--snap", type=float, default=DEFAULT_SNAP,
                        help="vertex weld tolerance in pixels (default %.1f)" % DEFAULT_SNAP)
    args = parser.parse_args()

    walkways = load_walkways()
    nodes, edges = build_graph(walkways, args.snap)
    components = connected_components(len(nodes), edges)
    locations = Locations.all()
    anchors, rows = resolve_anchors(nodes, walkways, locations)
    # After resolve_anchors, so a spur's end never becomes a terminus some
    # other building could claim.
    attach_doors(nodes, edges, anchors, rows, locations, args.snap)

    print_report(walkways, nodes, edges, components, anchors, rows, args.snap)

    if not args.write:
        print("\nDry run. Re-run with --write to save.")
        return

    if len(components) != 1:
        # A fragmented graph does not fail loudly at runtime -- it just returns
        # "no route" for whichever half the visitor asked about. Refusing here
        # is the only place that mistake is visible.
        raise SystemExit(
            "\nRefusing to write: the graph has %d components, expected 1.\n"
            "Raise --snap, or fix the gaps in QGIS with topological editing on."
            % len(components)
        )

    payload = {
        "_docs": "Generated by scripts/build_campus_graph.py from lspu-data.gpkg. "
                 "Coordinates are 2.5D layer space (x, y-down-negative). Do not hand-edit.",
        "snap": args.snap,
        "nodes": [[round(x, 2), round(y, 2)] for x, y in nodes],
        "edges": [[a, b, round(cost, 2)] for a, b, cost in edges],
        "anchors": anchors,
    }
    with open(_OUTPUT_PATH, "w") as handle:
        json.dump(payload, handle, indent=1)
        handle.write("\n")
    print("\nWrote %s" % os.path.relpath(_OUTPUT_PATH, _ROOT))


if __name__ == "__main__":
    main()
