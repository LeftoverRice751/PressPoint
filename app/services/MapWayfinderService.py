"""Shortest walking routes across campus, over the digitised walkway network.

The kiosk used to answer "how do I get there?" with a straight line from the
start to the building, straight through whatever stood between them. That was
never the intent — it was the fallback showing through, because the previous
source (`campus_routes.geojson`, one hand-drawn polyline per building) only
covered 11 of 37 locations and every other building fell through to it.

This module routes over `resources/geo/campus_graph.json` instead: 116 nodes
and 155 edges welded out of the 34 walkways in `resources/geo/lspu-data.gpkg`,
which were digitised in QGIS against the real campus. Rebuild it with
`scripts/build_campus_graph.py` after editing the walkways; the transform from
QGIS's WGS84 into the coordinates used here lives in that script, offline,
because nothing on the request path should be doing projective geometry.

Coordinate space: the graph is stored in the 2.5D layer's pixel space (x right,
y negative running down from the top of the campus) and routes are handed out
as `[y, x]` pairs because Leaflet's CRS.Simple is y-first. That is the same
shape the old CampusRoutes returned, so the JSON payload did not change when
this replaced it. See app/services/Campus25dMapping.py for why the stored
`locations.latitude` is *not* this space and must never be drawn with.

Locations the walkways do not reach have no anchor, and `route_between` returns
None for them rather than inventing a last leg. The kiosk then draws its
straight-line fallback, which is honest about being a guess in a way that a
route through a wall is not.
"""

import heapq
import json
from pathlib import Path


_GRAPH_PATH = (
    Path(__file__).resolve().parents[2] / "resources" / "geo" / "campus_graph.json"
)


def _load_graph():
    """Parse the baked graph into (nodes, adjacency, anchors).

    Returns empty structures rather than raising when the file is missing: a
    kiosk that falls back to straight lines is degraded, one that will not boot
    is down. The tests are what catch a graph that failed to generate.
    """
    if not _GRAPH_PATH.exists():
        return [], {}, {}

    with open(_GRAPH_PATH) as handle:
        data = json.load(handle) or {}

    nodes = [(float(x), float(y)) for x, y in data.get("nodes", [])]

    adjacency = {}
    for edge in data.get("edges", []) or []:
        a, b, cost = int(edge[0]), int(edge[1]), float(edge[2])
        adjacency.setdefault(a, []).append((b, cost))
        adjacency.setdefault(b, []).append((a, cost))

    anchors = {}
    for location_id, node_index in (data.get("anchors") or {}).items():
        try:
            anchors[int(location_id)] = int(node_index)
        except (TypeError, ValueError):
            # Skip a malformed entry rather than crashing the app on boot.
            continue

    return nodes, adjacency, anchors


#: Parsed once at import — the graph is generated data, not runtime state.
_NODES, _ADJACENCY, _ANCHORS = _load_graph()


def nodes():
    """The graph's vertices as (x, y) in layer space."""
    return _NODES


def anchor_for(location_id):
    """Return the node a location sits on, or None if no walkway reaches it."""
    if location_id is None:
        return None
    try:
        return _ANCHORS.get(int(location_id))
    except (TypeError, ValueError):
        return None


def component_count():
    """How many disconnected islands the graph is in. Anything but 1 is a bug.

    A fragmented graph does not raise — it answers "no route" for whichever
    side of the break the visitor asked about, which looks exactly like the
    straight-line behaviour this module exists to remove.
    """
    if not _NODES:
        return 0

    seen = set()
    count = 0
    for start in range(len(_NODES)):
        if start in seen:
            continue
        count += 1
        stack = [start]
        seen.add(start)
        while stack:
            current = stack.pop()
            for neighbour, _ in _ADJACENCY.get(current, ()):
                if neighbour not in seen:
                    seen.add(neighbour)
                    stack.append(neighbour)
    return count


def route_between(start_location_id, end_location_id):
    """Shortest walk between two locations as [[y, x], ...], or None.

    None means "draw your own fallback": either end may be unanchored, the ids
    may be unknown, or the two may share a node — buildings either side of the
    hub do — and a single-point route is not a polyline any client can draw.
    """
    start_node = anchor_for(start_location_id)
    end_node = anchor_for(end_location_id)
    if start_node is None or end_node is None or start_node == end_node:
        return None

    path = _shortest_path(start_node, end_node)
    if path is None:
        return None

    # [y, x]: Leaflet's CRS.Simple is y-first. Emitting [x, y] here draws every
    # route mirrored across the campus diagonal.
    return [[_NODES[index][1], _NODES[index][0]] for index in path]


def build_location_route_map(locations, start_location_id):
    """Routes from one start to every location, as {location_id: [[y, x], ...]}.

    Mirrors the shape the old CampusRoutes returned so the controller and both
    clients read it unchanged. Locations without a route are simply absent, and
    callers treat a missing key as "no route available".

    The start is passed in rather than known here: which building the kiosk
    stands in is MapController's business (KIOSK_START_LOCATION_NAME), and a
    second kiosk would make it per-request.
    """
    if anchor_for(start_location_id) is None:
        return {}

    routes = {}
    for location in locations:
        location_id = getattr(location, "id", None)
        path = route_between(start_location_id, location_id)
        if path:
            routes[location_id] = path
    return routes


def _shortest_path(start_node, end_node):
    """Dijkstra over the walkway graph. Returns node indices, or None.

    Dijkstra rather than A*: ~120 nodes resolve in microseconds, and a heuristic
    would be one more thing to get subtly wrong for no measurable gain.
    """
    distances = {start_node: 0.0}
    previous = {}
    visited = set()
    queue = [(0.0, start_node)]

    while queue:
        distance, current = heapq.heappop(queue)
        if current in visited:
            continue
        visited.add(current)

        if current == end_node:
            break

        for neighbour, cost in _ADJACENCY.get(current, ()):
            if neighbour in visited:
                continue
            candidate = distance + cost
            if candidate < distances.get(neighbour, float("inf")):
                distances[neighbour] = candidate
                previous[neighbour] = current
                heapq.heappush(queue, (candidate, neighbour))

    if end_node not in visited:
        return None

    path = [end_node]
    while path[-1] != start_node:
        path.append(previous[path[-1]])
    path.reverse()
    return path
