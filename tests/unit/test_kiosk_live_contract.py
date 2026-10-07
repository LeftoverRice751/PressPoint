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

Also pinned: autosave never broadcasts (a draft is not public, and the
composer autosaves continuously -- each one would yank the terminal), and the
server's SECTIONS and sw-kiosk.js's EVICT_SECTIONS name the same sections. A
section the server announces but the service worker cannot evict reloads the
frame onto the same stale-while-revalidate copy, which looks like no update.
"""

import re
from contextlib import contextmanager
from pathlib import Path
from unittest.mock import Mock, call, patch

from tests import TestCase
from tests.unit.test_news_endpoints import (
    _mock_actor_request,
    _mock_request,
    _mock_response,
    _where_side_effect,
)
from tests.unit.test_review_workflow import _request, _response

from app.controllers.gears.NewsController import NewsController
from app.controllers.gears.ReviewController import ReviewController
from app.services import KioskBroadcast, NewsCache

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
        inputs = {
            "title": "Live story",
            "description": "<p>Body</p>",
            "layout_type": "main",
            "status": "published",
            "priority": "1",
            "category_id": "1",
        }
        with _ordered(self.MODULE) as parent, patch(
            f"{self.MODULE}.NewsCategories.find_live", return_value=Mock(id=1, name="Campus")
        ), patch(f"{self.MODULE}.News.create", return_value=Mock(id=200, image=None)), patch(
            f"{self.MODULE}.NewNews"
        ):
            NewsController().store(_mock_actor_request(inputs, role="admin"), Mock(), _mock_response())
        self.assertEqual(_timeline(parent), FORGET_THEN_BROADCAST)

    def test_layout(self):
        record = self._record(id=1, layout_type="brief", priority=5, status="published")
        items = [{"id": 1, "layout_type": "lead", "priority": 0}]
        request = _mock_request(inputs={"__all__": {"items": items}})
        request.all.return_value = {"items": items}
        with _ordered(self.MODULE) as parent, patch(
            f"{self.MODULE}.News.where", side_effect=_where_side_effect({1: record})
        ):
            NewsController().layout(request, _mock_response())
        self.assertEqual(_timeline(parent), FORGET_THEN_BROADCAST)

    def test_body(self):
        record = self._record(id=7, description="old", status="draft")
        request = _mock_request(inputs={"description": "<p>New</p>"}, params={"id": "7"})
        with _ordered(self.MODULE) as parent, patch(
            f"{self.MODULE}.News.where", side_effect=_where_side_effect({7: record})
        ):
            NewsController().body(request, _mock_response())
        self.assertEqual(_timeline(parent), FORGET_THEN_BROADCAST)

    def test_unassign(self):
        record = self._record(id=3, layout_type="secondary", status="published")
        with _ordered(self.MODULE) as parent, patch(
            f"{self.MODULE}.News.where", side_effect=_where_side_effect({3: record})
        ):
            NewsController().unassign(_mock_request(params={"id": "3"}), _mock_response())
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

    def test_autosave_never_reaches_the_kiosk(self):
        record = self._record(id=9, status="draft", title="", description="")
        request = _mock_request(inputs={"title": "WIP", "description": "<p>half</p>"}, params={"id": "9"})
        with _ordered(self.MODULE) as parent, patch(
            f"{self.MODULE}.News.where", side_effect=_where_side_effect({9: record})
        ):
            NewsController().autosave(request, _mock_response())
        record.save.assert_called_once()  # it did save -- it just told nobody
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

    def test_approve_issue(self):
        rows = [Mock(id=i, status="review", author_id=5, issue_id=5) for i in (1, 2)]
        for row in rows:
            row.save = Mock()
        issue = Mock(id=5)
        issue.save = Mock()
        with _ordered(self.MODULE) as parent, patch(
            f"{self.MODULE}.review_stories_of", return_value=rows
        ), patch("app.models.Issue.Issue.where") as where, patch(f"{self.MODULE}.Notifications"):
            where.return_value.first.return_value = issue
            ReviewController().approve_issue(_request(role="admin", params={"id": "5"}), _response())
        # Once for the whole issue, not once per block.
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
