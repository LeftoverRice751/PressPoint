""" SiteSetting Model """

from masoniteorm.models import Model


class SiteSetting(Model):
    """One row per site-wide setting. Read and written through the service
    that owns the key (e.g. app/services/Branding.py) rather than directly,
    so callers never have to know the key spelling."""

    __table__ = "site_settings"
    __fillable__ = [
        "setting_key",
        "setting_value",
    ]
