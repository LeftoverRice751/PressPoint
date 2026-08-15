# Campus map source data

The QGIS work behind the campus map's coordinates and its walking routes.
Nothing here is served to browsers. Two files are read by the app at runtime —
`campus_25d_mapping.json` and `campus_graph.json` — and both are *generated*;
everything else lives here so the georeferencing can be audited, corrected, or
redone later.

These sat in `storage/public/` until 2026-08-12, which meant nginx was serving
an 8.7 MB GeoTIFF and every GeoPackage to anyone who guessed the URL.

## The two that matter

**`campus_loc.points`** — four ground control points from the QGIS
Georeferencer, each pairing a pixel on `campus-map.png` (1218x1113) with its
real WGS84 coordinate. These four rows are transcribed into `GCPS` in
`scripts/build_campus_graph.py`, which derives the projective transform from
them at run time. Everything about converting between the globe and the map's
pixel space follows from this file.

Guard it. If it is lost the app keeps working — `GCPS` is a copy — but the
georeferencing can never be adjusted or re-derived without redoing the QGIS
session from scratch.

**`lspu-data.gpkg`** — the walkway network: 34 LineStrings in real WGS84,
digitised over the campus in QGIS. This is the source you edit to change how
the kiosk routes people around campus. Every line starts at a shared hub near
the Main Gate and ends at one building, so the network is a star rather than a
mesh; adding cross-links between the spokes is what would make routes between
two arbitrary buildings take a sensible path instead of going back via the hub.

## Editing the routes

1. Open `lspu-data.gpkg` in QGIS. It is EPSG:4326, so it drops onto any
   basemap correctly. Do **not** trace against `lspu_campus.gpkg` or
   `campus-map_modified.tif` — those are north-up exports of artwork that is
   drawn ~13.5° off north, so they are rotated relative to what the kiosk draws.
2. Turn on snapping for the layer (*Vertex and segment*) **and topological
   editing**. Without it new lines land a hair off the existing ones, and the
   builder's weld tolerance either misses the join or swallows real detail.
3. Draw. Toggle editing off and save — GeoPackage edits are written in place,
   so there is no export step.
4. Rebuild the graph and read the table it prints before saving:

   ```bash
   venv/bin/python scripts/build_campus_graph.py           # review
   venv/bin/python scripts/build_campus_graph.py --write   # save
   venv/bin/python -m pytest tests/unit/test_campus_wayfinding.py -q
   ```

5. Commit both `lspu-data.gpkg` and the regenerated `campus_graph.json`.

The builder refuses to write a graph that has fragmented into more than one
connected component, because that failure is otherwise invisible: the kiosk
just answers "no route" for half the campus and falls back to straight lines.
If it refuses, either fix the gap in QGIS or raise `--snap`.

Three locations have no walkway drawn to them yet — the CCJE Academic
Building, the CFOSH Bakery, and the Activity Center. They keep the kiosk's
straight-line fallback until someone draws them a spur.

## Everything else

| File | What it is |
|---|---|
| `campus_graph.json` | **Generated.** The walkway network baked into 2.5D layer pixel space: nodes, edges, and the node each location attaches to. Read at import by `app/services/MapWayfinderService.py`. Do not hand-edit — rebuild it. |
| `campus_25d_mapping.json` | **Generated.** Bridges the 2.5D layer's string feature ids ("H", "17", "19b") to numeric `locations.id`. Rebuild with `scripts/generate_campus_25d_mapping.py`. |
| `lspu_campus.gpkg` | The georeferenced map as a raster tile pyramid, EPSG:4326, 1548x1415. Produced by QGIS independently of `GCPS`, so it is the honest check on the transform. |
| `campus-map_modified.tif` | Same raster as a GeoTIFF (plus its `.aux.xml` statistics sidecar). Identical origin and pixel size to the `.gpkg`. Kept as the more portable of the two. |
| `campus-data.gpkg`, `campus_data.gpkg` | Both empty, 0 features. Safe to delete. |

## Why the artwork looks rotated in the georeferenced files

`campus-map.png` is drawn with the campus squared up to the page. True north is
about 13.5 degrees off that, so the georeferenced exports — which must be
north-up — hold the same artwork rotated inside a larger frame, with the
corners filled in.

The kiosk does not use those exports, and no longer draws `campus-map.png`
either: it draws the 2.5D layer (`resources/js/campus-2.5d.layer.js`), whose
embedded footprints are in the same upright pixel space. `campus-map.png` is
still what the georeferencing is expressed against, which is why re-exporting
the artwork at a different size would invalidate both `GCPS` and every
coordinate in the `locations` table.
