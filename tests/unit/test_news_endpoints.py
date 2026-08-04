import os
from datetime import datetime, timedelta
from unittest.mock import Mock, patch

from app.controllers.NewsController import NewsController
from app.services.StorageRouter import public_base
from tests import TestCase


def _mock_request(inputs=None, params=None):
    inputs = inputs or {}
    params = params or {}
    request = Mock()
    request.input.side_effect = lambda key, default="": inputs.get(key, default)
    request.param.side_effect = lambda key, default="": params.get(key, default)
    request.header.return_value = None
    request.all.return_value = inputs.get("__all__", {})
    return request


def _mock_response():
    response = Mock()
    redirect_response = Mock()
    redirect_response.with_success.return_value = "redirected"
    redirect_response.with_errors.return_value = "redirected-with-errors"
    response.redirect.return_value = redirect_response
    response.back.return_value = redirect_response
    return response


def _where_side_effect(records):
    def _side_effect(field, value):
        query = Mock()
        # ids may arrive as int or str depending on caller
        candidates = [value]
        if str(value).isdigit():
            candidates.append(int(value))
        candidates.append(str(value))
        record = None
        for candidate in candidates:
            if candidate in records:
                record = records[candidate]
                break
        query.first.return_value = record
        return query

    return _side_effect


class NewsLayoutEndpointTestCase(TestCase):
    def test_bulk_layout_save_updates_only_slot_and_order(self):
        controller = NewsController()

        record = Mock(
            id=1,
            title="Keep me",
            description="<p>Keep me</p>",
            status="approved",
            published_at="2026-01-01T00:00:00",
            layout_type="secondary",
            priority=5,
        )
        record.save = Mock()

        items = [{"id": 1, "layout_type": "main", "priority": 0}]
        records = {1: record}
        request = _mock_request(inputs={"__all__": {"items": items}})
        request.all.return_value = {"items": items}
        response = _mock_response()

        with patch(
            "app.controllers.NewsController.News.where", side_effect=_where_side_effect(records)
        ), patch("app.controllers.NewsController.Cache") as cache_mock:
            controller.layout(request, response)

        self.assertEqual(record.layout_type, "main")
        self.assertEqual(record.priority, 0)
        record.save.assert_called_once()
        # Untouched fields.
        self.assertEqual(record.title, "Keep me")
        self.assertEqual(record.description, "<p>Keep me</p>")
        self.assertEqual(record.status, "approved")
        self.assertEqual(record.published_at, "2026-01-01T00:00:00")
        cache_mock.forget.assert_called_once()

    def test_bulk_layout_save_writes_many_rows_in_one_request(self):
        controller = NewsController()

        record_a = Mock(id=1, layout_type="secondary", priority=5, status="approved")
        record_a.save = Mock()
        record_b = Mock(id=2, layout_type="widget", priority=9, status="approved")
        record_b.save = Mock()
        records = {1: record_a, 2: record_b}

        items = [
            {"id": 1, "layout_type": "main", "priority": 0},
            {"id": 2, "layout_type": "secondary", "priority": 1},
        ]
        request = _mock_request()
        request.all.return_value = {"items": items}
        response = _mock_response()

        with patch(
            "app.controllers.NewsController.News.where", side_effect=_where_side_effect(records)
        ), patch("app.controllers.NewsController.Cache"):
            controller.layout(request, response)

        self.assertEqual(record_a.layout_type, "main")
        self.assertEqual(record_a.priority, 0)
        self.assertEqual(record_b.layout_type, "secondary")
        self.assertEqual(record_b.priority, 1)
        record_a.save.assert_called_once()
        record_b.save.assert_called_once()

    def test_bulk_layout_save_rejects_missing_items(self):
        controller = NewsController()
        request = _mock_request()
        request.all.return_value = {}
        response = _mock_response()

        with patch("app.controllers.NewsController.Cache") as cache_mock:
            controller.layout(request, response)

        cache_mock.forget.assert_not_called()
        response.back.assert_called_once()


class NewsBodyEndpointTestCase(TestCase):
    def test_body_save_sanitizes_script_tag(self):
        controller = NewsController()

        record = Mock(id=7, description="old body")
        record.save = Mock()
        records = {7: record}

        request = _mock_request(
            inputs={"description": "<p>Safe</p><script>alert(1)</script>"},
            params={"id": "7"},
        )
        response = _mock_response()

        with patch(
            "app.controllers.NewsController.News.where", side_effect=_where_side_effect(records)
        ), patch("app.controllers.NewsController.Cache") as cache_mock:
            controller.body(request, response)

        self.assertNotIn("<script>", record.description)
        self.assertIn("<p>Safe</p>", record.description)
        record.save.assert_called_once()
        cache_mock.forget.assert_called_once()

    def test_body_save_requires_article(self):
        controller = NewsController()
        request = _mock_request(inputs={"description": "<p>Hi</p>"}, params={"id": "404"})
        response = _mock_response()

        with patch(
            "app.controllers.NewsController.News.where", side_effect=_where_side_effect({})
        ):
            controller.body(request, response)

        response.back.assert_called_once()


