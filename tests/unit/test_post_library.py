"""Per-post library and duplicate. Doubles only: News and the file helpers are
patched, so nothing here touches the (live) database or the NAS."""

from datetime import datetime, timedelta, timezone
from types import SimpleNamespace
from unittest import TestCase
from unittest.mock import Mock, patch

import pytest

from app.controllers.gears.NewsController import NewsController
from app.services import PostLibrary

LIB = "app.services.PostLibrary"
NEWS = "app.controllers.gears.NewsController"

pytestmark = pytest.mark.usefixtures("actor_may_change_any_story")


def _post(id, status="draft", **over):
    fields = dict(
        id=id, title=f"Post {id}", description="body", kicker="K", image=f"news/{id}.jpg",
        logo_path=None, image_crop=None, source_lines=None, status=status, author_id=7,
        rejection_reason=None, expires_at=None, published_at=None, created_at=None,
    )
    fields.update(over)
    return SimpleNamespace(**fields)


def _future():
    return datetime.now(timezone.utc) + timedelta(days=2)


def _past():
    return datetime.now(timezone.utc) - timedelta(days=2)


class LibraryRowsTestCase(TestCase):
    def _rows(self, posts):
        with patch(f"{LIB}.News") as news:
            chain = news.where.return_value.order_by.return_value.order_by.return_value
            chain.get.return_value = posts
            rows = PostLibrary.library_rows(7)
        self.news = news
        return rows

    def test_queries_only_the_callers_posts_ordered_in_sql(self):
        self._rows([])
        self.news.where.assert_called_once_with("author_id", 7)
        first = self.news.where.return_value.order_by
        first.assert_called_once_with("updated_at", "desc")
        first.return_value.order_by.assert_called_once_with("id", "desc")

    def test_state_for_each_kind_of_post(self):
        rows = self._rows([
            _post(1, "draft"),
            _post(2, "draft", rejection_reason="Blurry"),
            _post(3, "review"),
            _post(4, "published", expires_at=_future()),
            _post(5, "published", expires_at=_past()),
        ])
        self.assertEqual(
            [r["state"] for r in rows], ["draft", "rejected", "review", "live", "expired"]
        )

    def test_rows_carry_the_card_context(self):
        rows = self._rows([_post(1)])
        self.assertEqual(rows[0]["id"], 1)
        self.assertEqual(rows[0]["headline"], "Post 1")

    def test_no_user_means_no_query(self):
        with patch(f"{LIB}.News") as news:
            self.assertEqual(PostLibrary.library_rows(None), [])
        news.where.assert_not_called()


