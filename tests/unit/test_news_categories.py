"""Category normalisation, the three-outcome create contract, and the cascade.

The create contract is the part worth guarding closely: it has three outcomes
that a caller distinguishes by an `outcome` string in the payload rather than
by HTTP status, and one of them ("restorable") must never fire automatically.
"""

from unittest.mock import Mock, patch

from app.services import NewsCategories
from tests import TestCase


class NormaliseTestCase(TestCase):
    def test_trims_and_collapses_whitespace(self):
        """The collision the collation cannot catch.

        MySQL's utf8mb4_unicode_ci already folds "Sports"/"sports", so case
        alone did not justify a name_key column. Internal whitespace did:
        "Campus  News" and "Campus News" are distinct under any collation.
        """
        self.assertEqual(NewsCategories.normalise("  Campus   News "), ("Campus News", "campus news"))

    def test_case_folds_for_the_lookup_key_but_keeps_the_display_form(self):
        name, key = NewsCategories.normalise("SPORTS")
        self.assertEqual(name, "SPORTS")  # the editor's own capitalisation
        self.assertEqual(key, "sports")

    def test_empty_input_is_rejected_rather_than_raising(self):
        self.assertEqual(NewsCategories.normalise("   "), (None, None))
        self.assertEqual(NewsCategories.normalise(None), (None, None))

    def test_over_length_is_rejected(self):
        too_long = "x" * (NewsCategories.MAX_NAME_LENGTH + 1)
        self.assertEqual(NewsCategories.normalise(too_long), (None, None))


class ResolveOrOfferTestCase(TestCase):
    def _category(self, id=3, name="Sports", deleted_at=None):
        # `name` cannot be passed to the Mock constructor — it sets the mock's
        # own repr name, not an attribute. Assign it afterwards.
        category = Mock(id=id, deleted_at=deleted_at)
        category.name = name
        return category

    def test_creates_when_the_name_is_free(self):
        created = self._category()
        with patch.object(NewsCategories, "NewsCategory") as model, patch.object(
            NewsCategories, "story_count", return_value=0
        ), patch.object(NewsCategories.NewsCache, "forget"):
            model.with_trashed.return_value.where.return_value.first.return_value = None
            model.create.return_value = created

            outcome, payload = NewsCategories.resolve_or_offer("Sports")

        self.assertEqual(outcome, "created")
        self.assertEqual(payload["name"], "Sports")
        # Stored normalised, so "sports" cannot be created alongside it.
        self.assertEqual(model.create.call_args[0][0]["name_key"], "sports")

    def test_an_existing_live_name_is_a_success_not_an_error(self):
        """The caller's goal is "give me a category id to assign this story
        to", and an existing row meets it. Reporting this through json_errors
        would be worse than useless: that envelope carries no payload slot, so
        the modal would have to parse an id out of an English sentence."""
        with patch.object(NewsCategories, "NewsCategory") as model, patch.object(
            NewsCategories, "story_count", return_value=5
        ):
            model.with_trashed.return_value.where.return_value.first.return_value = self._category()

            outcome, payload = NewsCategories.resolve_or_offer("sports")

        self.assertEqual(outcome, "exists")
        self.assertEqual(payload["id"], 3)
        self.assertEqual(payload["story_count"], 5)

    def test_a_soft_deleted_name_offers_restore_and_never_restores_itself(self):
        """Auto-restoring would resurrect every story cascade-deleted with the
        category -- published ones included -- straight back onto the campus
        kiosk, on what the editor experienced as a typo."""
        tombstone = self._category(deleted_at=Mock(isoformat=lambda: "2026-09-02T14:11:00",
                                                   strftime=lambda fmt: "Sep 02, 2026"))
        with patch.object(NewsCategories, "NewsCategory") as model, patch.object(
            NewsCategories, "story_count", return_value=5
        ):
            model.with_trashed.return_value.where.return_value.first.return_value = tombstone

            outcome, payload = NewsCategories.resolve_or_offer("Sports")

        self.assertEqual(outcome, "restorable")
        self.assertEqual(payload["trashed_story_count"], 5)
        self.assertFalse(model.create.called)
        # Nothing was un-deleted as a side effect.
        self.assertFalse(model.with_trashed.return_value.where.return_value.update.called)

    def test_losing_the_create_race_returns_the_winner_s_row(self):
        """Two editors POST the same new name; both lookups miss, one INSERT
        violates the unique index. The loser must receive exactly the body the
        winner produced -- that is what lets the browser have no
        race-specific branch at all."""
        winner = self._category()
        lookups = [None, winner]  # miss, then the winner's row on the re-select

        with patch.object(NewsCategories, "NewsCategory") as model, patch.object(
            NewsCategories, "story_count", return_value=0
        ):
            model.with_trashed.return_value.where.return_value.first.side_effect = lookups
            model.create.side_effect = Exception("Duplicate entry 'sports'")

            outcome, payload = NewsCategories.resolve_or_offer("Sports")

        self.assertEqual(outcome, "exists")
        self.assertEqual(payload["id"], 3)

    def test_a_non_uniqueness_failure_is_re_raised_rather_than_swallowed(self):
        """The catch is a broad `except Exception` because masonite-orm does
        not wrap driver errors and the class differs per connector. What keeps
        that honest is re-raising when the re-select finds nothing: a failure
        that is not a collision leaves no row behind."""
        with patch.object(NewsCategories, "NewsCategory") as model:
            model.with_trashed.return_value.where.return_value.first.side_effect = [None, None]
            model.create.side_effect = Exception("connection lost")

            with self.assertRaises(Exception):
                NewsCategories.resolve_or_offer("Sports")

    def test_invalid_names_never_reach_the_database(self):
        with patch.object(NewsCategories, "NewsCategory") as model:
            outcome, payload = NewsCategories.resolve_or_offer("   ")

        self.assertEqual(outcome, "invalid")
        self.assertFalse(model.create.called)