class NewsUnassignEndpointTestCase(TestCase):
    def test_unassign_sets_value_without_deleting_or_changing_status(self):
        controller = NewsController()

        record = Mock(id=3, layout_type="secondary", status="approved")
        record.save = Mock()
        record.delete = Mock()
        records = {3: record}

        request = _mock_request(params={"id": "3"})
        response = _mock_response()

        with patch(
            "app.controllers.NewsController.News.where", side_effect=_where_side_effect(records)
        ), patch("app.controllers.NewsController.Cache") as cache_mock:
            controller.unassign(request, response)

        self.assertEqual(record.layout_type, "unassigned")
        self.assertEqual(record.status, "approved")
        record.save.assert_called_once()
        record.delete.assert_not_called()
        cache_mock.forget.assert_called_once()


class NewsDestroyDerivativeCleanupTestCase(TestCase):
    def test_destroy_removes_derivative_files(self):
        controller = NewsController()

        rel_original = "news/__test_derivative_cleanup__.jpg"
        rel_large = "news/__test_derivative_cleanup__.large.webp"
        rel_thumb = "news/__test_derivative_cleanup__.thumb.webp"

        base = public_base()
        original_path = os.path.join(base, rel_original)
        large_path = os.path.join(base, rel_large)
        thumb_path = os.path.join(base, rel_thumb)

        os.makedirs(os.path.dirname(original_path), exist_ok=True)
        for path in (original_path, large_path, thumb_path):
            with open(path, "wb") as handle:
                handle.write(b"fake-bytes")

        record = Mock(id=42, image=rel_original)
        record.delete = Mock()
        records = {42: record}

        request = _mock_request(params={"id": "42"})
        response = _mock_response()

        try:
            with patch(
                "app.controllers.NewsController.News.where",
                side_effect=_where_side_effect(records),
            ), patch("app.controllers.NewsController.Cache"):
                controller.destroy(request, response)

            self.assertFalse(os.path.isfile(original_path))
            self.assertFalse(os.path.isfile(large_path))
            self.assertFalse(os.path.isfile(thumb_path))
        finally:
            for path in (original_path, large_path, thumb_path):
                if os.path.isfile(path):
                    os.remove(path)


class NewsStoreSchedulingTestCase(TestCase):
    def _store_inputs(self, published_at, status="published"):
        return {
            "title": "Future Story",
            "description": "<p>Body</p>",
            "source": "",
            "location": "",
            "dek": "",
            "image_caption": "",
            "image_credit": "",
            "layout_type": "secondary",
            "status": status,
            "published_at": published_at,
            "priority": "3",
            "image": None,
            "article_id": "",
        }

    def test_future_published_at_persists_scheduled_status(self):
        controller = NewsController()
        future = (datetime.now() + timedelta(days=2)).isoformat()

        inputs = self._store_inputs(future)
        request = Mock()
        request.input.side_effect = lambda key: inputs.get(key)
        request.header.return_value = None

        storage = Mock()
        response = _mock_response()
        created_story = Mock(id=200, image=None)

        with patch(
            "app.controllers.NewsController.News.create", return_value=created_story
        ) as create_mock, patch("app.controllers.NewsController.NewNews"), patch(
            "app.controllers.NewsController.Cache"
        ):
            controller.store(request, storage, response)

        self.assertEqual(create_mock.call_args.kwargs["status"], "scheduled")

    def test_past_published_at_keeps_default_status(self):
        controller = NewsController()
        past = (datetime.now() - timedelta(days=2)).isoformat()

        inputs = self._store_inputs(past)
        request = Mock()
        request.input.side_effect = lambda key: inputs.get(key)
        request.header.return_value = None

        storage = Mock()
        response = _mock_response()
        created_story = Mock(id=201, image=None)

        with patch(
            "app.controllers.NewsController.News.create", return_value=created_story
        ) as create_mock, patch("app.controllers.NewsController.NewNews"), patch(
            "app.controllers.NewsController.Cache"
        ):
            controller.store(request, storage, response)

        self.assertEqual(create_mock.call_args.kwargs["status"], "published")

    def test_explicit_draft_with_future_published_at_is_not_overridden(self):
        controller = NewsController()
        future = (datetime.now() + timedelta(days=2)).isoformat()

        inputs = self._store_inputs(future, status="draft")
        request = Mock()
        request.input.side_effect = lambda key: inputs.get(key)
        request.header.return_value = None

        storage = Mock()
        response = _mock_response()
        created_story = Mock(id=202, image=None)

        with patch(
            "app.controllers.NewsController.News.create", return_value=created_story
        ) as create_mock, patch("app.controllers.NewsController.NewNews"), patch(
            "app.controllers.NewsController.Cache"
        ):
            controller.store(request, storage, response)

        self.assertEqual(create_mock.call_args.kwargs["status"], "draft")


class NewsEndpointsAuthMiddlewareTestCase(TestCase):
    def test_new_routes_require_auth_middleware(self):
        router = self.application.make("router")
        for name in ("news.layout", "news.body", "news.unassign"):
            route = router.find_by_name(name)
            self.assertIsNotNone(route, f"route {name} is not registered")
            self.assertIn("auth", route.list_middleware)
