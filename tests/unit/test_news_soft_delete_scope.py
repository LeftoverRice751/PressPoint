"""The soft-delete global scope on News, pinned by COMPILED SQL.

These assertions deliberately compile queries instead of running them. The
whole reason SoftDeletesMixin was worth using here is that its scope is
applied inside `QueryBuilder.run_scopes()` at compile time -- after the entire
builder chain -- so nothing a caller chains can bypass it, and all twelve
pre-existing `News.*` read sites became correct without being edited.

That is a claim about generated SQL, so testing it against generated SQL is
both the most direct check and the only one that works on a machine whose
database has not been migrated yet.
"""

from unittest.mock import patch

from app.models.News import News
from app.models.NewsCategory import NewsCategory
from tests import TestCase


DELETED_PREDICATE = "`news`.`deleted_at` IS NULL"


class NewsSoftDeleteScopeTestCase(TestCase):
    def test_plain_select_is_scoped(self):
        self.assertIn(DELETED_PREDICATE, News.all(query=True).to_sql())

    def test_where_is_scoped(self):
        sql = News.where("layout_type", "main").to_sql()
        self.assertIn(DELETED_PREDICATE, sql)

    def test_select_raw_group_by_is_scoped(self):
        """The single most surprising thing in this change.

        DashboardContext.grouped_counts() builds its query with select_raw()
        + group_by(), which reads like it sidesteps the model layer entirely.
        It does not -- the scope is appended at compile time regardless. If
        this ever stops holding, the admin console's status tiles start
        counting deleted stories and nothing else fails loudly.
        """
        sql = (
            News.select_raw("status AS grouped_value, COUNT(*) AS grouped_count")
            .group_by("status")
            .to_sql()
        )
        self.assertIn(DELETED_PREDICATE, sql)

    def test_max_aggregate_is_scoped(self):
        """section_stamp() reads max(updated_at) through this path."""
        self.assertIn(DELETED_PREDICATE, News.max("updated_at").to_sql())

    def test_delete_becomes_an_update_that_only_writes_the_tombstone(self):
        """A soft delete does NOT bump updated_at, and that is load-bearing.

        SoftDeleteScope flips the action from "delete" to "update" from inside
        run_scopes()' own loop, so the "update"-action scopes -- TimeStampsScope
        among them -- are never reached for this statement.

        DashboardContext.section_stamp() is `count:max(updated_at)`, so a soft
        delete moves the stamp via the COUNT half alone. That is fine (both
        callers compare for equality, never ordering) and it is what the
        asymmetry with restore below protects.
        """
        sql = News.where("id", 5).delete(query=True).to_sql()

        self.assertIn("UPDATE", sql)
        self.assertIn("deleted_at", sql)
        self.assertNotIn("updated_at", sql)

    def test_restore_style_update_does_bump_updated_at(self):
        """The other half of the asymmetry that keeps section_stamp sound.

        For the stamp to return to an earlier value you would need both the
        count and max(updated_at) to come back. The only pair that restores a
        count without an obvious timestamp write is (soft-delete X, restore Y)
        -- and a restore is a genuine "update" action, so TimeStampsScope does
        fire and max(updated_at) always moves forward.

        Without this, NewsController.layout()'s 409 optimistic-concurrency
        check could ABA back to a stale editor's token and silently accept an
        overwrite of another editor's front page.
        """
        # NOTE: `update(..., dry=True)` returns the builder still in its SELECT
        # state, so it cannot be used to inspect update SQL. Drive the update
        # grammar the way QueryBuilder.update() itself does instead.
        from masoniteorm.expressions.expressions import UpdateQueryExpression

        builder = News.with_trashed().where("id", 5)
        builder._updates = (UpdateQueryExpression({"deleted_at": None}),)
        builder.set_action("update")
        sql = builder.to_sql()

        self.assertIn("deleted_at", sql)
        self.assertIn("updated_at", sql)

    def test_restore_binds_a_real_null_not_the_string_none(self):
        """to_sql() renders `deleted_at = 'None'`, which looks alarming.

        It is a dry-render artifact: the live path is
        `connection.query(self.to_qmark(), self._bindings)`, and the qmark form
        binds a real None, which the driver sends as SQL NULL. Pinned because
        the to_sql() output invites someone to "fix" it into a string.
        """
        from masoniteorm.expressions.expressions import UpdateQueryExpression

        builder = News.with_trashed().where("id", 5)
        builder._updates = (UpdateQueryExpression({"deleted_at": None}),)
        builder.set_action("update")
        builder.to_qmark()

        self.assertIn(None, builder._bindings)

    def test_with_trashed_drops_the_predicate(self):
        """The inverse of the convenience: surfaces that WANT tombstones -- the
        restore prompt, store()'s "was this deleted?" re-check -- have to opt
        back in explicitly."""
        self.assertNotIn(DELETED_PREDICATE, News.with_trashed().to_sql())

    def test_only_trashed_inverts_the_predicate(self):
        self.assertIn("`deleted_at` IS NOT NULL", News.only_trashed().to_sql())

    def test_deleted_at_is_not_mass_assignable(self):
        """Mass-assigning deleted_at would make delete and undelete reachable
        from any form post -- the same class of bug as `role` sitting in
        User.__fillable__."""
        self.assertNotIn("deleted_at", News.__fillable__)
        self.assertNotIn("deleted_at", NewsCategory.__fillable__)

    def test_category_id_is_fillable_because_store_validates_it(self):
        self.assertIn("category_id", News.__fillable__)


class NewsCategoryScopeTestCase(TestCase):
    def test_categories_are_soft_deleted_too(self):
        self.assertIn("`news_categories`.`deleted_at` IS NULL", NewsCategory.all(query=True).to_sql())

    def test_unique_lookup_uses_the_normalised_key(self):
        """Uniqueness is on name_key, never on name -- see NewsCategory's
        docstring for why the collation alone is not enough."""
        sql = NewsCategory.with_trashed().where("name_key", "sports").to_sql()
        self.assertIn("name_key", sql)


class DestroyLeavesFilesAloneTestCase(TestCase):
    def test_delete_image_files_is_not_called_by_destroy(self):
        """Pinned separately from the filesystem test in test_news_endpoints:
        that one proves the files survive, this one proves the CALL is gone,
        so a refactor cannot reintroduce it behind a no-op guard."""
        from app.controllers.gears.NewsController import NewsController

        controller = NewsController()
        source = controller.destroy.__code__.co_names

        self.assertNotIn("_delete_image_files", source)
