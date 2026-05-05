"""StorageRouter — one place that knows where stored files physically live.

The app keeps short relative paths in the database (e.g. `Archives/foo.pdf`,
`Videos/clip.mp4`, `news/banner.png`). Two physical roots back those paths:

  * GEARSNAS_BASE — the GearsNAS Samba mount, holds Archives + Videos so
    editors and the kiosk share one volume.
  * the project's local `storage/framework/public/` — everything else
    (news photos, post images, anything legacy).

Routing is by leading folder. Anything starting with `Archives/` or
`Videos/` lives on the NAS; the rest stays on the local public disk.
This gives us one resolver instead of touching `os.path` directly in
every controller.
"""

import os

from masonite.environment import env
from masonite.utils.location import base_path


# Folders served by the GearsNAS volume.
NAS_FOLDERS = ("Archives", "Videos")


def gearsnas_base() -> str:
    return env("GEARSNAS_BASE", "/mnt/nas_storage/gears_data")


def public_base() -> str:
    return base_path("storage/framework/public")


def _normalize(stored_path: str) -> str:
    return str(stored_path or "").replace("\\", "/").lstrip("/")


def _is_nas_path(path: str) -> bool:
    head = path.split("/", 1)[0]
    return head in NAS_FOLDERS


def absolute_path(stored_path: str) -> str:
    """Resolve a stored relative path to its absolute on-disk location."""
    path = _normalize(stored_path)
    root = gearsnas_base() if _is_nas_path(path) else public_base()
    return os.path.join(root, path)


def is_safe_path(stored_path: str) -> bool:
    """Prevent path traversal: confirm the resolved file is inside one
    of the allowed roots. Use this before serving or deleting a file
    whose path came from user input or the database."""
    path = _normalize(stored_path)
    if not path:
        return False

    resolved = os.path.realpath(absolute_path(path))
    allowed_roots = [
        os.path.realpath(public_base()),
        os.path.realpath(gearsnas_base()),
    ]
    return any(
        resolved == root or resolved.startswith(root + os.sep)
        for root in allowed_roots
    )
