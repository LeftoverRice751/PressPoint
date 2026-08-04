from tests import TestCase

from app.services.DashboardContext import group_news_slots


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
        main = _Story(id=1, priority=1, layout_type="main")
        unassigned_secondary = _Story(id=2, priority=2, layout_type="unassigned")
        secondary = _Story(id=3, priority=3, layout_type="secondary")
        unassigned_widget = _Story(id=4, priority=4, layout_type="unassigned")
        widget = _Story(id=5, priority=5, layout_type="widget")

        slots = group_news_slots(
            [main, unassigned_secondary, secondary, unassigned_widget, widget]
        )

        self.assertIs(slots["main_news"], main)
        self.assertNotIn(unassigned_secondary, slots["secondary_news"])
        self.assertNotIn(unassigned_widget, slots["widget_news"])
        self.assertEqual([item.id for item in slots["secondary_news"]], [3])
        self.assertEqual([item.id for item in slots["widget_news"]], [5])

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
