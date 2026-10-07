# Story Library: Published Newsletters Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** In the News panel's Story Library drawer, each editor sees the newsletters they published to the kiosk and can preview them, duplicate one as a new draft issue, or print it to a tabloid PDF.

**Architecture:** No schema change. Ownership is `issues.owner_id`; "published" is derived from story statuses as everywhere else (`Issues.VISIBLE_STATUSES`). Queries live in `app/services/Issues.py`, the duplicate workflow and print context in a new `app/services/IssueLibrary.py`, HTTP in a new thin `app/controllers/gears/IssueLibraryController.py`. The drawer gains a second tab fed by a new user-scoped live section `story-library`. Print is a standalone page that includes the kiosk's own `kiosk/_issue.html` plus a tabloid `@page` stylesheet; the browser's Save as PDF produces the file.

**Tech Stack:** Masonite 5 / masonite-orm 3.1 (MySQL), Jinja2, plain IIFE browser JS, laravel-mix (Node 18), pytest, `node --test`.

**Spec:** `docs/superpowers/specs/2026-10-07-story-library-published-newsletters-design.md`

## Global Constraints

- No schema change, no new Python or npm dependency.
- Every new endpoint is `.middleware("auth")` and resolves the issue with `owner_id == signed-in user`; anything else is **404**.
- Never pass a `published_at` key to `Issue.create()` (masonite-orm turns `None` into *now* for `__dates__` columns).
- Duplicated stories: `status = "draft"`, `author_id = updated_by_id = caller`; copied images get **new filenames** (original + `.large.webp` + `.thumb.webp`).
- Every stored path goes through `StorageRouter.is_safe_path()` before it is read, copied or deleted.
- Paper: `@page { size: 11in 17in; margin: 0.5in; }` (tabloid portrait).
- UI: solid/flat colors, no gradients.
- New `resources/js|css` files do nothing until added to `webpack.mix.js`; build under Node 18: `export PATH="$HOME/.nvm/versions/node/v18.20.8/bin:$PATH"`.
- Routes use `@id:int` (Masonite does not preserve route declaration order across boots).
- `.env` is production. Do **not** run `craft migrate`/`seed:run`. Tests read the live MySQL tables but must not depend on rows.
- Comments explain *why*, citing the bug or quirk — match the surrounding register.
- Commit only the files each task names (`git add <paths>`, never `git add -A`).
- **Precondition — clean the shared files first.** At planning time `app/services/DashboardContext.py`, `app/controllers/gears/NewsController.py` and `mix-manifest.json` carry the user's unrelated uncommitted work, and Tasks 2, 3, 5 and 7 edit them. Interactive staging (`git add -p`) is unavailable, so those tasks would sweep that work into feature commits. Before Task 1, run `git status --short`; if any of the three is still modified, **stop and ask the user** to commit or stash their work-in-progress. Do not commit it on their behalf.

## Spec deviations (decided while planning, from reading the code)

1. **Print context lives in `IssueLibrary`, not `DashboardContext`.** The kiosk projects stories through `NewsController._news_item_to_dict` (resolves `.large` WebP variants, `published_label`, category name). Reusing it guarantees print == kiosk, but `NewsController` imports `DashboardContext`, so `DashboardContext` cannot import it back. `IssueLibrary` imports it lazily.
2. **`content` is not copied.** It is not in `News.__fillable__` (the body is `description`), so `News.create()` would drop it silently anyway.
3. **Only the source issue's visible stories are duplicated** — what readers saw. A story an admin rejected after the issue went out is not resurrected.

## Review Focus

1. **A source story whose image file is missing on disk** — duplicate still succeeds; that copy has no image (Task 3 test `test_missing_source_returns_none`, Task 4 test `test_missing_image_copies_without_image`).
2. **The editor double-clicks Duplicate** — the second request sees the first's new draft (with stories) and gets 409 rather than a second copy (Task 4 test `test_second_duplicate_is_blocked_by_the_first`).
3. **A story whose category was soft-deleted since publication** — copy falls back to Uncategorized instead of pointing at a hidden category (Task 4 test `test_deleted_category_falls_back_to_default`).
4. **An issue title containing HTML or quotes** — the library row and print page render it escaped (Task 6 test `test_row_escapes_title`).
5. **Printing an issue published three months ago** — the calendar shows events as of its publish date, not today (Task 5 test `test_calendar_is_as_of_publication`).

---

## File Structure

| File | Responsibility |
|---|---|
| `app/services/Issues.py` (modify) | `is_visible`, `published_local`, `owned_issue`, `published_by`, `library_stamp` |
| `app/services/DashboardContext.py` (modify) | `upcoming_events(as_of=)`, `story_library_context(user_id)` |
| `app/services/ImageDerivatives.py` (modify) | `delete_image_and_variants`, `copy_image_and_variants` |
| `app/controllers/gears/NewsController.py` (modify) | `_delete_image_files` delegates to the above |
| `app/services/IssueLibrary.py` (create) | `duplicate()`, `print_context()`, `library_rows()`, exceptions |
| `app/controllers/gears/IssueLibraryController.py` (create) | `duplicate`, `print_view` HTTP |
| `routes/dashboard.py` (modify) | two routes |
| `app/controllers/gears/DashboardController.py` (modify) | `story-library` in `FRAGMENTS`, `STAMP_MODELS`, user scoping |
| `templates/gears/issue-print.html` (create) | standalone print page |
| `templates/gears/partials/story-library-issues.html` (create) | the Published tab's rows |
| `templates/gears/partials/panel-news.html` (modify) | drawer tabs |
| `templates/gears/dashboard.html` (modify) | load `story-library.js` |
| `resources/css/issue-print.css` (create) | tabloid print rules |
| `resources/js/issue-print.js` (create) | autoprint after fonts/images |
| `resources/js/story-library.js` (create) | tabs + duplicate/confirm |
| `resources/css/news-dashboard.css` (modify) | tab + row styles |
| `webpack.mix.js` (modify) | three entries |
| Tests | `tests/unit/test_issue_library_queries.py`, `test_upcoming_events_as_of.py`, `test_image_copy.py`, `test_issue_library_duplicate.py`, `test_issue_library_print.py`, `test_issue_library_controller.py`, `test_story_library_section.py`, `tests/js/story-library.test.mjs` |

---

### Task 1: Ownership and library queries in `Issues`

**Files:**
- Modify: `app/services/Issues.py` (append after `stamp_for`, refactor `stamp_for` body)
- Test: `tests/unit/test_issue_library_queries.py`

**Interfaces:**
- Produces:
  - `Issues.is_visible(story) -> bool`
  - `Issues.published_local(issue) -> datetime | None` (naive campus-local)
  - `Issues.owned_issue(user_id, issue_id) -> Issue | None`
  - `Issues.published_by(user_id) -> list[Issue]` — each with `.stories` (visible only, id asc), newest first
  - `Issues.library_stamp(user_id) -> str` — `"count:max(updated_at)"`, `"0:"` when none

- [ ] **Step 1: Write the failing tests**

```python
"""Issues' Story Library queries: which newsletters belong to an editor's
library, and the stamp that tells the drawer one of them changed.

published_by() is the whole ownership rule for the Published tab -- an issue
another editor owns must never appear, however public it is."""

from datetime import datetime, timezone
from unittest.mock import Mock, patch

from tests import TestCase

from app.services import Issues


def _issue(id, owner_id=7, published_at=None):
    return Mock(id=id, owner_id=owner_id, published_at=published_at)


def _story(id, issue_id, status):
    return Mock(id=id, issue_id=issue_id, status=status)


class PublishedByTestCase(TestCase):
    def _run(self, issues, stories, user_id=7):
        issue_q = Mock()
        issue_q.get.return_value = issues
        news_q = Mock()
        news_q.order_by.return_value.get.return_value = stories
        with patch.object(Issues.Issue, "where", return_value=issue_q) as iw, \
                patch.object(Issues.News, "where_in", return_value=news_q) as nw:
            result = Issues.published_by(user_id)
        return result, iw, nw

    def test_no_user_is_empty(self):
        self.assertEqual(Issues.published_by(None), [])

    def test_queries_only_the_callers_issues(self):
        _, iw, _ = self._run([], [])
        iw.assert_called_once_with("owner_id", 7)

    def test_only_issues_with_a_visible_story_are_listed(self):
        a, b = _issue(1), _issue(2)
        result, _, nw = self._run(
            [a, b],
            [_story(10, 1, "published"), _story(11, 2, "draft"), _story(12, 2, "review")],
        )
        self.assertEqual([i.id for i in result], [1])
        nw.assert_called_once_with("issue_id", [1, 2])

    def test_stories_are_the_visible_ones_only(self):
        a = _issue(1)
        result, _, _ = self._run(
            [a], [_story(10, 1, "published"), _story(11, 1, "draft"), _story(12, 1, "live")])
        self.assertEqual([s.id for s in result[0].stories], [10, 12])

    def test_newest_publication_first_then_newest_id(self):
        old = _issue(1, published_at=datetime(2026, 9, 1, 9, tzinfo=timezone.utc))
        new = _issue(2, published_at=datetime(2026, 10, 1, 9, tzinfo=timezone.utc))
        undated = _issue(3, published_at=None)
        result, _, _ = self._run(
            [old, new, undated],
            [_story(10, 1, "published"), _story(11, 2, "published"), _story(12, 3, "approved")],
        )
        self.assertEqual([i.id for i in result], [2, 1, 3])


class OwnedIssueTestCase(TestCase):
    def test_filters_on_id_and_owner(self):
        q = Mock()
        q.where.return_value.first.return_value = "row"
        with patch.object(Issues.Issue, "where", return_value=q) as w:
            self.assertEqual(Issues.owned_issue(7, 3), "row")
        w.assert_called_once_with("id", 3)
        q.where.assert_called_once_with("owner_id", 7)

    def test_missing_user_or_id_is_none(self):
        self.assertIsNone(Issues.owned_issue(None, 3))
        self.assertIsNone(Issues.owned_issue(7, None))


class LibraryStampTestCase(TestCase):
    def test_no_owned_issues_is_zero(self):
        q = Mock()
        q.get.return_value = []
        with patch.object(Issues.Issue, "where", return_value=q):
            self.assertEqual(Issues.library_stamp(7), "0:")

    def test_stamps_the_owned_issues_stories(self):
        q = Mock()
        q.get.return_value = [_issue(1), _issue(2)]
        row = Mock(n=3, m="2026-10-07 09:00:00")
        news_q = Mock()
        news_q.select_raw.return_value.first.return_value = row
        with patch.object(Issues.Issue, "where", return_value=q), \
                patch.object(Issues.News, "where_in", return_value=news_q) as nw:
            self.assertEqual(Issues.library_stamp(7), "3:2026-10-07 09:00:00")
        nw.assert_called_once_with("issue_id", [1, 2])
```

