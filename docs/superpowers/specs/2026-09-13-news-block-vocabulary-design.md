# News block vocabulary — design

**Date:** 2026-09-13
**Status:** approved, not yet implemented
**Supersedes:** the rename-only mapping agreed earlier the same day, where the
six editor-facing blocks were labels over the existing three `layout_type`
values. That mapping is dropped: the block names become the stored values.

## Context

The Gears composer lets an editor lay out the kiosk newsletter. Until now a
story's placement was one of three values — `main`, `secondary`, `widget` —
which were never the words an editor uses. The newsroom talks about a lead, a
brief, an editorial, a notice; the database talked about widgets. Every surface
in between carried a translation, and the composer's "Add a block" chips could
not match the stored types because there were only three of them.

This replaces the vocabulary with the blocks themselves, so the chip an editor
clicks, the row the outline shows, the bucket the kiosk renders and the value in
the column are all the same word.

**The live table holds 2 rows** (one `main`, one `secondary`; no soft-deleted
rows), so the data migration is trivial. The work is in code and tests.

## Vocabulary

`news.layout_type` takes exactly these values. Capacity is the number of rows a
block holds; a write past it is rejected by `NewsController.layout()`.

| Value | Cap | Section on the page | Notes |
|---|---|---|---|
| `lead` | 1 | `01 — Lead story` | The one story with a photo, dek and full body. |
| `brief` | 4 | `02 — Side stories` | The container is "Side stories"; each row is a brief. The kiosk prints the first 2, the composer shows all 4. |
| `photo_essay` | 3 | `03 — Photo essay` | One image per row, in priority order. First row's `image_caption`/`image_credit` caption the grid. Section omits itself below 3. |
| `editorial` | 1 | `04 — From the editor` | |
| `quote` | 2 | pull-quote band | Display type; `description` is the quote, `source` the attribution. |
| `notice` | 1 | beside the calendar | Optional; the calendar spans full width without it. |
| `unassigned` | — | — | Story library only. Excluded from every bucket, including the lead fallback. |

**Calendar is not a block type.** Its rows come from the `events` table, which
the Events panel owns. The composer renders it read-only with a jump to that
panel; duplicating event CRUD into News would put a second write path on
another pipeline.

**Masthead is not a block type.** It is template chrome with no row behind it,
and the outline marks it `FIXED`.

## Migration

`databases/migrations/2026_09_13_..._rename_news_layout_types.py`:

```
main      -> lead
secondary -> brief
widget    -> editorial
```

`widget` is mapped for completeness; no live row carries it. Anything not in the
map is left alone rather than coerced — an unrecognised value is already
excluded from every bucket by `group_news_slots`, so leaving it is safe and
loses no information, while coercing it would silently move a story.

The column default changes `'secondary'` → `'brief'`. `databases/schema.sql` is
regenerated afterwards: CLAUDE.md records that the migration history cannot
rebuild the schema and that `schema.sql` is the baseline CI loads.

`down()` reverses the map, so the migration is not a one-way door.

## Architecture

### `group_news_slots()` becomes generic

It is currently three hardcoded buckets with `[:4]`/`[:2]` truncation. It
becomes a group-by over `layout_type` driven by one capacity table, returning a
dict keyed by block type. Adding a block type later is then one entry, not a new
bucket threaded through five files.

The existing behaviours it must keep, all pinned by tests:

- ascending sort on `(priority, id)` — lower renders first, so "Position #1" is
  literally true
- `unassigned` excluded from every bucket **including** the lead fallback, so an
  unplaced story can never become the lead
- an empty `lead` bucket falls back to the first assignable story
- truncation at capacity, so an over-full bucket cannot render a story that
  reads as placed but appears nowhere

Its two callers keep working unchanged in shape: `NewsController._build_news_payload`
(kiosk) and `DashboardContext.news_context` (composer).

### One capacity table

`NewsController._NEWS_SLOT_CAPACITY` is the single source. `layout()` already
enforces overflow against it inside its transaction. The composer's JS derives
the same numbers from the DOM (`containerCapacity()` reads the rendered
containers), so the two cannot drift without the markup drifting first.

### Rendering

`templates/kiosk/_issue.html` — already the one partial both surfaces render —
gains a section per block type, keyed to the new bucket names. Section numbering
is already self-closing: a block with no rows omits its band and the counter
closes the gap.

### Retirement

`templates/kiosk/_news_slots.html` is rendered by nothing once this lands (the
composer, the canvas fragment and the review preview all moved to `_issue.html`
earlier today). It is deleted, along with `tests/unit/test_composer_templates.py`,
which exists only to test it.

## Files

| File | Change |
|---|---|
| `databases/migrations/2026_09_13_*_rename_news_layout_types.py` | new |
| `databases/schema.sql` | regenerate (structure only, never data) |
| `app/services/DashboardContext.py` | `group_news_slots` → generic bucketing |
| `app/controllers/gears/NewsController.py` | `_NEWS_LAYOUT_TYPES`, `_NEWS_SLOT_CAPACITY`, default |
| `templates/kiosk/_issue.html` | a section per block type |
| `resources/js/news-dashboard.js` | block table, chips, slot choices |
| `templates/gears/partials/panel-news.html` | chips, layout thumbnails |
| `templates/gears/partials/news-slots.html` | library slot labels |
| `templates/kiosk/_news_slots.html` | delete |
| `tests/unit/test_composer_templates.py` | delete |

## What must not break

These are enforced elsewhere and this change must not weaken any of them:

1. **Editors cannot publish.** `_resolve_status_for_actor` downgrades any
   publish-intent status to `review` unless the actor's role is exactly `admin`.
   Untouched.
2. **Status vocabulary** stays `draft / review / approved / scheduled /
   published / archived`. There is no `rejected`; a rejection writes `draft` plus
   `rejection_reason`. Untouched.
3. **Approve/reject notifications** fire from `ReviewController` into the
   `notifications` table. Untouched.
4. **Category is required** on every save and validated live. Untouched.
5. **Optimistic concurrency** on `news.layout` via `base_stamp` → 409. The
   capacity check inside that transaction must be updated to the new table, or an
   over-full bucket stops being caught.
6. **`_news_is_public`** is the single visibility gate, with three call sites.
   Untouched.

## Testing

Test-first, because the bucketing rules ARE the specification:

- `tests/unit/test_news_slots.py` — rewritten against the new vocabulary. It is
  the real spec of the rules above; it gets written before `group_news_slots` is
  touched and drives the rewrite.
- `tests/unit/test_layout_concurrency.py` — the overflow cases move to the new
  capacities.
- `tests/unit/test_issue_composer.py` — a section per block type, and the
  editor/kiosk leak contract that already exists there.
- new: a migration test asserting the two live rows land on `lead` and `brief`,
  and that `down()` restores them.
- `tests/unit/test_news_endpoints.py`, `test_news_controller_priority.py`,
  `test_review_workflow.py` — updated where they name a layout value.

**Baseline to hold:** the suite is currently green at 697 passed (pytest) and
212 passed (JS), with lint clean. Anything below that is a regression from this
change, not a pre-existing failure — the five stale failures that used to exist
were corrected earlier today.

End-to-end, on a non-admin editor account (admins are redirected to `/users`):
place one row of each block type, drag to reorder, upload an image, publish →
status becomes `review`, approve as admin → `published` + a notification row,
then confirm the kiosk renders each story in the section it was placed in.

## Open

Nothing blocking. The `quote` band's exact typography is unspecified — it
follows the issue's display face and the existing band rhythm, and can be tuned
once there is a real one to look at.
