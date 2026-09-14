"""Guards on the bulk layout endpoint against two editors sharing the composer.

The composer does not send "the card that moved". `currentCanvasBatch()` in
news-dashboard.js rebuilds the ENTIRE canvas from that browser's DOM on every
drag and posts all of it. So a tab that loaded an hour ago does not send a small
change — it sends its whole stale front page, and before these guards it won.
The other editor's afternoon of work vanished with no error shown to anyone.

Two independent protections are covered here:

* an optimistic-concurrency token, so a batch built against a stale canvas is
  refused instead of applied;
* a slot-capacity check, so a race cannot commit two mains or six secondaries —
  which group_news_slots would then silently truncate at capacity, leaving a
  story that reads as "placed" in the composer but renders nowhere on the kiosk.
"""

from unittest import TestCase
from unittest.mock import Mock, patch

from app.controllers.gears.NewsController import NewsController


def _mock_response():
    response = Mock()
    redirect_response = Mock()
    redirect_response.with_success.return_value = "redirected"
    redirect_response.with_errors.return_value = "redirected-with-errors"
    response.redirect.return_value = redirect_response
    response.back.return_value = redirect_response
    return response


def _mock_request(payload, role="editor", user_id=7):
    request = Mock()
    request.all.return_value = payload
    request.input.side_effect = lambda key, default="": default
    # wants_json(): only the exact-cased header a real fetch() sends.
    request.header.side_effect = lambda name: (
        "XMLHttpRequest" if name == "X-Requested-With" else None
    )
    request.user.return_value = Mock(id=user_id, role=role)
    return request


def _where_side_effect(records):
    """Models the two query shapes layout() issues: an id lookup, and the
    per-slot count the capacity guard runs."""
    def _side_effect(field, value):
        query = Mock()
        if field == "layout_type":
            query.count.return_value = sum(
                1
                for record in records.values()
                if getattr(record, "layout_type", None) == value
            )
            return query
        query.first.return_value = records.get(int(value)) if str(value).isdigit() else None
        return query

    return _side_effect


def _record(record_id, layout_type="brief", priority=0):
    record = Mock(id=record_id, layout_type=layout_type, priority=priority, updated_by_id=None)
    record.save = Mock()
    return record


def _body(response):
    """The dict handed to response.json()."""
    return response.json.call_args[0][0]


class LayoutConflictTestCase(TestCase):
    def test_stale_canvas_is_refused_and_writes_nothing(self):
        """The core protection. B's tab was built against an older database
        state; its batch must not land, and — critically — must not partially
        land."""
        controller = NewsController()
        record = _record(1)
        records = {1: record}

        request = _mock_request({
            "items": [{"id": 1, "layout_type": "lead", "priority": 1}],
            "base_stamp": "3:2026-08-23 09:00:00",
        })
        response = _mock_response()

        with patch(
            "app.controllers.gears.NewsController.News.where",
            side_effect=_where_side_effect(records),
        ), patch(
            "app.controllers.gears.NewsController.section_stamp",
            return_value="4:2026-08-23 10:15:00",
        ), patch("app.controllers.gears.NewsController.Cache") as cache_mock:
            controller.layout(request, response)

        record.save.assert_not_called()
        self.assertEqual(record.layout_type, "brief")
        # The kiosk cache must not be dropped either: nothing changed, so
        # invalidating it would just cost a rebuild.
        cache_mock.forget.assert_not_called()

        body = _body(response)
        self.assertFalse(body["ok"])
        self.assertEqual(response.json.call_args[1]["status"], 409)

    def test_conflict_is_409_not_422(self):
        """409, not 422: the payload was well-formed, it just lost a race. The
        composer branches on this status to reload the canvas rather than
        showing a validation error."""
        controller = NewsController()
        records = {1: _record(1)}

        request = _mock_request({
            "items": [{"id": 1, "layout_type": "lead", "priority": 1}],
            "base_stamp": "stale",
        })
        response = _mock_response()

        with patch(
            "app.controllers.gears.NewsController.News.where",
            side_effect=_where_side_effect(records),
        ), patch(
            "app.controllers.gears.NewsController.section_stamp", return_value="current"
        ), patch("app.controllers.gears.NewsController.Cache"):
            controller.layout(request, response)

        self.assertEqual(response.json.call_args[1]["status"], 409)

    def test_matching_stamp_applies_the_batch(self):
        """The guard must not block the ordinary case."""
        controller = NewsController()
        record = _record(1)
        records = {1: record}

        request = _mock_request({
            "items": [{"id": 1, "layout_type": "lead", "priority": 1}],
            "base_stamp": "4:2026-08-23 10:15:00",
        })
        response = _mock_response()

        with patch(
            "app.controllers.gears.NewsController.News.where",
            side_effect=_where_side_effect(records),
        ), patch(
            "app.controllers.gears.NewsController.section_stamp",
            return_value="4:2026-08-23 10:15:00",
        ), patch("app.controllers.gears.NewsController.Cache") as cache_mock:
            controller.layout(request, response)

        record.save.assert_called_once()
        self.assertEqual(record.layout_type, "lead")
        cache_mock.forget.assert_called_once()
        self.assertTrue(_body(response)["ok"])

    def test_absent_stamp_skips_the_check(self):
        """Back-compat: this endpoint must still degrade to a plain form post,
        which has no stamp to send. An unversioned write is allowed through
        rather than refused, because refusing it would break that path."""
        controller = NewsController()
        record = _record(1)
        records = {1: record}

        request = _mock_request({"items": [{"id": 1, "layout_type": "lead", "priority": 1}]})
        response = _mock_response()

        with patch(
            "app.controllers.gears.NewsController.News.where",
            side_effect=_where_side_effect(records),
        ), patch(
            "app.controllers.gears.NewsController.section_stamp", return_value="anything"
        ), patch("app.controllers.gears.NewsController.Cache"):
            controller.layout(request, response)

        record.save.assert_called_once()
        self.assertTrue(_body(response)["ok"])

    def test_success_returns_the_new_stamp_for_the_next_write(self):
        """The client has to be able to chain writes without a refetch."""
        controller = NewsController()
        records = {1: _record(1)}

        request = _mock_request({
            "items": [{"id": 1, "layout_type": "lead", "priority": 1}],
            "base_stamp": "same",
        })
        response = _mock_response()

        with patch(
            "app.controllers.gears.NewsController.News.where",
            side_effect=_where_side_effect(records),
        ), patch(
            "app.controllers.gears.NewsController.section_stamp", return_value="same"
        ), patch("app.controllers.gears.NewsController.Cache"):
            controller.layout(request, response)

        self.assertEqual(_body(response)["stamp"], "same")