- [ ] **Step 2: Run to verify failure**

Run: `venv/bin/python -m pytest tests/unit/test_issue_library_queries.py -q`
Expected: FAIL — `AttributeError: module 'app.services.Issues' has no attribute 'published_by'`

- [ ] **Step 3: Implement**

In `app/services/Issues.py`, replace the body of `stamp_for` so the parsing is shared, then append the new functions:

```python
def _stamp_of(query):
    """`count:max(updated_at)` off a News query -- the shape every stamp uses."""
    try:
        row = query.select_raw("COUNT(*) AS n, MAX(updated_at) AS m").first()
        n = getattr(row, "n", None) if row is not None else None
        m = getattr(row, "m", None) if row is not None else None
        if isinstance(row, dict):
            n, m = row.get("n"), row.get("m")
        return f"{int(n or 0)}:{m or ''}"
    except Exception:
        return "0:"


def stamp_for(issue):
    """`count:max(updated_at)` over THIS issue's stories -- the
    optimistic-concurrency token news.layout checks. Scoped to the issue so
    one editor's writes never read as a conflict to another editor working
    on a different newsletter."""
    issue_id = getattr(issue, "id", issue)
    if not issue_id:
        return "0:"
    return _stamp_of(News.where("issue_id", issue_id))


def is_visible(story):
    """True when `story` is on the kiosk side of the review gate."""
    return normalize_news_status(getattr(story, "status", None)) in VISIBLE_STATUSES


def published_local(issue):
    """The issue's publish moment as naive campus-local time, or None."""
    return _campus_local(getattr(issue, "published_at", None))


def owned_issue(user_id, issue_id):
    """`issue_id` if `user_id` owns it, else None.

    The owner is part of the WHERE, not checked after a plain find(): a guessed
    id then gets the same None (404) as a missing one, so the endpoint cannot
    be used to confirm another editor's issue exists."""
    if not user_id or not issue_id:
        return None
    try:
        return Issue.where("id", issue_id).where("owner_id", user_id).first()
    except Exception:
        return None


def _owned(user_id):
    try:
        return list(Issue.where("owner_id", user_id).get() or [])
    except Exception:
        return []


def _library_sort_key(issue):
    at = published_local(issue)
    return (at is None, -(at.timestamp() if at else 0), -(getattr(issue, "id", 0) or 0))


def published_by(user_id):
    """The Story Library's Published tab: `user_id`'s issues with at least one
    visible story, newest publication first, each with `.stories` set to its
    visible stories (oldest first).

    Two queries, not one per issue: _issues_where_stories() calls stories_of()
    per issue, which is fine for the kiosk's handful of current issues and an
    N+1 across an editor's whole back catalogue."""
    if not user_id:
        return []
    owned = _owned(user_id)
    if not owned:
        return []
    ids = [getattr(i, "id", None) for i in owned]
    try:
        rows = list(News.where_in("issue_id", ids).order_by("id", "asc").get() or [])
    except Exception:
        return []

    by_issue = {}
    for row in rows:
        if is_visible(row):
            by_issue.setdefault(getattr(row, "issue_id", None), []).append(row)

    out = []
    for issue in owned:
        stories = by_issue.get(getattr(issue, "id", None))
        if stories:
            issue.stories = stories
            out.append(issue)
    out.sort(key=_library_sort_key)
    return out


def library_stamp(user_id):
    """Change marker for the Published tab: every story in every issue this
    editor owns. news_stamp is per OPEN issue, so it never moves when an
    admin approves one of this editor's older issues -- this one does."""
    if not user_id:
        return "0:"
    ids = [getattr(i, "id", None) for i in _owned(user_id)]
    if not ids:
        return "0:"
    return _stamp_of(News.where_in("issue_id", ids))
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `venv/bin/python -m pytest tests/unit/test_issue_library_queries.py tests/unit/test_issues_service.py -q`
Expected: PASS (the second file proves the `stamp_for` refactor changed nothing)

- [ ] **Step 5: Commit**

```bash
git add app/services/Issues.py tests/unit/test_issue_library_queries.py
git commit -m "feat(issues): published_by, owned_issue and library_stamp for the Story Library"
```

---

### Task 2: `upcoming_events(as_of=)`

**Files:**
- Modify: `app/services/DashboardContext.py` — `upcoming_events` (around line 413)
- Test: `tests/unit/test_upcoming_events_as_of.py`

**Interfaces:**
- Produces: `DashboardContext.upcoming_events(limit=CALENDAR_LIMIT, as_of=None) -> list[dict]`; `as_of` is a naive local `datetime`, default `datetime.now()`.

- [ ] **Step 1: Write the failing test**

```python
"""A reprint of an old issue must carry the calendar the issue carried, not
today's -- upcoming_events() used to measure only from now."""

from datetime import datetime
from unittest.mock import Mock, patch

from tests import TestCase

from app.services import DashboardContext


class UpcomingEventsAsOfTestCase(TestCase):
    def _cutoff(self, **kwargs):
        chain = Mock()
        chain.where.return_value = chain
        chain.order_by.return_value = chain
        chain.limit.return_value = chain
        chain.get.return_value = []
        with patch.object(DashboardContext.Events, "where", return_value=chain):
            DashboardContext.upcoming_events(**kwargs)
        return chain.where.call_args.args

    def test_as_of_sets_the_cutoff(self):
        self.assertEqual(
            self._cutoff(as_of=datetime(2026, 7, 1, 8, 30)),
            ("event_date", ">=", "2026-07-01 08:30:00"),
        )

    def test_default_is_now(self):
        field, op, value = self._cutoff()
        self.assertEqual((field, op), ("event_date", ">="))
        self.assertEqual(value[:10], datetime.now().strftime("%Y-%m-%d"))
```

- [ ] **Step 2: Run to verify failure**

Run: `venv/bin/python -m pytest tests/unit/test_upcoming_events_as_of.py -q`
Expected: FAIL — `TypeError: upcoming_events() got an unexpected keyword argument 'as_of'`

- [ ] **Step 3: Implement**

Change the signature and the cutoff line, and add a docstring paragraph:

```python
def upcoming_events(limit=CALENDAR_LIMIT, as_of=None):
    """...existing docstring...

    `as_of` (naive campus-local) moves the cutoff: the Story Library's print
    view passes the issue's publish time so a reprint shows the calendar the
    issue carried, not today's.
    """
    cutoff = as_of or datetime.now()
    try:
        rows = (
            Events.where("is_archive", 0)
            .where("event_date", ">=", cutoff.strftime("%Y-%m-%d %H:%M:%S"))
            .order_by("event_date", "asc")
            .limit(limit)
            .get()
        )
```

(Rest of the function unchanged.)

- [ ] **Step 4: Run tests**

Run: `venv/bin/python -m pytest tests/unit/test_upcoming_events_as_of.py tests/unit/test_dashboard_context_keys.py -q`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add app/services/DashboardContext.py tests/unit/test_upcoming_events_as_of.py
git commit -m "feat(calendar): upcoming_events takes an as_of cutoff"
```

---

### Task 3: Image copy/delete helpers

**Files:**
- Modify: `app/services/ImageDerivatives.py` (append; add `import shutil`, `import uuid`, `from app.services.StorageRouter import absolute_path, is_safe_path`)
- Modify: `app/controllers/gears/NewsController.py:232-246` (`_delete_image_files` delegates)
- Test: `tests/unit/test_image_copy.py`

**Interfaces:**
- Produces:
  - `ImageDerivatives.copy_image_and_variants(stored_path) -> str | None` — new relative path in the same folder, or None when unsafe/missing
  - `ImageDerivatives.delete_image_and_variants(stored_path) -> None`

- [ ] **Step 1: Write the failing tests**

```python
"""Duplicating a story must give it its OWN image files: NewsController
deletes the old file and its derivatives when an image is replaced, so a
shared path would let an edit to the copy destroy the published original's
photograph."""

import os
import tempfile
from unittest.mock import patch

from tests import TestCase

from app.services import ImageDerivatives as D


class ImageCopyTestCase(TestCase):
    def setUp(self):
        super().setUp()
        self.root = tempfile.mkdtemp()
        os.makedirs(os.path.join(self.root, "news"))
        self._p = [
            patch.object(D, "absolute_path", lambda rel: os.path.join(self.root, rel)),
            patch.object(D, "is_safe_path", lambda rel: ".." not in str(rel)),
        ]
        for p in self._p:
            p.start()

    def tearDown(self):
        for p in self._p:
            p.stop()
        super().tearDown()

    def _write(self, rel, data=b"x"):
        with open(os.path.join(self.root, rel), "wb") as fh:
            fh.write(data)

    def test_copies_original_and_both_variants_under_a_new_name(self):
        self._write("news/a.jpg", b"orig")
        self._write("news/a.large.webp", b"L")
        self._write("news/a.thumb.webp", b"T")
        new = D.copy_image_and_variants("news/a.jpg")
        self.assertTrue(new.startswith("news/") and new.endswith(".jpg"))
        self.assertNotEqual(new, "news/a.jpg")
        stem = new[:-4]
        for rel, data in ((new, b"orig"), (stem + ".large.webp", b"L"), (stem + ".thumb.webp", b"T")):
            with open(os.path.join(self.root, rel), "rb") as fh:
                self.assertEqual(fh.read(), data)
        self.assertTrue(os.path.isfile(os.path.join(self.root, "news/a.jpg")))

    def test_missing_variants_are_skipped(self):
        self._write("news/b.png")
        new = D.copy_image_and_variants("news/b.png")
        self.assertTrue(os.path.isfile(os.path.join(self.root, new)))

    def test_missing_source_returns_none(self):
        self.assertIsNone(D.copy_image_and_variants("news/gone.jpg"))

    def test_unsafe_or_empty_path_returns_none(self):
        self.assertIsNone(D.copy_image_and_variants("../etc/passwd"))
        self.assertIsNone(D.copy_image_and_variants(None))

    def test_delete_removes_original_and_variants(self):
        for rel in ("news/c.jpg", "news/c.large.webp", "news/c.thumb.webp"):
            self._write(rel)
        D.delete_image_and_variants("news/c.jpg")
        self.assertEqual(os.listdir(os.path.join(self.root, "news")), [])
```

