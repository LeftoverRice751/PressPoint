from unittest.mock import patch

from tests import TestCase

from app.services.DashboardContext import group_news_slots, news_canvas_context


class _Story:
    """Minimal stand-in for a News model row — group_news_slots only ever
    touches `.priority`, `.id`, and `.layout_type` via getattr()."""

    def __init__(self, id, priority, layout_type):
        self.id = id
        self.priority = priority
        self.layout_type = layout_type


class NewsSlotsTestCase(TestCase):
    def test_ascending_order_is_respected(self):
        # Lower priority number should render first (Position #1 = first).
        low = _Story(id=1, priority=1, layout_type="secondary")
        mid = _Story(id=2, priority=2, layout_type="secondary")
        high = _Story(id=3, priority=3, layout_type="secondary")

        slots = group_news_slots([high, low, mid])

        # No explicit "main" story: the fallback should pick the first item
        # under the new ascending key, i.e. the lowest priority.
        self.assertIs(slots["main_news"], low)
        self.assertEqual([item.id for item in slots["secondary_news"]], [2, 3])

    def test_unassigned_excluded_from_all_buckets(self):
        # An "unassigned" story with layout_type == "unassigned" trivially
        # fails the `== "secondary"` / `== "widget"` equality checks on its
        # own, so a naive version of this test (assertNotIn on the
        # unassigned item) would still pass even with the exclusion filter
        # deleted from DashboardContext.group_news_slots — it wouldn't be
        # pinning anything. To make the filter's removal actually observable
        # here, there is no explicit "main" story and the unassigned item
        # has the LOWEST priority: with the filter in place it is skipped
        # and `secondary_a` becomes main_news, freeing `secondary_b` to be
        # the only story left in the secondary bucket. Without the filter,
        # the unassigned item would win the main-fallback slot instead,
        # which frees `secondary_a` into the bucket too — changing both the
        # count and the membership of secondary_news. (Verified empirically:
        # deleting the `assignable_items` filter at DashboardContext.py and
        # reverting `main_news`/`secondary_news`/`widget_news` to read from
        # `sorted_items` makes this test fail, asserting
        # `[secondary_b.id]` against an actual `[secondary_a.id,
        # secondary_b.id]` — see fix-round report for the full transcript.)
        unassigned = _Story(id=1, priority=1, layout_type="unassigned")
        secondary_a = _Story(id=2, priority=2, layout_type="secondary")
        secondary_b = _Story(id=3, priority=3, layout_type="secondary")
        unassigned_widget = _Story(id=4, priority=4, layout_type="unassigned")
        widget = _Story(id=5, priority=5, layout_type="widget")

        slots = group_news_slots(
            [unassigned, secondary_a, secondary_b, unassigned_widget, widget]
        )

        self.assertIs(slots["main_news"], secondary_a)
        self.assertNotIn(unassigned, slots["secondary_news"])
        self.assertNotIn(unassigned_widget, slots["widget_news"])
        self.assertEqual([item.id for item in slots["secondary_news"]], [secondary_b.id])
        self.assertEqual([item.id for item in slots["widget_news"]], [widget.id])

    def test_id_tiebreak_direction_is_ascending(self):
        # Equal priority: the OLD key (-priority, -id) broke ties on
        # descending id (newest first). The NEW key (priority, id) breaks
        # ties on ASCENDING id (oldest first) — this is exactly the
        # direction that silently flipped a real newsroom's story order
        # (see fix-round report, B-2). Pin it explicitly.
        older = _Story(id=5, priority=2, layout_type="secondary")
        newer = _Story(id=9, priority=2, layout_type="secondary")
        main = _Story(id=1, priority=1, layout_type="main")

        slots = group_news_slots([newer, older, main])

        self.assertEqual([item.id for item in slots["secondary_news"]], [5, 9])

    def test_priority_none_normalizes_to_zero(self):
        none_priority = _Story(id=2, priority=None, layout_type="secondary")
        zero_priority = _Story(id=3, priority=0, layout_type="secondary")
        main = _Story(id=1, priority=1, layout_type="main")

        # Should not raise, and priority=None must sort identically to 0
        # (i.e. ahead of priority=1), tie-broken by ascending id.
        slots = group_news_slots([main, zero_priority, none_priority])

        self.assertEqual([item.id for item in slots["secondary_news"]], [2, 3])

    def test_layout_type_is_case_insensitive(self):
        main = _Story(id=1, priority=1, layout_type="MAIN")
        secondary = _Story(id=2, priority=2, layout_type="Secondary")
        widget = _Story(id=3, priority=3, layout_type="WIDGET")
        unassigned = _Story(id=4, priority=0, layout_type="Unassigned")

        slots = group_news_slots([unassigned, main, secondary, widget])

        self.assertIs(slots["main_news"], main)
        self.assertEqual([item.id for item in slots["secondary_news"]], [2])
        self.assertEqual([item.id for item in slots["widget_news"]], [3])

    def test_unassigned_never_wins_main_fallback(self):
        # Lowest priority is "unassigned" — it must be skipped in favor of
        # the next eligible story, not win the main slot by default.
        unassigned = _Story(id=1, priority=1, layout_type="unassigned")
        secondary = _Story(id=2, priority=2, layout_type="secondary")

        slots = group_news_slots([unassigned, secondary])

        self.assertIs(slots["main_news"], secondary)
        self.assertNotIn(unassigned, slots["secondary_news"])
        self.assertNotIn(unassigned, slots["widget_news"])

    def test_main_fallback_picks_first_non_unassigned_when_nothing_is_main(self):
        unassigned = _Story(id=1, priority=1, layout_type="unassigned")
        first_eligible = _Story(id=2, priority=2, layout_type="secondary")
        second_eligible = _Story(id=3, priority=3, layout_type="widget")

        slots = group_news_slots([unassigned, second_eligible, first_eligible])

        self.assertIs(slots["main_news"], first_eligible)

    def test_duplicate_main_rows_orphan_the_loser_in_every_bucket(self):
        # THE defect class four fix rounds of the newsroom composer have been
        # chasing, pinned server-side at last. Every one of those bugs ended
        # the same way: the composer wrote a SECOND layout_type="main" row
        # (a lead scratch that stayed staged as "main" while a real story took
        # the lead). This is what that costs — group_news_slots() keeps only
        # the lowest (priority, id) as main_news, and the loser matches
        # neither the `== "secondary"` nor the `== "widget"` filter, so it is
        # in NO bucket at all: it saves successfully, renders on neither the
        # kiosk nor the composer canvas, and the editor has no way to find it.
        # The grouping is doing the right thing here; the test exists so that
        # stays true and so the cost of a duplicate main is documented in
        # code, not only in a fix-round report.
        winner = _Story(id=7, priority=2, layout_type="main")
        loser = _Story(id=3, priority=5, layout_type="main")
        secondary = _Story(id=4, priority=6, layout_type="secondary")

        slots = group_news_slots([loser, secondary, winner])

        self.assertIs(slots["main_news"], winner)
        self.assertNotIn(loser, slots["secondary_news"])
        self.assertNotIn(loser, slots["widget_news"])
        # And it does not quietly displace a legitimate secondary story either.
        self.assertEqual([item.id for item in slots["secondary_news"]], [secondary.id])

    def test_duplicate_main_rows_tie_break_on_lowest_id(self):
        # Same priority — which is the realistic collision, since a new story
        # created from the composer gets priority max+1 only on the create
        # path. The ascending (priority, id) key means the OLDER row keeps the
        # lead and the newer one is the orphan; pin the direction, because a
        # flip would silently change which of two mains the kiosk shows.
        older = _Story(id=2, priority=3, layout_type="main")
        newer = _Story(id=9, priority=3, layout_type="main")

        slots = group_news_slots([newer, older])

        self.assertIs(slots["main_news"], older)
        self.assertNotIn(newer, slots["secondary_news"])
        self.assertNotIn(newer, slots["widget_news"])
        self.assertEqual(slots["secondary_news"], [])
        self.assertEqual(slots["widget_news"], [])

    def test_unassigned_excluded_from_every_bucket_even_when_a_main_exists(self):
        # The other two "unassigned" tests both run with NO explicit main, so
        # they exercise the exclusion through the main-FALLBACK path. This one
        # pins the plain bucket exclusion with a real main present, which is
        # the state the composer's colliding-scratch retarget actually
        # produces: a real story owns the lead and the draft is sent to
        # layout_type="unassigned". That retarget is only safe because an
        # unassigned row cannot be capacity-excluded into invisibility — it is
        # never in a bucket to begin with, and has no cap to overflow (the
        # bug that killed round 2's retarget-to-secondary).
        main = _Story(id=1, priority=1, layout_type="main")
        unassigned = _Story(id=2, priority=2, layout_type="unassigned")
        secondary = _Story(id=3, priority=3, layout_type="secondary")
        unassigned_upper = _Story(id=4, priority=4, layout_type="Unassigned")
        widget = _Story(id=5, priority=5, layout_type="widget")

        slots = group_news_slots(
            [main, unassigned, secondary, unassigned_upper, widget]
        )

        self.assertIs(slots["main_news"], main)
        self.assertEqual([item.id for item in slots["secondary_news"]], [secondary.id])
        self.assertEqual([item.id for item in slots["widget_news"]], [widget.id])
        for orphan in (unassigned, unassigned_upper):
            self.assertIsNot(slots["main_news"], orphan)
            self.assertNotIn(orphan, slots["secondary_news"])
            self.assertNotIn(orphan, slots["widget_news"])

    def test_secondary_cap_holds_at_four(self):
        # Six secondary stories, plus one explicit "main" so the fallback
        # doesn't eat into the secondary pool being measured.
        main = _Story(id=0, priority=0, layout_type="main")
        stories = [main] + [
            _Story(id=i, priority=i, layout_type="secondary")
            for i in range(1, 7)
        ]
        slots = group_news_slots(stories)

        self.assertEqual(len(slots["secondary_news"]), 4)
        self.assertEqual([item.id for item in slots["secondary_news"]], [1, 2, 3, 4])

    def test_widget_cap_holds_at_two(self):
        main = _Story(id=0, priority=0, layout_type="main")
        stories = [main] + [
            _Story(id=i, priority=i, layout_type="widget")
            for i in range(1, 5)
        ]
        slots = group_news_slots(stories)

        self.assertEqual(len(slots["widget_news"]), 2)
        self.assertEqual([item.id for item in slots["widget_news"]], [1, 2])

    def test_empty_input_returns_none_main_and_empty_buckets(self):
        slots = group_news_slots([])

        self.assertIsNone(slots["main_news"])
        self.assertEqual(slots["secondary_news"], [])
        self.assertEqual(slots["widget_news"], [])


