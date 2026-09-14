# Kiosk Live Updates Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** When an editor changes news, About LSPU, or archives, the campus kiosk shows the change without anyone touching the terminal.

**Architecture:** Every editor write that already invalidates a server cache also emits a tiny `{section, stamp}` signal over Pusher on a public `kiosk-content` channel. The kiosk shell (`welcome-screen.js`, which already holds a Pusher socket for the flash ticker) receives it, immediately tells `sw-kiosk.js` to evict that section's stale-while-revalidate entries, then reloads the affected frame — at once if the terminal is unattended, otherwise the next time the attract screen appears. The event carries no content; the kiosk always re-fetches.

**Tech Stack:** Masonite 5 `Broadcast` facade (pusher driver, hosted pusher.com for now), `pusher-js` 8.2.0 in the browser, service worker `postMessage`, `node --test` for JS, `pytest` for Python.

**Spec:** `docs/superpowers/specs/2026-09-10-kiosk-live-updates-design.md`

## Deviations from the spec (agreed with the user on 2026-09-14)

1. **Transport is hosted pusher.com for now, not Soketi.** `.env` already carries working `PUSHER_KEY/APP_ID/SECRET/CLUSTER` and empty `PUSHER_HOST/PORT`. The browser client is written to honour `PUSHER_HOST`/`PUSHER_PORT` so switching to Soketi later is a `.env` + nginx change, no code. No systemd unit, no nginx `/ws` block, no CSP change in this plan.
2. **One socket per terminal.** The new channel is subscribed on the Pusher connection `welcome-screen.js` already opens for `flash-updates-channel`, instead of a second connection in a standalone module. The *decision logic* still lives in its own file (`resources/js/kiosk-live.js`) because that is what makes it testable without a DOM.
3. **The stamp is a server millisecond timestamp, not `count:max(updated_at)`.** `max(updated_at)` has one-second resolution and does not move on a delete, so two events in the same second would be dropped as "not newer" and a delete could be ignored entirely. The client dedupes on `stamp <= last applied` exactly as the spec says; the *collapse* of a multi-step save burst is done by a 750 ms per-section debounce on the client instead.
4. **Archives broadcast at the end of `store()`, on the request thread.** `store()` already renders the cover and the first `EAGER_PAGE_LIMIT` pages synchronously before responding; only the tail of the issue is swept in the background, and `ArchivesController.page` renders on demand. So the issue *is* readable when `store()` returns and the spec's "after eager pre-warm" condition is met right there. No thread hook.

## Global Constraints

- Broadcasts are best-effort: never raise, never block a save. Every existing endpoint that reports `broadcast: true/false` keeps doing so.
- The `kiosk-content` channel is public and the payload is exactly `{"section": <id>, "stamp": <int ms>}`. No editorial content ever rides on it.
- Section ids are the `KioskSections` ids: `latest-news`, `about-lspu`, `gears-archive`. Nothing else is broadcast in this plan.
- `sw-kiosk.js` `CACHE_NAME` stays `pp-kiosk-v3`. Do not bump it.
- No error UI on the kiosk for any failure in this feature.
- Python: flake8 max-line-length 99, black line-length 99. Run `make lint` before each commit.
- JS: plain browser JS, no framework. New `resources/js` files must be added to `webpack.mix.js`. Rebuild with `export PATH="$HOME/.nvm/versions/node/v18.20.8/bin:$PATH" && npm run prod`.
- **`.env` holds real Pusher credentials, so a controller test that reaches the real `Broadcast.channel` makes an HTTP call to pusher.com.** Task 1 adds an autouse fixture that stubs delivery for the whole unit suite; do not remove it.
- Work on branch `testing_phase` (already checked out, not main).

---

## File map

| File | Responsibility |
|---|---|
| `app/services/KioskBroadcast.py` (new) | `pusher_configured()`, `section_changed(section_id) -> bool`, `_deliver()`; the single owner of the channel/event names. |
| `app/events/KioskSectionChanged.py` (new) | Masonite `Event` mirroring `LockKioskEvent`, so the wire name lives beside the other events. |
| `tests/unit/conftest.py` (new) | Autouse fixture stubbing `KioskBroadcast._deliver` so no unit test hits pusher.com. |
| `tests/unit/test_kiosk_broadcast_service.py` (new) | Service unit tests. |
| `app/controllers/gears/{Kiosk,Video,Editorial,News}Controller.py` | `_pusher_configured` becomes an import alias of the service's predicate. |
| `app/controllers/gears/NewsController.py`, `ReviewController.py`, `app/services/NewsCategories.py` | `section_changed("latest-news")` beside every `Cache.forget(_NEWS_CACHE_KEY)` / `NewsCache.forget()`. |
| `app/controllers/kiosk/AboutController.py` | `section_changed("about-lspu")` after every save/delete. |
| `app/controllers/kiosk/ArchivesController.py` | `section_changed("gears-archive")` beside both `Cache.forget(_ARCHIVES_CACHE_KEY)`. |
| `resources/js/sw-kiosk.js` | New `EVICT` message. |
| `tests/js/sw-kiosk-evict.test.mjs` (new) | Evaluates the worker with stubbed `self`/`caches`. |
| `resources/js/kiosk-content.js` | New `reload(id)` on `window.__kioskContent`. |
| `resources/js/kiosk-live.js` (new) | Pure decision logic: stamp dedupe, debounce, evict-now/reload-when-idle, which frame. Exposes `window.__kioskLiveCreate`. |
| `tests/js/kiosk-live.test.mjs` (new) | State machine tests with fake timers. |
| `resources/js/welcome-screen.js` | Shared Pusher connection, host/port options, wires `kiosk-live` to the attract state machine and the service worker. |
| `app/controllers/kiosk/KioskShellController.py`, `templates/welcome.html` | `data-pusher-host` / `data-pusher-port`, load `kiosk-live.js`. |
| `webpack.mix.js` | Register `kiosk-live.js`. |

---

### Task 1: `KioskBroadcast` service, event class, and the test-suite delivery stub

**Files:**
- Create: `app/services/KioskBroadcast.py`
- Create: `app/events/KioskSectionChanged.py`
- Create: `tests/unit/conftest.py`
- Create: `tests/unit/test_kiosk_broadcast_service.py`

**Interfaces:**
- Produces: `KioskBroadcast.pusher_configured() -> bool`, `KioskBroadcast.section_changed(section_id: str) -> bool`, `KioskBroadcast._deliver(payload: dict) -> None` (the seam tests patch), constants `CHANNEL = "kiosk-content"`, `EVENT = "app.events.KioskSectionChanged"`, `SECTIONS = ("latest-news", "about-lspu", "gears-archive")`.

- [ ] **Step 1: Write the failing tests**

```python
# tests/unit/test_kiosk_broadcast_service.py
from unittest.mock import patch

from app.services import KioskBroadcast
from tests import TestCase


class KioskBroadcastServiceTestCase(TestCase):
    def test_section_changed_delivers_section_and_stamp(self):
        with patch("app.services.KioskBroadcast.pusher_configured", return_value=True), patch(
            "app.services.KioskBroadcast._deliver"
        ) as deliver, patch("app.services.KioskBroadcast.time.time", return_value=1_700_000_000.123):
            sent = KioskBroadcast.section_changed("latest-news")

        self.assertTrue(sent)
        deliver.assert_called_once_with({"section": "latest-news", "stamp": 1_700_000_000_123})

    def test_deliver_uses_the_public_channel_and_event_name(self):
        with patch("app.services.KioskBroadcast.Broadcast.channel") as channel:
            KioskBroadcast._deliver({"section": "about-lspu", "stamp": 5})

        channel.assert_called_once_with(
            ["kiosk-content"],
            "app.events.KioskSectionChanged",
            {"section": "about-lspu", "stamp": 5},
        )

    def test_section_changed_is_false_when_pusher_unconfigured(self):
        with patch("app.services.KioskBroadcast.pusher_configured", return_value=False), patch(
            "app.services.KioskBroadcast._deliver"
        ) as deliver:
            self.assertFalse(KioskBroadcast.section_changed("latest-news"))
        deliver.assert_not_called()

    def test_section_changed_swallows_delivery_errors(self):
        with patch("app.services.KioskBroadcast.pusher_configured", return_value=True), patch(
            "app.services.KioskBroadcast._deliver", side_effect=RuntimeError("pusher down")
        ):
            self.assertFalse(KioskBroadcast.section_changed("latest-news"))

    def test_unknown_section_is_refused_without_delivery(self):
        with patch("app.services.KioskBroadcast.pusher_configured", return_value=True), patch(
            "app.services.KioskBroadcast._deliver"
        ) as deliver:
            self.assertFalse(KioskBroadcast.section_changed("org-chart"))
        deliver.assert_not_called()

    def test_pusher_configured_reads_broadcast_config(self):
        with patch(
            "app.services.KioskBroadcast.config",
            return_value={"pusher": {"key": "k", "app_id": "a", "secret": "s"}},
        ):
            self.assertTrue(KioskBroadcast.pusher_configured())
        with patch(
            "app.services.KioskBroadcast.config",
            return_value={"pusher": {"key": "k", "app_id": "", "secret": "s"}},
        ):
            self.assertFalse(KioskBroadcast.pusher_configured())
```

