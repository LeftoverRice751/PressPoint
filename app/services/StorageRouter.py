
import os

from masonite.environment import env
from masonite.utils.location import base_path


# Folders served by the GearsNAS volume.
#
# KEEP IN SYNC with the regex `location` block in deploy/nginx-presspoint.conf.
# In production nginx serves these roots directly and only falls back to Python
# on a miss, so a folder added here but not there quietly routes every request
# for it through VideoController.serve_storage — which reads ranges into memory.
NAS_FOLDERS = ("Archives", "Videos", "About", "Branding", "Profiles", "Events")


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
