"""Where a spot on campus-map.png is in the real world, and back again.

The kiosk draws its map as a flat picture: Leaflet runs in CRS.Simple over
`/campus-map.png`, so a "position" there is just a pixel — x across, y up from
the bottom edge. That is fine for drawing and useless for anything else. A
pixel cannot be handed to a phone's GPS, opened in Maps, or measured in metres.

The campus map was georeferenced in QGIS, which produced
`resources/geo/campus_loc.points`: four spots clicked on the picture, each
paired with its true WGS84 coordinate. Four pairs is exactly what a projective
transform needs — it has eight unknowns and each pair supplies two equations —
so those four rows pin down the mapping completely, with nothing left over.

That makes this module the bridge. `locations` stores real WGS84; the kiosk
still wants pixels; MapController converts on the way out via `to_pixel()`.
Nothing in the browser knows any of this happened.

Both matrices are derived from GCPS at import rather than pasted in as
constants. Deriving costs one 8x8 solve at startup and buys the guarantee that
the inverse can never drift out of step with the forward transform, and that
correcting the georeferencing means editing four rows instead of eighteen
magic numbers.
"""

#: campus-map.png, in pixels. The georeferencing is expressed against this
#: exact size, so a re-export of the artwork at a different resolution
#: invalidates GCPS below.
MAP_IMAGE_WIDTH = 1218
MAP_IMAGE_HEIGHT = 1113

#: The ground control points from QGIS, as (source_x, source_y, lng, lat).
#:
#: source_x / source_y are pixels in QGIS's convention, where y runs *down*
#: from the top-left as a negative number. Leaflet's CRS.Simple runs y *up*
#: from the bottom-left, which is why `_to_source` / `_from_source` exist.
#:
#: Copied from resources/geo/campus_loc.points (columns mapX, mapY, sourceX,
#: sourceY, reordered here to read as "pixel -> world"). QGIS reported
#: residuals of ~1e-13 on all four, i.e. an exact projective fit.
GCPS = [
    (98.34282786885313499, -30.56188524590491795, 121.3958018261938463, 14.26345583100606618),
    (1147.48217213114730839, -192.49426229508520692, 121.39842262645169058, 14.26400689281183531),
    (553.71530517266808147, -1060.90722381573732491, 121.39780350506512718, 14.2615572304027971),
    (1143.70570482461880601, -1001.90241602964340473, 121.39914483934599332, 14.26220258513255246),
]


def _solve(matrix, rhs):
    """Gaussian elimination with partial pivoting. Returns the solution vector.

    Small and self-contained on purpose: pulling numpy in for one 8x8 solve
    would put a compiled dependency on the app's import path for no gain.
    """
    n = len(rhs)
    # Work on an augmented copy so the caller's rows are left alone.
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
    """Build the 3x3 projective transform taking each src point to its dst.

    A projective transform is a 3x3 matrix defined up to scale, so h33 is
    fixed at 1 and the remaining eight unknowns come out of the eight
    equations the four point pairs provide.
    """
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
    """Invert a 3x3 matrix via its adjugate.

    Left un-normalised, so this is the true matrix inverse and
    `PIXEL_TO_WGS84 @ WGS84_TO_PIXEL` is the identity. Scaling a projective
    matrix does not change the mapping it describes — `_apply` divides the
    scale straight back out — so there is nothing to gain by forcing m33 to
    1, and a matrix that is not quite an inverse is a trap for the next
    reader.
    """
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
    """Push (x, y) through a projective matrix, including the divide.

    The third row is what makes this projective rather than affine: it yields
    a per-point divisor, which is how a transform can correct for the slight
    perspective in the source artwork instead of only rotating and scaling it.
    """
    denominator = m[2][0] * x + m[2][1] * y + m[2][2]
    if abs(denominator) < 1e-30:
        raise ValueError("Point projects to infinity.")
    return (
        (m[0][0] * x + m[0][1] * y + m[0][2]) / denominator,
        (m[1][0] * x + m[1][1] * y + m[1][2]) / denominator,
    )


PIXEL_TO_WGS84 = _homography(GCPS)
WGS84_TO_PIXEL = _invert(PIXEL_TO_WGS84)


def _to_source(map_y):
    """Leaflet y (up from the bottom) -> QGIS y (down from the top, negative)."""
    return map_y - MAP_IMAGE_HEIGHT


def _from_source(source_y):
    return source_y + MAP_IMAGE_HEIGHT


def to_wgs84(map_x, map_y):
    """Leaflet CRS.Simple pixel -> real coordinate, as (lat, lng).

    Returned lat/lng first so it reads in the order the database columns and
    every mapping API expect.
    """
    lng, lat = _apply(PIXEL_TO_WGS84, float(map_x), _to_source(float(map_y)))
    return lat, lng


def to_pixel(lat, lng):
    """Real coordinate -> Leaflet CRS.Simple pixel, as (map_x, map_y)."""
    source_x, source_y = _apply(WGS84_TO_PIXEL, float(lng), float(lat))
    return source_x, _from_source(source_y)