- [ ] **Step 2: Run to verify failure**

Run: `venv/bin/python -m pytest tests/unit/test_image_copy.py -q`
Expected: FAIL — `AttributeError: ... has no attribute 'absolute_path'`

- [ ] **Step 3: Implement**

Append to `app/services/ImageDerivatives.py`:

```python
def delete_image_and_variants(stored_path):
    """Remove an uploaded news image and its .large/.thumb derivatives, safely.

    Moved here from NewsController so the Story Library's duplicate can undo
    its own copies with the same rule the controller uses on replace."""
    if not stored_path:
        return
    for relative_path in [stored_path] + [
        variant_relpath(stored_path, variant) for variant, _edge in VARIANTS
    ]:
        try:
            full_path = absolute_path(relative_path)
            if is_safe_path(relative_path) and os.path.isfile(full_path):
                os.remove(full_path)
        except OSError:
            pass


def copy_image_and_variants(stored_path):
    """Copy an image and whichever derivatives exist to a fresh name in the
    same folder. Returns the new relative path, or None when there is nothing
    safe to copy -- a duplicate then simply has no photograph.

    Files are copied, not shared, because a replaced image is deleted along
    with its derivatives (delete_image_and_variants): two stories pointing at
    one file would let an edit to one delete the other's picture."""
    if not stored_path or not is_safe_path(stored_path):
        return None
    source = absolute_path(stored_path)
    if not os.path.isfile(source):
        return None

    normalized = str(stored_path).replace("\\", "/")
    folder, name = os.path.split(normalized)
    _root, ext = os.path.splitext(name)
    fresh = f"{uuid.uuid4().hex}{ext}"
    new_path = f"{folder}/{fresh}" if folder else fresh
    if not is_safe_path(new_path):
        return None

    shutil.copy2(source, absolute_path(new_path))
    for variant, _edge in VARIANTS:
        variant_source = absolute_path(variant_relpath(normalized, variant))
        if os.path.isfile(variant_source):
            shutil.copy2(variant_source, absolute_path(variant_relpath(new_path, variant)))
    return new_path
```

In `NewsController.py`, replace `_delete_image_files`'s body:

```python
def _delete_image_files(image_path):
    """Remove an uploaded news image and its .large/.thumb derivatives, safely."""
    delete_image_and_variants(image_path)
```

and extend its import: `from app.services.ImageDerivatives import delete_image_and_variants, generate_variants, variant_path, variant_relpath`. Leave `absolute_path, is_safe_path` imported only if still used elsewhere in the file (`grep -n "absolute_path\|is_safe_path" app/controllers/gears/NewsController.py`); flake8 will flag an unused one.

- [ ] **Step 4: Run tests**

Run: `venv/bin/python -m pytest tests/unit/test_image_copy.py tests/unit/test_news_endpoints.py -q && make lint`
Expected: PASS, lint clean

- [ ] **Step 5: Commit**

```bash
git add app/services/ImageDerivatives.py app/controllers/gears/NewsController.py tests/unit/test_image_copy.py
git commit -m "refactor(images): copy/delete helpers shared by NewsController and the Story Library"
```

---

### Task 4: `IssueLibrary.duplicate()`

**Files:**
- Create: `app/services/IssueLibrary.py`
- Test: `tests/unit/test_issue_library_duplicate.py`

**Interfaces:**
- Consumes: `Issues.owned_issue`, `Issues.is_visible`, `Issues.stories_of`, `Issues.current_for`, `Issues.next_number` (Task 1 / existing); `ImageDerivatives.copy_image_and_variants`, `delete_image_and_variants` (Task 3); `NewsCategories.names_by_id`, `NewsCategories.default_category_id`.
- Produces:
  - `IssueLibrary.NotFound`, `IssueLibrary.NotPublished`, `IssueLibrary.DraftInProgress(story_count)` (attr `.story_count`)
  - `IssueLibrary.COPIED_FIELDS: tuple[str, ...]`
  - `IssueLibrary.duplicate(user_id, issue_id, discard=False) -> {"issue_id": int, "number": int, "story_count": int}`

- [ ] **Step 1: Write the failing tests**

```python
"""IssueLibrary.duplicate(): a published newsletter becomes a new draft issue
with the same layout, owned and authored by the caller."""

from contextlib import contextmanager
from unittest.mock import Mock, patch

from tests import TestCase

from app.services import IssueLibrary as L


def _story(id, status="published", **over):
    base = dict(
        id=id, status=status, issue_id=1, title=f"T{id}", description="<p>b</p>",
        dek="d", excerpt="e", source="PIO", location="Gym", category_id=4,
        layout_type="brief", priority=id, headline_font=None, image_caption="c",
        image_credit="cr", image=None, author_id=99, rejection_reason="old",
    )
    base.update(over)
    return Mock(**base)


@contextmanager
def _no_tx():
    yield


class DuplicateTestCase(TestCase):
    def setUp(self):
        super().setUp()
        self.source = Mock(id=1, title="Week 1", owner_id=7)
        self.created_issue = Mock(id=50, number=12)
        self.stories = [_story(10, layout_type="lead"), _story(11)]
        self.current = None
        self.current_stories = []
        self.created_news = []

        def stories_of(issue):
            return self.current_stories if issue is self.current else self.stories

        patches = [
            patch.object(L.Issues, "owned_issue", side_effect=lambda u, i: self.source if (u, i) == (7, 1) else None),
            patch.object(L.Issues, "stories_of", side_effect=stories_of),
            patch.object(L.Issues, "current_for", side_effect=lambda u: self.current),
            patch.object(L.Issues, "next_number", return_value=12),
            patch.object(L.Issue, "create", return_value=self.created_issue),
            patch.object(L.News, "create", side_effect=lambda data: self.created_news.append(data) or Mock()),
            patch.object(L.NewsCategories, "names_by_id", return_value={4: "Campus"}),
            patch.object(L.NewsCategories, "default_category_id", return_value=1),
            patch.object(L.DB, "transaction", _no_tx),
        ]
        self.mocks = [p.start() for p in patches]
        self._patches = patches

    def tearDown(self):
        for p in self._patches:
            p.stop()
        super().tearDown()

    def test_not_mine_is_not_found(self):
        with self.assertRaises(L.NotFound):
            L.duplicate(8, 1)

    def test_unpublished_source_is_refused(self):
        self.stories = [_story(10, status="draft")]
        with self.assertRaises(L.NotPublished):
            L.duplicate(7, 1)

    def test_creates_issue_without_published_at(self):
        result = L.duplicate(7, 1)
        L.Issue.create.assert_called_once_with({"number": 12, "owner_id": 7, "title": "Week 1"})
        self.assertEqual(result, {"issue_id": 50, "number": 12, "story_count": 2})

    def test_copies_fields_and_resets_the_rest(self):
        L.duplicate(7, 1)
        first = self.created_news[0]
        for field in L.COPIED_FIELDS:
            self.assertEqual(first[field], getattr(self.stories[0], field), field)
        self.assertEqual(first["status"], "draft")
        self.assertEqual(first["author_id"], 7)
        self.assertEqual(first["updated_by_id"], 7)
        self.assertEqual(first["issue_id"], 50)
        for absent in ("published_at", "rejection_reason", "display_date", "expiration_date", "content"):
            self.assertNotIn(absent, first)

    def test_only_visible_stories_are_copied(self):
        self.stories.append(_story(12, status="draft"))
        L.duplicate(7, 1)
        self.assertEqual([d["title"] for d in self.created_news], ["T10", "T11"])

    def test_draft_with_stories_blocks(self):
        self.current = Mock(id=40)
        self.current_stories = [Mock(), Mock(), Mock()]
        with self.assertRaises(L.DraftInProgress) as caught:
            L.duplicate(7, 1)
        self.assertEqual(caught.exception.story_count, 3)
        L.Issue.create.assert_not_called()

    def test_second_duplicate_is_blocked_by_the_first(self):
        L.duplicate(7, 1)
        self.current = self.created_issue
        self.current_stories = [Mock(), Mock()]
        with self.assertRaises(L.DraftInProgress):
            L.duplicate(7, 1)

    def test_discard_soft_deletes_the_draft_then_duplicates(self):
        self.current = Mock(id=40)
        old = [Mock(), Mock()]
        self.current_stories = old
        L.duplicate(7, 1, discard=True)
        for s in old:
            s.delete.assert_called_once_with()
        self.current.delete.assert_called_once_with()
        L.Issue.create.assert_called_once()

    def test_empty_draft_is_reused(self):
        self.current = Mock(id=40, number=9, title=None)
        result = L.duplicate(7, 1)
        L.Issue.create.assert_not_called()
        self.assertEqual(self.current.title, "Week 1")
        self.current.save.assert_called_once_with()
        self.assertEqual(result["issue_id"], 40)
        self.assertTrue(all(d["issue_id"] == 40 for d in self.created_news))

    def test_images_are_copied_to_new_paths(self):
        self.stories[0].image = "news/a.jpg"
        with patch.object(L, "copy_image_and_variants", return_value="news/new.jpg") as cp:
            L.duplicate(7, 1)
        cp.assert_called_once_with("news/a.jpg")
        self.assertEqual(self.created_news[0]["image"], "news/new.jpg")
        self.assertIsNone(self.created_news[1]["image"])

    def test_missing_image_copies_without_image(self):
        self.stories[0].image = "news/gone.jpg"
        with patch.object(L, "copy_image_and_variants", return_value=None):
            L.duplicate(7, 1)
        self.assertIsNone(self.created_news[0]["image"])

    def test_db_failure_removes_copied_images(self):
        self.stories[0].image = "news/a.jpg"
        L.News.create.side_effect = RuntimeError("db down")
        with patch.object(L, "copy_image_and_variants", return_value="news/new.jpg"), \
                patch.object(L, "delete_image_and_variants") as rm:
            with self.assertRaises(RuntimeError):
                L.duplicate(7, 1)
        rm.assert_called_once_with("news/new.jpg")

    def test_deleted_category_falls_back_to_default(self):
        self.stories[1].category_id = 99
        L.duplicate(7, 1)
        self.assertEqual(self.created_news[1]["category_id"], 1)
```

