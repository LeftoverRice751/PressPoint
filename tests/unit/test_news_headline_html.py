"""The headline became a rich-text column, so it became an HTML sink.

`news.title` used to be plain text and every template printed it escaped. The
composer now edits it in the same Quill instance that writes the body (the
"Headline font" dropdown it replaced is gone), so the kiosk renders it with
`| safe` — which means the write path has to sanitize it exactly as carefully
as the body's, and every ATTRIBUTE that prints a title has to strip the markup
back out again.

These tests pin both halves. The sanitizer is deliberately NOT the body's: a
headline is one line of display type, and a heading, list or blockquote inside
one wrecks the newspaper typography the composer exists to preview.
"""

import re
from pathlib import Path

from tests import TestCase

from app.controllers.gears.NewsController import (
    _html_to_text,
    _sanitize_headline_html,
)

_REPO_ROOT = Path(__file__).resolve().parents[2]


class HeadlineSanitizerTestCase(TestCase):
    def test_script_tag_does_not_survive(self):
        """`strip=True` unwraps an unknown tag and keeps its text, so the
        payload survives as inert characters — "alert(1)" renders as those
        eight literal characters in the headline, with no element around them
        to execute it. This matches _sanitize_news_html, which has always
        behaved this way for the body; the assertion to hold is that no TAG
        gets through, not that the text vanishes."""
        cleaned = _sanitize_headline_html("Soft launch<script>alert(1)</script>")

        self.assertNotIn("<", cleaned)
        self.assertIn("Soft launch", cleaned)

    def test_img_onerror_payload_loses_its_element(self):
        cleaned = _sanitize_headline_html('<img src=x onerror="alert(1)">Launch')

        self.assertNotIn("<img", cleaned)
        self.assertNotIn("onerror", cleaned)
        self.assertIn("Launch", cleaned)

    def test_event_handler_attribute_is_stripped(self):
        cleaned = _sanitize_headline_html('<span onclick="steal()">Headline</span>')

        self.assertNotIn("onclick", cleaned)
        self.assertIn("Headline", cleaned)

    def test_known_quill_font_class_survives(self):
        """The whole point of the change: Quill sets the headline's face."""
        cleaned = _sanitize_headline_html('<span class="ql-font-bebas">Presspoint</span>')

        self.assertIn("ql-font-bebas", cleaned)
        self.assertIn("Presspoint", cleaned)

    def test_invented_font_class_does_not_survive(self):
        """_ALLOWED_CLASSES is an exact set, not a `ql-font-*` pattern — an
        attacker must not be able to mint a class name and have it persist."""
        cleaned = _sanitize_headline_html('<span class="ql-font-evil">Presspoint</span>')

        self.assertNotIn("ql-font-evil", cleaned)
        self.assertIn("Presspoint", cleaned)

    def test_block_formats_are_unwrapped_not_kept(self):
        """`strip=True` drops the tag and keeps the text, so a headline stays
        one line even when something upstream sends several blocks."""
        cleaned = _sanitize_headline_html("<h2>Big</h2><ul><li>a</li></ul><blockquote>q</blockquote>")

        for tag in ("<h2", "<ul", "<li", "<blockquote"):
            self.assertNotIn(tag, cleaned)
        self.assertIn("Big", cleaned)

    def test_links_are_not_allowed_in_a_headline(self):
        cleaned = _sanitize_headline_html('<a href="https://example.com">Read</a>')

        self.assertNotIn("<a", cleaned)
        self.assertIn("Read", cleaned)

    def test_inline_emphasis_survives(self):
        cleaned = _sanitize_headline_html("<strong>Bold</strong> and <em>italic</em>")

        self.assertIn("<strong>", cleaned)
        self.assertIn("<em>", cleaned)

    def test_a_visually_empty_headline_reads_as_empty(self):
        """store() guards on _html_to_text(title), not on `title` itself: an
        empty Quill editor still serialises to markup, and a truthiness check
        on the raw string would publish a blank headline."""
        for markup in ("<p><br></p>", '<span class="ql-font-lora"></span>', "   "):
            self.assertEqual(_html_to_text(_sanitize_headline_html(markup)), "")


class HeadlineTemplateTestCase(TestCase):
    """A sanitized HTML column is only safe if the templates agree with it."""

    def _slots(self):
        return (_REPO_ROOT / "templates" / "kiosk" / "_issue.html").read_text()

    def test_every_headline_heading_renders_the_markup(self):
        """`news.title` is a sanitized HTML column, so every place that prints
        one has to render it with `| safe` -- autoescaping instead would show
        Quill's formatting spans as literal &lt;span…&gt; on the kiosk.

        The editor hook is wrapped in `{% if news_editor %}` on the real
        headings and bare on the two screen-reader-only ones, so the pattern
        allows both. Counted rather than hardcoded: a block added later is
        covered without touching this test, and one that forgets `| safe`
        fails it."""
        markup = self._slots()
        headings = re.findall(
            r'data-news-edit="title"[^>]*>\{\{\s*([^}]+?)\s*\}\}',
            markup,
        )

        # One per block that carries a title: lead, brief, photo essay,
        # editorial, quote, notice.
        self.assertGreaterEqual(
            len(headings), 6, f"expected a title region per block, found {len(headings)}"
        )
        for heading in headings:
            self.assertIn("| safe", heading, heading)

    def test_no_attribute_prints_a_title_without_striptags(self):
        """The real regression risk. Autoescaping an attribute turns Quill's
        spans into visible &lt;span…&gt; noise — and a screen reader reads it
        aloud — so alt/aria-label must strip, never escape."""
        markup = self._slots()
        # Every {{ … }} that sits inside a double-quoted attribute value.
        for attr, expr in re.findall(r'(\w[\w-]*)="([^"]*\{\{[^"]*)"', markup):
            if ".title" not in expr:
                continue
            self.assertIn(
                "striptags", expr, "%s= prints a title without | striptags: %s" % (attr, expr)
            )

    def test_library_row_keeps_the_markup_for_the_editor(self):
        """The one attribute that must NOT strip: news-dashboard.js reads it
        back and hands it to the headline region as HTML."""
        markup = (
            _REPO_ROOT / "templates" / "gears" / "partials" / "news-slots.html"
        ).read_text()

        self.assertIn('data-news-library-title="{{ news.title | e }}"', markup)
