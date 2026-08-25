import os
from datetime import datetime, timedelta
from unittest.mock import Mock, patch

from app.controllers.gears.NewsController import (
    NEWSLETTER_FONTS,
    NewsController,
    _sanitize_news_html,
    normalize_headline_font,
)
from app.services.StorageRouter import public_base
from tests import TestCase


def _mock_request(inputs=None, params=None, ajax=False):
    inputs = inputs or {}
    params = params or {}
    request = Mock()
    request.input.side_effect = lambda key, default="": inputs.get(key, default)
    request.param.side_effect = lambda key, default="": params.get(key, default)
    if ajax:
        # Mirrors wants_json()'s header lookup: only the exact-cased
        # X-Requested-With: XMLHttpRequest header is honored here, matching
        # what a real fetch() client sends.
        request.header.side_effect = lambda name: (
            "XMLHttpRequest" if name == "X-Requested-With" else None
        )
    else:
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
    """Fake for News.where covering the two query shapes layout() issues.

    `where("id", n).first()` looks a record up. `where("layout_type", slot).count()`
    is the slot-capacity guard, and it counts the records this fake holds so a
    test that sets up two mains actually trips the cap rather than comparing a
    bare Mock against an int.
    """
    def _side_effect(field, value):
        query = Mock()

        if field == "layout_type":
            query.count.return_value = sum(
                1
                for record in records.values()
                if getattr(record, "layout_type", None) == value
            )
            return query

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
            "app.controllers.gears.NewsController.News.where", side_effect=_where_side_effect(records)
        ), patch("app.controllers.gears.NewsController.Cache") as cache_mock:
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
            "app.controllers.gears.NewsController.News.where", side_effect=_where_side_effect(records)
        ), patch("app.controllers.gears.NewsController.Cache"):
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

        with patch("app.controllers.gears.NewsController.Cache") as cache_mock:
            controller.layout(request, response)

        cache_mock.forget.assert_not_called()
        response.back.assert_called_once()

    def test_layout_mid_batch_failure_rolls_back_and_skips_cache_invalidation(self):
        """I1: if item 4 of 7 raises, items 1-3 must not be left committed
        with a stale (un-invalidated) cache. The endpoint wraps the whole
        batch in `with DB.transaction():`, so a mid-loop exception rolls
        every row in this request back — meaning the cache doesn't need
        invalidating on the error path, because nothing in the database
        actually changed. This drives a REAL `DB.transaction()` (against
        the sqlite test database from .env.testing, never MySQL) so the
        control flow is proven, not just mocked away."""
        controller = NewsController()

        record_ok = Mock(id=1, layout_type="secondary", priority=5)
        record_ok.save = Mock()
        record_bad = Mock(id=2, layout_type="widget", priority=9)
        record_bad.save = Mock(side_effect=RuntimeError("simulated write failure"))
        records = {1: record_ok, 2: record_bad}

        items = [
            {"id": 1, "layout_type": "main", "priority": 0},
            {"id": 2, "layout_type": "secondary", "priority": 1},
        ]
        request = _mock_request(ajax=True)
        request.all.return_value = {"items": items}
        response = _mock_response()

        with patch(
            "app.controllers.gears.NewsController.News.where", side_effect=_where_side_effect(records)
        ), patch("app.controllers.gears.NewsController.Cache") as cache_mock:
            controller.layout(request, response)

        # The batch failed -> the write path's error branch ran, not the
        # success branch that calls Cache.forget().
        cache_mock.forget.assert_not_called()
        response.json.assert_called_once()
        body, kwargs = response.json.call_args
        self.assertFalse(body[0]["ok"])
        self.assertEqual(kwargs["status"], 422)

    def test_layout_uses_request_all_not_input_for_single_item_payload(self):
        """I3: pins the reason `layout()` reads `request.all().get("items")`
        instead of `request.input("items")`. Masonite's real
        InputBag.get() unwraps a length-1 list to its bare element before
        returning it — so a single dragged card would hand
        `request.input("items")` back a dict, not a [dict]. This mock
        reproduces exactly that unwrap on `.input()` while leaving `.all()`
        as the raw parsed value (mirroring InputBag.all_as_values(), which
        does no such unwrapping). If `layout()` is ever changed back to
        `request.input("items")`, this test fails: `isinstance(items, list)`
        goes False on the unwrapped dict, the row is never saved, and the
        assertions below break.
        """
        controller = NewsController()

        record = Mock(id=1, layout_type="secondary", priority=5)
        record.save = Mock()
        records = {1: record}

        items = [{"id": 1, "layout_type": "main", "priority": 0}]

        request = Mock()
        request.all.return_value = {"items": items}
        request.input.side_effect = lambda key, default="": (
            items[0] if key == "items" else default
        )
        request.header.return_value = None
        request.param.side_effect = lambda key, default="": default
        response = _mock_response()

        with patch(
            "app.controllers.gears.NewsController.News.where", side_effect=_where_side_effect(records)
        ), patch("app.controllers.gears.NewsController.Cache") as cache_mock:
            controller.layout(request, response)

        record.save.assert_called_once()
        self.assertEqual(record.layout_type, "main")
        self.assertEqual(record.priority, 0)
        cache_mock.forget.assert_called_once()

    def test_layout_json_success_payload_shape(self):
        """I2: exercises the actual AJAX branch Task 6 codes against —
        every other layout test sets ajax=False and only reaches the
        redirect branch."""
        controller = NewsController()

        record = Mock(id=1, layout_type="secondary", priority=5)
        record.save = Mock()
        records = {1: record}

        items = [{"id": 1, "layout_type": "main", "priority": 0}]
        request = _mock_request(ajax=True)
        request.all.return_value = {"items": items}
        response = _mock_response()

        with patch(
            "app.controllers.gears.NewsController.News.where", side_effect=_where_side_effect(records)
        ), patch("app.controllers.gears.NewsController.Cache"):
            controller.layout(request, response)

        response.json.assert_called_once()
        body, kwargs = response.json.call_args
        payload = body[0]
        self.assertTrue(payload["ok"])
        self.assertEqual(payload["updated"], [1])
        self.assertEqual(payload["messages"], ["Layout saved."])
        self.assertEqual(kwargs["status"], 200)

    def test_layout_json_validation_error_shape(self):
        controller = NewsController()

        items = [{"id": 1, "layout_type": "not-a-real-slot", "priority": 0}]
        request = _mock_request(ajax=True)
        request.all.return_value = {"items": items}
        response = _mock_response()

        with patch("app.controllers.gears.NewsController.Cache") as cache_mock:
            controller.layout(request, response)

        cache_mock.forget.assert_not_called()
        response.json.assert_called_once()
        body, kwargs = response.json.call_args
        payload = body[0]
        self.assertFalse(payload["ok"])
        self.assertEqual(payload["errors"], ["Invalid layout type."])
        self.assertEqual(kwargs["status"], 422)


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
            "app.controllers.gears.NewsController.News.where", side_effect=_where_side_effect(records)
        ), patch("app.controllers.gears.NewsController.Cache") as cache_mock:
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
            "app.controllers.gears.NewsController.News.where", side_effect=_where_side_effect({})
        ):
            controller.body(request, response)

        response.back.assert_called_once()

    def test_body_json_success_payload_shape(self):
        controller = NewsController()

        record = Mock(id=7, description="old body")
        record.save = Mock()
        records = {7: record}

        request = _mock_request(
            inputs={"description": "<p>Safe</p>"}, params={"id": "7"}, ajax=True
        )
        response = _mock_response()

        with patch(
            "app.controllers.gears.NewsController.News.where", side_effect=_where_side_effect(records)
        ), patch("app.controllers.gears.NewsController.Cache"):
            controller.body(request, response)

        response.json.assert_called_once()
        body, kwargs = response.json.call_args
        payload = body[0]
        self.assertTrue(payload["ok"])
        self.assertEqual(payload["id"], 7)
        self.assertEqual(payload["description"], "<p>Safe</p>")
        self.assertEqual(payload["messages"], ["Body saved."])
        self.assertEqual(kwargs["status"], 200)

    def test_body_json_not_found_returns_404(self):
        controller = NewsController()
        request = _mock_request(
            inputs={"description": "<p>Hi</p>"}, params={"id": "404"}, ajax=True
        )
        response = _mock_response()

        with patch(
            "app.controllers.gears.NewsController.News.where", side_effect=_where_side_effect({})
        ):
            controller.body(request, response)

        response.json.assert_called_once()
        body, kwargs = response.json.call_args
        payload = body[0]
        self.assertFalse(payload["ok"])
        self.assertEqual(payload["errors"], ["Article not found."])
        self.assertEqual(kwargs["status"], 404)


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
            "app.controllers.gears.NewsController.News.where", side_effect=_where_side_effect(records)
        ), patch("app.controllers.gears.NewsController.Cache") as cache_mock:
            controller.unassign(request, response)

        self.assertEqual(record.layout_type, "unassigned")
        self.assertEqual(record.status, "approved")
        record.save.assert_called_once()
        record.delete.assert_not_called()
        cache_mock.forget.assert_called_once()

    def test_unassign_json_success_payload_shape(self):
        controller = NewsController()

        record = Mock(id=3, layout_type="secondary", status="approved")
        record.save = Mock()
        record.delete = Mock()
        records = {3: record}

        request = _mock_request(params={"id": "3"}, ajax=True)
        response = _mock_response()

        with patch(
            "app.controllers.gears.NewsController.News.where", side_effect=_where_side_effect(records)
        ), patch("app.controllers.gears.NewsController.Cache"):
            controller.unassign(request, response)

        response.json.assert_called_once()
        body, kwargs = response.json.call_args
        payload = body[0]
        self.assertTrue(payload["ok"])
        self.assertEqual(payload["id"], 3)
        self.assertEqual(payload["layout_type"], "unassigned")
        self.assertEqual(payload["messages"], ["Story unassigned."])
        self.assertEqual(kwargs["status"], 200)

    def test_unassign_json_not_found_returns_404(self):
        controller = NewsController()
        request = _mock_request(params={"id": "404"}, ajax=True)
        response = _mock_response()

        with patch(
            "app.controllers.gears.NewsController.News.where", side_effect=_where_side_effect({})
        ):
            controller.unassign(request, response)

        response.json.assert_called_once()
        body, kwargs = response.json.call_args
        payload = body[0]
        self.assertFalse(payload["ok"])
        self.assertEqual(payload["errors"], ["Article not found."])
        self.assertEqual(kwargs["status"], 404)


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
                "app.controllers.gears.NewsController.News.where",
                side_effect=_where_side_effect(records),
            ), patch("app.controllers.gears.NewsController.Cache"):
                controller.destroy(request, response)

            self.assertFalse(os.path.isfile(original_path))
            self.assertFalse(os.path.isfile(large_path))
            self.assertFalse(os.path.isfile(thumb_path))
        finally:
            for path in (original_path, large_path, thumb_path):
                if os.path.isfile(path):
                    os.remove(path)


