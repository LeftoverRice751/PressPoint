# Issues: every editor composes their own newsletter

**Date:** 2026-09-14 · **Status:** approved, in progress

## The change

Today there is one implicit issue: every published story is "the front page",
every editor sees and edits the same canvas, and the issue number is derived
from the lead story's date. Two editors cannot work on two newsletters.

After this: an **issue** is a row. It has an owner, a number, and its own set
of stories. An editor's composer shows *their* open issue and nothing else. The
kiosk shows every published issue as a carousel slide, newest first. The admin
reviews and publishes one issue at a time.

Decisions taken (asked and answered): a real `issues` table rather than
author-scoping (an editor must be able to publish Issue 5 and start Issue 6);
one kiosk slide per published issue; existing stories are filed into one issue
per author by the migration.

## Data

```
issues
  id            int unsigned PK
  number        int unsigned NOT NULL        display number, max+1 on create
  owner_id      int unsigned NULL  FK users  ON DELETE SET NULL
  title         varchar(255) NULL            "Campus edition"; optional
  published_at  datetime NULL                set when approved
  created_at / updated_at / deleted_at

news.issue_id   int unsigned NULL  FK issues ON DELETE SET NULL, indexed
```

**Issue status is derived, not stored.** The per-story `status` column and the
whole pipeline behind it (`_news_is_public`, `_resolve_status_for_actor`,
approve/reject) keep working unchanged; an issue is `published` if any of its
stories is public, `review` if any is in review, else `draft`. Storing it too
would be a second source of truth that the existing story-level writes would
have to keep in step.

**The editor's open issue** = their newest owned issue that is not published.
Created on demand the first time they open the composer (or on first save),
and again automatically after their current one publishes — so "start the next
issue" is not a button, it is what happens.

## Migration — `2026_09_14_000100_create_issues_and_file_news`

Creates `issues`, adds `news.issue_id`, then files every existing story
(soft-deleted ones included, so a restore lands somewhere) into one issue per
distinct `author_id`, numbered in author order. Stories with no author go into
one unowned issue. Guards its preconditions and returns early when they are
absent, like the vocabulary migration before it — this repo's migration
history is broken precisely by data migrations that assumed their tables.
Reversible: `down()` drops the column then the table.

`databases/schema.sql` regenerated afterwards.

## Where it lands

| Layer | Change |
|---|---|
| `app/models/Issue.py` | new |
| `app/services/Issues.py` | new: `current_for(user_id)`, `next_number()`, `stories_of(issue)`, `status_of(issue)`, `published_issues()`, `pending_issues()`, `stamp_for(issue)` |
| `DashboardContext` | `news_context(user_id)`, `news_canvas_context(user_id)`, `full_context(default_page, user_id)` scope to the editor's open issue; `news_issue` joins the context; the news stamp is per issue |
| `DashboardController` | `show`/`fragment`/`stamps` pass the signed-in user through; `fragment` gains `request` |
| `NewsController.store` | new stories take `issue_id` from the actor's open issue |
| `NewsController.layout` | stamp compared per issue, not table-wide |
| `NewsController._build_news_payload` | a **list** of published issues, each with its own `blocks` and identity, newest first → `NewsCache.KEY` v7 → v8 |
| `ReviewQueue` | `pending_issues()`; `issue_preview_context(issue)` |
| `ReviewController` | `_decide_issue(issue_id)`; routes become `/gears/review/issue/@id:int/…` |
| `kiosk/_issue.html` | identity from the issue row (`issue.number`, `issue.title`) |
| `kiosk/news.html` | `{% for issue in issues %}` — one slide each; nav shows when > 1 |
| `panel-news.html` | top bar names the editor's issue |
| `review-queue.html` / `review-queue.js` | one card per pending issue, addressed by id |

## What does not change

`group_news_slots()`, the block vocabulary, `_issue.html`'s block markup, the
composer's editing surface, autosave, the flush, approve/reject semantics.
The issue is a scope around all of it, not a rewrite of any of it.

## Order of work

1. Model + migration + service, with tests. Regenerate `schema.sql`.
2. Composer scoping (context builders, controllers, top bar).
3. `store()` files new stories; `layout()` stamp per issue.
4. Kiosk: list of issues, one slide each, cache key bump.
5. Review queue per issue.
6. End to end: two editors, two issues, both on the kiosk.
