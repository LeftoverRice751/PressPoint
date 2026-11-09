import json
from datetime import datetime, timezone
from types import SimpleNamespace
from unittest.mock import patch

import pytest

from app.services import Posts

UTC = timezone.utc


def test_parse_crop_clamps_and_defaults():
    assert Posts.parse_crop('{"x":2,"y":-1,"zoom":99}') == {"x": 1.0, "y": 0.0, "zoom": 4.0}
    assert Posts.parse_crop("nope") == {"x": 0.5, "y": 0.5, "zoom": 1.0}
    assert Posts.parse_crop(None) == {"x": 0.5, "y": 0.5, "zoom": 1.0}
    assert Posts.parse_crop({"x": 0.2, "y": 0.3, "zoom": 0.1})["zoom"] == 1.0
    assert Posts.parse_crop('{"x":"a"}') == {"x": 0.5, "y": 0.5, "zoom": 1.0}


def test_parse_source_lines_caps_and_maps_unknown_icons():
    raw = json.dumps([{"icon": "tiktok", "text": "a"}] + [{"icon": "email", "text": "b"}] * 9)
    lines = Posts.parse_source_lines(raw)
    assert len(lines) == 3
    assert lines[0]["icon"] == "link"
    assert lines[1]["icon"] == "email"


def test_parse_source_lines_defaults_and_drops_empty():
    assert Posts.parse_source_lines(None) == Posts.DEFAULT_SOURCE_LINES
    assert Posts.parse_source_lines("garbage") == Posts.DEFAULT_SOURCE_LINES
    got = Posts.parse_source_lines('[{"icon":"web","text":"  "},{"icon":"website","text":"x"}]')
    assert got == [{"icon": "website", "text": "x"}]


def test_source_text_is_verbatim_but_truncated():
    raw = json.dumps([{"icon": "link", "text": "<script>"}, {"icon": "link", "text": "z" * 99}])
    lines = Posts.parse_source_lines(raw)
    assert lines[0]["text"] == "<script>"
    assert len(lines[1]["text"]) == Posts.SOURCE_TEXT_MAX


def test_clean_text():
    assert len(Posts.clean_text("x" * 500, Posts.BODY_MAX)) == 420
    assert Posts.clean_text("  a \t  b\x00c  ", 50) == "a bc"
    assert Posts.clean_text(None, 10) == ""
    assert Posts.clean_text("a\n\n\nb  c", 50, keep_newlines=True) == "a\nb c"
    assert Posts.clean_text("a\nb", 50) == "a b"


def test_expiry_boundary_is_campus_time():
    post = SimpleNamespace(expires_at=datetime(2026, 11, 10, 0, 0, tzinfo=UTC))
    assert Posts.is_expired(post, now=datetime(2026, 11, 9, 23, 59, tzinfo=UTC)) is False
    assert Posts.is_expired(post, now=datetime(2026, 11, 10, 0, 0, tzinfo=UTC)) is True


def test_is_expired_unset_and_naive():
    assert Posts.is_expired(SimpleNamespace(expires_at=None)) is False
    naive = SimpleNamespace(expires_at=datetime(2026, 11, 10, 0, 0))
    assert Posts.is_expired(naive, now=datetime(2026, 11, 10, 0, 1, tzinfo=UTC)) is True
    assert Posts.is_expired(naive, now=datetime(2026, 11, 9, 23, 0, tzinfo=UTC)) is False


def test_parse_local_expiry():
    now = datetime(2026, 11, 9, 12, 0, tzinfo=UTC)
    assert Posts.parse_local_expiry("2026-11-10T08:00", now=now) == datetime(
        2026, 11, 10, 0, 0, tzinfo=UTC
    )
    assert Posts.parse_local_expiry("", now=now) is None
    with pytest.raises(ValueError, match="^Pick an expiry in the future$"):
        Posts.parse_local_expiry("2026-11-01T08:00", now=now)


def test_default_expiry():
    assert Posts.default_expiry(datetime(2026, 11, 9, tzinfo=UTC)) == datetime(
        2026, 11, 16, tzinfo=UTC
    )


def test_crop_style():
    style = Posts.crop_style({"x": 0.25, "y": 0.5, "zoom": 2.0})
    assert style == ("object-position:25% 50%;transform:scale(2);transform-origin:25% 50%")


def _post(**kw):
    base = dict(
        id=7,
        kicker="K",
        title="Head",
        description="Body",
        image=None,
        logo_path=None,
        image_crop=None,
        source_lines=None,
        status="published",
        expires_at=None,
        published_at=None,
        created_at=None,
    )
    base.update(kw)
    return SimpleNamespace(**base)


def test_card_context_falls_back_to_site_logo():
    with patch.object(Posts.Branding, "logo_url", return_value="/gears.png"):
        ctx = Posts.card_context(_post())
    assert ctx["logo_url"] == "/gears.png"
    assert ctx["headline"] == "Head" and ctx["body"] == "Body"
    assert ctx["source_lines"] == Posts.DEFAULT_SOURCE_LINES
    json.dumps(ctx)


def test_card_context_own_logo_images_and_labels():
    disk = SimpleNamespace(exists=lambda p: True)
    post = _post(
        logo_path="Branding/x.png",
        image="News/a.jpg",
        expires_at=datetime(2026, 11, 10, 0, 0, tzinfo=UTC),
        published_at=datetime(2026, 11, 9, 0, 0, tzinfo=UTC),
    )
    ctx = Posts.card_context(post, disk)
    assert ctx["logo_url"] == "/storage/Branding/x.png"
    assert ctx["image_large"] != "News/a.jpg" and ctx["image_thumb"] != ctx["image_large"]
    assert ctx["expires_label"] == "Nov 10, 2026 08:00 AM"
    assert ctx["published_label"] == "Nov 09, 2026"
    assert Posts.card_context(post)["image_large"] == "News/a.jpg"