- [ ] **Step 2: Run to verify they fail**

Run: `venv/bin/python -m pytest tests/unit/test_kiosk_broadcast_service.py -q`
Expected: ImportError / AttributeError — `app.services.KioskBroadcast` does not exist.

- [ ] **Step 3: Write the event class**

```python
# app/events/KioskSectionChanged.py
from masonite.events import Event


class KioskSectionChanged(Event):
    """A kiosk section's content changed; the terminal should re-fetch it.

    The payload is a signal, never content: the kiosk re-fetches from the
    server on receipt, so a dropped, duplicated or reordered event can never
    render anything wrong. That is also why the channel is public.
    """

    def __init__(self, section, stamp):
        self.section = section
        self.stamp = stamp

    def broadcast_on(self):
        return ["kiosk-content"]

    def broadcast_with(self):
        return {"section": self.section, "stamp": self.stamp}

    def broadcast_as(self):
        return "app.events.KioskSectionChanged"
```

- [ ] **Step 4: Write the service**

```python
# app/services/KioskBroadcast.py
"""Tell the kiosk a section changed, so it re-fetches without a reload.

One function matters: section_changed(section_id). It is best-effort in the
same way every other broadcast in this app is (KioskController.lock,
VideoController._broadcast_play_video): it checks the Pusher config, it
swallows every exception, and it returns whether the message went out. A
failed broadcast must never fail, block or slow an editor's save -- the
kiosk degrades to the service worker's stale-while-revalidate freshness,
which is exactly what it had before this existed.

The payload is {"section", "stamp"} and nothing else. The kiosk re-fetches
on receipt, so nothing editorial ever rides the (public) channel, and a
duplicated or reordered event is at worst a redundant re-fetch.

`stamp` is a server millisecond timestamp rather than the dashboard's
count:max(updated_at) marker: updated_at has one-second resolution and does
not move on a delete, so the kiosk would drop the second of two same-second
saves -- or a delete -- as "not newer". Time only ever moves forward.

`pusher_configured()` is the single definition of the predicate that used
to be copy-pasted into four controllers; they import it as
`_pusher_configured` so their tests keep patching the same name.
"""

import time

from masonite.configuration import config
from masonite.facades import Broadcast

CHANNEL = "kiosk-content"
EVENT = "app.events.KioskSectionChanged"

#: The kiosk sections that have a live-update path. Must match the ids in
#: KioskSections and the section map in resources/js/sw-kiosk.js.
SECTIONS = ("latest-news", "about-lspu", "gears-archive")


def pusher_configured():
    broadcasts = config("broadcast.broadcasts", {}) or config("broadcast.BROADCASTS", {}) or {}
    pusher_settings = broadcasts.get("pusher") or {}
    return bool(
        (pusher_settings.get("client") or pusher_settings.get("key"))
        and pusher_settings.get("app_id")
        and pusher_settings.get("secret")
    )


def _deliver(payload):
    """The one line that touches the network. Tests patch this."""
    Broadcast.channel([CHANNEL], EVENT, payload)


def section_changed(section_id):
    """Broadcast that `section_id` changed. Returns True if it went out."""
    if section_id not in SECTIONS:
        return False
    if not pusher_configured():
        return False
    try:
        _deliver({"section": section_id, "stamp": int(time.time() * 1000)})
        return True
    except Exception:
        return False
```

- [ ] **Step 5: Write the autouse delivery stub**

```python
# tests/unit/conftest.py
"""Keep the unit suite off the network.

`.env` in this repo is the production config and carries real Pusher
credentials, so any controller that now calls KioskBroadcast.section_changed
would make a live HTTP request to pusher.com from inside a test. This stubs
the one delivery seam for every unit test; a test that wants to assert on a
broadcast patches `app.services.KioskBroadcast._deliver` (or
`section_changed`) itself, which takes precedence over this fixture.
"""

from unittest.mock import patch

import pytest


@pytest.fixture(autouse=True)
def _stub_kiosk_broadcast_delivery():
    with patch("app.services.KioskBroadcast._deliver"):
        yield
```

- [ ] **Step 6: Run the tests**

Run: `venv/bin/python -m pytest tests/unit/test_kiosk_broadcast_service.py -q`
Expected: 6 passed.

- [ ] **Step 7: Lint and commit**

```bash
make lint
git add app/services/KioskBroadcast.py app/events/KioskSectionChanged.py tests/unit/conftest.py tests/unit/test_kiosk_broadcast_service.py
git commit -m "feat(kiosk): KioskBroadcast service for section-changed signals

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01WEv16U7HtJYrkVHKbftYwV"
```

---

### Task 2: Absorb the four `_pusher_configured` copies

**Files:**
- Modify: `app/controllers/gears/KioskController.py:8-15`
- Modify: `app/controllers/gears/VideoController.py:26-33`
- Modify: `app/controllers/gears/EditorialController.py:12-19`
- Modify: `app/controllers/gears/NewsController.py:346-353`
- Test: `tests/unit/test_kiosk_broadcasts.py` (existing, must stay green unchanged)

**Interfaces:**
- Consumes: `KioskBroadcast.pusher_configured`.
- Produces: each controller still has a module attribute named `_pusher_configured` (tests patch `app.controllers.gears.KioskController._pusher_configured` etc.).

- [ ] **Step 1: Confirm the existing tests pass before touching anything**

Run: `venv/bin/python -m pytest tests/unit/test_kiosk_broadcasts.py -q`
Expected: all pass.

- [ ] **Step 2: Replace each definition with an import alias**

In each of the four files, delete the 8-line `def _pusher_configured(): ...` block and add, with the other imports:

```python
from app.services.KioskBroadcast import pusher_configured as _pusher_configured
```

For `KioskController.py`, `VideoController.py`, `EditorialController.py`: `config` was imported only for this predicate. Check with `grep -n "config(" <file>`; if there are no other uses, drop `from masonite.configuration import config` too (flake8 F401 will fail otherwise). `NewsController.py` uses `config` elsewhere — keep its import.

Add a one-line comment above the alias in `KioskController.py` only (the other three just alias):

```python
# The predicate used to be copy-pasted into four controllers; it lives in the
# service now and is aliased so the tests that patch `_pusher_configured`
# here keep working.
```

- [ ] **Step 3: Verify the aliases are patchable and nothing else broke**

Run: `venv/bin/python -m pytest tests/unit/test_kiosk_broadcasts.py tests/unit/test_news_endpoints.py -q && make lint`
Expected: all pass, lint clean.

- [ ] **Step 4: Commit**

```bash
git add app/controllers/gears/KioskController.py app/controllers/gears/VideoController.py app/controllers/gears/EditorialController.py app/controllers/gears/NewsController.py
git commit -m "refactor: single _pusher_configured definition in KioskBroadcast

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01WEv16U7HtJYrkVHKbftYwV"
```

---

### Task 3: News broadcasts — every write that invalidates the news cache

**Files:**
- Modify: `app/controllers/gears/NewsController.py` (five `Cache.forget(_NEWS_CACHE_KEY)` sites at ~760, ~885, ~953, ~1061, ~1110)
- Modify: `app/controllers/gears/ReviewController.py` (two sites at ~106, ~192)
- Modify: `app/services/NewsCategories.py` (four `NewsCache.forget()` sites at ~210, ~238, ~273, ~306)
- Create: `tests/unit/test_news_live_broadcast.py`