- [ ] **Step 2: Run to verify failure**

Run: `venv/bin/python -m pytest tests/unit/test_issue_library_duplicate.py -q`
Expected: FAIL — `ModuleNotFoundError: No module named 'app.services.IssueLibrary'`

- [ ] **Step 3: Implement** `app/services/IssueLibrary.py`

```python
"""The Story Library's Published tab: an editor's own past newsletters, and
what can be done with one -- duplicate it as a new draft, or print it.

Ownership is issues.owner_id and "published" is derived from story statuses,
both exactly as the composer and kiosk already define them; nothing here adds
a column or a second notion of either.
"""

from config.database import DB

from app.models.Issue import Issue
from app.models.News import News
from app.services import Issues, NewsCategories
from app.services.ImageDerivatives import copy_image_and_variants, delete_image_and_variants


class NotFound(Exception):
    """Not the caller's issue, or no such issue -- deliberately the same."""


class NotPublished(Exception):
    """The caller's issue has nothing on the kiosk side of the review gate."""


class DraftInProgress(Exception):
    """The caller already has an open issue with stories in it."""

    def __init__(self, story_count):
        super().__init__(f"open draft has {story_count} stories")
        self.story_count = story_count


#: Carried over verbatim. NOT `content`: it is not in News.__fillable__ (the
#: body is `description`), so create() would drop it silently anyway.
COPIED_FIELDS = (
    "title", "description", "dek", "excerpt", "source", "location",
    "category_id", "layout_type", "priority", "headline_font",
    "image_caption", "image_credit",
)


def _source(user_id, issue_id):
    issue = Issues.owned_issue(user_id, issue_id)
    if issue is None:
        raise NotFound()
    stories = [s for s in Issues.stories_of(issue) if Issues.is_visible(s)]
    if not stories:
        raise NotPublished()
    return issue, stories


def _target_issue(user_id, discard):
    """The open issue to fill, or None to create one.

    Issues.current_for() treats the editor's newest unpublished issue as THE
    composer canvas, so a second one with stories would hide the first until
    the duplicate published. An empty open issue is reused instead of
    creating another, which would burn a number and leave a gap in No."""
    current = Issues.current_for(user_id)
    if current is None:
        return None
    existing = Issues.stories_of(current)
    if not existing:
        return current
    if not discard:
        raise DraftInProgress(len(existing))
    # Soft deletes, like NewsController.destroy: files stay, rows restorable.
    for story in existing:
        story.delete()
    current.delete()
    return None


def duplicate(user_id, issue_id, discard=False):
    source, stories = _source(user_id, issue_id)
    target = _target_issue(user_id, discard)

    live_categories = NewsCategories.names_by_id()
    fallback_category = NewsCategories.default_category_id()

    # Files before the transaction: a copy cannot be rolled back, and NAS I/O
    # does not belong inside an open MySQL transaction. On failure below, the
    # copies are deleted instead.
    images = {
        getattr(s, "id", None): copy_image_and_variants(getattr(s, "image", None))
        for s in stories
    }

    try:
        with DB.transaction():
            if target is None:
                # No `published_at` key: it is a __dates__ column and the ORM
                # turns None into now (see Issues.ensure_current_for).
                target = Issue.create({
                    "number": Issues.next_number(),
                    "owner_id": user_id,
                    "title": getattr(source, "title", None),
                })
            else:
                target.title = getattr(source, "title", None)
                target.save()

            for story in stories:
                data = {field: getattr(story, field, None) for field in COPIED_FIELDS}
                if data["category_id"] not in live_categories:
                    # Pointing a copy at a soft-deleted category blanks its
                    # kiosk label and hides it from the category modal.
                    data["category_id"] = fallback_category
                data.update({
                    "image": images.get(getattr(story, "id", None)),
                    "status": "draft",
                    "author_id": user_id,
                    "updated_by_id": user_id,
                    "issue_id": getattr(target, "id", None),
                })
                News.create(data)
    except Exception:
        for path in images.values():
            if path:
                delete_image_and_variants(path)
        raise

    return {
        "issue_id": getattr(target, "id", None),
        "number": int(getattr(target, "number", 0) or 0),
        "story_count": len(stories),
    }
```

- [ ] **Step 4: Run tests**

Run: `venv/bin/python -m pytest tests/unit/test_issue_library_duplicate.py -q`
Expected: PASS (13 tests)

- [ ] **Step 5: Commit**

```bash
git add app/services/IssueLibrary.py tests/unit/test_issue_library_duplicate.py
git commit -m "feat(story-library): duplicate a published newsletter as a new draft issue"
```

---

### Task 5: Print context, print page, tabloid stylesheet

**Files:**
- Modify: `app/services/IssueLibrary.py` (append `print_context`)
- Create: `templates/gears/issue-print.html`, `resources/css/issue-print.css`, `resources/js/issue-print.js`
- Modify: `webpack.mix.js` (two entries)
- Test: `tests/unit/test_issue_library_print.py`

**Interfaces:**
- Consumes: `Issues.published_local`, `Issues.is_visible` (Task 1); `upcoming_events(as_of=)` (Task 2); `NewsController._news_item_to_dict(item, disk, category_names)`; `group_news_slots`, `issue_identity_of`, `BLOCK_TYPES`.
- Produces: `IssueLibrary.print_context(issue, autoprint=False) -> dict` with keys `blocks, news_editor, calendar_events, issue_vol, issue_no, issue_title, issue_published_label, autoprint`.

- [ ] **Step 1: Write the failing tests**

```python
"""The print view renders a past issue through the kiosk's own template, with
the calendar as the issue carried it."""

from datetime import datetime, timezone
from unittest.mock import Mock, patch

from tests import TestCase

from app.services import IssueLibrary as L


def _story(id, status, layout_type="brief"):
    return Mock(id=id, status=status, layout_type=layout_type, priority=id, image=None,
                published_at=None, created_at=None, category_id=None, title=f"T{id}",
                description="<p>body</p>", excerpt="", dek="", source="", location="",
                image_caption="", image_credit="", headline_font=None)


class PrintContextTestCase(TestCase):
    def _context(self, stories, published_at=datetime(2026, 7, 1, 1, 0, tzinfo=timezone.utc)):
        issue = Mock(id=3, number=12, title="Week <1>", published_at=published_at,
                     created_at=published_at)
        with patch.object(L.Issues, "stories_of", return_value=stories), \
                patch.object(L, "upcoming_events", return_value=[]) as ev:
            ctx = L.print_context(issue)
        return ctx, ev

    def test_only_visible_stories_are_printed(self):
        ctx, _ = self._context([_story(1, "published", "lead"), _story(2, "draft")])
        ids = [row["id"] for rows in ctx["blocks"].values() for row in rows]
        self.assertEqual(ids, [1])

    def test_calendar_is_as_of_publication(self):
        _, ev = self._context([_story(1, "published", "lead")])
        # 01:00 UTC is 09:00 in Manila.
        ev.assert_called_once_with(as_of=datetime(2026, 7, 1, 9, 0))

    def test_identity_and_label(self):
        ctx, _ = self._context([_story(1, "published", "lead")])
        self.assertEqual(ctx["issue_no"], 12)
        self.assertEqual(ctx["issue_title"], "Week <1>")
        self.assertEqual(ctx["issue_published_label"], "Jul 01, 2026")
        self.assertFalse(ctx["news_editor"])


class PrintTemplateTestCase(TestCase):
    def _render(self, **extra):
        from wsgi import application

        ctx = {
            "blocks": {}, "news_editor": False, "calendar_events": [],
            "issue_vol": 1, "issue_no": 12, "issue_title": "Week <1>",
            "issue_published_label": "Jul 01, 2026", "autoprint": False,
        }
        ctx.update(extra)
        return application.make("view").render("gears.issue-print", ctx).rendered_template

    def test_links_the_print_stylesheet_and_escapes_title(self):
        html = self._render()
        self.assertIn("css/issue-print.css", html)
        self.assertIn("Week &lt;1&gt;", html)
        self.assertNotIn("Week <1>", html)

    def test_autoprint_flag_reaches_the_page(self):
        self.assertIn('data-autoprint="1"', self._render(autoprint=True))
        self.assertIn('data-autoprint="0"', self._render(autoprint=False))
```

- [ ] **Step 2: Run to verify failure**

Run: `venv/bin/python -m pytest tests/unit/test_issue_library_print.py -q`
Expected: FAIL — `AttributeError: module 'app.services.IssueLibrary' has no attribute 'print_context'`

- [ ] **Step 3: Implement `print_context`** — append to `app/services/IssueLibrary.py` (and add `from app.services.DashboardContext import BLOCK_TYPES, group_news_slots, issue_identity_of, upcoming_events` at the top; `DashboardContext` imports `Issues` lazily, so this is not a cycle):

