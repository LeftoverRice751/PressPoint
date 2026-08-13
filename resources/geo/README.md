# Campus map source data

The QGIS work behind the campus map's coordinates. Nothing here is served to
browsers or read at runtime — it lives here so the georeferencing can be
audited, corrected, or redone later. The app reads exactly one file from this
whole story, and it is not in this folder: `storage/public/campus-map.png`.

These sat in `storage/public/` until 2026-08-12, which meant nginx was serving
an 8.7 MB GeoTIFF and every GeoPackage to anyone who guessed the URL.

## The one that matters

**`campus_loc.points`** — four ground control points from the QGIS
Georeferencer, each pairing a pixel on `campus-map.png` (1218x1113) with its
real WGS84 coordinate. These four rows are transcribed into `GCPS` in
`app/services/CampusGeo.py`, which derives the projective transform from them
at import. Everything else about coordinates in this app follows from this file.

Guard it. If it is lost the app keeps working — `GCPS` is a copy — but the
georeferencing can never be adjusted or re-derived without redoing the QGIS
session from scratch.

If you re-georeference the map, update `GCPS`, then run
`tests/unit/test_campus_geo.py`. It checks the new transform still puts the
image corners where the exported raster says they belong.

## Everything else

| File | What it is |
|---|---|
| `lspu_campus.gpkg` | The georeferenced map as a raster tile pyramid, EPSG:4326, 1548x1415. `tests/unit/test_campus_geo.py` checks the transform against its bounds — it was produced by QGIS independently, so agreeing with it is real corroboration. |
| `campus-map_modified.tif` | Same raster as a GeoTIFF (plus its `.aux.xml` statistics sidecar). Identical origin and pixel size to the `.gpkg`. Kept as the more portable of the two. |
| `lspu-data.gpkg` | 34 walkway LineStrings (197 segments) in real WGS84. Currently unused. This is the input for walkway routing, which is why `databases/seeds/campus_graph_seeder.py` and `app/services/MapWayfinderService.py` exist as empty files. |
| `campus_routes.geojson` | An earlier route digitisation, still in raw pixel coordinates despite being labelled CRS84. Superseded by `lspu-data.gpkg`. Kept only for history — do not build on it. |
| `campus-data.gpkg`, `campus_data.gpkg` | Both empty, 0 features. Safe to delete. |

## Why the artwork looks rotated in the georeferenced files

`campus-map.png` is drawn with the campus squared up to the page. True north is
about 13.5 degrees off that, so the georeferenced exports — which must be
north-up — hold the same artwork rotated inside a larger frame, with the
corners filled in.

The kiosk does not use those exports. It draws the original upright PNG and
converts real coordinates into pixel positions on it, which is why the map
still looks the way it always has.
