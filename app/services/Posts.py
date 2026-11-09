"""Pure rules for photo posts: validation, expiry, visibility, projection.

Nothing here touches the database, so the kiosk, the composer and the review
preview can all share one definition of what a post is allowed to look like.
"""

import json
import re
from datetime import datetime, timedelta, timezone
from zoneinfo import ZoneInfo

from app.services import Branding
from app.services.ImageDerivatives import variant_path

# Defined here, not imported from app.services.Issues: that module is deleted
# when the newsletter is retired, and Posts must outlive it.
CAMPUS_TZ = ZoneInfo("Asia/Manila")

DEFAULT_EXPIRY_DAYS = 7
KICKER_MAX = 40
HEADLINE_MAX = 110
# Stored in news.description, so the flash ticker's `copy` keeps working.
BODY_MAX = 420
SOURCE_TEXT_MAX = 60
SOURCE_LINES_MAX = 3
SOURCE_ICONS = ("facebook", "email", "instagram", "website", "link")
DEFAULT_SOURCE_LINES = [
    {"icon": "facebook", "text": "/TheGearsOfficial"},
    {"icon": "email", "text": "/thegearspublication@gmail.com"},
]
DEFAULT_CROP = {"x": 0.5, "y": 0.5, "zoom": 1.0}
ZOOM_MIN, ZOOM_MAX = 1.0, 4.0

EMPTY_HEADING = "No new posts right now"
EMPTY_LINE = "Check back soon for the latest from The Gears."

_CONTROL = re.compile(r"[\x00-\x08\x0b-\x1f\x7f]")
_SPACES = re.compile(r"[ \t\r\f\v]+")


def clean_text(value, max_len, keep_newlines=False):
    """Plain text only: no control chars, collapsed whitespace, hard length cap.

    Escaping is the template's job; this never strips markup characters.
    """
    text = (
        _CONTROL.sub("", str(value or ""))
        if not keep_newlines
        else (re.sub(r"[\x00-\x09\x0b-\x1f\x7f]", "", str(value or "")))
    )
    if keep_newlines:
        lines = [_SPACES.sub(" ", line).strip() for line in text.split("\n")]
        text = "\n".join(line for line in lines if line)
    else:
        text = " ".join(text.split())
    return text.strip()[:max_len]


def _load_json(raw):
    if isinstance(raw, (str, bytes)):
        try:
            return json.loads(raw)
        except ValueError:
            return None
    return raw


def parse_crop(raw):
    data = _load_json(raw)
    if not isinstance(data, dict):
        return dict(DEFAULT_CROP)
    try:
        x = float(data.get("x", 0.5))
        y = float(data.get("y", 0.5))
        zoom = float(data.get("zoom", 1.0))
    except (TypeError, ValueError):
        return dict(DEFAULT_CROP)
    if not all(v == v and abs(v) != float("inf") for v in (x, y, zoom)):
        return dict(DEFAULT_CROP)
    return {
        "x": min(1.0, max(0.0, x)),
        "y": min(1.0, max(0.0, y)),
        "zoom": min(ZOOM_MAX, max(ZOOM_MIN, zoom)),
    }


def parse_source_lines(raw):
    data = _load_json(raw)
    if not isinstance(data, list):
        return [dict(line) for line in DEFAULT_SOURCE_LINES]
    lines = []
    for item in data:
        if not isinstance(item, dict):
            continue
        text = clean_text(item.get("text"), SOURCE_TEXT_MAX)
        if not text:
            continue
        icon = item.get("icon")
        lines.append({"icon": icon if icon in SOURCE_ICONS else "link", "text": text})
        if len(lines) == SOURCE_LINES_MAX:
            break
    return lines


def _aware_utc(value):
    # masonite-orm tags naive datetimes as UTC without shifting them (see
    # CLAUDE.md, "Issues expire"), so a naive value here is already UTC.
    if value.tzinfo is None:
        return value.replace(tzinfo=timezone.utc)
    return value.astimezone(timezone.utc)


def parse_local_expiry(value, now=None):
    """Campus-local 'YYYY-MM-DDTHH:MM' -> aware UTC; empty -> None."""
    value = (value or "").strip()
    if not value:
        return None
    try:
        local = datetime.strptime(value, "%Y-%m-%dT%H:%M")
    except ValueError:
        raise ValueError("Pick a valid expiry date and time")
    expires = local.replace(tzinfo=CAMPUS_TZ).astimezone(timezone.utc)
    current = _aware_utc(now) if now else datetime.now(timezone.utc)
    if expires <= current:
        raise ValueError("Pick an expiry in the future")
    return expires


def default_expiry(approved_at):
    return approved_at + timedelta(days=DEFAULT_EXPIRY_DAYS)


def is_expired(post, now=None):
    expires_at = getattr(post, "expires_at", None)
    if not isinstance(expires_at, datetime):
        return False
    current = _aware_utc(now) if now else datetime.now(timezone.utc)
    return _aware_utc(expires_at) <= current


def _pct(value):
    return f"{value * 100:g}%"


def crop_style(crop):
    x, y, zoom = _pct(crop["x"]), _pct(crop["y"]), f"{crop['zoom']:g}"
    return f"object-position:{x} {y};transform:scale({zoom});transform-origin:{x} {y}"


def _local_label(value, fmt):
    if not isinstance(value, datetime):
        return None
    return _aware_utc(value).astimezone(CAMPUS_TZ).strftime(fmt)


def card_context(post, disk=None):
    """JSON-safe projection shared by the kiosk, composer and review preview."""
    image = getattr(post, "image", None)
    logo_path = (getattr(post, "logo_path", None) or "").strip()
    if logo_path:
        logo = "/storage/" + logo_path.replace("\\", "/").lstrip("/")
    else:
        logo = Branding.logo_url()
    published = getattr(post, "published_at", None) or getattr(post, "created_at", None)
    return {
        "id": getattr(post, "id", None),
        "kicker": getattr(post, "kicker", None) or "",
        "headline": getattr(post, "title", None) or "",
        "body": getattr(post, "description", None) or "",
        "image_large": variant_path(image, "large", disk) if (image and disk) else image,
        "image_thumb": variant_path(image, "thumb", disk) if (image and disk) else image,
        "crop_style": crop_style(parse_crop(getattr(post, "image_crop", None))),
        "logo_url": logo,
        "source_lines": parse_source_lines(getattr(post, "source_lines", None)),
        "status": getattr(post, "status", None),
        "expires_label": _local_label(getattr(post, "expires_at", None), "%b %d, %Y %I:%M %p"),
        "published_label": _local_label(published, "%b %d, %Y"),
    }