```python
def print_context(issue, autoprint=False):
    """Context for templates/gears/issue-print.html, which includes the
    kiosk's own kiosk/_issue.html -- no second renderer.

    Stories are projected through NewsController._news_item_to_dict, the
    kiosk's projection (WebP variants, published_label, category name), so a
    print cannot differ from what readers saw. Imported here, not at module
    top: NewsController imports DashboardContext, which must not import back.
    """
    from masonite.facades import Storage as StorageFacade

    from app.controllers.gears.NewsController import _news_item_to_dict

    try:
        disk = StorageFacade.disk("public")
    except Exception:
        disk = None
    names = NewsCategories.names_by_id()

    stories = [s for s in Issues.stories_of(issue) if Issues.is_visible(s)]
    slots = group_news_slots(stories)
    published = Issues.published_local(issue)

    return {
        "blocks": {
            block: [_news_item_to_dict(item, disk, names) for item in slots[block]]
            for block in BLOCK_TYPES
        },
        "news_editor": False,
        # As of publication: a reprint months later must not show today's events.
        "calendar_events": upcoming_events(as_of=published) if published else [],
        **issue_identity_of(issue),
        "issue_title": getattr(issue, "title", None) or "",
        "issue_published_label": published.strftime("%b %d, %Y") if published else None,
        "autoprint": bool(autoprint),
    }
```

- [ ] **Step 4: Create `templates/gears/issue-print.html`**

```html
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>{{ issue_title or ('Issue %02d' % issue_no if issue_no else 'Newsletter') }} | The Gears</title>
  <link rel="icon" href="{{ site_logo() }}">
  {# The same three sheets kiosk/news.html links for the issue; the headline
     face (--nl-playfair) is declared in newsletter-type.css, not the tokens. #}
  <link rel="stylesheet" href="{{ asset_url('css/kiosk-tokens.css') }}" />
  <link rel="stylesheet" href="{{ asset_url('css/kiosk-news.css') }}" />
  <link rel="stylesheet" href="{{ asset_url('css/newsletter-type.css') }}" />
  <link rel="stylesheet" href="{{ asset_url('css/issue-print.css') }}" />
</head>
<body class="newspaper-bg issue-print" data-autoprint="{{ '1' if autoprint else '0' }}">
  <p class="issue-print__hint">Tabloid (11 × 17 in). Use your browser's Print → Save as PDF.</p>
{% include "kiosk/_issue.html" %}
  <script src="{{ asset_url('js/issue-print.js') }}" defer></script>
</body>
</html>
```

- [ ] **Step 5: Create `resources/css/issue-print.css`**

```css
/* Story Library print view: a published issue on tabloid paper.

   The page renders kiosk/_issue.html unchanged; everything here only
   adapts that kiosk layout to paper. Solid colors only. */

@page {
  size: 11in 17in;
  margin: 0.5in;
}

.issue-print {
  /* Browsers drop backgrounds when printing unless told otherwise, which
     would print the masthead bands as white boxes. */
  -webkit-print-color-adjust: exact;
  print-color-adjust: exact;
}

.issue-print__hint {
  font: 14px/1.4 system-ui, sans-serif;
  margin: 12px auto;
  max-width: 10in;
  padding: 8px 12px;
  background: #fff4d6;
  color: #3b2f00;
  border: 1px solid #e0c56e;
}

.issue-print .paper-container {
  max-width: 10in;
  margin: 0 auto;
}

/* kiosk-news.js clamps the lead body and offers a reader overlay; neither
   exists on paper, so print the lead in full and drop the dead button. */
.issue-print .feature-story__copy,
.issue-print .feature-story__copy.is-clamped {
  max-height: none;
  overflow: visible;
}

.issue-print .feature-story__more {
  display: none;
}

@media print {
  .issue-print__hint {
    display: none;
  }

  /* A headline stranded at the foot of a page with its body overleaf. */
  .issue-print .feature-story,
  .issue-print .secondary-story,
  .issue-print .issue-editorial,
  .issue-print .issue-quote,
  .issue-print .issue-notice,
  .issue-print figure {
    break-inside: avoid;
  }

  .issue-print .issue-band {
    break-after: avoid;
  }
}
```

- [ ] **Step 6: Create `resources/js/issue-print.js`**

```js
/*
 * Story Library print view: ?autoprint=1 opens the print dialog once the
 * page is actually ready. window.print() snapshots the page as it stands, so
 * firing on `load` alone can still capture fallback fonts or blank image
 * boxes -- the PDF would differ from the kiosk.
 */
(function () {
  if (document.body.getAttribute('data-autoprint') !== '1') return;

  function settled(img) {
    if (img.complete) return Promise.resolve();
    return new Promise(function (resolve) {
      img.addEventListener('load', resolve, { once: true });
      img.addEventListener('error', resolve, { once: true });
    });
  }

  var fonts = document.fonts && document.fonts.ready ? document.fonts.ready : Promise.resolve();
  var images = Array.prototype.map.call(document.images, settled);

  Promise.all([fonts].concat(images)).then(function () {
    window.print();
  });
})();
```

