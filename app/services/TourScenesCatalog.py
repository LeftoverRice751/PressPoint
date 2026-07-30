"""Read-only view over the Marzipano scene catalog at resources/js/data.js.

The tour pipeline (Marzipano) generates that JS file; we never write to
it. This service parses it once per request so controllers can know
what scene_ids exist without hardcoding them in Python.
"""

import json
import os
import re

# resources/js/data.js layout: `window.APP_DATA = { ... };`
_DATA_JS_PATH = os.path.join(
    os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))),
    "resources",
    "js",
    "data.js",
)

_PREFIX_RE = re.compile(r"^\s*window\.APP_DATA\s*=\s*", re.MULTILINE)


class TourScenesCatalog:
    @classmethod
    def all_scenes(cls):
        """Return [{scene_id, name}] in the order they appear in data.js.

        Returns an empty list (not raises) if the file is missing or
        unparsable — the dashboard should still render so an editor can
        see something is wrong rather than getting a 500.
        """
        try:
            with open(_DATA_JS_PATH, "r", encoding="utf-8") as f:
                contents = f.read()
        except OSError:
            return []

        stripped = _PREFIX_RE.sub("", contents, count=1).strip()
        if stripped.endswith(";"):
            stripped = stripped[:-1].strip()

        try:
            payload = json.loads(stripped)
        except json.JSONDecodeError:
            return []

        scenes = payload.get("scenes") or []
        return [
            {
                "scene_id": scene.get("id") or "",
                "name": scene.get("name") or "",
            }
            for scene in scenes
            if scene.get("id")
        ]

    @classmethod
    def scene_by_id(cls, scene_id):
        """Return the full scene dict (id, name, levels, faceSize, ...) for
        one scene_id, or None if missing/unparsable. Unlike all_scenes(),
        this keeps every field — callers that need `levels` (e.g. the
        equirect generator) use this instead."""
        try:
            with open(_DATA_JS_PATH, "r", encoding="utf-8") as f:
                contents = f.read()
        except OSError:
            return None

        stripped = _PREFIX_RE.sub("", contents, count=1).strip()
        if stripped.endswith(";"):
            stripped = stripped[:-1].strip()

        try:
            payload = json.loads(stripped)
        except json.JSONDecodeError:
            return None

        for scene in payload.get("scenes") or []:
            if scene.get("id") == scene_id:
                return scene
        return None
