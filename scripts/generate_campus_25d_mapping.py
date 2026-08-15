"""Propose `resources/geo/campus_25d_mapping.json` by matching locations to footprints.

The 2.5D layer (resources/js/campus-2.5d.layer.js) draws its buildings from an
embedded GeoJSON whose features carry their own ids ("H", "17", "19b"). The
kiosk needs to know which of those is which row in `locations`, and hand-authoring
37 of those from memory is slow and error-prone.

Both datasets are the same QGIS digitisation, so the machine can propose the
pairing: convert each location into layer space (Campus25dMapping.layer_point)
and pair it with the nearest building footprint's centroid.

    python scripts/generate_campus_25d_mapping.py           # print the table only
    python scripts/generate_campus_25d_mapping.py --write   # ...and save the file

Nothing is written without --write. Review the distances first: a pairing far
larger than a building's own size is the script guessing, not knowing.
"""

import argparse
import json
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from wsgi import application  # noqa: E402,F401  (boots the container + env)

from app.models.Locations import Locations  # noqa: E402
from app.services import Campus25dMapping  # noqa: E402


LAYER_JS = os.path.join(
    os.path.dirname(os.path.dirname(os.path.abspath(__file__))),
    "resources", "js", "campus-2.5d.layer.js",
)

#: Only real buildings are candidates. The layer's ground plane, walkways,
#: open areas and standalone gate markers would win on centroid distance by
#: accident — the gate markers are small glyphs sitting in the middle of the
#: paths, which is exactly where a nearby building's stored point tends to be.
BUILDING_KINDS = {"building"}

#: Beyond this the pairing is a guess, not a match. Footprints run 50-200px
#: across, so a centroid this far off is a different building.
REVIEW_DISTANCE = 120.0


def load_layer_features():
    """Slice L.CAMPUS_25D_DATA out of the vendored plugin.

    The data is a plain object literal inside the IIFE, not an export, so it
    is read with a balanced-brace scan rather than imported.
    """
    with open(LAYER_JS) as handle:
        source = handle.read()

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
    else:
        raise SystemExit("Could not find the end of CAMPUS in campus-2.5d.layer.js")

    return json.loads(source[start:end])["features"]


def centroid(feature):
    """Mean of every vertex in the feature, in layer space."""
    points = []

    def walk(node):
        if isinstance(node[0], (int, float)):
            points.append(node)
        else:
            for child in node:
                walk(child)

    walk(feature["geometry"]["coordinates"])
    return (
        sum(point[0] for point in points) / len(points),
        sum(point[1] for point in points) / len(points),
    )


def is_plausible(location, feature):
    """Reject pairings that geometry likes but the campus does not.

    The layer draws the gate structures as buildings ("Gate G", "Gate H").
    A college whose nearest footprint is a gate does not live in that gate —
    it means the layer has no footprint for it at all, and it is better left
    unmapped: the kiosk then pins it from its own coordinates and tapping the
    gate correctly selects nothing.
    """
    feature_name = (feature["properties"].get("name") or "").strip().lower()
    if not feature_name.startswith("gate"):
        return True

    text = f"{location.name or ''} {getattr(location, 'type', '') or ''}".lower()
    return any(word in text for word in ("gate", "entrance", "exit"))


def build_pairs(locations, features):
    """Greedy nearest-first assignment, one feature per location.

    Every (location, feature) pair is scored, then consumed cheapest-first;
    a location or feature already claimed is skipped. Greedy rather than
    optimal because the inputs are the same digitisation — the nearest match
    is unambiguous — and a wrong pair is easier to spot in a sorted table.
    """
    candidates = []
    for location in locations:
        point = Campus25dMapping.layer_point(location)
        if point is None:
            continue
        for feature in features:
            if feature["properties"].get("kind") not in BUILDING_KINDS:
                continue
            if not is_plausible(location, feature):
                continue
            feature_x, feature_y = centroid(feature)
            distance = ((point[0] - feature_x) ** 2 + (point[1] - feature_y) ** 2) ** 0.5
            candidates.append((distance, location, feature))

    candidates.sort(key=lambda row: row[0])

    pairs = []
    used_locations = set()
    used_features = set()
    for distance, location, feature in candidates:
        feature_id = str(feature["properties"]["id"])
        if location.id in used_locations or feature_id in used_features:
            continue
        used_locations.add(location.id)
        used_features.add(feature_id)
        pairs.append((distance, location, feature))

    return pairs, used_locations


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--write", action="store_true", help="save the proposed mapping")
    args = parser.parse_args()

    features = load_layer_features()
    locations = list(Locations.all())
    pairs, used_locations = build_pairs(locations, features)

    print(f"{len(locations)} locations, "
          f"{sum(1 for f in features if f['properties'].get('kind') in BUILDING_KINDS)} "
          f"candidate footprints\n")
    print(f"{'dist':>6}  {'feature':<6} {'layer name':<22} location")
    print("-" * 78)
    for distance, location, feature in sorted(pairs, key=lambda row: row[0]):
        flag = "  <-- review" if distance > REVIEW_DISTANCE else ""
        print(f"{distance:6.1f}  {str(feature['properties']['id']):<6} "
              f"{(feature['properties'].get('name') or ''):<22} {location.name}{flag}")

    unmatched = [loc.name for loc in locations if loc.id not in used_locations]
    if unmatched:
        print(f"\nNo footprint left for {len(unmatched)}: {', '.join(unmatched)}")

    far = [row for row in pairs if row[0] > REVIEW_DISTANCE]
    print(f"\n{len(pairs)} paired, {len(far)} beyond {REVIEW_DISTANCE:.0f}px worth checking.")

    if not args.write:
        print("\nNothing written. Re-run with --write once the table looks right.")
        return

    with open(Campus25dMapping._MAPPING_PATH) as handle:
        existing = json.load(handle) or {}

    # Underscore keys carry the file's own documentation; Campus25dMapping
    # skips them at load, so they survive a regeneration untouched.
    mapping = {key: value for key, value in existing.items() if key.startswith("_")}
    for _distance, location, feature in pairs:
        mapping[str(feature["properties"]["id"])] = int(location.id)

    with open(Campus25dMapping._MAPPING_PATH, "w") as handle:
        json.dump(mapping, handle, indent=2)
        handle.write("\n")

    print(f"\nWrote {len(pairs)} entries to {Campus25dMapping._MAPPING_PATH}")


if __name__ == "__main__":
    main()
