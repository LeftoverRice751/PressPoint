"""Pure rules for photo posts: validation, expiry, visibility, projection.

Nothing here touches the database, so the kiosk, the composer and the review
preview can all share one definition of what a post is allowed to look like.
"""

import json
import math
import re
from datetime import datetime, timedelta, timezone
from zoneinfo import ZoneInfo

from app.services import Branding
from app.services.ImageDerivatives import variant_path

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
    # CLAUDE.md, "Photo posts"), so a naive value here is already UTC.
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


def _two_decimals(value):
    """At most two decimals, trailing zeros stripped, never exponent notation.

    Mirrored step for step by fmt() in resources/js/post-crop.mjs, whose toStyle()
    previews what this renders. `:g` gave "1e-05" where JS's String() gives
    "0.00001", and round()/toFixed() disagree on exact halves (banker's rounding vs
    half-up), so both sides do the same IEEE multiply-add-floor on non-negative
    values instead.
    """
    hundredths = int(math.floor(value * 100 + 0.5))
    whole, frac = divmod(hundredths, 100)
    if frac == 0:
        return str(whole)
    if frac % 10 == 0:
        return f"{whole}.{frac // 10}"
    return f"{whole}.{frac:02d}"


def _pct(value):
    return f"{_two_decimals(value * 100)}%"


def crop_style(crop):
    x, y, zoom = _pct(crop["x"]), _pct(crop["y"]), _two_decimals(crop["zoom"])
    return f"object-position:{x} {y};transform:scale({zoom});transform-origin:{x} {y}"


LAYOUT_PIECES = ("kicker", "headline", "body")
LOGO_BASE_H = 11
LOGO_BASE_MAX_W = 34
_LAYOUT_RANGES = {
    "x": (0, 100),
    "y": (0, 100),
    "w": (5, 100),
    "h": (1, 70),
    "s": (0.5, 2.5),
}
_PANEL_H_RANGE = (25, 70)


def _round2(value):
    """Same half-up step as _two_decimals; non-negative values only."""
    return math.floor(value * 100 + 0.5) / 100


def _layout_number(value, low, high, label):
    # Real JSON numbers only: no bools, no numeric strings.
    if isinstance(value, bool) or not isinstance(value, (int, float)):
        raise ValueError(f"{label} is not a number")
    try:
        number = float(value)
    except OverflowError:
        raise ValueError(f"{label} is out of range")
    if not math.isfinite(number):
        raise ValueError(f"{label} is not finite")
    # Range is checked on the raw value, before rounding (the JS twin mirrors this).
    if not low <= number <= high:
        raise ValueError(f"{label} is out of range")
    return _round2(number)


def parse_layout(raw):
    """Normalised element layout, None when unset; ValueError when malformed."""
    if raw is None or (isinstance(raw, (str, bytes)) and not raw.strip()):
        return None
    if isinstance(raw, (str, bytes)):
        try:
            data = json.loads(raw)
        except (ValueError, OverflowError, RecursionError):
            raise ValueError("layout is not valid JSON")
    else:
        data = raw
    if data is None:
        return None
    if not isinstance(data, dict):
        raise ValueError("layout must be an object")
    out = {"panel_h": _layout_number(data.get("panel_h"), *_PANEL_H_RANGE, "panel_h")}
    shapes = {"logo": ("x", "y", "s")}
    shapes.update({piece: ("x", "y", "w", "h", "s") for piece in LAYOUT_PIECES})
    for name, keys in shapes.items():
        box = data.get(name)
        if not isinstance(box, dict):
            raise ValueError(f"{name} is missing")
        out[name] = {
            key: _layout_number(box.get(key), *_LAYOUT_RANGES[key], f"{name}.{key}")
            for key in keys
        }
    return out


def _text_box(box):
    x, y = box["x"], box["y"]
    return x, y, _round2(box["w"] * box["s"]), _round2(box["h"] * box["s"])


def layout_problems(layout):
    """Geometry violations of a parsed layout; empty when it fits."""
    problems = []
    panel_h = layout["panel_h"]
    eps = 1e-9
    boxes = {}
    for piece in LAYOUT_PIECES:
        x, y, w, h = _text_box(layout[piece])
        boxes[piece] = (x, y, w, h)
        if x < 0 or y < 0 or x + w > 100 + eps or y + h > panel_h + eps:
            problems.append(f"{piece} is outside the panel")
    for i, a in enumerate(LAYOUT_PIECES):
        for b in LAYOUT_PIECES[i + 1:]:
            ax, ay, aw, ah = boxes[a]
            bx, by, bw, bh = boxes[b]
            # Strict: boxes that merely touch are fine.
            if ax < bx + bw - eps and bx < ax + aw - eps and ay < by + bh - eps and by < ay + ah - eps:
                problems.append(f"{a} overlaps {b}")
    logo = layout["logo"]
    if logo["x"] > 100 or logo["y"] + LOGO_BASE_H * logo["s"] > 100 - panel_h + eps:
        problems.append("logo is outside the photo")
    return problems


def layout_styles(layout):
    """Inline style strings for a parsed layout; mirrored by the JS editor."""
    if not layout:
        return None
    t = _two_decimals
    styles = {
        "panel": f"height:{t(layout['panel_h'])}cqw",
        "logo": (
            f"left:{t(layout['logo']['x'])}cqw;top:{t(layout['logo']['y'])}cqw;"
            f"--s:{t(layout['logo']['s'])}"
        ),
    }
    for piece in LAYOUT_PIECES:
        x, y, w, h = _text_box(layout[piece])
        styles[piece] = (
            f"left:{t(x)}cqw;top:{t(y)}cqw;width:{t(w)}cqw;height:{t(h)}cqw;"
            f"--s:{t(layout[piece]['s'])}"
        )
    return styles


def local_label(value, fmt):
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
    try:
        layout = parse_layout(getattr(post, "element_layout", None))
    except (ValueError, OverflowError, RecursionError):
        layout = None
    return {
        "id": getattr(post, "id", None),
        "kicker": getattr(post, "kicker", None) or "",
        "headline": getattr(post, "title", None) or "",
        "body": getattr(post, "description", None) or "",
        "image_large": variant_path(image, "large", disk) if (image and disk) else image,
        "image_thumb": variant_path(image, "thumb", disk) if (image and disk) else image,
        "crop_style": crop_style(parse_crop(getattr(post, "image_crop", None))),
        "layout": layout,
        "layout_styles": layout_styles(layout),
        "logo_url": logo,
        "source_lines": parse_source_lines(getattr(post, "source_lines", None)),
        "status": getattr(post, "status", None),
        "expires_label": local_label(getattr(post, "expires_at", None), "%b %d, %Y %I:%M %p"),
        "published_label": local_label(published, "%b %d, %Y"),
    }
