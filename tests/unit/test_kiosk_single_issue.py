"""The kiosk news page is one issue, not a pile of stories.

The page is a Swiper carousel, and the carousel is an ISSUE browser: editors
publish issues and readers swipe between them. It used to hold the issue as
slide 1 and then one slide per approved story that had not been placed in a
block -- each rendered standalone with its own headline, photograph and full
body. A story could therefore escape the newsletter and become a page of its
own, which is the opposite of what a composed issue means.

The carousel itself stays. It is the mechanism multiple issues will use; only
the standalone story slides are gone.
"""

from masonite.facades import View

from tests import TestCase


class _Story:
    def __init__(self, id, title="A headline", **overrides):
        self.id = id
        self.title = title
        self.description = "<p>Body copy.</p>"
        self.excerpt = "A summary."
        self.source = "Editorial Desk"
        self.location = "Campus"
        self.layout_type = "lead"
        self.status = "published"
        self.priority = 0
        self.image = None
        self.dek = "A dek."
        self.image_caption = None
        self.image_credit = None
        self.headline_font = None
        self.published_label = "Sep 14, 2026"
        self.published_iso = "2026-09-14"
        for key, value in overrides.items():
            setattr(self, key, value)


def _render_page(**over):
    blocks = {b: [] for b in ("lead", "brief", "photo_essay", "editorial", "quote", "notice")}
    blocks["lead"] = [_Story(1)]
    context = {
        "blocks": blocks,
        "events": [],
        "issue_vol": 1,
        "issue_no": 5,
        "news_items": [],
        "featured_news": None,
        "main_news": blocks["lead"][0],
        "secondary_news": [],
        "active_nav": "news",
        # Stories that were NOT placed in a block. This is the list the page
        # used to turn into one standalone slide each; handing it real rows is
        # the only way these tests can see the defect.
        "carousel_news": [
            _Story(90, title="Unplaced story A", layout_type="unassigned"),
            _Story(91, title="Unplaced story B", layout_type="unassigned"),
        ],
    }
    context.update(over)
    return View.render("kiosk/news", context).get_content()


class SingleIssueTestCase(TestCase):
    def test_no_story_becomes_a_slide_of_its_own(self):
        """The defect: a story that was not placed in a block used to render as
        its own full page in the carousel."""
        html = _render_page()

        self.assertNotIn("news-slide--story", html)
        self.assertNotIn("news-slide__copy", html)
        self.assertNotIn("Unplaced story A", html)
        self.assertNotIn("Unplaced story B", html)

    def test_the_issue_is_the_only_slide(self):
        html = _render_page()

        self.assertEqual(html.count("swiper-slide"), 1)

    def test_the_carousel_itself_survives(self):
        """It is the issue browser. Removing it would have to be undone the
        moment a second issue exists, so it stays with one slide in it."""
        html = _render_page()

        self.assertIn("data-news-swiper", html)
        self.assertIn("swiper-wrapper", html)
        self.assertIn("data-news-pagination", html)
        self.assertIn("data-news-prev", html)

    def test_the_reader_overlay_survives(self):
        """The lead still clamps to keep the other six blocks reachable, so the
        overlay that shows the rest of it has to still be there."""
        html = _render_page()

        self.assertIn('id="news-reader"', html)
        self.assertIn("data-news-more", html)
