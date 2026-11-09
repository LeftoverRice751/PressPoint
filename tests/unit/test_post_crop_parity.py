"""Posts.crop_style and post-crop.mjs's toStyle must emit the same string.

The editor previews a crop with toStyle(); the kiosk renders the saved crop with
crop_style(). Python's `:g` and JS's String() disagree on small values (1e-05 vs
0.00001), so both now round to at most two decimals with the same integer
arithmetic. The expected strings are literal here AND in
tests/js/post-crop.test.mjs -- change one, change both.
"""

import re

import pytest

from app.services import Posts

PARITY = [
    (
        {"x": 0.25, "y": 0.5, "zoom": 1.5},
        "object-position:25% 50%;transform:scale(1.5);transform-origin:25% 50%",
    ),
    (
        {"x": 0.00001, "y": 0.333333, "zoom": 1},
        "object-position:0% 33.33%;transform:scale(1);transform-origin:0% 33.33%",
    ),
    (
        {"x": 1, "y": 0, "zoom": 2},
        "object-position:100% 0%;transform:scale(2);transform-origin:100% 0%",
    ),
    (
        {"x": 0.875, "y": 0.1, "zoom": 3.999},
        "object-position:87.5% 10%;transform:scale(4);transform-origin:87.5% 10%",
    ),
    (
        {"x": 0.123456, "y": 0.5, "zoom": 1.234},
        "object-position:12.35% 50%;transform:scale(1.23);transform-origin:12.35% 50%",
    ),
    (
        {"x": 0.0005, "y": 0.99999, "zoom": 1.006},
        "object-position:0.05% 100%;transform:scale(1.01);transform-origin:0.05% 100%",
    ),
]


@pytest.mark.parametrize("crop,expected", PARITY)
def test_crop_style_matches_the_js_preview(crop, expected):
    assert Posts.crop_style(crop) == expected


def test_no_exponent_notation_ever():
    for value in (1e-9, 1e-5, 0.0001):
        style = Posts.crop_style({"x": value, "y": value, "zoom": 1})
        assert re.search(r"\d[eE][-+]?\d", style) is None, style
