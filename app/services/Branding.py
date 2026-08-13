"""The site logo, and where every template gets it from.

`logo_url()` is shared into the Jinja environment as `site_logo` (see
app/providers/AppProvider.py), so kiosk pages, the dashboard, and the auth
shell all resolve the same mark without their controllers knowing about it.

Because it runs on every render of every page, the lookup is cached for
CACHE_TTL_SECONDS. Under gunicorn each worker holds its own cache, so an
upload in one worker becomes visible in the others within that window —
acceptable for a logo, and it keeps the hot path free of a DB round trip.
"""

import os
import time

from app.models.SiteSetting import SiteSetting
from app.services.StorageRouter import absolute_path


#: The logo shipped with the app. Never overwritten, so 'Restore default'
#: is always available.
DEFAULT_LOGO_URL = "/gears.png"

SETTING_KEY = "branding.logo_path"

#: Where uploads land, relative to the NAS root. Listed in
#: StorageRouter.NAS_FOLDERS so /storage/Branding/... resolves there.
NAS_SUBDIR = "Branding"

CACHE_TTL_SECONDS = 30

_cache = {"url": None, "expires_at": 0.0}


def _stored_path():
    row = SiteSetting.where("setting_key", SETTING_KEY).first()
    return (getattr(row, "setting_value", None) or "").strip()


def _resolve_logo_url():
    """The current logo URL, falling back to the shipped default.

    The isfile check matters: if the NAS is unmounted, a stored path would
    otherwise render a broken image on every page of the site.
    """
    path = _stored_path()
    if not path:
        return DEFAULT_LOGO_URL

    if not os.path.isfile(absolute_path(path)):
        return DEFAULT_LOGO_URL

    return "/storage/" + path.replace("\\", "/").lstrip("/")


def logo_url():
    now = time.time()
    if _cache["url"] is None or now >= _cache["expires_at"]:
        try:
            _cache["url"] = _resolve_logo_url()
        except Exception:
            # A missing table or an unreachable DB must never take a kiosk
            # page down over a logo.
            _cache["url"] = DEFAULT_LOGO_URL
        _cache["expires_at"] = now + CACHE_TTL_SECONDS
    return _cache["url"]


def invalidate_cache():
    _cache["url"] = None
    _cache["expires_at"] = 0.0


def set_logo(stored_path):
    """Point the site logo at an uploaded file (a NAS-relative path)."""
    row = SiteSetting.where("setting_key", SETTING_KEY).first()
    if row:
        row.setting_value = stored_path
        row.save()
    else:
        SiteSetting.create({
            "setting_key": SETTING_KEY,
            "setting_value": stored_path,
        })
    invalidate_cache()


def clear_logo():
    """Fall back to the shipped default. The uploaded file is left on the
    NAS rather than deleted, so a mistaken restore is recoverable by hand."""
    row = SiteSetting.where("setting_key", SETTING_KEY).first()
    if row:
        row.delete()
    invalidate_cache()
