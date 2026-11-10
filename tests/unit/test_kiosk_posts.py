"""The kiosk Latest News page: one square card per live photo post.

All doubles, no live writes: the News query is patched, and the page is
rendered from the same payload NewsController.show() hands the template.
"""

import re
from datetime import datetime, timedelta, timezone
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import patch

from masonite.facades import View

from app.controllers.gears.NewsController import NewsController
from app.services import Posts
from tests import TestCase

_ROOT = Path(__file__).resolve().parents[2]
NOW = datetime.now(timezone.utc)


def _post(pid, title="A headline", **over):
    data = dict(
        id=pid,
        title=title,
        kicker="HAPPENING NOW",
        description="Body copy.",
        image=None,
        image_crop=None,
        logo_path=None,
        source_lines=None,
        status="published",
        expires_at=NOW + timedelta(days=3),
        published_at=NOW - timedelta(hours=pid),
        created_at=NOW - timedelta(days=1),
    )
    data.update(over)
    return SimpleNamespace(**data)


def _payload(posts, news_double=None):
    with patch("app.controllers.gears.NewsController.News") as news:
        # Mimic the DB: NULL expires_at is excluded and the order is published_at
        # desc; the doubles are handed back in the order the chain would return.
        chain = news.where_not_null.return_value.order_by.return_value.order_by.return_value
        chain.get.return_value = sorted(
            [p for p in posts if p.expires_at is not None],
            key=lambda p: p.published_at,
            reverse=True,
        )
        out = NewsController()._build_news_payload()
        if news_double is not None:
            news_double.append(news)
        return out


def _render(posts):
    payload = _payload(posts)
    return View.render(
        "kiosk/news",
        {
            "posts": payload["posts"],
            "empty_heading": Posts.EMPTY_HEADING,
            "empty_line": Posts.EMPTY_LINE,
            "active_nav": "news",
        },
    ).get_content()


