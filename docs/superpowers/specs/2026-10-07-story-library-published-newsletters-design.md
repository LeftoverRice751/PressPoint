# Story Library: Published Newsletters — Design

**Date:** 2026-10-07
**Status:** Approved in brainstorming, awaiting spec review
**Builds on:** `2026-09-14-issues-per-editor-design.md`

## Problem

The News panel's Story Library drawer lists `news_context(user_id)["news_items"]`,
which is only the stories of the editor's **open** issue (`Issues.current_for`
skips published issues). The moment a newsletter is approved and reaches the
kiosk, its stories vanish from the library. An editor has no way to look back
at what they published, reuse it, or print it.

## Goal

In the Story Library, each editor sees every newsletter **they** published to
the kiosk, and can:

1. **Preview** it.
2. **Duplicate** it as a new draft issue — same layout, same stories — and edit that.
3. **Print** it to PDF at tabloid size.

### Decisions made during brainstorming

| Question | Decision |
|---|---|
| What does "reuse" mean? | Duplicate the whole newsletter as a new draft issue. |
| Editor already has a draft with stories? | Blocked by default; a confirm dialog offers *Cancel* or *Discard my current draft and duplicate* (soft delete). |
| PDF mechanism | Browser print view of the kiosk's own template (`window.print()` → Save as PDF). No server-side PDF engine. |
| Paper size | Tabloid, 11 × 17 in, portrait. |
| Admin view of everyone's newsletters | Not in scope; admins see their own here, everyone's via the Review panel. |

## Non-goals

- Several open drafts per editor / an issue switcher.
- Copying individual stories into the current draft.
- Re-running a past issue on the kiosk as-is.
- Server-generated `.pdf` files (WeasyPrint, headless Chromium).
- Any schema change.

## Design

### 1. Data and scope

**`Issues.published_by(user_id)`** — the editor's issues (`owner_id = user_id`)
with at least one story in `VISIBLE_STATUSES`, newest first by `published_at`,
falling back to `id`. Each returned issue carries `.stories` (its visible
stories). Two queries total: issues by owner, then
`News.where_in("issue_id", ids)`, grouped in Python — not the per-issue
`stories_of()` loop `_issues_where_stories` uses. `None`/falsy `user_id` → `[]`.

