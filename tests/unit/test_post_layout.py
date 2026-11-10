import json
from types import SimpleNamespace

import pytest

from app.services import Posts


def fitting(**over):
    layout = {
        "panel_h": 44,
        "logo": {"x": 40, "y": 4, "s": 1},
        "kicker": {"x": 10, "y": 5, "w": 30, "h": 3.5, "s": 1.2},
        "headline": {"x": 10, "y": 10, "w": 80, "h": 10, "s": 1},
        "body": {"x": 10, "y": 20, "w": 80, "h": 15, "s": 1},
    }
    layout.update(over)
    return layout


def test_parse_layout_empty_is_none():
    assert Posts.parse_layout(None) is None
    assert Posts.parse_layout("") is None
    assert Posts.parse_layout("null") is None


def test_parse_layout_valid_round_trip():
    layout = fitting()
    layout["kicker"] = dict(layout["kicker"], x=10.004)
    out = Posts.parse_layout(json.dumps(layout))
    assert out["kicker"]["x"] == 10.0
    assert out["panel_h"] == 44
    assert out["logo"] == {"x": 40, "y": 4, "s": 1}


def test_parse_layout_rejects_missing_piece():
    layout = fitting()
    del layout["body"]
    with pytest.raises(ValueError):
        Posts.parse_layout(json.dumps(layout))


@pytest.mark.parametrize("bad", ["NaN", "abc", float("inf")])
def test_parse_layout_rejects_non_finite(bad):
    layout = fitting()
    layout["headline"] = dict(layout["headline"], w=bad)
    with pytest.raises(ValueError):
        Posts.parse_layout(layout)


def test_parse_layout_rejects_malformed_json():
    with pytest.raises(ValueError):
        Posts.parse_layout("{bad")


@pytest.mark.parametrize(
    "mutate",
    [
        lambda d: d["body"].update(s=3),
        lambda d: d.update(panel_h=80),
        lambda d: d["kicker"].update(w=2),
    ],
)
def test_parse_layout_rejects_out_of_range(mutate):
    layout = fitting()
    mutate(layout)
    with pytest.raises(ValueError):
        Posts.parse_layout(layout)


def test_layout_problems_fits():
    assert Posts.layout_problems(fitting()) == []


def test_layout_problems_overlap():
    layout = fitting()
    layout["headline"] = dict(layout["headline"], h=12)
    assert "headline overlaps body" in Posts.layout_problems(layout)


def test_layout_problems_touching_edges_ok():
    layout = fitting()
    layout["headline"] = dict(layout["headline"], y=10, h=10)
    layout["body"] = dict(layout["body"], y=20)
    assert Posts.layout_problems(layout) == []


def test_layout_problems_outside_panel():
    layout = fitting()
    layout["body"] = dict(layout["body"], x=21, w=80)
    assert "body is outside the panel" in Posts.layout_problems(layout)


def test_layout_problems_logo_on_panel():
    layout = fitting()
    layout["logo"] = dict(layout["logo"], y=50)
    assert "logo is outside the photo" in Posts.layout_problems(layout)


def test_layout_styles_none():
    assert Posts.layout_styles(None) is None


def test_layout_styles_strings():
    styles = Posts.layout_styles(fitting())
    assert styles["panel"] == "height:44cqw"
    assert styles["logo"] == "left:40cqw;top:4cqw;--s:1"
    assert styles["kicker"] == "left:10cqw;top:5cqw;width:36cqw;height:4.2cqw;--s:1.2"
    assert styles["headline"] == "left:10cqw;top:10cqw;width:80cqw;height:10cqw;--s:1"


def test_card_context_layout_garbage_is_none():
    post = SimpleNamespace(id=1, element_layout="{bad")
    ctx = Posts.card_context(post)
    assert ctx["layout"] is None
    assert ctx["layout_styles"] is None


def test_card_context_layout_valid():
    post = SimpleNamespace(id=1, element_layout=json.dumps(fitting()))
    ctx = Posts.card_context(post)
    assert ctx["layout"]["panel_h"] == 44
    assert ctx["layout_styles"]["panel"] == "height:44cqw"