**Interfaces:**
- Consumes: `KioskBroadcast.section_changed("latest-news")`.

The rule is mechanical and worth stating in one comment at the first site in each file: **wherever the news cache is forgotten, the kiosk is told.** The cache-forget marks "the kiosk's projection is stale"; the broadcast is the same fact delivered to the terminal.

- [ ] **Step 1: Write the failing tests**

Model the request/response mocking on `tests/unit/test_review_workflow.py` (the `_approve`/`_reject` helpers there) and `tests/unit/test_news_endpoints.py::test_destroy...`. The assertion of interest in every case is that `section_changed` was called with `"latest-news"`:

```python
# tests/unit/test_news_live_broadcast.py
"""Every write that forgets the kiosk news cache also tells the kiosk.

The cache-forget and the broadcast are the same fact ("what the kiosk shows
is stale") delivered to two consumers. A site that forgets but does not
broadcast leaves the terminal correct only after its next manual reload,
which is the exact bug this feature exists to remove.
"""
from unittest.mock import Mock, patch

from app.controllers.gears.ReviewController import ReviewController
from tests import TestCase


def _admin():
    user = Mock()
    user.role = "admin"
    user.id = 1
    return user


class NewsLiveBroadcastTestCase(TestCase):
    def _review_request(self, story_id="7", reason=""):
        request = Mock()
        request.param.return_value = story_id
        request.input.side_effect = lambda key, default=None: {"reason": reason}.get(key, default)
        request.user.return_value = _admin()
        request.header.return_value = "XMLHttpRequest"
        request.ajax.return_value = True
        return request

    def test_approve_broadcasts_latest_news(self):
        record = Mock()
        record.status = "review"
        record.id = 7
        query = Mock()
        query.first.return_value = record

        with patch("app.controllers.gears.ReviewController.News") as news_mock, patch(
            "app.controllers.gears.ReviewController.Cache"
        ), patch("app.controllers.gears.ReviewController.Notifications"), patch(
            "app.controllers.gears.ReviewController.KioskBroadcast.section_changed"
        ) as changed:
            news_mock.where.return_value = query
            response = Mock()
            response.json.side_effect = lambda payload, status=200: payload
            ReviewController().approve(self._review_request(), response)

        changed.assert_called_once_with("latest-news")

    def test_reject_broadcasts_latest_news(self):
        record = Mock()
        record.status = "review"
        record.id = 7
        query = Mock()
        query.first.return_value = record

        with patch("app.controllers.gears.ReviewController.News") as news_mock, patch(
            "app.controllers.gears.ReviewController.Cache"
        ), patch("app.controllers.gears.ReviewController.Notifications"), patch(
            "app.controllers.gears.ReviewController.KioskBroadcast.section_changed"
        ) as changed:
            news_mock.where.return_value = query
            response = Mock()
            response.json.side_effect = lambda payload, status=200: payload
            ReviewController().reject(self._review_request(reason="Needs a source."), response)

        changed.assert_called_once_with("latest-news")

    def test_category_rename_broadcasts_latest_news(self):
        # A rename changes a label the kiosk prints while touching zero news
        # rows -- the same reason NewsCategories invalidates the news cache.
        from app.services import NewsCategories

        with patch("app.services.NewsCategories.NewsCache.forget"), patch(
            "app.services.NewsCategories.KioskBroadcast.section_changed"
        ) as changed, patch.object(NewsCategories, "_category_or_none", create=True):
            pass  # see Step 3: assert against whichever rename helper the module exposes

        # Replace the body above with the module's actual rename entry point
        # (grep "def " app/services/NewsCategories.py); it must end with:
        # changed.assert_called_once_with("latest-news")
```

Then read `app/services/NewsCategories.py` and `tests/unit/test_news_categories.py` to see how the existing tests drive create/rename/delete/restore, and rewrite `test_category_rename_broadcasts_latest_news` so it drives the rename the same way those tests do and asserts `changed.assert_called_once_with("latest-news")`. Do the same for `NewsController.destroy` by copying the destroy test setup from `tests/unit/test_news_endpoints.py` into a `test_destroy_broadcasts_latest_news` and asserting the call. Delete the placeholder body — the committed test file must contain no `pass` stubs.

- [ ] **Step 2: Run to verify they fail**

