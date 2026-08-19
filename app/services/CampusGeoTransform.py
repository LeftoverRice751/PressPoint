"""The WGS84 <-> campus-pixel projective transform, recovered from the four
ground control points in `resources/geo/campus_loc.points`.

This used to live only inside `scripts/build_campus_graph.py`, derived and
applied offline, never on the request path (see `resources/geo/README.md`).
It moved here because the mobile route page now needs to place a live phone
GPS reading against the route polyline, which means *applying* the transform
at request/client time. The derivation itself is still the same one-time
solve it always was -- nothing here re-digitises anything or touches QGIS
data; it just runs once at import, same as `MapWayfinderService._load_graph`.

`scripts/build_campus_graph.py` imports its GCPS/homography helpers from here
now instead of duplicating them, so there is exactly one copy of this math.
"""

import math

# Four ground control points from the QGIS Georeferencer, each pairing a
# pixel on campus-map.png with its true WGS84 coordinate. Four pairs is
# exactly what a projective transform needs -- eight unknowns, two equations
# each -- so these pin the mapping down completely, with nothing left over.
# Transcribed from resources/geo/campus_loc.points; QGIS reported residuals
# of ~1e-13.
#
# source_x / source_y are QGIS's convention: y runs *down* from the top-left
# as a negative number. That is also the 2.5D layer's convention, which is
# why nothing here flips anything -- see the note on `_to_layer()` below.
GCPS = [
    (98.34282786885313499, -30.56188524590491795, 121.3958018261938463, 14.26345583100606618),
    (1147.48217213114730839, -192.49426229508520692, 121.39842262645169058, 14.26400689281183531),
    (553.71530517266808147, -1060.90722381573732491, 121.39780350506512718, 14.2615572304027971),
    (1143.70570482461880601, -1001.90241602964340473, 121.39914483934599332, 14.26220258513255246),
]


def _solve(matrix, rhs):
    """Gaussian elimination with partial pivoting. Returns the solution vector.

    Small and self-contained on purpose: pulling numpy in for one 8x8 solve
    would put a compiled dependency on this repo for no gain.
    """
    n = len(rhs)
    aug = [list(row) + [rhs[i]] for i, row in enumerate(matrix)]

    for col in range(n):
        pivot = max(range(col, n), key=lambda r: abs(aug[r][col]))
        if abs(aug[pivot][col]) < 1e-15:
            raise ValueError("Degenerate control points: no unique transform.")
        aug[col], aug[pivot] = aug[pivot], aug[col]

        for row in range(col + 1, n):
            factor = aug[row][col] / aug[col][col]
            if factor:
                for k in range(col, n + 1):
                    aug[row][k] -= factor * aug[col][k]

    out = [0.0] * n
    for row in range(n - 1, -1, -1):
        total = aug[row][n] - sum(aug[row][k] * out[k] for k in range(row + 1, n))
        out[row] = total / aug[row][row]
    return out


def _homography(pairs):
    """Build the 3x3 projective transform taking each src point to its dst."""
    rows, rhs = [], []
    for src_x, src_y, dst_x, dst_y in pairs:
        rows.append([src_x, src_y, 1, 0, 0, 0, -dst_x * src_x, -dst_x * src_y])
        rhs.append(dst_x)
        rows.append([0, 0, 0, src_x, src_y, 1, -dst_y * src_x, -dst_y * src_y])
        rhs.append(dst_y)

    h = _solve(rows, rhs)
    return [
        [h[0], h[1], h[2]],
        [h[3], h[4], h[5]],
        [h[6], h[7], 1.0],
    ]


def _invert(m):
    """Invert a 3x3 matrix via its adjugate."""
    (a, b, c), (d, e, f), (g, h, i) = m

    cof = [
        [e * i - f * h, c * h - b * i, b * f - c * e],
        [f * g - d * i, a * i - c * g, c * d - a * f],
        [d * h - e * g, b * g - a * h, a * e - b * d],
    ]
    det = a * cof[0][0] + b * cof[1][0] + c * cof[2][0]
    if abs(det) < 1e-30:
        raise ValueError("Transform is not invertible.")

    return [[cof[r][col] / det for col in range(3)] for r in range(3)]


def _apply(m, x, y):
    """Push (x, y) through a projective matrix, including the divide."""
    denominator = m[2][0] * x + m[2][1] * y + m[2][2]
    if abs(denominator) < 1e-30:
        raise ValueError("Point projects to infinity.")
    return (
        (m[0][0] * x + m[0][1] * y + m[0][2]) / denominator,
        (m[1][0] * x + m[1][1] * y + m[1][2]) / denominator,
    )


#: Parsed once at import -- these are generated data, not runtime state.
PIXEL_TO_WGS84 = _homography(GCPS)
WGS84_TO_PIXEL = _invert(PIXEL_TO_WGS84)


def _to_layer(lng, lat):
    """Real coordinate -> 2.5D layer pixel, as (x, y).

    The old CampusGeo.to_pixel() added MAP_IMAGE_HEIGHT here to flip y
    upward, because the flat imageOverlay's origin sat at the bottom-left.
    The 2.5D layer that replaced it kept QGIS's y-down-negative convention,
    which is what WGS84_TO_PIXEL already produces -- so the correct amount of
    flipping is none. Adding it back puts every point one whole image height
    above the campus, which is the bug that made routes draw off the map.
    """
    return _apply(WGS84_TO_PIXEL, float(lng), float(lat))


def wgs84_to_layer_point(lat, lng):
    """(lat, lng) -> (x, y) in 2.5D layer pixel space."""
    return _to_layer(lng, lat)


def layer_point_to_wgs84(x, y):
    """(x, y) in 2.5D layer pixel space -> (lat, lng).

    Only meant for numeric use (distance checks) on the far side -- never
    hand the result back into a Leaflet CRS.Simple call. That is exactly the
    space `Campus25dMapping.py` warns is one image height off from what the
    layer draws with.
    """
    lng, lat = _apply(PIXEL_TO_WGS84, float(x), float(y))
    return lat, lng


def wgs84_to_pixel_matrix():
    """The raw 3x3 WGS84->pixel matrix, for shipping to a client.

    The client only ever needs to *apply* this (a projective divide, a few
    lines of JS) -- deriving it stays here, offline-adjacent, a one-time
    import-time solve against `GCPS`.
    """
    return [row[:] for row in WGS84_TO_PIXEL]


def haversine_meters(lat1, lng1, lat2, lng2):
    """Great-circle distance between two WGS84 points, in meters."""
    radius = 6371000.0
    phi1, phi2 = math.radians(lat1), math.radians(lat2)
    d_phi = math.radians(lat2 - lat1)
    d_lambda = math.radians(lng2 - lng1)
    a = (
        math.sin(d_phi / 2) ** 2
        + math.cos(phi1) * math.cos(phi2) * math.sin(d_lambda / 2) ** 2
    )
    return 2 * radius * math.asin(math.sqrt(a))
