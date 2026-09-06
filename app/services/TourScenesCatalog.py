"""Read-only view over the Marzipano scene catalog at resources/js/data.js.

The tour pipeline (Marzipano) generates that JS file; we never write to
it. This service parses it once per request so controllers can know
what scene_ids exist without hardcoding them in Python.
"""

import json
import math
import os
import re

# resources/js/data.js layout: `window.APP_DATA = { ... };`
_DATA_JS_PATH = os.path.join(
    os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))),
    "resources",
    "js",
    "data.js",
)

# data.js sometimes carries a leading /* ... */ block comment (editor notes
# about hotspot fields) before the assignment — strip that first, then the
# `window.APP_DATA = ` prefix, then a trailing `;`.
#
# The Marzipano Tool emits `var APP_DATA = ` and we rewrite it to
# `window.APP_DATA = ` on import (kiosk-tour.js reads it off window, and the
# bare `var` form does not attach to window inside the mix bundle). Accept
# both spellings so a raw, unedited re-export still parses here.
_LEADING_COMMENT_RE = re.compile(r"^\s*/\*.*?\*/\s*", re.DOTALL)
_PREFIX_RE = re.compile(r"^\s*(?:window\.)?(?:var\s+)?APP_DATA\s*=\s*", re.MULTILINE)

# Every scene ships a preview.jpg beside its tiles -- the low-res fallback
# kiosk-tour.js hands Marzipano as cubeMapPreviewUrl while the real tiles
# stream in. The Tour Mapping dashboard reuses it as a thumbnail, which costs
# nothing because it is already deployed.
#
# It is NOT a photo. It is a 256x1536 strip of the six cube faces stacked
# vertically in Marzipano's default 'bdflru' order, so a usable thumbnail is
# one 256px band and the template crops to it by index.
_FACE_STRIP_ORDER = ("back", "down", "front", "left", "right", "up")

# Yaw 0 looks at the front face and grows clockwise, so quarter-turns walk
# front -> right -> back -> left. Down and up are deliberately unreachable:
# we ignore pitch, because a floor or ceiling band never shows the building an
# editor is trying to identify (and every scene in this capture opens roughly
# level anyway -- 0-jst-1 is pitch 0.09).
_QUARTER_TURN_FACES = tuple(
    _FACE_STRIP_ORDER.index(face) for face in ("front", "right", "back", "left")
)


def preview_face_index(initial_view):
    """Strip index of the cube face nearest a scene's opening yaw.

    Returns the "front" band for a missing or non-numeric yaw rather than
    raising -- a hand-edited data.js should cost an editor a badly framed
    thumbnail, not a 500 on the whole dashboard.
    """
    try:
        yaw = float((initial_view or {}).get("yaw"))
    except (AttributeError, TypeError, ValueError):
        return _FACE_STRIP_ORDER.index("front")

    if not math.isfinite(yaw):
        return _FACE_STRIP_ORDER.index("front")

    # data.js yaws come straight out of the Marzipano Tool and are not
    # normalised, so fold into [-pi, pi) before quantising to a quarter turn.
    yaw = math.remainder(yaw, 2 * math.pi)
    quarter = int(round(yaw / (math.pi / 2))) % 4

    return _QUARTER_TURN_FACES[quarter]


class TourScenesCatalog:
    @classmethod
    def _load_payload(cls):
        """Parse data.js into the raw {"scenes": [...], ...} dict, or None
        if the file is missing/unparsable."""
        try:
            with open(_DATA_JS_PATH, "r", encoding="utf-8") as f:
                contents = f.read()
        except OSError:
            return None

        stripped = _LEADING_COMMENT_RE.sub("", contents, count=1)
        stripped = _PREFIX_RE.sub("", stripped, count=1).strip()
        if stripped.endswith(";"):
            stripped = stripped[:-1].strip()

        try:
            return json.loads(stripped)
        except json.JSONDecodeError:
            return None

    @classmethod
    def all_scenes(cls):
        """Return [{scene_id, name, initial_view, preview_face}] in data.js order.

        Returns an empty list (not raises) if the file is missing or
        unparsable — the dashboard should still render so an editor can
        see something is wrong rather than getting a 500.

        `initial_view` and `preview_face` feed the Tour Mapping thumbnails and
        its 360 preview modal; the kiosk's scene drawer ignores them.
        """
        payload = cls._load_payload()
        if payload is None:
            return []

        scenes = payload.get("scenes") or []
        catalog = []
        for scene in scenes:
            if not scene.get("id"):
                continue

            initial_view = scene.get("initialViewParameters") or {}
            catalog.append(
                {
                    "scene_id": scene.get("id") or "",
                    "name": scene.get("name") or "",
                    "initial_view": initial_view,
                    "preview_face": preview_face_index(initial_view),
                }
            )

        return catalog

    @classmethod
    def geometry(cls):
        """Tile pyramid shared by every scene, for building a CubeGeometry.

        Read off the first scene rather than repeated per row: this capture is
        uniform (one `levels` array, faceSize 750 across all 205 scenes), and
        embedding it once keeps ~25 KB of duplicated JSON out of the Tour
        Mapping page. `test_the_capture_is_geometrically_uniform` fails loudly
        if a re-export ever breaks that assumption.
        """
        payload = cls._load_payload()
        scenes = (payload or {}).get("scenes") or []
        if not scenes:
            return {"levels": [], "face_size": 0}

        return {
            "levels": scenes[0].get("levels") or [],
            "face_size": scenes[0].get("faceSize") or 0,
        }
