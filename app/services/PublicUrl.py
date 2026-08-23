"""Absolute, publicly-reachable URLs for QR handoffs.

A QR code on the kiosk is scanned by a phone that is NOT on the kiosk's
network path. Building the URL from the request host would encode whatever
internal address the terminal happened to be browsed through (localhost, a
LAN IP), which the phone cannot resolve. APP_URL is the public domain in
production, so it is the only correct base for anything a phone must reach.

MapController._mobile_url() implements the same rule for the route handoff.
It is deliberately left alone here rather than refactored onto this helper:
it is working production code on a path this change does not touch.
"""

from masonite.configuration import config


def public_url(path=""):
    """Return APP_URL joined to `path`, always absolute and scheme-qualified."""
    base = (config("application.app_url") or "").rstrip("/")

    if not base:
        return path or "/"

    # A bare domain in .env (no scheme) would otherwise produce a relative
    # URL that a phone's camera app refuses to open.
    if not base.startswith("http"):
        base = f"https://{base}"

    if not path:
        return base

    return f"{base}/{path.lstrip('/')}"
