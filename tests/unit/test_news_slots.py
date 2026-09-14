"""The bucketing rules ARE the specification of the issue's layout.

`group_news_slots()` is the single place that decides which block a story
renders in, and it has two consumers that must never disagree: the kiosk page
and the Gears composer canvas. Everything subtle about the front page lives
here -- the ascending sort, the lead fallback, the capacity truncation, and the
rule that an unplaced story can never be promoted into print.

The vocabulary is the editor's own: `lead`, `brief`, `photo_essay`,
`editorial`, `quote`, `notice`. It replaced `main`/`secondary`/`widget`, which
were words no newsroom uses and which forced a translation into every surface
between the column and the screen.
"""

from app.services.DashboardContext import (
    BLOCK_CAPACITY,
    BLOCK_TYPES,
    group_news_slots,
)

from tests import TestCase


class _Story:
    """Minimal stand-in for a News row — group_news_slots only ever touches
    `.id`, `.priority` and `.layout_type`, all via getattr()."""

    def __init__(self, id, priority=0, layout_type="brief"):
        self.id = id
        self.priority = priority
        self.layout_type = layout_type


def _ids(stories):
    return [story.id for story in stories]


class BlockVocabularyTestCase(TestCase):
    """The table itself. If these drift, the migration and the composer's
    capacity checks are describing different things."""

    def test_every_block_type_has_a_capacity(self):
        self.assertEqual(set(BLOCK_TYPES), set(BLOCK_CAPACITY))

    def test_the_capacities_are_the_ones_the_issue_renders(self):
        self.assertEqual(
            BLOCK_CAPACITY,
            {
                "lead": 1,
                "brief": 4,
                "photo_essay": 3,
                "editorial": 1,
                "quote": 2,
                "notice": 1,
            },
        )

    def test_unassigned_is_not_a_block(self):
        """It is a destination, not a place on the page: a story sent to the
        library must not acquire a capacity or a section."""
        self.assertNotIn("unassigned", BLOCK_TYPES)

    def test_every_block_comes_back_even_when_empty(self):
        """Templates index these directly. A missing key is a 500 on the kiosk,
        not a blank section."""
        slots = group_news_slots([])

        for block in BLOCK_TYPES:
            self.assertIn(block, slots)
            self.assertEqual(slots[block], [])


class OrderingTestCase(TestCase):
    def test_lower_priority_renders_first(self):
        """"Position #1" is literally true — the sort is ascending, so the
        badge an editor reads is the render order, not a raw column value.

        The explicit lead is not incidental: without one the fallback promotes
        the first brief out of the bucket, and this would be measuring the
        fallback instead of the sort."""
        lead = _Story(id=9, priority=0, layout_type="lead")
        high = _Story(id=3, priority=3)
        low = _Story(id=1, priority=1)
        mid = _Story(id=2, priority=2)

        slots = group_news_slots([high, lead, low, mid])

        self.assertEqual(_ids(slots["brief"]), [1, 2, 3])

    def test_id_breaks_a_priority_tie(self):
        """Ties are common: `priority` defaults to 0, so a run of new stories
        all carry it. Falling back to id keeps the order stable instead of
        leaving it to whatever the driver returned."""
        lead = _Story(id=1, priority=0, layout_type="lead")
        later = _Story(id=9, priority=0)
        earlier = _Story(id=4, priority=0)

        slots = group_news_slots([later, lead, earlier])

        self.assertEqual(_ids(slots["brief"]), [4, 9])


class LeadTestCase(TestCase):
    def test_an_explicit_lead_wins_over_a_lower_priority_story(self):
        brief = _Story(id=1, priority=0, layout_type="brief")
        lead = _Story(id=2, priority=9, layout_type="lead")

        slots = group_news_slots([brief, lead])

        self.assertEqual(_ids(slots["lead"]), [2])
        self.assertEqual(_ids(slots["brief"]), [1])

    def test_the_lead_falls_back_to_the_first_assignable_story(self):
        """A page with no story marked `lead` still needs one, or the issue
        opens with section 01 missing."""
        first = _Story(id=1, priority=1, layout_type="brief")
        second = _Story(id=2, priority=2, layout_type="brief")

        slots = group_news_slots([second, first])

        self.assertEqual(_ids(slots["lead"]), [1])
        # And it is not ALSO left in the bucket it came from.
        self.assertEqual(_ids(slots["brief"]), [2])

    def test_only_one_lead_survives(self):
        """Two rows can carry `lead` — a concurrent edit, or a hand-posted
        form. The extra one is dropped rather than rendered into a slot the
        page has one of."""
        first = _Story(id=1, priority=1, layout_type="lead")
        second = _Story(id=2, priority=2, layout_type="lead")

        slots = group_news_slots([first, second])

        self.assertEqual(_ids(slots["lead"]), [1])

    def test_no_stories_means_no_lead(self):
        self.assertEqual(group_news_slots([])["lead"], [])