class LayoutSlotCapacityTestCase(TestCase):
    def test_second_main_is_refused(self):
        """Two mains is the case group_news_slots resolves by orphaning the
        loser out of every bucket — it publishes but renders nowhere. Refuse it
        at the write instead of discovering it on the kiosk."""
        controller = NewsController()
        # Another editor already has a main; this batch promotes a second one.
        existing_main = _record(2, layout_type="lead")
        record = _record(1)
        records = {1: record, 2: existing_main}

        request = _mock_request({
            "items": [{"id": 1, "layout_type": "lead", "priority": 1}],
        })
        response = _mock_response()

        with patch(
            "app.controllers.gears.NewsController.News.where",
            side_effect=_where_side_effect(records),
        ), patch(
            "app.controllers.gears.NewsController.section_stamp", return_value="x"
        ), patch("app.controllers.gears.NewsController.Cache") as cache_mock:
            controller.layout(request, response)

        body = _body(response)
        self.assertFalse(body["ok"])
        self.assertIn("lead", body["errors"][0])
        # Rolled back, so the cache still matches the database.
        cache_mock.forget.assert_not_called()

    def test_fifth_secondary_is_refused(self):
        controller = NewsController()
        records = {
            index: _record(index, layout_type="brief") for index in range(2, 6)
        }
        record = _record(1)
        records[1] = record

        request = _mock_request({
            "items": [{"id": 1, "layout_type": "brief", "priority": 1}],
        })
        response = _mock_response()

        with patch(
            "app.controllers.gears.NewsController.News.where",
            side_effect=_where_side_effect(records),
        ), patch(
            "app.controllers.gears.NewsController.section_stamp", return_value="x"
        ), patch("app.controllers.gears.NewsController.Cache"):
            controller.layout(request, response)

        body = _body(response)
        self.assertFalse(body["ok"])
        self.assertIn("brief", body["errors"][0])

    def test_batch_within_capacity_is_allowed(self):
        controller = NewsController()
        record = _record(1)
        records = {1: record}

        request = _mock_request({
            "items": [{"id": 1, "layout_type": "notice", "priority": 1}],
        })
        response = _mock_response()

        with patch(
            "app.controllers.gears.NewsController.News.where",
            side_effect=_where_side_effect(records),
        ), patch(
            "app.controllers.gears.NewsController.section_stamp", return_value="x"
        ), patch("app.controllers.gears.NewsController.Cache"):
            controller.layout(request, response)

        self.assertTrue(_body(response)["ok"])
        record.save.assert_called_once()


class LayoutAttributionTestCase(TestCase):
    def test_layout_write_records_who_moved_the_card(self):
        """Placement is an editorial decision — who put a story in the lead
        slot is exactly what was unanswerable before."""
        controller = NewsController()
        record = _record(1)
        records = {1: record}

        request = _mock_request(
            {"items": [{"id": 1, "layout_type": "lead", "priority": 1}]},
            user_id=42,
        )
        response = _mock_response()

        with patch(
            "app.controllers.gears.NewsController.News.where",
            side_effect=_where_side_effect(records),
        ), patch(
            "app.controllers.gears.NewsController.section_stamp", return_value="x"
        ), patch("app.controllers.gears.NewsController.Cache"):
            controller.layout(request, response)

        self.assertEqual(record.updated_by_id, 42)