def _mock_actor_request(inputs, role=None, user_id=7):
    """A store() request signed in as `role`.

    Scheduling only applies to a publish-intent status, and only an admin can
    write one — an editor's "published" is downgraded to "review" before
    _apply_scheduling ever sees it. So these tests have to say who is asking;
    a bare Mock() request is nobody, and nobody cannot publish.
    """
    request = Mock()
    request.input.side_effect = lambda key: inputs.get(key)
    request.header.return_value = None
    request.user.return_value = Mock(id=user_id, role=role) if role else None
    return request


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
        request = _mock_actor_request(inputs, role="admin")

        storage = Mock()
        response = _mock_response()
        created_story = Mock(id=200, image=None)

        with patch(
            "app.controllers.gears.NewsController.News.create", return_value=created_story
        ) as create_mock, patch("app.controllers.gears.NewsController.NewNews"), patch(
            "app.controllers.gears.NewsController.Cache"
        ):
            controller.store(request, storage, response)

        self.assertEqual(create_mock.call_args.kwargs["status"], "scheduled")

    # Renamed from test_past_published_at_keeps_default_status: the default is
    # now "draft", so "the default status" no longer means "published". What
    # this actually asserts is that a past date does not trip the scheduling
    # upgrade — the status an admin asked for survives.
    def test_past_published_at_stays_published(self):
        controller = NewsController()
        past = (datetime.now() - timedelta(days=2)).isoformat()

        inputs = self._store_inputs(past)
        request = _mock_actor_request(inputs, role="admin")

        storage = Mock()
        response = _mock_response()
        created_story = Mock(id=201, image=None)

        with patch(
            "app.controllers.gears.NewsController.News.create", return_value=created_story
        ) as create_mock, patch("app.controllers.gears.NewsController.NewNews"), patch(
            "app.controllers.gears.NewsController.Cache"
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
            "app.controllers.gears.NewsController.News.create", return_value=created_story
        ) as create_mock, patch("app.controllers.gears.NewsController.NewNews"), patch(
            "app.controllers.gears.NewsController.Cache"
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


class FeaturedImageRemovalTestCase(TestCase):
    """The composer's Featured Image box offers a "Remove" action. store()
    treats "no uploaded file" as "keep whatever image is already there"
    (otherwise every text-only edit would wipe the photo), so clearing one
    needs an explicit flag rather than an absent file."""

    def _existing_record(self):
        record = Mock(
            id=1,
            title="Existing",
            description="<p>Existing</p>",
            image="news/photo.jpg",
            status="published",
            layout_type="main",
            priority=0,
        )
        record.save = Mock()
        return record

    def _store_with(self, record, inputs):
        controller = NewsController()
        base = {
            "title": "Existing",
            "description": "<p>Existing</p>",
            "article_id": "1",
            "layout_type": "main",
            "status": "published",
        }
        base.update(inputs)
        request = _mock_request(inputs=base, ajax=True)
        response = _mock_response()
        storage = Mock()

        with patch(
            "app.controllers.gears.NewsController.News.where",
            side_effect=_where_side_effect({1: record}),
        ), patch("app.controllers.gears.NewsController.Cache"), patch(
            "app.controllers.gears.NewsController.NewNews"
        ), patch(
            "app.controllers.gears.NewsController.json_success", return_value="ok"
        ):
            controller.store(request, storage, response)
        return record

    def test_remove_image_flag_clears_the_stored_image(self):
        record = self._store_with(self._existing_record(), {"remove_image": "1"})

        self.assertIsNone(record.image)

    def test_image_is_kept_when_the_flag_is_absent(self):
        # The guard that makes a plain text edit safe — pin it so adding
        # removal support can't turn every save into an image wipe.
        record = self._store_with(self._existing_record(), {})

        self.assertEqual(record.image, "news/photo.jpg")


class NewsHtmlSanitizerTestCase(TestCase):
    """The body is the one field rendered with `| safe` on the kiosk, so this
    allowlist is the security boundary between an editor's keyboard and a
    public screen. These pin both halves: what a font run is allowed to keep,
    and what must never survive."""

    def test_known_font_class_survives(self):
        html = '<p><span class="ql-font-playfair">Hi</span></p>'

        self.assertEqual(_sanitize_news_html(html), html)

    def test_stacked_font_and_size_classes_survive(self):
        # Quill stacks formats onto one span; bleach hands the filter the whole
        # attribute value, so the multi-name case needs its own guard.
        html = '<p><span class="ql-font-bebas ql-size-huge">Hi</span></p>'

        self.assertEqual(_sanitize_news_html(html), html)

    def test_align_and_indent_survive(self):
        # These regressed silently for the life of the composer: Quill offered
        # them, but no element allowed `class` so every save destroyed them.
        self.assertIn('class="ql-align-center"', _sanitize_news_html('<p class="ql-align-center">M</p>'))
        self.assertIn('class="ql-indent-1"', _sanitize_news_html('<ul><li class="ql-indent-1">x</li></ul>'))

    def test_unknown_font_class_is_stripped(self):
        # The whole point of an exact-membership set rather than a
        # `ql-font-\w+` regex — an invented slug must not reach the page.
        out = _sanitize_news_html('<p><span class="ql-font-evil">Hi</span></p>')

        self.assertNotIn("ql-font-evil", out)
        self.assertIn("Hi", out)

    def test_one_unknown_name_drops_the_whole_class_attribute(self):
        out = _sanitize_news_html('<p><span class="ql-font-lora sneaky">Hi</span></p>')

        self.assertNotIn("sneaky", out)
        self.assertNotIn("ql-font-lora", out)

    def test_arbitrary_class_is_stripped(self):
        self.assertNotIn("made-up", _sanitize_news_html('<p class="made-up">Hi</p>'))

    def test_inline_style_is_still_stripped(self):
        # Fonts are carried by class precisely so `style` never has to be
        # allowed; if this ever passes, arbitrary CSS is reaching the kiosk.
        out = _sanitize_news_html('<p style="position:fixed;top:0;z-index:9999">Hi</p>')

        self.assertNotIn("style", out)

    def test_script_and_event_handlers_are_stripped(self):
        self.assertNotIn("<script>", _sanitize_news_html("<p>ok</p><script>alert(1)</script>"))
        self.assertNotIn("onerror", _sanitize_news_html('<p onerror="alert(1)">Hi</p>'))
        self.assertNotIn("<img", _sanitize_news_html('<img src=x onerror=alert(1)>'))

    def test_javascript_href_is_rejected(self):
        self.assertNotIn("javascript:", _sanitize_news_html('<a href="javascript:alert(1)">x</a>'))

    def test_target_blank_is_stripped(self):
        # target="_blank" without rel="noopener" hands the opened page a
        # window.opener handle back to the kiosk. `target` is simply not
        # allowed rather than paired with a rel we would have to enforce.
        out = _sanitize_news_html('<a href="https://x.test" target="_blank">x</a>')

        self.assertNotIn("target", out)
        self.assertIn('href="https://x.test"', out)


class NormalizeHeadlineFontTestCase(TestCase):
    def test_known_slug_passes_through(self):
        self.assertEqual(normalize_headline_font("playfair"), "playfair")

    def test_case_and_whitespace_are_normalized(self):
        self.assertEqual(normalize_headline_font("  Playfair  "), "playfair")

    def test_unknown_slug_falls_back_to_the_brand_face(self):
        # A stale form or a hand-crafted POST must not put an unknown slug into
        # a class attribute on the kiosk.
        self.assertIsNone(normalize_headline_font("../../etc/passwd"))
        self.assertIsNone(normalize_headline_font("gotham"))

    def test_blank_is_the_brand_face(self):
        self.assertIsNone(normalize_headline_font(""))
        self.assertIsNone(normalize_headline_font(None))

    def test_every_offered_font_is_accepted(self):
        # Guards the CSS/JS/server three-way contract from one side: every slug
        # the server advertises must also validate.
        for slug in NEWSLETTER_FONTS:
            self.assertEqual(normalize_headline_font(slug), slug)
