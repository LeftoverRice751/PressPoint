"""Forget the cache, THEN tell the kiosk -- on every write it can see.

test_news_live_broadcast.py proves the broadcast happens. This file proves it
happens in the right order, which is what decides whether "live" is live:

    KioskBroadcast.section_changed()  ->  kiosk evicts its SW copy
                                      ->  re-fetches /kiosk/embed/latest-news
                                      ->  NewsController.show reads NewsCache

If the broadcast went out before Cache.forget(), that re-fetch could land on
the still-cached index and render the *old* stories -- and the terminal would
then sit on them for up to NewsCache.TTL (300s), because the one event that
was meant to refresh it has already been spent. Nothing errors; the kiosk is
just five minutes late. So every site is pinned to forget-then-broadcast.

Also pinned: the server's SECTIONS and sw-kiosk.js's EVICT_SECTIONS name the same sections. A
section the server announces but the service worker cannot evict reloads the
frame onto the same stale-while-revalidate copy, which looks like no update.
"""

import pytest
import re
from contextlib import contextmanager
from pathlib import Path
from unittest.mock import Mock, call, patch

from tests import TestCase
from tests.unit.news_doubles import (
    _mock_actor_request,
    _mock_request,
    _mock_response,
    _where_side_effect,
)
from tests.unit.test_review_workflow import _request, _response

from app.controllers.gears.NewsController import NewsController
from app.controllers.gears.ReviewController import ReviewController
from app.services import KioskBroadcast, NewsCache

pytestmark = pytest.mark.usefixtures("actor_may_change_any_story", "preview_already_read")

_REPO_ROOT = Path(__file__).resolve().parents[2]

FORGET_THEN_BROADCAST = [call.forget(NewsCache.KEY), call.changed("latest-news")]


@contextmanager
def _ordered(controller_module):
    """Record Cache.forget and section_changed on one timeline.

    Both mocks are attached to a single parent so `parent.mock_calls` is the
    interleaved order they ran in -- two separate mocks can only say each was
    called, not which came first.
    """
    parent = Mock()
    with patch(f"{controller_module}.Cache") as cache, patch(
        f"{controller_module}.KioskBroadcast.section_changed"
    ) as changed:
        parent.attach_mock(cache.forget, "forget")
        parent.attach_mock(changed, "changed")
        yield parent


def _timeline(parent):
    return [c for c in parent.mock_calls if c[0] in ("forget", "changed")]


class NewsWriteOrderTestCase(TestCase):
    MODULE = "app.controllers.gears.NewsController"

    def _record(self, **attrs):
        record = Mock(**attrs)
        record.save = Mock()
        record.delete = Mock()
        return record

    def test_store(self):
        inputs = {"headline": "Live story", "body": "Body", "status": "published"}
        inputs["image"] = Mock(extension=lambda: ".jpg", get_content=lambda: b"x")
        storage = Mock()
        storage.disk.return_value.put_file.return_value = "news/x.jpg"
        with _ordered(self.MODULE) as parent, patch(
            f"{self.MODULE}.News.create", return_value=Mock(id=200, image=None)
        ), patch(f"{self.MODULE}.FileVerificationService.verify_buffer", return_value=True), patch(
            f"{self.MODULE}.generate_variants"
        ):
            NewsController().store(
                _mock_actor_request(inputs, role="admin"), storage, _mock_response()
            )
        self.assertEqual(_timeline(parent), FORGET_THEN_BROADCAST)

    def test_destroy(self):
        record = self._record(id=42, image=None)
        with _ordered(self.MODULE) as parent, patch(
            f"{self.MODULE}.News.where", side_effect=_where_side_effect({42: record})
        ):
            NewsController().destroy(_mock_request(params={"id": "42"}), _mock_response())
        self.assertEqual(_timeline(parent), FORGET_THEN_BROADCAST)

    def test_a_missing_story_neither_forgets_nor_broadcasts(self):
        with _ordered(self.MODULE) as parent, patch(
            f"{self.MODULE}.News.where", side_effect=_where_side_effect({})
        ):
            NewsController().destroy(_mock_request(params={"id": "404"}), _mock_response())
        self.assertEqual(_timeline(parent), [])


class ReviewOrderTestCase(TestCase):
    MODULE = "app.controllers.gears.ReviewController"

    def test_approve_story(self):
        # Approval is the moment a story becomes public: the one site where
        # being five minutes late is most visible.
        record = Mock(id=11, status="review", title="Campus story", author_id=5)
        record.save = Mock()
        with _ordered(self.MODULE) as parent, patch(f"{self.MODULE}.News.where") as where, patch(
            f"{self.MODULE}.Notifications"
        ):
            where.return_value.first.return_value = record
            ReviewController().approve(_request(role="admin", params={"id": "11"}), _response())
        self.assertEqual(_timeline(parent), FORGET_THEN_BROADCAST)


class SectionDriftTestCase(TestCase):
    def test_server_sections_match_the_service_worker_evict_map(self):
        source = (_REPO_ROOT / "resources/js/sw-kiosk.js").read_text()
        block = re.search(r"const EVICT_SECTIONS = \{(.*?)\n\};", source, re.S)
        self.assertIsNotNone(block, "EVICT_SECTIONS literal not found in sw-kiosk.js")
        sw_sections = set(re.findall(r"'([a-z-]+)'\s*:", block.group(1)))
        self.assertEqual(sw_sections, set(KioskBroadcast.SECTIONS))

    def test_server_sections_match_the_kiosk_gate(self):
        source = (_REPO_ROOT / "resources/js/kiosk-live.js").read_text()
        literal = re.search(r"var SECTIONS = \[(.*?)\];", source, re.S)
        self.assertIsNotNone(literal, "SECTIONS literal not found in kiosk-live.js")
        self.assertEqual(
            set(re.findall(r"'([a-z-]+)'", literal.group(1))), set(KioskBroadcast.SECTIONS)
        )