Run: `venv/bin/python -m pytest tests/unit/test_news_live_broadcast.py -q`
Expected: FAIL — `AttributeError: ... has no attribute 'KioskBroadcast'` (the controllers don't import it yet).

- [ ] **Step 3: Add the broadcasts**

`ReviewController.py` — add import `from app.services import KioskBroadcast` and after **both** `Cache.forget(_NEWS_CACHE_KEY)` lines (≈106 and ≈192):

```python
            Cache.forget(_NEWS_CACHE_KEY)
            # Same fact, second consumer: the terminal re-fetches instead of
            # waiting for its next manual reload. Approval is the moment a
            # story becomes publicly visible, so this is the site that matters.
            KioskBroadcast.section_changed("latest-news")
```

(The comment goes on the first site only; the second gets the bare call.)

`NewsController.py` — add import `from app.services import KioskBroadcast` (there is already `from app.services import NewsCache, NewsCategories`; extend it). After each of the five `Cache.forget(_NEWS_CACHE_KEY)` lines add `KioskBroadcast.section_changed("latest-news")` at the same indentation. Comment on the first site only:

```python
            # Wherever the news cache is forgotten, the kiosk is told. The two
            # are the same fact ("the kiosk's projection is stale") for two
            # consumers, so a site that does one without the other is a bug.
```

`NewsCategories.py` — add `from app.services import KioskBroadcast` and after each of the four `NewsCache.forget()` lines add `KioskBroadcast.section_changed("latest-news")`. Comment on the first:

```python
    # A category label is printed on the kiosk, so the terminal is told too.
```

- [ ] **Step 4: Run the new tests, the existing news suites, and lint**

Run: `venv/bin/python -m pytest tests/unit/test_news_live_broadcast.py tests/unit/test_review_workflow.py tests/unit/test_news_endpoints.py tests/unit/test_layout_concurrency.py tests/unit/test_news_categories.py -q && make lint`
Expected: all pass (the autouse stub from Task 1 keeps the existing tests off the network).

- [ ] **Step 5: Commit**

```bash
git add app/controllers/gears/NewsController.py app/controllers/gears/ReviewController.py app/services/NewsCategories.py tests/unit/test_news_live_broadcast.py
git commit -m "feat(kiosk): broadcast latest-news on every news write

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01WEv16U7HtJYrkVHKbftYwV"
```

---

### Task 4: About LSPU broadcasts

**Files:**
- Modify: `app/controllers/kiosk/AboutController.py` (save points at ~182, ~256, ~264, ~286-287, ~306, ~373, ~443)
- Create: `tests/unit/test_about_live_broadcast.py`

**Interfaces:**
- Consumes: `KioskBroadcast.section_changed("about-lspu")`.

- [ ] **Step 1: Write the failing test**

Look at `tests/unit/test_about_lspu.py` for how `save_section` and `delete_milestone` are already driven (request/response mocks, `AboutSection`/`AboutMilestone` patches), then:

```python
# tests/unit/test_about_live_broadcast.py
from unittest.mock import patch

from tests import TestCase


class AboutLiveBroadcastTestCase(TestCase):
    def test_save_section_broadcasts_about_lspu(self):
        # Copy the arrange/act of the existing save_section success test from
        # tests/unit/test_about_lspu.py verbatim, adding this patch:
        with patch("app.controllers.kiosk.AboutController.KioskBroadcast.section_changed") as changed:
            ...  # act exactly as the existing test does
        changed.assert_called_once_with("about-lspu")

    def test_delete_milestone_broadcasts_about_lspu(self):
        with patch("app.controllers.kiosk.AboutController.KioskBroadcast.section_changed") as changed:
            ...  # act exactly as the existing delete_milestone test does
        changed.assert_called_once_with("about-lspu")
```

Replace both `...` with the real arrange/act copied from the existing tests; the committed file must have no ellipsis placeholders.

- [ ] **Step 2: Run to verify it fails**

Run: `venv/bin/python -m pytest tests/unit/test_about_live_broadcast.py -q`
Expected: FAIL with `AttributeError` — no `KioskBroadcast` in `AboutController`.

- [ ] **Step 3: Add the broadcasts**

Add `from app.services import KioskBroadcast` to the imports. Then add a module-level helper right below the imports so the seven call sites read identically:

```python
def _about_changed():
    # Every About write ends here. The kiosk's About page is served
    # stale-while-revalidate by sw-kiosk.js, so without this a saved section
    # would show up one visit late.
    KioskBroadcast.section_changed("about-lspu")
```

Insert `_about_changed()` immediately after each successful write, inside the same `try` block as the save so a failed save never broadcasts:

- after `section.save()` at ~182 (`save_section`)
- after the milestone create's `.save()` in `create_milestone` (find it with `grep -n "save()" app/controllers/kiosk/AboutController.py` — it is the one between lines 189 and 220)
- after `row.save()` at ~256 (`update_milestone`)
- after `row.delete()` at ~264 (`delete_milestone`)
- after `neighbour.save()` at ~287 (`reorder_milestone` — once, after both saves)
- after `section.save()` at ~306 (`upload_seal`)
- after `section.save()` at ~373 (`upload_hymn_audio`)
- after `section.save()` at ~443 (`upload_hymn_video`)

- [ ] **Step 4: Run tests and lint**

Run: `venv/bin/python -m pytest tests/unit/test_about_live_broadcast.py tests/unit/test_about_lspu.py tests/unit/test_about_meta.py tests/unit/test_about_sources.py tests/unit/test_about_values.py -q && make lint`
Expected: all pass.

- [ ] **Step 5: Commit**

```bash
git add app/controllers/kiosk/AboutController.py tests/unit/test_about_live_broadcast.py
git commit -m "feat(kiosk): broadcast about-lspu on every About write

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01WEv16U7HtJYrkVHKbftYwV"
```

---

### Task 5: Archives broadcasts

**Files:**
- Modify: `app/controllers/kiosk/ArchivesController.py:244` (store) and `:348` (destroy)
- Create: `tests/unit/test_archives_live_broadcast.py`

**Interfaces:**
- Consumes: `KioskBroadcast.section_changed("gears-archive")`.

- [ ] **Step 1: Write the failing test**

`store()` has a lot of upload machinery; test at the seam that matters — the broadcast happens *after* the eager pre-warm, never before it:

```python
# tests/unit/test_archives_live_broadcast.py
"""The archive broadcast fires only once the issue is readable.

store() renders the cover and the first EAGER_PAGE_LIMIT pages on the request
thread and sweeps the rest in a background thread; ArchivesController.page
renders on demand past that. So the point right after the eager pre-warm is
the first moment a kiosk refresh would open onto real pages rather than a
shelf card with nothing behind it.
"""
from unittest.mock import Mock, call, patch

from app.controllers.kiosk import ArchivesController as module
from tests import TestCase


class ArchivesLiveBroadcastTestCase(TestCase):
    def test_store_broadcasts_after_eager_prewarm(self):
        order = []
        services = Mock()
        services.prewarm_archive_previews.side_effect = lambda *a, **k: order.append("prewarm")

        with patch.object(module, "ArchiveServices", return_value=services), patch.object(
            module, "_sweep_archive_pages_in_background"
        ), patch.object(module, "Cache"), patch.object(
            module.KioskBroadcast, "section_changed", side_effect=lambda s: order.append(s)
        ):
            # Drive store() the way tests/unit/test_archive_entry.py or
            # test_mobile_archives.py already do for the success path (copy that
            # arrange/act here). If neither drives store() end-to-end, drive it
            # with the same request/storage/response mocks NewsController's
            # tests use, patching FileVerificationService and Archive.
            pass

        self.assertEqual(order, ["prewarm", "gears-archive"])

    def test_destroy_broadcasts_gears_archive(self):
        with patch.object(module.KioskBroadcast, "section_changed") as changed:
            # copy the existing destroy success arrange/act
            pass
        changed.assert_called_once_with("gears-archive")
```

Replace the `pass` bodies with real arrange/act (grep the existing archive tests for `.store(` / `.destroy(`; if none exist, build the mocks from the controller's signature `store(self, request, storage, response)` — `request.input` for `name`/`type`/`year`, `request.input("file")` for the upload, `storage.disk().put_file` for the write). No `pass` stubs in the committed test.

- [ ] **Step 2: Run to verify it fails**

Run: `venv/bin/python -m pytest tests/unit/test_archives_live_broadcast.py -q`
Expected: FAIL — no `KioskBroadcast` attribute on the module.

- [ ] **Step 3: Add the broadcasts**

Add `from app.services import KioskBroadcast` to the imports.

At ~244 (store):

```python
            Cache.forget(_ARCHIVES_CACHE_KEY)
            # After the eager pre-warm above, never before it: a kiosk refresh
            # at this point opens onto a cover and readable pages, whereas one
            # at upload time would land on a shelf card with nothing behind
            # it. The tail of the issue is still sweeping, and page() renders
            # on demand past the sweep, so "readable" holds from here on.
            KioskBroadcast.section_changed("gears-archive")
```

At ~348 (destroy):

```python
            Cache.forget(_ARCHIVES_CACHE_KEY)
            KioskBroadcast.section_changed("gears-archive")
```

- [ ] **Step 4: Run tests and lint**

Run: `venv/bin/python -m pytest tests/unit/test_archives_live_broadcast.py tests/unit/test_archive_entry.py tests/unit/test_mobile_archives.py tests/unit/test_archive_render_plan.py -q && make lint`
Expected: all pass.

- [ ] **Step 5: Commit**

```bash
git add app/controllers/kiosk/ArchivesController.py tests/unit/test_archives_live_broadcast.py
git commit -m "feat(kiosk): broadcast gears-archive on upload and delete

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01WEv16U7HtJYrkVHKbftYwV"
```

---

### Task 6: Service worker `EVICT` message

**Files:**
- Modify: `resources/js/sw-kiosk.js:324-339` (message listener) and the header comment near line 52
- Create: `tests/js/sw-kiosk-evict.test.mjs`

**Interfaces:**
- Produces: worker accepts `{ type: 'EVICT', section: <id> }` and deletes matching entries from `CACHE_NAME`. Section map:

| Section | Document | Media prefix |
|---|---|---|
| `latest-news` | `/kiosk/embed/latest-news` | `/storage/news/` |
| `about-lspu` | `/kiosk/embed/about-lspu` | `/storage/About/` |
| `gears-archive` | `/kiosk/embed/gears-archive` | `/storage/Archives/covers/` |

- [ ] **Step 1: Write the failing test**

```js
// tests/js/sw-kiosk-evict.test.mjs
// Run with: node --test tests/js/
//
// sw-kiosk.js serves kiosk documents and editor-mutable media stale-while-
// revalidate, which is what makes the terminal feel instant -- and what makes a
// bare "reload the frame" do nothing visible, because the reload re-serves the
// same stale entry. EVICT is the message the shell sends first, so the reload
// that follows misses the cache and fetches fresh.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const SOURCE = readFileSync(join(here, '../../resources/js/sw-kiosk.js'), 'utf8');

function boot(initialUrls) {
  const listeners = {};
  const store = new Map(initialUrls.map((u) => [u, { url: u }]));
  const cache = {
    keys: async () => Array.from(store.values()).map((r) => ({ url: r.url })),
    delete: async (req) => store.delete(typeof req === 'string' ? req : req.url),
    match: async () => undefined,
    put: async () => undefined,
  };
  const self = {
    location: { origin: 'https://presspoint-gears.me' },
    addEventListener(type, fn) { (listeners[type] ||= []).push(fn); },
    skipWaiting() {},
    clients: { claim() {} },
  };
  const caches = { open: async () => cache, keys: async () => [] };
  new Function('self', 'caches', 'fetch', SOURCE)(self, caches, async () => ({ status: 200 }));

  async function message(data) {
    const waits = [];
    for (const fn of listeners.message || []) {
      fn({ data, waitUntil: (p) => waits.push(p) });
    }
    await Promise.all(waits);
  }
  return { store, message };
}

const ORIGIN = 'https://presspoint-gears.me';
const SEED = [
  `${ORIGIN}/kiosk/embed/latest-news`,
  `${ORIGIN}/storage/news/story-1.large.webp`,
  `${ORIGIN}/kiosk/embed/about-lspu`,
  `${ORIGIN}/storage/About/seal.webp`,
  `${ORIGIN}/kiosk/embed/gears-archive`,
  `${ORIGIN}/storage/Archives/covers/vol-1.webp`,
  `${ORIGIN}/storage/Archives/pages/vol-1/page-1.webp`,
  `${ORIGIN}/kiosk/embed/campus-map`,
];

test('EVICT latest-news drops the news document and its media only', async () => {
  const { store, message } = boot(SEED);
  await message({ type: 'EVICT', section: 'latest-news' });
  const left = Array.from(store.keys());
  assert.ok(!left.includes(`${ORIGIN}/kiosk/embed/latest-news`));
  assert.ok(!left.includes(`${ORIGIN}/storage/news/story-1.large.webp`));
  assert.ok(left.includes(`${ORIGIN}/kiosk/embed/about-lspu`));
  assert.ok(left.includes(`${ORIGIN}/storage/About/seal.webp`));
  assert.ok(left.includes(`${ORIGIN}/kiosk/embed/campus-map`));
});

test('EVICT gears-archive drops covers but never the rasterised pages', async () => {
  const { store, message } = boot(SEED);
  await message({ type: 'EVICT', section: 'gears-archive' });
  const left = Array.from(store.keys());
  assert.ok(!left.includes(`${ORIGIN}/kiosk/embed/gears-archive`));
  assert.ok(!left.includes(`${ORIGIN}/storage/Archives/covers/vol-1.webp`));
  assert.ok(left.includes(`${ORIGIN}/storage/Archives/pages/vol-1/page-1.webp`));
});

test('EVICT for an unknown section is a no-op', async () => {
  const { store, message } = boot(SEED);
  await message({ type: 'EVICT', section: 'org-chart' });
  assert.equal(store.size, SEED.length);
});

test('EVICT with no section is a no-op', async () => {
  const { store, message } = boot(SEED);
  await message({ type: 'EVICT' });
  assert.equal(store.size, SEED.length);
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `node --test tests/js/sw-kiosk-evict.test.mjs`
Expected: the first two tests fail (entries still present); the no-op tests pass.

If `new Function(...)` throws on the worker source (e.g. it references a global the stub lacks), extend the `self` stub with that member — do not modify the worker to suit the harness.

- [ ] **Step 3: Implement**

Below `MEDIA_PREFIXES` add:

```js
// What a live-update EVICT drops, per kiosk section. Both the document and
// the media go, because a story's replaced image is exactly as stale as its
// HTML. Archive pages are deliberately absent: they are immutable per issue,
// so only the covers (the shelf) are evicted. Must match
// app/services/KioskBroadcast.py SECTIONS.
const EVICT_SECTIONS = {
  'latest-news':   { document: '/kiosk/embed/latest-news',   media: '/storage/news/' },
  'about-lspu':    { document: '/kiosk/embed/about-lspu',    media: '/storage/About/' },
  'gears-archive': { document: '/kiosk/embed/gears-archive', media: '/storage/Archives/covers/' },
};
```

In the `message` listener, after the `PRECACHE_ROUTES` branch:

```js
  if (event.data.type === 'EVICT') {
    const target = EVICT_SECTIONS[event.data.section];
    if (!target) return;
    event.waitUntil(evictSection(target));
  }
```

And add the function:

```js
/*
 * Drop one section's cached document and media so the next fetch misses.
 *
 * Sent by the shell (welcome-screen.js, via kiosk-live.js) the moment an
 * editor's change is announced over Pusher, BEFORE any frame reload: with
 * stale-while-revalidate a reload alone would re-serve the stale entry and
 * appear to do nothing. No CACHE_NAME bump is involved -- the strategy is
 * unchanged, the worker is just being told that a specific entry is dead.
 */
function evictSection(target) {
  return caches.open(CACHE_NAME).then(async (cache) => {
    const keys = await cache.keys();
    const doomed = keys.filter((req) => {
      const url = new URL(req.url);
      if (url.origin !== self.location.origin) return false;
      return url.pathname === target.document || url.pathname.startsWith(target.media);
    });
    await Promise.all(doomed.map((req) => cache.delete(req)));
  });
}
```

Update the header comment block (near line 52, "Receives a PRECACHE message…") to list EVICT alongside PRECACHE and PRECACHE_ROUTES.

- [ ] **Step 4: Run the JS tests**

Run: `node --test tests/js/sw-kiosk-evict.test.mjs`
Expected: 4 passed.

- [ ] **Step 5: Commit**

```bash
git add resources/js/sw-kiosk.js tests/js/sw-kiosk-evict.test.mjs
git commit -m "feat(kiosk): service worker EVICT message for live updates

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01WEv16U7HtJYrkVHKbftYwV"
```

---

### Task 7: `window.__kioskContent.reload(id)`

**Files:**
- Modify: `resources/js/kiosk-content.js:268-274`
- Modify: `tests/js/kiosk-content.test.mjs` (extend the frame stub and add two tests)

**Interfaces:**
- Produces: `window.__kioskContent.reload(sectionId) -> boolean` — reloads the content frame **only if** that section is the one currently shown; returns whether it did.

- [ ] **Step 1: Write the failing tests**

In `tests/js/kiosk-content.test.mjs`, the frame stub at ~line 82 has `location: { replace(url) { srcLog.push(String(url)); } }`. Add a `reload()` that pushes the sentinel `'<reload>'` onto `srcLog`, then append:

```js
test('reload(id) reloads the frame only when that section is showing', () => {
  const { window, srcLog } = boot({ activeId: 'latest-news' });
  const api = window.__kioskContent;

  assert.equal(api.reload('about-lspu'), false, 'not the current section: nothing to do');
  assert.deepEqual(srcLog, []);

  assert.equal(api.reload('latest-news'), true);
  assert.deepEqual(srcLog, ['<reload>']);
});

test('reload(id) never pushes history', () => {
  const { window, historyLog } = boot({ activeId: 'latest-news' });
  window.__kioskContent.reload('latest-news');
  assert.deepEqual(historyLog, []);
});
```

Adapt the destructured names (`srcLog`, `historyLog`) to whatever `boot()` in that file actually returns — read it first.

- [ ] **Step 2: Run to verify it fails**

Run: `node --test tests/js/kiosk-content.test.mjs`
Expected: the two new tests fail with `api.reload is not a function`.

- [ ] **Step 3: Implement**

In `kiosk-content.js`, above the `window.__kioskContent = {` block:

```js
  /*
   * Re-fetch the frame in place, for a live update (welcome-screen.js via
   * kiosk-live.js). Only when `id` is the section on screen: any other
   * section is served fresh on its next visit anyway, because the shell
   * evicted it from the service worker cache before asking for this.
   *
   * location.reload(), like the replace() in loadFrame(), adds no history
   * entry -- writing src would.
   */
  function reload(id) {
    if (id !== currentId) return false;
    try {
      if (frame.contentWindow && frame.contentWindow.location) {
        frame.contentWindow.location.reload();
        return true;
      }
    } catch (_) {
      // Same-origin throughout; a frame in a strange state must not take
      // the kiosk down.
    }
    return false;
  }
```

and add `reload: reload,` to the exported object.

- [ ] **Step 4: Run the tests**

Run: `node --test tests/js/kiosk-content.test.mjs`
Expected: all pass.

- [ ] **Step 5: Commit**

```bash
git add resources/js/kiosk-content.js tests/js/kiosk-content.test.mjs
git commit -m "feat(kiosk): __kioskContent.reload(id) for in-place frame refresh

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01WEv16U7HtJYrkVHKbftYwV"
```

---

### Task 8: `kiosk-live.js` — the decision logic

**Files:**
- Create: `resources/js/kiosk-live.js`
- Create: `tests/js/kiosk-live.test.mjs`
- Modify: `webpack.mix.js` (add the entry next to `kiosk-content.js` at line 33)

**Interfaces:**
- Produces: `window.__kioskLiveCreate(deps) -> { onEvent(payload), onAttract(opts), dirty() }` where

```js
deps = {
  evict(section),                         // -> void; posts EVICT to the SW
  reloadContent(section),                 // -> boolean; __kioskContent.reload
  reloadAttract(),                        // -> void; re-src the newsletter iframe
  isAttract(),                            // -> boolean; attractShowing
  attractMode(),                          // -> 'video' | 'newsletter' | null
  setTimeout, clearTimeout,               // injectable for tests
}
onEvent({ section, stamp })               // from Pusher
onAttract({ contentJustNavigated: bool }) // called by playIdleAttract after it reset the frame
dirty()                                   // -> string[]; for tests/devtools
```

Constants: `DEBOUNCE_MS = 750`, `SECTIONS = ['latest-news', 'about-lspu', 'gears-archive']`.

- [ ] **Step 1: Write the failing tests**

```js
// tests/js/kiosk-live.test.mjs
// Run with: node --test tests/js/
//
// The idle gate for live editor -> kiosk updates (resources/js/kiosk-live.js).
//
// Two rules carry the whole feature and both are easy to get backwards:
//
//   * Evict IMMEDIATELY, reload CONDITIONALLY. Eviction is invisible, so it is
//     never deferred; a deferred eviction would let the visitor's next tap
//     re-serve the stale entry the event just told us about.
//   * A visitor mid-read is never interrupted. The reload waits for the attract
//     screen, which arrives at most KIOSK_IDLE_TIMEOUT after their last touch.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const SOURCE = readFileSync(join(here, '../../resources/js/kiosk-live.js'), 'utf8');

function boot({ attract = false, mode = null } = {}) {
  const window = {};
  new Function('window', SOURCE)(window);

  const timers = new Map();
  let nextId = 1;
  const calls = { evict: [], reloadContent: [], reloadAttract: 0 };
  const state = { attract, mode };

  const live = window.__kioskLiveCreate({
    evict: (s) => calls.evict.push(s),
    reloadContent: (s) => { calls.reloadContent.push(s); return true; },
    reloadAttract: () => { calls.reloadAttract += 1; },
    isAttract: () => state.attract,
    attractMode: () => state.mode,
    setTimeout: (fn, ms) => { const id = nextId++; timers.set(id, { fn, ms }); return id; },
    clearTimeout: (id) => { timers.delete(id); },
  });

  function flushTimers() {
    for (const [id, t] of Array.from(timers)) { timers.delete(id); t.fn(); }
  }
  return { live, calls, state, timers, flushTimers };
}

test('evicts immediately on receipt, before any debounce', () => {
  const { live, calls, timers } = boot();
  live.onEvent({ section: 'latest-news', stamp: 10 });
  assert.deepEqual(calls.evict, ['latest-news']);
  assert.equal(timers.size, 1, 'reload is debounced, eviction is not');
  assert.deepEqual(calls.reloadContent, []);
});

test('unattended terminal: reloads the content frame after the debounce', () => {
  const { live, calls, flushTimers } = boot({ attract: true, mode: 'video' });
  live.onEvent({ section: 'about-lspu', stamp: 10 });
  flushTimers();
  assert.deepEqual(calls.reloadContent, ['about-lspu']);
  assert.equal(calls.reloadAttract, 0, 'an idle video is never disturbed');
});

test('newsletter attract on screen: a news event reloads the attract iframe too', () => {
  const { live, calls, flushTimers } = boot({ attract: true, mode: 'newsletter' });
  live.onEvent({ section: 'latest-news', stamp: 10 });
  flushTimers();
  assert.equal(calls.reloadAttract, 1);
  assert.deepEqual(calls.reloadContent, ['latest-news']);
});

test('newsletter attract on screen: an About event leaves the attract alone', () => {
  const { live, calls, flushTimers } = boot({ attract: true, mode: 'newsletter' });
  live.onEvent({ section: 'about-lspu', stamp: 10 });
  flushTimers();
  assert.equal(calls.reloadAttract, 0);
  assert.deepEqual(calls.reloadContent, ['about-lspu']);
});

test('visitor present: defers the reload and flushes it on the next attract', () => {
  const { live, calls, state, flushTimers } = boot({ attract: false });
  live.onEvent({ section: 'latest-news', stamp: 10 });
  flushTimers();
  assert.deepEqual(calls.reloadContent, [], 'never yank the page from a visitor');
  assert.deepEqual(live.dirty(), ['latest-news']);

  state.attract = true; state.mode = 'video';
  live.onAttract({ contentJustNavigated: false });
  assert.deepEqual(calls.reloadContent, ['latest-news']);
  assert.deepEqual(live.dirty(), []);
});

test('flush skips the content reload when attract already navigated the frame', () => {
  // playIdleAttract() resets the frame to the default section BEFORE calling
  // onAttract; that reset is itself a fresh post-eviction fetch, so a second
  // reload would just cost a request.
  const { live, calls, state, flushTimers } = boot({ attract: false });
  live.onEvent({ section: 'latest-news', stamp: 10 });
  flushTimers();
  state.attract = true; state.mode = 'newsletter';
  live.onAttract({ contentJustNavigated: true });
  assert.deepEqual(calls.reloadContent, []);
  assert.equal(calls.reloadAttract, 0, 'showNewsletterAttract re-srcs the iframe itself');
  assert.deepEqual(live.dirty(), []);
});

test('a burst of events collapses to one reload per section', () => {
  const { live, calls, flushTimers } = boot({ attract: true, mode: 'video' });
  live.onEvent({ section: 'latest-news', stamp: 10 });
  live.onEvent({ section: 'latest-news', stamp: 11 });
  live.onEvent({ section: 'latest-news', stamp: 12 });
  flushTimers();
  assert.deepEqual(calls.reloadContent, ['latest-news']);
  assert.equal(calls.evict.length, 3, 'every event still evicts; eviction is idempotent');
});

test('ignores an event whose stamp is not newer than the last applied', () => {
  const { live, calls, flushTimers } = boot({ attract: true, mode: 'video' });
  live.onEvent({ section: 'latest-news', stamp: 10 });
  flushTimers();
  live.onEvent({ section: 'latest-news', stamp: 10 });
  live.onEvent({ section: 'latest-news', stamp: 9 });
  flushTimers();
  assert.deepEqual(calls.evict, ['latest-news']);
  assert.deepEqual(calls.reloadContent, ['latest-news']);
});

test('ignores unknown sections and malformed payloads', () => {
  const { live, calls, timers } = boot();
  live.onEvent({ section: 'org-chart', stamp: 10 });
  live.onEvent({ section: 'latest-news' });
  live.onEvent(null);
  live.onEvent({ section: 'latest-news', stamp: 'soon' });
  assert.deepEqual(calls.evict, []);
  assert.equal(timers.size, 0);
});

test('survives a dependency that throws', () => {
  const window = {};
  new Function('window', SOURCE)(window);
  const live = window.__kioskLiveCreate({
    evict: () => { throw new Error('no SW controller'); },
    reloadContent: () => { throw new Error('frame gone'); },
    reloadAttract: () => {},
    isAttract: () => true,
    attractMode: () => 'video',
    setTimeout: (fn) => { fn(); return 1; },
    clearTimeout: () => {},
  });
  assert.doesNotThrow(() => live.onEvent({ section: 'latest-news', stamp: 1 }));
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `node --test tests/js/kiosk-live.test.mjs`
Expected: fails — `ENOENT` reading `kiosk-live.js`.

- [ ] **Step 3: Implement**

```js
// resources/js/kiosk-live.js
/*
 * Live editor -> kiosk updates: the idle gate.
 *
 * welcome-screen.js receives {section, stamp} events on the public
 * "kiosk-content" Pusher channel (app/services/KioskBroadcast.py) and hands
 * them here. This file decides what to do with one; it touches no DOM, which
 * is why it is a factory taking its effects as arguments and why it has a
 * node test (tests/js/kiosk-live.test.mjs) and welcome-screen.js does the
 * wiring.
 *
 * The event is a signal, never content. Two rules follow:
 *
 *   1. Evict immediately, always. sw-kiosk.js serves the section documents and
 *      their media stale-while-revalidate, so a frame reload on its own would
 *      re-serve the stale entry and look like nothing happened. Eviction is
 *      invisible, so nothing is gained by deferring it, and it guarantees the
 *      visitor's next tap on that section is fresh even if no reload follows.
 *
 *   2. Reload conditionally. Unattended (attract screen showing): reload now.
 *      A visitor mid-read: remember the section as dirty and flush when the
 *      attract screen next appears, which is at most KIOSK_IDLE_TIMEOUT after
 *      their last touch. Nobody ever has the page pulled out from under them.
 *
 * Two frames exist and the attract one is the visible one. ATTRACT_SRC is the
 * news embed, so a latest-news event while the NEWSLETTER attract is showing
 * must also re-src that iframe -- that is what a passer-by is looking at. An
 * idle VIDEO is never disturbed; only the hidden content frame refreshes
 * behind it.
 *
 * The stamp is a server millisecond timestamp. An event not newer than the
 * last applied for its section is ignored. Bursts (a multi-step save emits
 * several events in a row, each with a distinct stamp) are collapsed by a
 * short per-section debounce on the reload -- not on the eviction.
 */
(function () {
  'use strict';

  var SECTIONS = ['latest-news', 'about-lspu', 'gears-archive'];
  var DEBOUNCE_MS = 750;

  function create(deps) {
    var setTimer = deps.setTimeout || window.setTimeout.bind(window);
    var clearTimer = deps.clearTimeout || window.clearTimeout.bind(window);

    var lastStamp = {};   // section -> last stamp applied
    var pending = {};     // section -> debounce timer id
    var dirty = {};       // section -> true, awaiting the next attract

    function safe(fn) {
      // A public terminal never shows plumbing failures. Every effect is
      // somebody else's code (the SW, the frame) and any of it can be absent.
      try { return fn(); } catch (_) { return undefined; }
    }

    function apply(section) {
      delete pending[section];
      if (!safe(deps.isAttract)) {
        dirty[section] = true;
        return;
      }
      if (section === 'latest-news' && safe(deps.attractMode) === 'newsletter') {
        safe(function () { deps.reloadAttract(); });
      }
      safe(function () { deps.reloadContent(section); });
    }

    function onEvent(payload) {
      if (!payload || typeof payload !== 'object') return;
      var section = payload.section;
      var stamp = payload.stamp;
      if (SECTIONS.indexOf(section) === -1) return;
      if (typeof stamp !== 'number' || !isFinite(stamp)) return;
      if (lastStamp[section] !== undefined && stamp <= lastStamp[section]) return;
      lastStamp[section] = stamp;

      safe(function () { deps.evict(section); });

      if (pending[section] !== undefined) clearTimer(pending[section]);
      pending[section] = setTimer(function () { apply(section); }, DEBOUNCE_MS);
    }

    function onAttract(opts) {
      var contentJustNavigated = !!(opts && opts.contentJustNavigated);
      var sections = Object.keys(dirty);
      dirty = {};
      // showNewsletterAttract() re-srcs the attract iframe on every attract,
      // and a reset of the content frame is itself a fresh fetch; after the
      // eviction both come from the network. So only a content frame that
      // was NOT just reset needs an explicit reload here.
      if (contentJustNavigated) return;
      sections.forEach(function (section) {
        safe(function () { deps.reloadContent(section); });
      });
    }

    return {
      onEvent: onEvent,
      onAttract: onAttract,
      dirty: function () { return Object.keys(dirty); },
    };
  }

  window.__kioskLiveCreate = create;
})();
```

- [ ] **Step 4: Run the tests**

Run: `node --test tests/js/kiosk-live.test.mjs`
Expected: 10 passed.

- [ ] **Step 5: Register in `webpack.mix.js`**

After `.js('resources/js/kiosk-content.js', 'storage/compiled/js')` (line 33) add:

```js
.js('resources/js/kiosk-live.js', 'storage/compiled/js')
```

- [ ] **Step 6: Commit**

```bash
git add resources/js/kiosk-live.js tests/js/kiosk-live.test.mjs webpack.mix.js
git commit -m "feat(kiosk): kiosk-live idle gate for editor->kiosk updates

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01WEv16U7HtJYrkVHKbftYwV"
```

---

### Task 9: Wire it into the shell

**Files:**
- Modify: `app/controllers/kiosk/KioskShellController.py:44-55`
- Modify: `templates/welcome.html:388-392` (config element) and `:505-506` (script tags)
- Modify: `resources/js/welcome-screen.js` — config reads (~27-32), `initFlashUpdatesRealtime` (~175-197), `playIdleAttract` (~652-679), `resetContentToDefault` (~689-699), `showNewsletterAttract` (~567-590)
- Test: `tests/unit/test_kiosk_shell.py` (extend), `tests/js/welcome-idle-*.test.mjs` (must stay green)

**Interfaces:**
- Consumes: `window.__kioskLiveCreate` (Task 8), `window.__kioskContent.reload` (Task 7), SW `EVICT` (Task 6).

- [ ] **Step 1: Failing Python test — the shell passes host/port to the template**

In `tests/unit/test_kiosk_shell.py`, find the existing test that asserts on `pusher_key` in the shell context (grep `pusher_key`). Add beside it:

```python
    def test_shell_context_carries_pusher_host_and_port(self):
        with patch(
            "app.controllers.kiosk.KioskShellController.config",
            return_value={"pusher": {"key": "k", "cluster": "ap1", "host": "ws.example", "port": "6001"}},
        ):
            context = KioskShellController._shell_context("latest-news")  # use the real helper name
        self.assertEqual(context["pusher_host"], "ws.example")
        self.assertEqual(context["pusher_port"], "6001")
```

Read the controller first: the helper that returns the dict at line 47 has a real name and signature — use those, and mirror how the existing `pusher_key` test drives it.

- [ ] **Step 2: Run to verify it fails**

Run: `venv/bin/python -m pytest tests/unit/test_kiosk_shell.py -q`
Expected: the new test fails with `KeyError: 'pusher_host'`.

- [ ] **Step 3: Controller + template**

In `KioskShellController.py`, extend the returned dict:

```python
            "pusher_key": pusher_settings.get("client") or pusher_settings.get("key") or "",
            "pusher_cluster": pusher_settings.get("cluster") or "mt1",
            # Empty on hosted pusher.com. Set PUSHER_HOST/PUSHER_PORT to point
            # the browser at a self-hosted Soketi instead -- same protocol, no
            # code change (see docs/superpowers/specs/2026-09-10-kiosk-live-updates-design.md).
            "pusher_host": pusher_settings.get("host") or "",
            "pusher_port": str(pusher_settings.get("port") or ""),
```

In `templates/welcome.html`, on the `#kiosk-config` element add:

```html
    data-pusher-host="{{ pusher_host }}"
    data-pusher-port="{{ pusher_port }}"
```

and between the `kiosk-content.js` and `welcome-screen.js` script tags (lines 505-506) add:

```html
  <script src="{{ asset_url('js/kiosk-live.js') }}" defer></script>
```

(Order matters: `defer` scripts execute in document order, and `welcome-screen.js` reads `window.__kioskLiveCreate` at DOMContentLoaded.)

- [ ] **Step 4: Run the Python test**

Run: `venv/bin/python -m pytest tests/unit/test_kiosk_shell.py -q && make lint`
Expected: pass.

- [ ] **Step 5: `welcome-screen.js` — shared connection with host/port**

Near the other config reads (~line 28):

```js
  const pusherHost = configEl ? (configEl.getAttribute("data-pusher-host") || "").trim() : "";
  const pusherPort = configEl ? (configEl.getAttribute("data-pusher-port") || "").trim() : "";
  const liveChannelName = "kiosk-content";
  const liveEventName = "app.events.KioskSectionChanged";
```

Add a helper next to `loadPusherScript()`:

```js
  // Hosted pusher.com by default. With PUSHER_HOST set the same client talks
  // to a self-hosted Pusher-protocol server (Soketi) through nginx, with TLS
  // terminating there -- so forceTLS follows the page's own scheme.
  function pusherOptions() {
    const options = { cluster };
    if (pusherHost) {
      options.wsHost = pusherHost;
      options.wsPort = Number(pusherPort) || 80;
      options.wssPort = Number(pusherPort) || 443;
      options.forceTLS = window.location.protocol === "https:";
      options.enabledTransports = ["ws", "wss"];
    }
    return options;
  }
```

Replace `initFlashUpdatesRealtime` with one function that opens the socket once and subscribes both channels:

```js
  // One socket per terminal. The flash ticker and the live content updates
  // share it; a second connection would just be a second thing to reconnect.
  function initRealtime() {
    if (!pusherKey) {
      return;
    }

    loadPusherScript()
      .then((Pusher) => {
        if (!Pusher) {
          return;
        }

        const pusher = new Pusher(pusherKey, pusherOptions());

        const flash = pusher.subscribe(flashUpdatesChannel);
        flash.bind(flashUpdatesEvent, (payload) => {
          prependFlashArticle(payload || {});
        });

        if (kioskLive) {
          const live = pusher.subscribe(liveChannelName);
          live.bind(liveEventName, (payload) => {
            kioskLive.onEvent(payload || {});
          });
        }
      })
      .catch(() => {
        return;
      });
  }
```

Update the one call site (`grep -n "initFlashUpdatesRealtime" resources/js/welcome-screen.js`) to `initRealtime()`.

- [ ] **Step 6: `welcome-screen.js` — build the live gate**

Right after `let attractIframe = null;` (~line 520) add the mode flag and the gate. It must be declared before `initRealtime()` runs — check the call order in the file; if `initRealtime()` is invoked above line 520, move this block above that call.

```js
  // Which attract is on screen. kiosk-live.js needs to know, because a
  // latest-news event has to re-src the newsletter iframe (the thing a
  // passer-by is looking at) but must never interrupt the idle video.
  let attractMode = null; // 'video' | 'newsletter' | null

  function evictSection(section) {
    // Invisible and idempotent, so it is never deferred. Without it a frame
    // reload would re-serve sw-kiosk.js's stale-while-revalidate copy.
    if (!("serviceWorker" in navigator) || !navigator.serviceWorker.controller) return;
    navigator.serviceWorker.controller.postMessage({ type: "EVICT", section });
  }

  function reloadContentFrame(section) {
    if (!window.__kioskContent || typeof window.__kioskContent.reload !== "function") return false;
    return window.__kioskContent.reload(section);
  }

  function reloadAttractFrame() {
    if (attractIframe) attractIframe.setAttribute("src", ATTRACT_SRC);
  }

  const kioskLive =
    typeof window.__kioskLiveCreate === "function"
      ? window.__kioskLiveCreate({
          evict: evictSection,
          reloadContent: reloadContentFrame,
          reloadAttract: reloadAttractFrame,
          isAttract: () => attractShowing,
          attractMode: () => attractMode,
        })
      : null;
```

- [ ] **Step 7: `welcome-screen.js` — feed the attract state machine**

`resetContentToDefault()` must report whether it navigated. Change its tail:

```js
  function resetContentToDefault() {
    setNavExpanded(true);

    if (!window.__kioskContent) return false;
    const fallback = window.__kioskContent.defaultId();
    if (!fallback || window.__kioskContent.current() === fallback) return false;
    window.__kioskContent.show(fallback, { push: false });
    return true;
  }
```

In `playIdleAttract()`:

```js
  function playIdleAttract() {
    if (attractShowing) return;

    precacheAllDestinations();

    const contentJustNavigated = resetContentToDefault();

    if (idleVideoSrc && typeof window.__kioskPlaySrc === "function") {
      attractShowing = true;
      attractMode = "video";
      document.body.classList.add("kiosk-idle-active");
      window.__kioskPlaySrc(idleVideoSrc, idleVideoTitle, true);
      // Now unattended: flush any section an editor changed while a visitor
      // was reading. The content frame was just reset above only if it
      // moved, and kiosk-live skips the redundant reload in that case.
      if (kioskLive) kioskLive.onAttract({ contentJustNavigated });
      return;
    }

    if (showNewsletterAttract()) {
      attractShowing = true;
      attractMode = "newsletter";
      if (kioskLive) kioskLive.onAttract({ contentJustNavigated });
    }
  }
```

(Keep the existing comments in that function; only the lines shown change.) In `stopIdleAttract()`, after `attractShowing = false;` add `attractMode = null;`.

- [ ] **Step 8: Run every welcome/kiosk JS test**

Run: `node --test tests/js/welcome-*.test.mjs tests/js/kiosk-*.test.mjs`
Expected: all pass. The `welcome-*` harnesses build a stub `window` without `__kioskLiveCreate`, so `kioskLive` is `null` and every new branch is skipped — that is the intended degradation and also why the guard is `typeof === "function"`.

- [ ] **Step 9: Rebuild assets and confirm the entry exists**

```bash
export PATH="$HOME/.nvm/versions/node/v18.20.8/bin:$PATH" && npm run prod
ls storage/compiled/js/kiosk-live.js && grep -c "kiosk-live" mix-manifest.json
```

Expected: the file exists and the manifest lists it.

- [ ] **Step 10: Commit**

```bash
git add app/controllers/kiosk/KioskShellController.py templates/welcome.html resources/js/welcome-screen.js tests/unit/test_kiosk_shell.py mix-manifest.json storage/compiled
git commit -m "feat(kiosk): live editor->kiosk updates over the shell's Pusher socket

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01WEv16U7HtJYrkVHKbftYwV"
```

(Check `git status` for whether `storage/compiled` is tracked in this repo before adding it; if it is gitignored, drop it from the `git add`.)

---

### Task 10: Full verification and manual check

**Files:** none new.

- [ ] **Step 1: Full CI-equivalent run**

Run: `make ci`
Expected: lint clean; pytest — the pre-existing 5 dashboard news-toolbar failures noted in memory may still be present and are not this feature's; everything else passes, including all new tests. JS tests all pass.

Record the exact pass/fail counts in the completion report.

- [ ] **Step 2: Manual end-to-end (two browser windows)**

1. `venv/bin/python craft serve`. Open `http://localhost:8000/kiosk` in one window (DevTools → Application → Service Workers confirms `sw-kiosk.js` is controlling; Console shows no errors).
2. Open the dashboard in a second window and sign in as an admin.
3. **Idle case:** leave the kiosk untouched 30s until the attract screen shows. Approve a story in Review. Expected: within ~1s the kiosk's newsletter attract (or the hidden content frame, if the video attract is up) reloads and shows the story. Confirm in DevTools → Network that `/kiosk/embed/latest-news` was fetched from the network, not `(ServiceWorker)`.
4. **Visitor case:** tap the kiosk so the attract dismisses, open About LSPU, then save an About section from the dashboard. Expected: the kiosk does not move. Wait 30s for attract. Expected: the About frame reloads with the new text once attract appears.
5. **Archives:** upload a PDF. Expected: the kiosk shelf shows the new issue at the next attract (or immediately if idle), and it opens to rendered pages.
6. Kill the network to pusher.com (e.g. block `*.pusher.com` in DevTools) and repeat step 3. Expected: no console noise beyond pusher-js reconnect logs; kiosk still updates on its next manual navigation via SWR.

- [ ] **Step 3: Report**

Summarise: test counts, which manual checks passed, and the follow-up ("Soketi deployment: systemd unit, nginx `/ws`, CSP `connect-src` for own origin, set `PUSHER_HOST`/`PUSHER_PORT`") as a separate task.

---

## Self-review

**Spec coverage.** Signal-only event ✔ (T1). Stamp dedupe ✔ (T8, deviation 3 noted). Best-effort service + `_pusher_configured` absorption ✔ (T1, T2). All ten call-site rows: news ×5 + review ×2 (+ category writes) ✔ T3; About ×8 ✔ T4; archives ×2 with post-prewarm timing ✔ T5. SW `EVICT` with document+media, no `CACHE_NAME` bump ✔ T6. Idle gate, evict-now/reload-later, two frames, video untouched ✔ T8/T9. Failure modes: SW absent → `evictSection` returns; deps throwing → `safe()`; unknown section → ignored at both ends ✔. Transport deployment (Soketi, nginx, CSP) deliberately deferred — deviation 1.

**Placeholders.** T3/T4/T5 tests instruct the implementer to copy arrange/act from named existing tests because those mocks are 30+ lines each and copying them here would drift; each explicitly forbids committing `pass`/`...` stubs.

**Type consistency.** `section_changed(str) -> bool` used identically in T3–T5. `__kioskContent.reload(id) -> boolean` (T7) matches `reloadContent` in T8/T9. `onAttract({contentJustNavigated})` shape identical in T8 tests and T9 wiring. SW section map keys = `KioskBroadcast.SECTIONS` = `kiosk-live.js SECTIONS`.