**`Issues.owned_published(user_id, issue_id)`** — one issue, or `None` unless
`owner_id == user_id` AND `status_of(issue) == "published"`. Every new endpoint
goes through this; `None` → **404** whether the issue is someone else's,
missing, or unpublished-and-not-mine. (Duplicate distinguishes "mine but not
published" → 422; see §2.)

**Drawer UI** (`templates/gears/partials/panel-news.html`): two tabs.

- **This issue** — the existing table (`gears/partials/news-slots.html`), unchanged.
- **Published newsletters** — new partial `gears/partials/story-library-issues.html`.
  One row per issue: folio (*Vol. N · No. M*), issue title or lead headline,
  publish date, story count, and actions **Preview**, **Duplicate as new
  draft**, **Print (PDF)**. Empty state: "You haven't published a newsletter yet."

**Liveness:** new live section `story-library`, registered in **both**
`DashboardController.FRAGMENTS` and `STAMP_MODELS`. `news_stamp` is per open
issue, so it never moves when an older issue of mine gets approved; this
section needs its own stamp. Context builder:
`DashboardContext.story_library_context(user_id)` → `{"library_issues": [...]}`,
also merged into `full_context()`.

### 2. Duplicate as new draft

`POST /gears/issues/@id/duplicate` → `gears.IssueLibraryController@duplicate`,
`auth`. Responses through `AjaxResponses` (`wants_json` / `json_success` /
`json_errors`); plain-form posts redirect with a flash.

1. **Ownership.** Issue must have `owner_id == me` → else 404. Must be
   published → else 422 ("Only published newsletters can be duplicated.").
2. **Draft check.** `Issues.current_for(me)`:
   - `None` → create a new issue in step 4.
   - open issue with **zero stories** → reuse it (no stray row, no burned `number`).
   - open issue **with stories**, no `discard=1` → **409**
     `{"needs_confirm": true, "draft_story_count": N}`.
   - `discard=1` → soft-delete that issue and its stories (image files stay,
     same as `NewsController.destroy`), then create a new issue.
3. **Copy images, outside the transaction.** For each source story with
   `image`: copy the original and its `.large` / `.thumb` derivatives
   (`variant_relpath`) to a fresh unique filename in the same folder. All
   paths through `StorageRouter.is_safe_path()`. A missing source file is not
   fatal — that copy gets `image = None`. Reason: `NewsController` deletes the
   old file + derivatives when an image is replaced, so a shared path would let
   an edit to the copy destroy the published original's image.
4. **One DB transaction.**
   - Issue: `number = next_number()`, `title` = source title, `owner_id = me`.
     **Do not pass a `published_at` key** (ORM turns `None` into *now* for
     `__dates__` columns).
   - Stories, one per source story, in source `id` order:
     - **copied:** `title, description, content, dek, excerpt, source, location,
       category_id, layout_type, priority, headline_font, image_caption,
       image_credit`; `image` = the copy from step 3.
     - **reset:** `status = "draft"`, `author_id = updated_by_id = me`,
       `issue_id` = new issue; `published_at`, `display_date`,
       `expiration_date`, `rejection_reason` omitted / NULL.
     - `category_id` whose category is soft-deleted → `NewsCategories.default_category_id()`.
5. **Rollback.** If the transaction raises: delete every file copied in step
   3, return 500 via `json_errors`. If the discard in step 2 already ran, it is
   not undone (it is a soft delete and restorable).
6. **Success.** `json_success({"issue_id", "number", "story_count"})`;
   `NewsCache.forget()` is not needed (drafts are not public). The composer
   force-reloads its canvas, same path as a `news.layout` 409.

**Drawer JS** (`resources/js/news-dashboard.js`, Story Library section): the
Duplicate button posts; on 409 `needs_confirm` it opens a compact
`.article-modal` confirm ("Your current draft has N stories…") with *Cancel*
and *Discard my current draft and duplicate*, the latter re-posting with
`discard=1`.

### 3. Preview and Print (PDF)

`GET /gears/issues/@id/print` → `gears.IssueLibraryController@print_view`,
`auth`, `owned_published` (404 otherwise).

- Template `templates/gears/issue-print.html`: standalone page that
  `{% include "kiosk/_issue.html" %}` with `news_editor=False` — the kiosk's
  renderer, not a second one.
- Context `DashboardContext.issue_print_context(issue)`: `blocks =
  group_news_slots(visible stories)`, `issue_identity_of(issue)`, issue title,
  `calendar_events = upcoming_events(as_of=published_at)`.
- **`upcoming_events(limit, as_of=None)`** gains `as_of` (naive local datetime;
  default `datetime.now()`), so a reprint shows the calendar as the issue
  carried it, not today's. `published_at` is UTC-aware → convert via
  `CAMPUS_TZ` and drop tzinfo before comparing against naive `event_date`.
- Stylesheet `resources/css/issue-print.css` (new `webpack.mix.js` entry):
  `@page { size: 11in 17in; margin: 0.5in; }`; hide kiosk-only interactive
  chrome; `break-inside: avoid` on each story; `print-color-adjust: exact`.
  Solid colors only.
- `?autoprint=1`: small script (`resources/js/issue-print.js`, mix entry)
  awaits `document.fonts.ready` and every `<img>` settling, then `window.print()`.
- Drawer: **Preview** opens `/gears/issues/@id/print` in a new tab;
  **Print (PDF)** opens `...?autoprint=1`.

### Routes

In `routes/dashboard.py`, beside the other news routes, all `.middleware("auth")`:

```
GET  /gears/issues/@id:int/print      gears.IssueLibraryController@print_view   issues.print
POST /gears/issues/@id:int/duplicate  gears.IssueLibraryController@duplicate    issues.duplicate
```

(`@id:int` per the route-order memory: literal segments are not ordered reliably.)

## Error handling summary

| Case | Response |
|---|---|
| Issue not mine / missing | 404 |
| Mine, not published (duplicate) | 422 |
| Open draft has stories, no `discard` | 409 `needs_confirm` |
| Source image missing on disk | Copy proceeds, that story has no image |
| DB failure during duplicate | 500, copied files removed |

## Testing

**pytest** (`tests/unit/`):
- `published_by`: only my issues, only those with a visible story, newest-first, `.stories` holds visible stories only.
- `print` and `duplicate`: 404 for another editor's issue.
- duplicate: no draft → new issue; empty draft → reused; draft with stories → 409; `discard=1` → old draft soft-deleted + new issue; unpublished source → 422.
- copy map: every copied field equal, every reset field reset, `status == "draft"`, author = caller.
- images: new distinct paths for original + derivatives; source files untouched; copies removed when the transaction raises.
- new issue's `published_at` is NULL.
- soft-deleted category → default category.
- print page: renders only visible stories; calendar uses `as_of`.
- `story-library` present in both `FRAGMENTS` and `STAMP_MODELS`.

**JS** (`tests/js/`): tab switching; 409 → confirm → re-post with `discard=1`.

**Manual:** Chromium print preview at tabloid; Save as PDF.

## Files

New: `app/controllers/gears/IssueLibraryController.py`,
`templates/gears/issue-print.html`,
`templates/gears/partials/story-library-issues.html`,
`resources/css/issue-print.css`, `resources/js/issue-print.js`, tests.

Changed: `app/services/Issues.py`, `app/services/DashboardContext.py`,
`app/controllers/gears/DashboardController.py`, `routes/dashboard.py`,
`templates/gears/partials/panel-news.html`, `resources/js/news-dashboard.js`,
`resources/css/gears-dashboard.css`, `webpack.mix.js`.