class UnassignedTestCase(TestCase):
    def test_an_unassigned_story_reaches_no_block(self):
        unassigned = _Story(id=1, priority=0, layout_type="unassigned")
        brief = _Story(id=2, priority=1, layout_type="brief")

        slots = group_news_slots([unassigned, brief])

        for block in BLOCK_TYPES:
            self.assertNotIn(1, _ids(slots[block]))

    def test_an_unassigned_story_can_never_become_the_lead(self):
        """The sharpest case: with the lead empty, the fallback picks the
        first ASSIGNABLE story. If `unassigned` were eligible, sending a story
        to the library would promote it to the front page instead of removing
        it — the exact opposite of what the editor asked for."""
        unassigned = _Story(id=1, priority=0, layout_type="unassigned")
        brief = _Story(id=2, priority=5, layout_type="brief")

        slots = group_news_slots([unassigned, brief])

        self.assertEqual(_ids(slots["lead"]), [2])

    def test_only_unassigned_stories_means_an_empty_page(self):
        slots = group_news_slots([_Story(id=1, layout_type="unassigned")])

        self.assertEqual(slots["lead"], [])
        self.assertEqual(slots["brief"], [])


class CapacityTestCase(TestCase):
    def test_each_block_truncates_at_its_capacity(self):
        for block, capacity in BLOCK_CAPACITY.items():
            stories = [
                _Story(id=n, priority=n, layout_type=block)
                for n in range(1, capacity + 3)
            ]
            # A lead of its own, except when the block under test IS the lead:
            # otherwise the fallback borrows one of these rows and the count
            # comes up short for a reason that has nothing to do with capacity.
            if block != "lead":
                stories.append(_Story(id=999, priority=0, layout_type="lead"))

            slots = group_news_slots(stories)

            self.assertEqual(
                len(slots[block]),
                capacity,
                f"{block} holds {capacity}, so an over-full bucket must truncate",
            )

    def test_truncation_keeps_the_lowest_priorities(self):
        """Which ones survive matters: an editor who put a story at position 1
        expects to see it, not whichever rows the database happened to return
        first."""
        stories = [_Story(id=n, priority=n, layout_type="brief") for n in (5, 1, 4, 2, 3)]
        stories.append(_Story(id=99, priority=0, layout_type="lead"))

        slots = group_news_slots(stories)

        self.assertEqual(_ids(slots["brief"]), [1, 2, 3, 4])


class UnknownTypeTestCase(TestCase):
    def test_an_unrecognised_layout_type_renders_nowhere(self):
        """Fails closed. A value the vocabulary does not know — a stale row, a
        hand-posted form, a half-run migration — must not be guessed into a
        block. The story stays reachable in the library; it just does not print.
        """
        stories = [
            _Story(id=1, priority=0, layout_type="widget"),
            _Story(id=2, priority=1, layout_type="brief"),
        ]

        slots = group_news_slots(stories)

        for block in BLOCK_TYPES:
            self.assertNotIn(1, _ids(slots[block]))

    def test_a_blank_layout_type_is_treated_as_a_brief(self):
        """The column is NOT NULL with a default, but a model built in memory
        can still carry None. A brief is the safe landing: it is the ordinary
        body of the page, not the lead."""
        lead = _Story(id=9, priority=0, layout_type="lead")
        slots = group_news_slots([lead, _Story(id=1, priority=1, layout_type=None)])

        self.assertEqual(_ids(slots["brief"]), [1])

    def test_matching_is_case_and_padding_insensitive(self):
        lead = _Story(id=9, priority=0, layout_type="lead")
        slots = group_news_slots([lead, _Story(id=1, priority=1, layout_type="  Photo_Essay  ")])

        self.assertEqual(_ids(slots["photo_essay"]), [1])