class DuplicateTestCase(TestCase):
    def _run(self, source, user_id=7, copy=None, create=None):
        with patch(f"{LIB}.News") as news, patch(
            f"{LIB}.copy_image_and_variants", side_effect=copy or (lambda p: p and p + ".copy")
        ) as copier, patch(f"{LIB}.delete_image_and_variants") as deleter:
            news.where.return_value.first.return_value = source
            if create is not None:
                news.create.side_effect = create
            else:
                news.create.return_value = Mock(id=99)
            try:
                result = PostLibrary.duplicate(user_id, 5)
            finally:
                self.news, self.copier, self.deleter = news, copier, deleter
        return result

    def test_copies_to_fresh_files_and_makes_a_draft_without_dates(self):
        source = _post(
            5, "published", logo_path="Branding/posts/l.png", expires_at=_future(),
            published_at=_past(), rejection_reason="x", image_crop='{"x":0.1}',
            source_lines='[{"icon":"link","text":"a"}]',
        )
        self._run(source)
        fields = self.news.create.call_args.kwargs
        self.assertEqual(fields["image"], "news/5.jpg.copy")
        self.assertEqual(fields["logo_path"], "Branding/posts/l.png.copy")
        self.assertEqual(fields["status"], "draft")
        self.assertEqual(fields["author_id"], 7)
        self.assertEqual(fields["title"], "Post 5")
        self.assertEqual(fields["kicker"], "K")
        self.assertEqual(fields["image_crop"], '{"x":0.1}')
        self.assertEqual(fields["source_lines"], '[{"icon":"link","text":"a"}]')
        # masonite-orm turns None into now() for a dates column: keys must be absent.
        for key in ("expires_at", "published_at", "rejection_reason"):
            self.assertNotIn(key, fields)

    def test_another_editors_post_is_a_lookup_error_and_copies_nothing(self):
        with self.assertRaises(LookupError):
            self._run(_post(5, author_id=8))
        self.copier.assert_not_called()

    def test_missing_post_is_a_lookup_error(self):
        with self.assertRaises(LookupError):
            self._run(None)

    def test_missing_logo_file_still_duplicates_without_a_logo(self):
        def copy(path):
            return None if path.startswith("Branding") else path + ".copy"

        self._run(_post(5, logo_path="Branding/posts/gone.png"), copy=copy)
        self.assertIsNone(self.news.create.call_args.kwargs["logo_path"])

    def test_no_logo_means_none(self):
        self._run(_post(5, logo_path=None))
        self.assertIsNone(self.news.create.call_args.kwargs["logo_path"])

    def test_database_failure_removes_the_copies(self):
        source = _post(5, logo_path="Branding/posts/l.png")
        with self.assertRaises(RuntimeError):
            self._run(source, create=RuntimeError("db down"))
        removed = sorted(c.args[0] for c in self.deleter.call_args_list)
        self.assertEqual(removed, ["Branding/posts/l.png.copy", "news/5.jpg.copy"])

    def test_failed_logo_copy_removes_the_photo_copy(self):
        def copy(path):
            if path.startswith("Branding"):
                raise OSError("disk full")
            return path + ".copy"

        with self.assertRaises(OSError):
            self._run(_post(5, logo_path="Branding/posts/l.png"), copy=copy)
        self.deleter.assert_called_once_with("news/5.jpg.copy")
        self.news.create.assert_not_called()


def _request(user_id=7, **inputs):
    request = Mock()
    request.input.side_effect = lambda key, default="": inputs.get(key, default)
    request.param.side_effect = lambda key, default="": inputs.get(key, default)
    request.header.side_effect = lambda name: (
        "XMLHttpRequest" if name == "X-Requested-With" else None
    )
    request.user.return_value = Mock(id=user_id, role="editor")
    return request


class DuplicateEndpointTestCase(TestCase):
    def test_ajax_success_returns_the_new_id_and_card(self):
        response = Mock()
        with patch(f"{NEWS}.PostLibrary.duplicate", return_value=_post(99)) as dup, patch(
            f"{NEWS}.json_success"
        ) as ok:
            NewsController().duplicate(_request(id="5"), response)
        dup.assert_called_once_with(7, 5)
        payload = ok.call_args.kwargs["payload"]
        self.assertEqual(payload["id"], 99)
        self.assertEqual(payload["card"]["headline"], "Post 99")
        # Enough for the editor to open the copy without its library row.
        for key in ("crop", "expires_input", "custom_logo", "rejection_reason"):
            self.assertIn(key, payload["card"])
        self.assertEqual(payload["card"]["state"], "draft")

    def test_not_yours_is_the_same_404_as_missing(self):
        with patch(f"{NEWS}.PostLibrary.duplicate", side_effect=LookupError), patch(
            f"{NEWS}.json_errors"
        ) as err:
            NewsController().duplicate(_request(id="5"), Mock())
        self.assertEqual(err.call_args.kwargs["status"], 404)
        self.assertEqual(err.call_args.args[1], ["Article not found."])

    def test_plain_form_post_redirects_with_a_flash(self):
        request = _request(id="5")
        request.header.side_effect = lambda name: None
        response = Mock()
        with patch(f"{NEWS}.PostLibrary.duplicate", return_value=_post(99)):
            NewsController().duplicate(request, response)
        response.redirect.assert_called_once()
        response.redirect.return_value.with_success.assert_called_once()