class NewsCanvasContextTestCase(TestCase):
    """Task 4's stale-canvas fix re-renders kiosk/_news_slots.html from a
    fragment endpoint. That partial expects `main_story` / `secondary_stories`
    / `widget_news` / `news_editor` — different key names than news_context()
    returns (`main_news` / `secondary_news`) — so pin the renaming here rather
    than relying on the fragment route to catch a typo."""

    def test_renames_slot_buckets_for_the_canvas_partial(self):
        main = _Story(id=1, priority=1, layout_type="main")
        secondary = _Story(id=2, priority=2, layout_type="secondary")
        widget = _Story(id=3, priority=3, layout_type="widget")

        with patch("app.services.DashboardContext.News") as mock_news:
            # news_context() orders in SQL now, so the stub answers
            # order_by(...).get() rather than all(). A bare MagicMock is
            # iterable and yields nothing, so a stub left on all() would make
            # this pass vacuously with an empty canvas.
            mock_news.order_by.return_value.get.return_value = [
                widget, secondary, main
            ]
            context = news_canvas_context()

            mock_news.order_by.assert_called_once_with("id", "desc")
            mock_news.all.assert_not_called()

        self.assertIs(context["main_story"], main)
        self.assertEqual(context["secondary_stories"], [secondary])
        self.assertEqual(context["widget_news"], [widget])
        self.assertIs(context["news_editor"], True)
        # news_items comes back id-descending (newest first) straight from the
        # database — unrelated to the slot buckets above, which sort by
        # priority.
        self.assertEqual(context["news_items"], [widget, secondary, main])