class CascadeTestCase(TestCase):
    def test_delete_hides_the_stories_before_the_category(self):
        """Ordering matters: if the category went first, a failure partway
        would leave a hidden category whose stories are still on the public
        kiosk -- worse than either extreme."""
        category = Mock(id=3, name="Sports")
        order = []

        with patch.object(NewsCategories, "find_live", return_value=category), patch.object(
            NewsCategories, "story_count", return_value=4
        ), patch.object(NewsCategories, "News") as news, patch.object(
            NewsCategories.NewsCache, "forget"
        ):
            news.where.return_value.delete.side_effect = lambda: order.append("stories")
            category.delete.side_effect = lambda: order.append("category")

            outcome, payload = NewsCategories.soft_delete_cascade(3)

        self.assertEqual(outcome, "deleted")
        self.assertEqual(payload["deleted_stories"], 4)
        self.assertEqual(order, ["stories", "category"])

    def test_delete_invalidates_the_kiosk_cache(self):
        """A category write changes what the kiosk shows while touching no
        `news` row, so nothing on the news side would ever invalidate it."""
        with patch.object(NewsCategories, "find_live", return_value=Mock(id=3, name="Sports")), \
                patch.object(NewsCategories, "story_count", return_value=0), \
                patch.object(NewsCategories, "News"), \
                patch.object(NewsCategories.NewsCache, "forget") as forget:
            NewsCategories.soft_delete_cascade(3)

        self.assertTrue(forget.called)

    def test_rename_invalidates_the_kiosk_cache(self):
        """The subtlest one: a rename changes a LABEL the kiosk renders and
        touches nothing else at all."""
        category = Mock(id=3, name="Sports")
        with patch.object(NewsCategories, "find_live", return_value=category), \
                patch.object(NewsCategories, "story_count", return_value=0), \
                patch.object(NewsCategories, "NewsCategory") as model, \
                patch.object(NewsCategories.NewsCache, "forget") as forget:
            model.with_trashed.return_value.where.return_value.first.return_value = None

            outcome, payload = NewsCategories.rename(3, "Campus Sports")

        self.assertEqual(outcome, "renamed")
        self.assertEqual(category.name_key, "campus sports")
        self.assertTrue(forget.called)

    def test_rename_onto_an_existing_name_reports_it_instead_of_throwing(self):
        with patch.object(NewsCategories, "find_live", return_value=Mock(id=3, name="Sports")), \
                patch.object(NewsCategories, "story_count", return_value=2), \
                patch.object(NewsCategories, "NewsCategory") as model:
            model.with_trashed.return_value.where.return_value.first.return_value = Mock(
                id=9, name="News", deleted_at=None
            )

            outcome, payload = NewsCategories.rename(3, "News")

        self.assertEqual(outcome, "exists")
        self.assertEqual(payload["id"], 9)

    def test_restore_brings_back_the_category_and_its_stories(self):
        with patch.object(NewsCategories, "story_count", return_value=5), \
                patch.object(NewsCategories, "NewsCategory") as model, \
                patch.object(NewsCategories, "News") as news, \
                patch.object(NewsCategories.NewsCache, "forget"):
            model.only_trashed.return_value.where.return_value.first.return_value = Mock(id=3)
            model.where.return_value.first.return_value = Mock(id=3, name="Sports")

            outcome, payload = NewsCategories.restore_cascade(3)

        self.assertEqual(outcome, "restored")
        self.assertEqual(payload["restored_stories"], 5)
        self.assertTrue(news.with_trashed.return_value.where.return_value.update.called)

    def test_restoring_something_that_is_not_in_the_trash_is_a_miss(self):
        with patch.object(NewsCategories, "NewsCategory") as model:
            model.only_trashed.return_value.where.return_value.first.return_value = None

            outcome, payload = NewsCategories.restore_cascade(3)

        self.assertEqual(outcome, "missing")
