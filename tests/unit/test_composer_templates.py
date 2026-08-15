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


class MainSlotAssignButtonTestCase(TestCase):
    """Every empty slot except the lead already offered a clickable "assign
    a story" button, so editors had no discoverable way to set a main
    headline (Task 1). The partial is shared with the public kiosk, so the
    new button must be editor-only -- a visitor keeps the plain static
    empty-state div and never receives the data-news-assign-slot hook."""

    def test_editor_sees_assign_button_when_lead_is_empty(self):
        html = _render_slots(editor=True)

        # Fix round 1, Minor 4: scoped past the <template
        # data-news-main-empty-template> clone source the same way the
        # "lead filled" test below already is. That inert copy always
        # carries this exact markup once news_editor is true (see
        # _news_slots.html's own comment on why), so a blind substring
        # search against the WHOLE document would stay green even if the
        # live `{% else %}` button were deleted outright -- this test
        # existed but could never actually fail.
        live_html = html.split("</template>", 1)[1]
        self.assertIn("data-news-assign-slot", live_html)
        self.assertIn('data-news-slot-type="main"', live_html)
        self.assertIn('data-news-slot-position="1"', live_html)

    def test_template_and_live_button_carry_matching_attributes(self):
        """_news_slots.html's own comment: syncPlaceholders() clones
        <template data-news-main-empty-template> instead of hardcoding the
        button string itself, precisely so the template copy and the
        `{% else %}` branch's live copy can't drift apart. Pin that they
        currently don't: both must carry the same three data attributes the
        JS reads (data-news-assign-slot, slot-type, slot-position)."""
        html = _render_slots(editor=True)
        template_html, live_html = html.split("</template>", 1)

        for attribute in (
            "data-news-assign-slot",
            'data-news-slot-type="main"',
            'data-news-slot-position="1"',
        ):
            self.assertIn(attribute, template_html)
            self.assertIn(attribute, live_html)

    def test_kiosk_never_sees_assign_button_when_lead_is_empty(self):
        html = _render_slots(editor=False)

        self.assertNotIn("data-news-assign-slot", html)
        self.assertIn(
            '<div class="paper-empty">No stories have been published yet.</div>', html
        )

    def test_editor_lead_filled_has_no_live_assign_button(self):
        html = _render_slots(main=_Story(1, layout_type="main"), editor=True)

        # <template data-news-main-empty-template> -- the clone source
        # syncPlaceholders() reads instead of hardcoding the button string
        # itself -- always carries this markup once news_editor is true,
        # regardless of whether the lead is filled (that's the point: it
        # can't drift from the `{% else %}` branch). So this checks the
        # LIVE paper-slot--main section, past the inert template, rather
        # than a blind substring search that the template would always
        # satisfy. Scoped to the "main" slot type specifically -- the
        # secondary/widget slots are legitimately still empty in this
        # fixture and keep their own assign buttons.
        live_html = html.split("</template>", 1)[1]
        self.assertNotIn('data-news-slot-type="main"', live_html)


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
