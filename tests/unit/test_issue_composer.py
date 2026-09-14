"""Contracts for the shared issue partial, kiosk/_issue.html.

One markup now serves two surfaces: the public kiosk page and the Gears
composer canvas, told apart by the `news_editor` flag. That is the whole point
of the file -- an editor cannot lay out a page that differs from the one the
terminal prints if there is only one of them.

Two things therefore have to hold, and neither shows up as an error when it
breaks:

  1. In editor mode the partial emits every hook news-dashboard.js reaches for.
     Miss one and the canvas renders but goes inert, silently -- the JS guards
     each lookup with `if (el)`.
  2. In kiosk mode it emits NONE of them. Editor chrome on a public campus
     terminal is a content leak, not a cosmetic bug.

This replaced tests/unit/test_composer_templates.py, which pinned the same
pair for kiosk/_news_slots.html -- a partial nothing renders any more, now that
the composer, the canvas fragment and the review preview all read this one.

Rendering goes through Masonite's View facade so the real Jinja environment
(the `news_image` filter, the `site_logo` global) is in play.
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
        # filter's disk lookups -- the hooks under test are independent of it.
        self.image = None
        self.dek = "A dek."
        self.image_caption = "A caption."
        self.image_credit = "A credit."
        self.headline_font = None
        self.published_label = "Sep 11, 2026"
        self.published_iso = "2026-09-11"
        for key, value in overrides.items():
            setattr(self, key, value)


def _render(lead=None, briefs=(), essay=(), editorial=(), quotes=(), notice=(),
            events=(), editor=True):
    """Render the partial the way its callers do: one `blocks` dict, every key
    present. group_news_slots() guarantees that shape, so a test that omits a
    block is still exercising a real context."""
    blocks = {
        "lead": [lead] if lead else [],
        "brief": list(briefs),
        "photo_essay": list(essay),
        "editorial": list(editorial),
        "quote": list(quotes),
        "notice": list(notice),
    }
    return View.render(
        "kiosk/_issue",
        {
            "blocks": blocks,
            "events": list(events),
            "issue_vol": 1,
            "issue_no": 5,
            "news_editor": editor,
        },
    ).get_content()


#: Every hook news-dashboard.js reads off the canvas. Grouped by what breaks.
EDITOR_HOOKS = (
    # Sortable's drop containers (slotListContainers, js:2282).
    'data-news-slot-list="lead"',
    'data-news-slot-list="brief"',
    'data-news-slot-list="photo_essay"',
    'data-news-slot-list="editorial"',
    'data-news-slot-list="quote"',
    'data-news-slot-list="notice"',
    # Click-selection reads the block type off the nearest section (js:1897).
    'data-news-slot="lead"',
    'data-news-slot="brief"',
    'data-news-slot="editorial"',
    'data-news-slot="notice"',
    # The Move Up/Down live region.
    "data-news-move-announcer",
    # Reordering.
    "data-news-position-badge",
    'data-news-move="up"',
    'data-news-move="down"',
    # Right-click menu.
    "data-news-context-menu=",
    # Editable regions.
    'data-news-edit="title"',
    'data-news-edit="body"',
    'data-news-edit="excerpt"',
)


class IssueEditorHooksTestCase(TestCase):
    def test_editor_mode_emits_every_hook_the_canvas_needs(self):
        html = _render(
            lead=_Story(1, layout_type="lead"),
            briefs=[_Story(2), _Story(3)],
            editorial=[_Story(9, layout_type="editorial")], notice=[_Story(10, layout_type="notice")],
        )
        for hook in EDITOR_HOOKS:
            self.assertIn(hook, html, f"the composer canvas is inert without {hook}")

    def test_editorial_and_notice_are_separate_blocks(self):
        """They were one `widget` bucket told apart by cell position, which is
        why a story could land in the wrong one. Each is now its own block with
        its own container, so there is nothing to confuse."""
        html = _render(lead=_Story(1, layout_type="lead"))

        self.assertIn('data-news-slot-list="editorial"', html)
        self.assertIn('data-news-slot-list="notice"', html)
        self.assertNotIn('data-news-slot-list="widget"', html)

    def test_a_single_capacity_card_carries_the_class_sortable_drags(self):
        """`.info-card` is Sortable's draggable selector for the single-capacity
        blocks and half the click-selection matcher. A card styled as anything
        else renders fine and cannot be dragged or selected."""
        html = _render(
            lead=_Story(1, layout_type="lead"),
            editorial=[_Story(9, layout_type="editorial")],
        )
        self.assertIn("info-card", html)

    def test_real_cards_carry_a_non_empty_news_id(self):
        """realCardNodes() treats a non-empty data-news-id as what makes a node
        a REAL card, regardless of class. Without it a placed story is invisible
        to every capacity check."""
        html = _render(lead=_Story(7, layout_type="lead"))
        self.assertIn('data-news-id="7"', html)


class DirectEntryTestCase(TestCase):
    """The composer is where an editor WRITES the newsletter, not where they
    assign stories written elsewhere.

    It used to render "+ Assign story to Lead" in every empty slot, which meant
    a newsroom with no stories yet had an unusable composer: there was nothing
    to assign, and no way to type. Every position now renders the same card the
    filled one does, empty, so the page itself is the input.
    """

    def test_an_empty_issue_offers_no_assignment_step(self):
        html = _render()

        self.assertNotIn("data-news-assign-slot", html)
        self.assertNotIn("Assign story", html)

    def test_every_block_renders_a_typeable_card_when_empty(self):
        """One per unfilled position, across all six blocks: 1 lead + 4 briefs
        + 3 photo essay + 1 editorial + 2 quotes + 1 notice."""
        html = _render()

        self.assertEqual(html.count('data-news-id=""'), 12)

    def test_an_empty_card_carries_its_editable_regions(self):
        """syncFormFromSurface() only writes a column whose region exists on the
        active card. An empty card missing one silently drops that column on the
        first save, which is how a headline typed into a blank lead would
        vanish."""
        html = _render()

        for region in ("title", "body", "excerpt", "image"):
            self.assertIn(f'data-news-edit="{region}"', html)

    def test_empty_regions_tell_the_editor_what_goes_there(self):
        """A blank newsletter with no prompts is just a blank page. The rule
        that renders these already exists in news-dashboard.css."""
        html = _render()

        self.assertIn("data-placeholder", html)
        self.assertIn("Enter the lead headline", html)

    def test_an_empty_card_has_no_position_badge(self):
        """Position badges and Move buttons belong to cards with a row and a
        place in the persisted order. A card that has neither must not show
        controls that would reorder nothing."""
        html = _render()

        self.assertNotIn("data-news-position-badge", html)


class IssueKioskLeakTestCase(TestCase):
    def test_kiosk_mode_leaks_no_editor_chrome(self):
        html = _render(
            lead=_Story(1, layout_type="lead"),
            briefs=[_Story(2)],
            editorial=[_Story(9, layout_type="editorial")],
            editor=False,
        )
        for hook in EDITOR_HOOKS:
            self.assertNotIn(hook, html, f"{hook} is editor chrome and must not reach the kiosk")

    def test_kiosk_mode_keeps_the_reader_trigger(self):
        """The inverse: "Read the full story" is kiosk-only, and the composer
        must not render a control that opens an overlay it does not have."""
        kiosk = _render(lead=_Story(1, layout_type="lead"), editor=False)
        editor = _render(lead=_Story(1, layout_type="lead"), editor=True)

        self.assertIn("data-news-more", kiosk)
        self.assertNotIn("data-news-more", editor)

    def test_kiosk_shows_no_slot_placeholder_text(self):
        """"Assign story to..." is CMS vocabulary. An empty issue on a public
        screen says nothing has been published, not that a slot is waiting."""
        html = _render(editor=False)

        self.assertNotIn("Assign story", html)
        self.assertIn("No stories have been published yet.", html)


class IssueSectionNumberingTestCase(TestCase):
    """The band counter increments inside the macro, so the numbers describe
    what actually rendered. A skipped section must not leave a gap -- printing
    `03` when section 2 was empty tells a reader something is missing."""

    def _bands(self, html):
        import re

        return [b.strip() for b in re.findall(r'issue-band__label">([^<]+)<', html)]

    def test_a_full_issue_numbers_every_section_in_order(self):
        html = _render(
            lead=_Story(1, layout_type="lead"),
            briefs=[_Story(2)],
            editorial=[_Story(9, layout_type="editorial")],
            events=[{"title": "Parade", "chip": "SEP 15", "iso": "2026-09-15"}],
            essay=[_Story(i, layout_type="photo_essay", image=f"news/{i}.jpg") for i in (5, 6, 7)],
            editor=False,
        )
        numbers = [b.split()[0] for b in self._bands(html)]
        self.assertEqual(numbers, ["01", "02", "03", "04", "05"])

    def test_numbering_closes_the_gap_when_a_section_is_empty(self):
        """Lead only: every later section skips itself, so `01` is the only
        number printed -- not `01` followed by a jump."""
        html = _render(lead=_Story(1, layout_type="lead"), editor=False)
        self.assertEqual([b.split()[0] for b in self._bands(html)], ["01"])

    def test_an_issue_with_no_lead_renumbers_from_one(self):
        html = _render(briefs=[_Story(2)], editor=False)
        bands = self._bands(html)

        self.assertEqual(len(bands), 1)
        self.assertTrue(bands[0].startswith("01"))
        self.assertIn("Also reported", bands[0])

    def test_the_photo_essay_needs_one_real_photograph(self):
        """The floor is ONE photograph, not three.

        This used to assert the opposite -- that two photographs is not an essay
        and the section removes itself rather than half-fill its grid. That
        reasoning held while an editor could only ASSIGN pre-existing stories,
        where a partly-filled block was the ordinary case. Direct entry changed
        it: an editor types into three slots, so two filled means two deliberate
        photographs, and hiding the section discards them silently.

        What survives from the old rule is the floor: an empty block is still
        not a section."""
        none_placed = _render(lead=_Story(1, layout_type="lead"), editor=False)
        two = _render(
            lead=_Story(1, layout_type="lead"),
            essay=[_Story(5, layout_type="photo_essay", image="a.jpg"),
                  _Story(6, layout_type="photo_essay", image="b.jpg")],
            editor=False,
        )
        three = _render(
            lead=_Story(1, layout_type="lead"),
            essay=[_Story(i, layout_type="photo_essay", image=f"{i}.jpg") for i in (5, 6, 7)],
            editor=False,
        )

        self.assertNotIn("issue-essay__grid", none_placed)
        self.assertIn("issue-essay__grid", two)
        self.assertIn("issue-essay__grid", three)


class KioskPrintsEverythingPlacedTestCase(TestCase):
    """What an editor fills in is what the terminal shows.

    Two blocks used to hide themselves on the kiosk even when filled. Both
    rules were defensible when an editor could only ASSIGN pre-existing
    stories -- a half-filled block was the normal case then, and a lone
    photograph really is not an essay. Direct entry changed that: an editor now
    types into four brief slots and three essay slots, so every one they fill is
    deliberate, and printing two of four is silently discarded work.
    """

    def test_all_four_side_stories_print(self):
        """The bucket holds four and the composer shows four, so the kiosk
        printing the first two meant stories three and four were written,
        saved, approved and never seen."""
        html = _render(
            lead=_Story(1, layout_type="lead"),
            briefs=[_Story(n, title=f"Brief {n}") for n in (2, 3, 4, 5)],
            editor=False,
        )

        for n in (2, 3, 4, 5):
            self.assertIn(f"Brief {n}", html, f"side story {n} is placed but not printed")

    def test_the_photo_essay_prints_with_a_single_photograph(self):
        html = _render(
            lead=_Story(1, layout_type="lead"),
            essay=[_Story(5, layout_type="photo_essay", image="a.jpg")],
            editor=False,
        )

        self.assertIn("issue-essay__grid", html)

    def test_the_photo_essay_prints_with_two_photographs(self):
        html = _render(
            lead=_Story(1, layout_type="lead"),
            essay=[_Story(n, layout_type="photo_essay", image=f"{n}.jpg") for n in (5, 6)],
            editor=False,
        )

        self.assertIn("issue-essay__grid", html)

    def test_the_essay_grid_says_how_many_photographs_it_holds(self):
        """The grid is 2fr/1fr/1fr for three. With one photograph that would
        leave two empty cells, so the count travels to the CSS as a modifier."""
        for count, rows in ((1, (5,)), (2, (5, 6)), (3, (5, 6, 7))):
            html = _render(
                lead=_Story(1, layout_type="lead"),
                essay=[_Story(n, layout_type="photo_essay", image=f"{n}.jpg") for n in rows],
                editor=False,
            )
            self.assertIn(f"issue-essay__grid--{count}", html)

    def test_an_essay_with_no_photographs_still_omits_itself(self):
        """The floor is one real photograph. An empty block is not a section."""
        html = _render(lead=_Story(1, layout_type="lead"), editor=False)

        self.assertNotIn("issue-essay__grid", html)