class KioskPostsTestCase(TestCase):
    def test_only_the_live_post_renders(self):
        live = _post(1, "Live one")
        expired = _post(2, "Gone", expires_at=NOW - timedelta(hours=1))
        draft = _post(3, "Draft", status="draft")
        html = _render([live, expired, draft])
        self.assertEqual(html.count('<article class="post-card"'), 1)
        self.assertIn("Live one", html)
        self.assertNotIn("Gone", html)
        self.assertNotIn("Draft", html)

    def test_newest_published_first(self):
        older = _post(1, "Older", published_at=NOW - timedelta(days=2))
        newer = _post(2, "Newer", published_at=NOW - timedelta(hours=1))
        html = _render([older, newer])
        self.assertLess(html.index("Newer"), html.index("Older"))

    def test_no_live_posts_renders_the_empty_card(self):
        html = _render([_post(1, status="draft")])
        self.assertIn("No new posts right now", html)
        self.assertIn("Check back soon for the latest from The Gears.", html)
        self.assertNotIn('<article class="post-card"', html)

    def test_kicker_element_absent_when_empty(self):
        html = _render([_post(1, kicker="")])
        self.assertNotIn("post-card__kicker", html)

    def test_kicker_present_when_set(self):
        self.assertIn("post-card__kicker", _render([_post(1)]))

    def test_source_text_is_escaped(self):
        post = _post(1, source_lines=[{"icon": "link", "text": "<b>x</b>"}])
        html = _render([post])
        self.assertIn("&lt;b&gt;x&lt;/b&gt;", html)
        self.assertNotIn("<b>x</b>", html)

    def test_headline_and_body_are_escaped(self):
        html = _render([_post(1, "<script>alert(1)</script>", description="<i>hi</i>")])
        self.assertNotIn("<script>alert(1)", html)
        self.assertNotIn("<i>hi</i>", html)

    def test_card_regions_and_icon_markers(self):
        html = _render([_post(1)])
        for marker in (
            'data-post-id="1"',
            "post-card__photo",
            "post-card__logo",
            "post-card__panel",
            "post-card__headline",
            "post-card__body",
            "post-card__sources",
            'data-icon="facebook"',
        ):
            self.assertIn(marker, html)
        self.assertNotIn("contenteditable", html)

    def test_editor_mode_exposes_fields(self):
        card = Posts.card_context(_post(1, kicker=""))
        html = View.render(
            "kiosk/_post_card", {"card": card, "post_editor": True}
        ).get_content()
        self.assertIn("data-post-editor", html)
        self.assertEqual(html.count('contenteditable="plaintext-only"'), 3)
        for field in ("kicker", "headline", "body"):
            self.assertIn(f'data-field="{field}"', html)
        self.assertIn("post-card__kicker", html)

    def test_flow_card_markup_unchanged_without_layout(self):
        card = Posts.card_context(_post(1))
        html = View.render("kiosk/_post_card", {"card": card}).get_content()
        self.assertNotIn("post-card--positioned", html)
        self.assertNotIn("style=\"height", html)
        for cls in ("panel", "kicker", "headline", "body", "logo"):
            self.assertRegex(html, rf'class="post-card__{cls}"[^>]*>')
            self.assertNotRegex(html, rf'class="post-card__{cls}"[^>]*style=')

    def test_positioned_card_renders_styles(self):
        layout = {
            "panel_h": 44,
            "logo": {"x": 40, "y": 4, "s": 1},
            "kicker": {"x": 10, "y": 5, "w": 30, "h": 3.5, "s": 1.2},
            "headline": {"x": 10, "y": 10, "w": 80, "h": 10, "s": 1},
            "body": {"x": 10, "y": 20, "w": 80, "h": 15, "s": 1},
        }
        card = Posts.card_context(_post(1, element_layout=layout))
        html = View.render("kiosk/_post_card", {"card": card}).get_content()
        self.assertIn("post-card post-card--positioned", html)
        for piece, style in (
            ("photo", "height:61cqw"),
            ("panel", "height:44cqw"),
            ("logo", "left:40cqw;top:4cqw;--s:1"),
            ("kicker", "left:10cqw;top:5cqw;width:36cqw;height:4.2cqw;--s:1.2"),
            ("headline", "left:10cqw;top:10cqw;width:80cqw;height:10cqw;--s:1"),
        ):
            self.assertRegex(html, rf'class="post-card__{piece}" style="{style}"')
        self.assertRegex(html, r'class="post-card__body" style="left:10cqw')

    def test_page_keeps_the_live_and_swiper_markers(self):
        html = _render([_post(1)])
        for marker in ("data-news-swiper", "data-news-pagination", "data-news-prev"):
            self.assertIn(marker, html)
        self.assertIn("post-card.css", html)

    def test_published_post_without_expiry_is_not_on_the_kiosk_query(self):
        """Legacy newsletter rows (expires_at NULL) are excluded in SQL."""
        seen = []
        _payload([_post(1, expires_at=None)], seen)
        seen[0].where_not_null.assert_called_once_with("expires_at")
        chain = seen[0].where_not_null.return_value
        chain.order_by.assert_called_once_with("published_at", "desc")
        chain.order_by.return_value.order_by.assert_called_once_with("id", "desc")
        self.assertEqual(_payload([_post(1, expires_at=None)])["posts"], [])

    def test_cache_key_bumped(self):
        from app.services import NewsCache

        self.assertEqual(NewsCache.KEY, "kiosk:news:index:v9")

    def test_payload_is_json_safe(self):
        import json

        json.dumps(_payload([_post(1)]))


class PostCardCssTestCase(TestCase):
    css = (_ROOT / "resources" / "css" / "post-card.css").read_text(encoding="utf-8")

    def test_no_gradients(self):
        self.assertNotIn("gradient", self.css.lower())

    def test_square(self):
        self.assertRegex(self.css, r"aspect-ratio:\s*1\b")

    def test_registered_in_mix(self):
        mix = (_ROOT / "webpack.mix.js").read_text(encoding="utf-8")
        self.assertTrue(re.search(r"resources/css/post-card\.css", mix))
