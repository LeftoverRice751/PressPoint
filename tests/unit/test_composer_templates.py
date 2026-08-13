"""Composer template contracts.

The dashboard composer renders the REAL kiosk partial
(templates/kiosk/_news_slots.html) as its editing surface, gated by the
`news_editor` flag. These tests pin the markup contracts the composer JS and
CSS depend on, and — just as importantly — pin that none of the editor-only
chrome leaks onto the kiosk.

Rendering goes through Masonite's View facade so the real Jinja environment
(custom filters like `news_image`, globals like `route`) is in play.
"""

from masonite.facades import View

from tests import TestCase


class _Story:
    """Stand-in for a News row. The partial reads plain attributes only."""

    def __init__(self, id, title="A headline", **overrides):
        self.id = id
        self.title = title
        self.description = "<p>Body copy.</p>"
        self.excerpt = "A short summary."
        self.source = "Editorial Desk"
        self.location = "Campus"
        self.layout_type = "secondary"
        self.status = "published"
        self.priority = 0
        # Falsy image keeps the fallback branch, avoiding the news_image
        # filter's disk lookups — the hooks under test are independent of it.
        self.image = None
        self.dek = "A dek."
        self.image_caption = "A caption."
        self.image_credit = "A credit."
        self.published_label = "May 20, 2026"
        self.published_iso = "2026-05-20T00:00:00"
        for key, value in overrides.items():
            setattr(self, key, value)


def _render_slots(main=None, secondary=(), widgets=(), editor=True):
    return View.render(
        "kiosk/_news_slots",
        {
            "main_story": main,
            "secondary_stories": list(secondary),
            "widget_news": list(widgets),
            "news_editor": editor,
        },
    ).get_content()


class SlotContextMenuTestCase(TestCase):
    """Right-click-to-delete needs every occupied slot to advertise which
    kind of slot it is, so the menu can offer the right actions and the JS
    doesn't have to walk ancestors guessing."""

    def test_lead_story_exposes_its_slot_type(self):
        html = _render_slots(main=_Story(1, layout_type="main"))

        self.assertIn('data-news-context-menu="main"', html)

    def test_secondary_story_exposes_its_slot_type(self):
        html = _render_slots(secondary=[_Story(2)])

        self.assertIn('data-news-context-menu="secondary"', html)

    def test_widget_story_exposes_its_slot_type(self):
        html = _render_slots(widgets=[_Story(3, layout_type="widget")])

        self.assertIn('data-news-context-menu="widget"', html)

    def test_kiosk_never_renders_context_menu_hooks(self):
        # The kiosk has no editor JS; shipping the hook there would be dead
        # markup that invites a right-click menu on a public display.
        html = _render_slots(
            main=_Story(1, layout_type="main"),
            secondary=[_Story(2)],
            widgets=[_Story(3, layout_type="widget")],
            editor=False,
        )

        self.assertNotIn("data-news-context-menu", html)


class WidgetSlotAlignmentTestCase(TestCase):
    """Widgets used to render one full-width <section> each, stacked below
    the 2-column secondary grid and stripped of their box styling in the
    editor. They now share a single section with a 2-column grid so the
    composer reads as one aligned page."""

    def test_two_widgets_share_a_single_section(self):
        html = _render_slots(
            widgets=[_Story(3, layout_type="widget"), _Story(4, layout_type="widget")]
        )

        self.assertEqual(html.count('data-news-slot="widget"'), 1)

    def test_widgets_render_inside_a_grid(self):
        html = _render_slots(widgets=[_Story(3, layout_type="widget")])

        self.assertIn("widget-grid", html)

    def test_each_widget_position_stays_its_own_drop_target(self):
        # Task 6's drag-and-drop treats every widget position as a
        # single-capacity container. Grouping them into one section must not
        # collapse that: one filled position + one empty placeholder position.
        html = _render_slots(widgets=[_Story(3, layout_type="widget")])

        self.assertEqual(html.count('data-news-slot-list="widget"'), 2)
        self.assertIn('data-news-slot-position="1"', html)
        self.assertIn('data-news-slot-position="2"', html)

    def test_kiosk_omits_the_widget_section_when_there_are_no_widgets(self):
        html = _render_slots(main=_Story(1, layout_type="main"), editor=False)

        self.assertNotIn("paper-slot--widget", html)


class AllPostsTableTestCase(TestCase):
    """The Story Library moves from a card grid to a WordPress-style
    All Posts table. The JS reads the data-news-library-* attributes, so
    those must survive the rewrite intact."""

    def _render_library(self, items):
        return View.render("gears/partials/news-slots", {"news_items": items}).get_content()

    def test_renders_a_table_row_per_story(self):
        html = self._render_library([_Story(7, title="First"), _Story(8, title="Second")])

        self.assertIn("<table", html)
        self.assertEqual(html.count("data-news-library-item"), 2)

    def test_row_keeps_the_data_attributes_the_composer_reads(self):
        html = self._render_library([_Story(7, title="First")])

        for attribute in (
            'data-news-library-id="7"',
            "data-news-library-title=",
            "data-news-library-layout=",
            "data-news-library-status=",
            "data-news-library-excerpt=",
            "data-news-library-dek=",
        ):
            self.assertIn(attribute, html)

    def test_row_shows_status_and_slot_columns(self):
        html = self._render_library([_Story(7, title="First", layout_type="main", status="draft")])

        self.assertIn("Lead", html)
        self.assertIn("Draft", html)

    def test_row_offers_edit_and_trash_actions(self):
        html = self._render_library([_Story(7)])

        self.assertIn("data-news-place-story", html)
        self.assertIn("data-news-library-trash", html)