- [ ] **Step 7: Add mix entries** in `webpack.mix.js` — after the `news-dashboard.js` line add `.js('resources/js/issue-print.js', 'storage/compiled/js')`, and after the `newsletter-type.css` `postCss(...)` block add the same shape for `resources/css/issue-print.css` (copy the neighbouring block's plugin list verbatim).

- [ ] **Step 8: Run tests and build**

```bash
venv/bin/python -m pytest tests/unit/test_issue_library_print.py -q
export PATH="$HOME/.nvm/versions/node/v18.20.8/bin:$PATH" && npm run prod
ls storage/compiled/css/issue-print.css storage/compiled/js/issue-print.js
```
Expected: PASS; build succeeds; both files exist.

- [ ] **Step 9: Commit**

```bash
git add app/services/IssueLibrary.py templates/gears/issue-print.html resources/css/issue-print.css \
  resources/js/issue-print.js webpack.mix.js mix-manifest.json tests/unit/test_issue_library_print.py
git commit -m "feat(story-library): tabloid print view through the kiosk's issue template"
```

---

### Task 6: Controller and routes

**Files:**
- Create: `app/controllers/gears/IssueLibraryController.py`
- Modify: `routes/dashboard.py` (after the `news.destroy` route)
- Test: `tests/unit/test_issue_library_controller.py`

**Interfaces:**
- Consumes: `IssueLibrary.duplicate`, `NotFound`, `NotPublished`, `DraftInProgress`, `print_context` (Tasks 4–5); `Issues.owned_issue`, `Issues.is_visible`, `Issues.stories_of`.
- Produces: routes `issues.duplicate` (`POST /gears/issues/@id:int/duplicate`), `issues.print` (`GET /gears/issues/@id:int/print`). 409 body: `{"ok": false, "needs_confirm": true, "draft_story_count": N, "errors": [...]}`.

- [ ] **Step 1: Write the failing tests**

```python
"""HTTP surface of the Story Library's Published tab."""

from unittest.mock import Mock, patch

from tests import TestCase

from app.controllers.gears import IssueLibraryController as C


def _request(user_id=7, issue_id="3", inputs=None, ajax=True):
    inputs = inputs or {}
    request = Mock()
    request.user.return_value = Mock(id=user_id) if user_id else None
    request.param.side_effect = lambda key, default="": issue_id if key == "id" else default
    request.input.side_effect = lambda key, default="": inputs.get(key, default)
    request.header.side_effect = lambda name: "XMLHttpRequest" if (ajax and name == "X-Requested-With") else None
    return request


class DuplicateEndpointTestCase(TestCase):
    def _call(self, side_effect=None, result=None, **kw):
        response = Mock()
        with patch.object(C.IssueLibrary, "duplicate", side_effect=side_effect, return_value=result) as dup:
            C.IssueLibraryController().duplicate(_request(**kw), response)
        return response, dup

    def test_success(self):
        response, dup = self._call(result={"issue_id": 50, "number": 12, "story_count": 2})
        dup.assert_called_once_with(7, 3, discard=False)
        body = response.json.call_args.args[0]
        self.assertTrue(body["ok"])
        self.assertEqual(body["issue_id"], 50)

    def test_discard_flag(self):
        _, dup = self._call(result={"issue_id": 1, "number": 1, "story_count": 1}, inputs={"discard": "1"})
        dup.assert_called_once_with(7, 3, discard=True)

    def test_not_found_is_404(self):
        response, _ = self._call(side_effect=C.IssueLibrary.NotFound())
        self.assertEqual(response.json.call_args.kwargs["status"], 404)

    def test_not_published_is_422(self):
        response, _ = self._call(side_effect=C.IssueLibrary.NotPublished())
        self.assertEqual(response.json.call_args.kwargs["status"], 422)

    def test_draft_in_progress_is_409_with_count(self):
        response, _ = self._call(side_effect=C.IssueLibrary.DraftInProgress(3))
        body = response.json.call_args.args[0]
        self.assertEqual(response.json.call_args.kwargs["status"], 409)
        self.assertTrue(body["needs_confirm"])
        self.assertEqual(body["draft_story_count"], 3)

    def test_unexpected_failure_is_500(self):
        response, _ = self._call(side_effect=RuntimeError("boom"))
        self.assertEqual(response.json.call_args.kwargs["status"], 500)

    def test_non_numeric_id_is_404(self):
        response, dup = self._call(issue_id="abc")
        dup.assert_not_called()
        self.assertEqual(response.json.call_args.kwargs["status"], 404)


class PrintEndpointTestCase(TestCase):
    def test_not_owned_is_404(self):
        response, view = Mock(), Mock()
        with patch.object(C.Issues, "owned_issue", return_value=None):
            C.IssueLibraryController().print_view(view, _request(), response)
        response.view.assert_called_once_with("Not found", status=404)
        view.render.assert_not_called()

    def test_unpublished_is_404(self):
        response, view = Mock(), Mock()
        with patch.object(C.Issues, "owned_issue", return_value=Mock()), \
                patch.object(C.Issues, "stories_of", return_value=[Mock(status="draft")]):
            C.IssueLibraryController().print_view(view, _request(), response)
        response.view.assert_called_once_with("Not found", status=404)

    def test_renders_with_autoprint(self):
        response, view = Mock(), Mock()
        issue = Mock()
        with patch.object(C.Issues, "owned_issue", return_value=issue), \
                patch.object(C.Issues, "stories_of", return_value=[Mock(status="published")]), \
                patch.object(C.IssueLibrary, "print_context", return_value={"k": 1}) as pc:
            C.IssueLibraryController().print_view(view, _request(inputs={"autoprint": "1"}), response)
        pc.assert_called_once_with(issue, autoprint=True)
        view.render.assert_called_once_with("gears/issue-print", {"k": 1})
```

- [ ] **Step 2: Run to verify failure**

Run: `venv/bin/python -m pytest tests/unit/test_issue_library_controller.py -q`
Expected: FAIL — `ImportError: cannot import name 'IssueLibraryController'`

- [ ] **Step 3: Implement** `app/controllers/gears/IssueLibraryController.py`

```python
"""Story Library, Published tab: duplicate or print one of the signed-in
editor's own past newsletters. Thin -- the rules live in IssueLibrary."""

import traceback

from masonite.controllers import Controller
from masonite.request import Request
from masonite.response import Response
from masonite.views import View

from app.services import IssueLibrary, Issues
from app.services.AjaxResponses import json_errors, json_success, wants_json


def _user_id(request):
    try:
        user = request.user() if callable(getattr(request, "user", None)) else None
    except Exception:
        return None
    return getattr(user, "id", None) or None


def _issue_id(request):
    try:
        return int(request.param("id"))
    except (TypeError, ValueError):
        return None


def _truthy(value):
    return str(value or "").strip().lower() in ("1", "true", "on", "yes")


class IssueLibraryController(Controller):
    def duplicate(self, request: Request, response: Response):
        is_ajax = wants_json(request)

        def _err(messages, status):
            if is_ajax:
                return json_errors(response, messages, status=status)
            return response.back().with_errors(messages)

        issue_id = _issue_id(request)
        if issue_id is None:
            return _err(["Newsletter not found."], 404)

        try:
            result = IssueLibrary.duplicate(
                _user_id(request), issue_id, discard=_truthy(request.input("discard"))
            )
        except IssueLibrary.NotFound:
            return _err(["Newsletter not found."], 404)
        except IssueLibrary.NotPublished:
            return _err(["Only published newsletters can be duplicated."], 422)
        except IssueLibrary.DraftInProgress as draft:
            message = (
                f"Your current draft has {draft.story_count} "
                f"{'story' if draft.story_count == 1 else 'stories'}."
            )
            if is_ajax:
                # Not json_errors(): the drawer needs the count to word its
                # confirm dialog, and json_errors() carries messages only.
                return response.json({
                    "ok": False,
                    "needs_confirm": True,
                    "draft_story_count": draft.story_count,
                    "errors": [message],
                }, status=409)
            return response.back().with_errors([message + " Publish or discard it first."])
        except Exception as exception:
            traceback.print_exception(type(exception), exception, exception.__traceback__)
            return _err(["Could not duplicate the newsletter. Please try again."], 500)

        message = f"Issue {result['number']:02d} created as a draft."
        if is_ajax:
            return json_success(response, payload=result, messages=[message])
        return response.redirect(name="gears.dashboard", query_params={"page": "news"}).with_success([message])

    def print_view(self, view: View, request: Request, response: Response):
        issue = Issues.owned_issue(_user_id(request), _issue_id(request))
        # Published only: the open draft is printed from the composer, not
        # here, and an unpublished issue gets the same 404 as someone else's.
        if issue is None or not any(Issues.is_visible(s) for s in Issues.stories_of(issue)):
            return response.view("Not found", status=404)
        context = IssueLibrary.print_context(issue, autoprint=_truthy(request.input("autoprint")))
        return view.render("gears/issue-print", context)
```

Add to `routes/dashboard.py` after the `news.destroy` line:

```python
    # Story Library, Published tab. "auth" only: the controller scopes every
    # lookup to issues.owner_id == the caller, so another editor's issue is a 404.
    Route.get("/gears/issues/@id:int/print", "gears.IssueLibraryController@print_view").name("issues.print").middleware("auth"),
    Route.post("/gears/issues/@id:int/duplicate", "gears.IssueLibraryController@duplicate").name("issues.duplicate").middleware("auth"),
```

- [ ] **Step 4: Run tests and route listing**

```bash
venv/bin/python -m pytest tests/unit/test_issue_library_controller.py -q
venv/bin/python craft routes:list | grep issues
```
Expected: PASS; two `issues.*` routes listed.

- [ ] **Step 5: Commit**

```bash
git add app/controllers/gears/IssueLibraryController.py routes/dashboard.py tests/unit/test_issue_library_controller.py
git commit -m "feat(story-library): duplicate and print endpoints, owner-scoped"
```

---

### Task 7: `story-library` live section and rows partial

**Files:**
- Modify: `app/services/IssueLibrary.py` (append `library_rows`)
- Modify: `app/services/DashboardContext.py` (add `story_library_context`, merge into `full_context`)
- Modify: `app/controllers/gears/DashboardController.py` (`FRAGMENTS`, `STAMP_MODELS`, `_USER_SCOPED_SECTIONS`, `_stamp_for`)
- Create: `templates/gears/partials/story-library-issues.html`
- Test: `tests/unit/test_story_library_section.py`

**Interfaces:**
- Consumes: `Issues.published_by`, `Issues.library_stamp`, `Issues.published_local` (Task 1); routes `issues.print`, `issues.duplicate` (Task 6).
- Produces:
  - `IssueLibrary.library_rows(user_id) -> list[dict]` with keys `id, number, vol, title, headline, published_label, story_count`
  - `DashboardContext.story_library_context(user_id=None) -> {"library_issues": list[dict]}`
  - Fragment `story-library` → template `gears/partials/story-library-issues`, rows key `library_issues`
  - Row markup hooks for Task 8: `[data-library-issue]` with `data-library-issue-id`, `data-library-duplicate-url`; buttons `[data-library-duplicate]`; links `[data-library-preview]`, `[data-library-print]`

- [ ] **Step 1: Write the failing tests**

```python
"""The Published tab is its own live section: news_stamp is per OPEN issue
and never moves when an admin approves one of this editor's older issues."""

from datetime import datetime, timezone
from unittest.mock import Mock, patch

from tests import TestCase

from app.controllers.gears import DashboardController as DC
from app.services import DashboardContext, IssueLibrary


class LibraryRowsTestCase(TestCase):
    def test_rows_describe_each_issue(self):
        lead = Mock(layout_type="lead", title="<b>Big</b> news")
        issue = Mock(id=3, number=12, title="", published_at=datetime(2026, 7, 1, 1, tzinfo=timezone.utc),
                     created_at=None, stories=[lead, Mock(layout_type="brief", title="x")])
        with patch.object(IssueLibrary.Issues, "published_by", return_value=[issue]):
            rows = IssueLibrary.library_rows(7)
        self.assertEqual(rows, [{
            "id": 3, "number": 12, "vol": 1, "title": "", "headline": "Big news",
            "published_label": "Jul 01, 2026", "story_count": 2,
        }])


class SectionRegistrationTestCase(TestCase):
    def test_registered_everywhere_a_section_must_be(self):
        self.assertIn("story-library", DC.FRAGMENTS)
        self.assertIn("story-library", DC.STAMP_MODELS)
        self.assertIn("story-library", DC._USER_SCOPED_SECTIONS)

    def test_stamp_is_the_library_stamp(self):
        # _stamp_for imports Issues lazily, so patch it where it lives.
        with patch("app.services.Issues.library_stamp", return_value="4:x") as stamp:
            self.assertEqual(DC.DashboardController._stamp_for("story-library", 7), "4:x")
        stamp.assert_called_once_with(7)

    def test_full_context_carries_library_issues(self):
        with patch.object(DashboardContext, "story_library_context",
                          return_value={"library_issues": ["row"]}):
            ctx = DashboardContext.full_context(user_id=None)
        self.assertEqual(ctx["library_issues"], ["row"])


class PartialTestCase(TestCase):
    def _render(self, rows):
        from wsgi import application

        return application.make("view").render(
            "gears.partials.story-library-issues", {"library_issues": rows}
        ).rendered_template

    def test_row_escapes_title(self):
        html = self._render([{
            "id": 3, "number": 12, "vol": 1, "title": 'Week "<1>"', "headline": "",
            "published_label": "Jul 01, 2026", "story_count": 2,
        }])
        self.assertIn("Week &#34;&lt;1&gt;&#34;", html)
        self.assertIn("/gears/issues/3/print", html)
        self.assertIn("/gears/issues/3/duplicate", html)

    def test_empty_state(self):
        self.assertIn("haven't published a newsletter yet", self._render([]))
```

- [ ] **Step 2: Run to verify failure**

Run: `venv/bin/python -m pytest tests/unit/test_story_library_section.py -q`
Expected: FAIL — `AttributeError: ... has no attribute 'library_rows'`

- [ ] **Step 3: Implement `library_rows`** (append to `IssueLibrary.py`; add `import re` at top):

```python
_TAGS = re.compile(r"<[^>]+>")


def _plain(html):
    """Headlines may carry Quill formatting spans; a row label wants text."""
    return _TAGS.sub("", str(html or "")).strip()


def library_rows(user_id):
    """One dict per published issue for the Published tab. Plain dicts, not
    models: the partial and the live fragment both render from these, and the
    lead headline is worked out once here rather than in Jinja."""
    rows = []
    for issue in Issues.published_by(user_id):
        stories = list(getattr(issue, "stories", []) or [])
        lead = next((s for s in stories if getattr(s, "layout_type", None) == "lead"), None)
        lead = lead or (stories[0] if stories else None)
        published = Issues.published_local(issue)
        identity = issue_identity_of(issue)
        rows.append({
            "id": getattr(issue, "id", None),
            "number": int(getattr(issue, "number", 0) or 0),
            "vol": identity["issue_vol"],
            "title": getattr(issue, "title", None) or "",
            "headline": _plain(getattr(lead, "title", "")) if lead else "",
            "published_label": published.strftime("%b %d, %Y") if published else "",
            "story_count": len(stories),
        })
    return rows
```

- [ ] **Step 4: Implement `story_library_context`** in `DashboardContext.py` (next to `news_categories_context`), and add `context.update(story_library_context(user_id))` in `full_context` directly after `context.update(news_context(user_id))`:

```python
def story_library_context(user_id=None):
    """The Story Library's Published tab: the signed-in editor's own past
    newsletters. Imported lazily -- IssueLibrary imports this module."""
    from app.services import IssueLibrary

    return {"library_issues": IssueLibrary.library_rows(user_id) if user_id else []}
```

- [ ] **Step 5: Register the section** in `DashboardController.py`:

```python
    # Story Library's Published tab. Its own section because news_stamp is per
    # OPEN issue and never moves when an older issue of this editor's is approved.
    "story-library": (
        DashboardContext.story_library_context,
        "gears/partials/story-library-issues",
        "library_issues",
    ),
```

in `FRAGMENTS`; `"story-library": News,  # stamp is user-scoped; see _stamp_for` in `STAMP_MODELS`; `_USER_SCOPED_SECTIONS = {"news", "news-canvas", "story-library"}`; and at the top of `_stamp_for`'s user-scoped branch:

```python
        if section in _USER_SCOPED_SECTIONS:
            from app.services import Issues

            if section == "story-library":
                return Issues.library_stamp(user_id)
            issue = Issues.current_for(user_id) if user_id else None
            return Issues.stamp_for(issue) if issue else "0:"
```

- [ ] **Step 6: Create `templates/gears/partials/story-library-issues.html`**

```html
{# Story Library, Published tab -- the signed-in editor's own past
   newsletters (IssueLibrary.library_rows). Re-rendered as the
   "story-library" live fragment, so it must render from `library_issues`
   alone. The data-library-* hooks are story-library.js's read surface. #}
{% if library_issues %}
<table class="wp-posts-table story-library-issues">
  <thead>
    <tr>
      <th scope="col" class="wp-posts-table__col-title">Newsletter</th>
      <th scope="col">Stories</th>
      <th scope="col">Published</th>
    </tr>
  </thead>
  <tbody>
    {% for issue in library_issues %}
    {% set _print = route('issues.print', {'id': issue.id}, False) %}
    <tr class="wp-posts-table__row" data-library-issue data-library-issue-id="{{ issue.id }}"
        data-library-duplicate-url="{{ route('issues.duplicate', {'id': issue.id}, False) }}">
      <td class="wp-posts-table__title-cell">
        <div class="wp-posts-table__title">Vol. {{ issue.vol or 1 }} &middot; No. {{ '%02d' % issue.number }}{% if issue.title %} &middot; {{ issue.title }}{% endif %}</div>
        {% if issue.headline %}<div class="wp-posts-table__excerpt">{{ issue.headline }}</div>{% endif %}
        <div class="wp-posts-table__actions">
          <a class="wp-row-action" href="{{ _print }}" target="_blank" rel="noopener" data-library-preview>Preview</a>
          <span class="wp-row-action__sep" aria-hidden="true">|</span>
          <button type="button" class="wp-row-action" data-library-duplicate>Duplicate as new draft</button>
          <span class="wp-row-action__sep" aria-hidden="true">|</span>
          <a class="wp-row-action" href="{{ _print }}?autoprint=1" target="_blank" rel="noopener" data-library-print>Print (PDF)</a>
        </div>
      </td>
      <td>{{ issue.story_count }}</td>
      <td class="wp-posts-table__date">{{ issue.published_label or '—' }}</td>
    </tr>
    {% endfor %}
  </tbody>
</table>
{% else %}
<div class="empty-state empty-state--embedded">You haven't published a newsletter yet.</div>
{% endif %}
```

- [ ] **Step 7: Run tests**

Run: `venv/bin/python -m pytest tests/unit/test_story_library_section.py tests/unit/test_dashboard_context_keys.py -q`
Expected: PASS

- [ ] **Step 8: Commit**

```bash
git add app/services/IssueLibrary.py app/services/DashboardContext.py app/controllers/gears/DashboardController.py \
  templates/gears/partials/story-library-issues.html tests/unit/test_story_library_section.py
git commit -m "feat(story-library): Published tab rows as a user-scoped live section"
```

---

### Task 8: Drawer tabs and duplicate flow (UI)

**Files:**
- Modify: `templates/gears/partials/panel-news.html` (drawer, ~line 415–445)
- Create: `resources/js/story-library.js`
- Modify: `templates/gears/dashboard.html` (`js` block), `webpack.mix.js`, `resources/css/news-dashboard.css`
- Test: `tests/js/story-library.test.mjs`

**Interfaces:**
- Consumes: Task 7 row hooks; 409 body from Task 6; `window.ConfirmModal.ask({title, body, confirmLabel, cancelLabel, danger}) -> Promise<boolean>`; CSRF `<meta name="csrf-token">`.
- Produces: tab hooks `[data-library-tab="issue"|"published"]`, panes `[data-library-pane="issue"|"published"]`.

- [ ] **Step 1: Write the failing JS test** `tests/js/story-library.test.mjs`

```js
// Run with: node --test tests/js/
//
// Story Library drawer, Published tab: tabs switch panes, and Duplicate walks
// 409 needs_confirm -> ConfirmModal -> re-post with discard=1. The module is a
// browser IIFE, so it runs here against a hand-rolled DOM stand-in, like
// review-preview-modal.test.mjs.

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import vm from 'node:vm';

const here = dirname(fileURLToPath(import.meta.url));
const SOURCE = readFileSync(join(here, '../../resources/js/story-library.js'), 'utf8');

class El {
  constructor(attrs = {}) {
    this.attrs = { ...attrs };
    this.hidden = false;
    this.listeners = {};
    this.disabled = false;
    this.classList = { set: new Set(), toggle(c, on) { on ? this.set.add(c) : this.set.delete(c); }, contains(c) { return this.set.has(c); } };
  }
  getAttribute(n) { return n in this.attrs ? this.attrs[n] : null; }
  setAttribute(n, v) { this.attrs[n] = String(v); }
  addEventListener(t, fn) { (this.listeners[t] ||= []).push(fn); }
  closest(sel) { return sel === '[data-library-issue]' ? this.row : null; }
  click() { (this.listeners.click || []).forEach((fn) => fn({ target: this, preventDefault() {} })); }
}

function boot({ responses, confirm = true }) {
  const tabIssue = new El({ 'data-library-tab': 'issue' });
  const tabPub = new El({ 'data-library-tab': 'published' });
  const paneIssue = new El({ 'data-library-pane': 'issue' });
  const panePub = new El({ 'data-library-pane': 'published' });
  const row = new El({ 'data-library-duplicate-url': '/gears/issues/3/duplicate' });
  const dup = new El({ 'data-library-duplicate': '' });
  dup.row = row;
  const drawer = new El();
  const calls = [];
  const asked = [];
  let assigned = null;
  const byAll = {
    '[data-library-tab]': [tabIssue, tabPub],
    '[data-library-pane]': [paneIssue, panePub],
  };
  drawer.querySelectorAll = (s) => byAll[s] || [];
  const document = {
    readyState: 'complete',
    querySelector: (s) => (s === '[data-news-library-drawer]' ? drawer
      : s === 'meta[name="csrf-token"]' ? { getAttribute: () => 'tok' } : null),
    addEventListener() {},
  };
  // Delegated click handler on the drawer: route through it.
  const window = {
    location: { assign: (u) => { assigned = u; } },
    ConfirmModal: { ask: (o) => { asked.push(o); return Promise.resolve(confirm); } },
  };
  const fetch = (url, opts) => {
    calls.push({ url, body: opts.body.toString() });
    const r = responses.shift();
    return Promise.resolve({ status: r.status, json: () => Promise.resolve(r.body) });
  };
  vm.runInNewContext(SOURCE, { window, document, fetch, URLSearchParams, Promise, console });
  return {
    tabIssue, tabPub, paneIssue, panePub, dup, drawer, calls, asked,
    get assigned() { return assigned; },
    clickDup: () => (drawer.listeners.click || []).forEach((fn) => fn({ target: dup, preventDefault() {} })),
  };
}

const tick = () => new Promise((r) => setTimeout(r, 0));

test('tabs show one pane at a time', () => {
  const ui = boot({ responses: [] });
  ui.tabPub.click();
  assert.equal(ui.panePub.hidden, false);
  assert.equal(ui.paneIssue.hidden, true);
  assert.equal(ui.tabPub.getAttribute('aria-selected'), 'true');
  ui.tabIssue.click();
  assert.equal(ui.paneIssue.hidden, false);
  assert.equal(ui.panePub.hidden, true);
});

test('a clean duplicate reloads into the composer', async () => {
  const ui = boot({ responses: [{ status: 200, body: { ok: true, issue_id: 50 } }] });
  ui.clickDup();
  await tick(); await tick();
  assert.equal(ui.calls.length, 1);
  assert.doesNotMatch(ui.calls[0].body, /discard/);
  assert.equal(ui.assigned, '/gears/dashboard?page=news');
});

test('409 asks, then re-posts with discard=1', async () => {
  const ui = boot({ responses: [
    { status: 409, body: { ok: false, needs_confirm: true, draft_story_count: 3 } },
    { status: 200, body: { ok: true, issue_id: 51 } },
  ] });
  ui.clickDup();
  for (let i = 0; i < 6; i++) await tick();
  assert.equal(ui.asked.length, 1);
  assert.match(ui.asked[0].body, /3 stories/);
  assert.equal(ui.calls.length, 2);
  assert.match(ui.calls[1].body, /discard=1/);
  assert.equal(ui.assigned, '/gears/dashboard?page=news');
});

test('cancelling the confirm posts nothing more', async () => {
  const ui = boot({ confirm: false, responses: [
    { status: 409, body: { ok: false, needs_confirm: true, draft_story_count: 1 } },
  ] });
  ui.clickDup();
  for (let i = 0; i < 6; i++) await tick();
  assert.equal(ui.calls.length, 1);
  assert.equal(ui.assigned, null);
});
```

- [ ] **Step 2: Run to verify failure**

Run: `export PATH="$HOME/.nvm/versions/node/v18.20.8/bin:$PATH" && node --test tests/js/story-library.test.mjs`
Expected: FAIL — `ENOENT ... resources/js/story-library.js`

- [ ] **Step 3: Implement `resources/js/story-library.js`**

```js
/*
 * Story Library drawer -- the "This issue" / "Published newsletters" tabs and
 * the Published tab's Duplicate action.
 *
 * Separate from news-dashboard.js on purpose: that file is the composer
 * (3,000+ lines), and nothing here touches the canvas. Duplicate ends in a
 * full reload of the news page, which is how the composer picks up a new
 * open issue -- the same outcome as a news.layout 409 forcing a canvas reload.
 *
 * Click handling is delegated on the drawer because the Published pane is a
 * [data-live-target]: a live refresh replaces its rows, and per-row listeners
 * would go with them.
 */
(function () {
  function init() {
    var drawer = document.querySelector('[data-news-library-drawer]');
    if (!drawer) return;

    var tabs = Array.prototype.slice.call(drawer.querySelectorAll('[data-library-tab]'));
    var panes = Array.prototype.slice.call(drawer.querySelectorAll('[data-library-pane]'));

    function show(name) {
      tabs.forEach(function (tab) {
        var on = tab.getAttribute('data-library-tab') === name;
        tab.setAttribute('aria-selected', String(on));
        tab.classList.toggle('is-active', on);
      });
      panes.forEach(function (pane) {
        pane.hidden = pane.getAttribute('data-library-pane') !== name;
      });
    }

    tabs.forEach(function (tab) {
      tab.addEventListener('click', function () { show(tab.getAttribute('data-library-tab')); });
    });

    var csrfMeta = document.querySelector('meta[name="csrf-token"]');
    var csrf = csrfMeta ? csrfMeta.getAttribute('content') : '';

    function post(url, discard) {
      var body = new URLSearchParams();
      body.set('__token', csrf);
      if (discard) body.set('discard', '1');
      return fetch(url, {
        method: 'POST',
        credentials: 'same-origin',
        headers: {
          'X-Requested-With': 'XMLHttpRequest',
          'Accept': 'application/json',
          'X-CSRF-TOKEN': csrf
        },
        body: body
      }).then(function (res) {
        return res.json().then(function (data) { return { status: res.status, data: data || {} }; });
      });
    }

    function done() {
      window.location.assign('/gears/dashboard?page=news');
    }

    function fail(data) {
      var msg = (data && data.errors && data.errors[0]) || 'Could not duplicate the newsletter.';
      if (window.ConfirmModal) {
        window.ConfirmModal.ask({ title: 'Duplicate failed', body: msg, confirmLabel: 'OK', cancelLabel: 'Close' });
      }
    }

    function duplicate(button) {
      var row = button.closest('[data-library-issue]');
      var url = row && row.getAttribute('data-library-duplicate-url');
      if (!url || button.disabled) return;
      button.disabled = true;

      post(url, false).then(function (first) {
        if (first.status === 409 && first.data.needs_confirm) {
          var n = first.data.draft_story_count || 0;
          return window.ConfirmModal.ask({
            title: 'Replace your current draft?',
            body: 'Your current draft has ' + n + (n === 1 ? ' story' : ' stories') +
              '. Discarding moves it to the trash (it can be restored) and opens this newsletter as your new draft.',
            confirmLabel: 'Discard my current draft and duplicate',
            cancelLabel: 'Cancel',
            danger: true
          }).then(function (ok) {
            if (!ok) return null;
            return post(url, true);
          });
        }
        return first;
      }).then(function (result) {
        if (!result) return;
        if (result.data.ok) return done();
        fail(result.data);
      }).catch(function () {
        fail(null);
      }).then(function () {
        button.disabled = false;
      });
    }

    drawer.addEventListener('click', function (event) {
      var target = event.target;
      var button = target && target.closest ? (target.getAttribute('data-library-duplicate') !== null ? target : target.closest('[data-library-duplicate]')) : null;
      if (!button) return;
      event.preventDefault();
      duplicate(button);
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
```

Before relying on the CSRF names, confirm them: `grep -n "csrf\|__token\|X-CSRF" resources/js/news-dashboard.js | head` and copy exactly what `news-dashboard.js` sends on its own POSTs (field name and header). Adjust `post()` to match.

- [ ] **Step 4: Run the JS test**

Run: `node --test tests/js/story-library.test.mjs`
Expected: PASS (4 tests). If the stub's `closest` shape mismatches, fix the stub — not the module's delegated lookup.

- [ ] **Step 5: Drawer markup** — in `panel-news.html`, between the header `</div>` and the existing filters `<div class="news-library-drawer__filters"...>`, add:

```html
          <div class="news-library-drawer__tabs" role="tablist" aria-label="Story Library">
            <button type="button" class="news-slot-choice is-active" role="tab" aria-selected="true" data-library-tab="issue">This issue</button>
            <button type="button" class="news-slot-choice" role="tab" aria-selected="false" data-library-tab="published">Published newsletters</button>
          </div>
```

Wrap the existing filters + `news-library-drawer__body` in `<div data-library-pane="issue">…</div>`, and after it add:

```html
          <div data-library-pane="published" hidden>
            {# Its own live section ("story-library", DashboardController.FRAGMENTS):
               news_stamp is per OPEN issue and never moves when an older
               issue of this editor's is approved. #}
            <div class="news-library-drawer__body page-card" data-live-section="story-library"
                 data-section-count="{{ library_issues|length if library_issues else 0 }}">
              <div data-section-content data-live-target>
{% include "gears/partials/story-library-issues.html" %}
              </div>
            </div>
          </div>
```

Check `resources/js/dashboard-live.js` for the exact attributes a live section needs (`grep -n "data-live-section\|data-live-target\|data-section-count" resources/js/dashboard-live.js`) and match the existing `news` panel's structure exactly; adjust the wrapper above if it needs more.

- [ ] **Step 6: Wire assets** — `webpack.mix.js`: `.js('resources/js/story-library.js', 'storage/compiled/js')` after `news-dashboard.js`. `templates/gears/dashboard.html` js block, after the `news-dashboard.js` script: `<script src="{{ asset_url('js/story-library.js') }}" defer></script>`. `resources/css/news-dashboard.css`, append:

```css
/* Story Library tabs: "This issue" vs "Published newsletters". Reuses the
   .news-slot-choice pill; this only lays the pair out. */
.news-library-drawer__tabs {
  display: flex;
  gap: 8px;
  margin: 0 0 12px;
}
```

- [ ] **Step 7: Build and run the full suites**

```bash
export PATH="$HOME/.nvm/versions/node/v18.20.8/bin:$PATH"
npm run prod && npm run test:js
venv/bin/python -m pytest -q
make lint
```
Expected: all green (pytest ≥ 866 + new tests, JS ≥ 311 + 4).

- [ ] **Step 8: Commit**

```bash
git add templates/gears/partials/panel-news.html templates/gears/dashboard.html resources/js/story-library.js \
  resources/css/news-dashboard.css webpack.mix.js tests/js/story-library.test.mjs
git commit -m "feat(story-library): Published newsletters tab with duplicate and print actions"
```

(`panel-news.html` is clean in the working tree; `resources/css/gears-dashboard.css` is not touched by this task.)

---

### Task 9: Browser verification and docs

**Files:**
- Modify: `CLAUDE.md` (News composer section)

- [ ] **Step 1: Manual check in the dev server** (`venv/bin/python craft serve`, Chromium; see the e2e snap-chromium memory for the local recipe). As an editor with one published issue:
  - Story Library → Published newsletters lists it; another editor's issue does not appear.
  - Preview opens the kiosk render in a new tab; the lead body is unclamped; no "Read the full story" button.
  - Print (PDF) opens the print dialog with paper size 11 × 17; Save as PDF; the masthead colors print.
  - Duplicate with no draft → page reloads, composer shows the copy with layout intact, every story Draft.
  - Duplicate again → confirm dialog with the story count; Cancel does nothing; Discard → new draft, old one gone from the composer.
  - Replace an image in the copy → the published original still shows its image on the kiosk.

- [ ] **Step 2: CLAUDE.md** — under "News composer", add a short paragraph:

```markdown
**Story Library, Published tab.** `Issues.published_by(user_id)` lists an editor's own issues with a visible story; `IssueLibrary.duplicate()` copies one into a new draft issue (images copied to fresh names, because a replaced image is deleted with its derivatives), blocking with 409 when the editor's open issue already has stories. `/gears/issues/@id/print` renders `kiosk/_issue.html` through the kiosk's own projection with a tabloid `@page` (`issue-print.css`); PDF is the browser's Save as PDF. It is its own live section, `story-library`, with a user-scoped stamp (`Issues.library_stamp`).
```

Also correct the stale vocabulary in the same section: `layout_type` blocks are `BLOCK_TYPES` (`lead`, `brief`, `photo_essay`, `editorial`, `quote`, `notice`), not `main`/`secondary`/`widget`.

- [ ] **Step 3: Run `make ci`**

Run: `make ci`
Expected: green.

- [ ] **Step 4: Commit**

```bash
git add CLAUDE.md
git commit -m "docs: Story Library published tab in CLAUDE.md"
```
