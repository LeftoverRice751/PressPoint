"""On-demand equirectangular derivative of a Marzipano cube-map scene.

Why: the tour pipeline only ships cube-face tiles (storage/public/pano/tiles/
<scene>/<level>/<face>/<y>/<x>.jpg); no equirect source exists. The Three.js
zoom-blend transition needs a single equirect texture per scene, so we
reproject the highest-resolution cube faces into one on first request and
cache the result next to the tiles (equirect.jpg), exactly like
ImageDerivatives caches resized WebP variants next to originals.

Portability: writes go through the Masonite disk API (disk.put / disk.exists),
matching ImageDerivatives.py, so the public disk can move to S3 later with no
change here. Reads of the *source* tile bytes are plain local file reads (see
note in ImageDerivatives.py: the disk API's .get() mangles binary data in this
Masonite version) — tiles are always local under storage/public regardless of
where the "public" disk points, because they're pipeline output, not user
uploads, so a direct path read is safe and simpler than routing through
disk.get().
"""

import os
from io import BytesIO

try:
    import numpy as np
    from PIL import Image
    import py360convert
except ImportError:
    np = None
    Image = None
    py360convert = None

# Marzipano cube face tokens -> py360convert's dict cube_format keys
# ("F","R","B","L","U","D" exactly, per py360convert.utils.cube_dict2list).
FACE_TOKEN_TO_KEY = {"f": "F", "r": "R", "b": "B", "l": "L", "u": "U", "d": "D"}

# Per-face 90-degree-multiple correction if py360convert's face orientation
# convention doesn't match Marzipano's for a given face. Start at 0; tune
# after visually inspecting a first generated equirect (seams, a mirrored
# horizon, or an upside-down sky/floor are the tell for the affected face).
FACE_ROTATIONS = {"f": 0, "r": 0, "b": 0, "l": 0, "u": 0, "d": 0}

_TILES_ROOT = os.path.join(
    os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))),
    "storage",
    "public",
    "pano",
    "tiles",
)


def _highest_level(levels):
    """Index (== on-disk directory name) of the largest non-fallback level."""
    best_idx, best_size = None, -1
    for idx, level in enumerate(levels or []):
        if level.get("fallbackOnly"):
            continue
        size = level.get("size", 0)
        if size > best_size:
            best_size = size
            best_idx = idx
    return best_idx, best_size


def _assemble_face(scene_id, level_dir, face_token, tile_size, face_px):
    """Stitch a face's tile grid (level_dir/face_token/<y>/<x>.jpg) into one
    face_px x face_px PIL Image."""
    grid = face_px // tile_size
    face_img = Image.new("RGB", (face_px, face_px))
    face_dir = os.path.join(_TILES_ROOT, scene_id, str(level_dir), face_token)
    for y in range(grid):
        for x in range(grid):
            tile_path = os.path.join(face_dir, str(y), f"{x}.jpg")
            with Image.open(tile_path) as tile:
                face_img.paste(tile.convert("RGB"), (x * tile_size, y * tile_size))
    return face_img


def generate_equirect(scene_id, levels, disk, out_w=4096, out_h=2048):
    """Build storage/public/pano/tiles/<scene_id>/equirect.jpg if missing.

    Returns the relative disk path ("pano/tiles/<id>/equirect.jpg") on
    success, or None on any failure (caller decides how to respond, e.g.
    404/500, but this must never raise past this boundary)."""
    rel_path = f"pano/tiles/{scene_id}/equirect.jpg"
    try:
        if disk.exists(rel_path):
            return rel_path
    except Exception:
        pass

    if np is None or Image is None or py360convert is None:
        return None

    level_idx, _ = _highest_level(levels)
    if level_idx is None:
        return None
    tile_size = levels[level_idx]["tileSize"]
    face_px = levels[level_idx]["size"]

    try:
        cube = {}
        for token, key in FACE_TOKEN_TO_KEY.items():
            face_img = _assemble_face(scene_id, level_idx, token, tile_size, face_px)
            arr = np.array(face_img)
            rot = FACE_ROTATIONS[token]
            if rot:
                arr = np.rot90(arr, k=rot // 90)
            cube[key] = arr

        equirect = py360convert.c2e(cube, out_h, out_w, cube_format="dict")
        equirect_img = Image.fromarray(equirect.astype("uint8"), "RGB")

        buf = BytesIO()
        equirect_img.save(buf, "JPEG", quality=88)
        disk.put(rel_path, buf.getvalue())
        return rel_path
    except Exception:
        return None
