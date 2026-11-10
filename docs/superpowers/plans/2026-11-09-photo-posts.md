# Photo Posts Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the block/issue newsletter on Latest News with single square photo posts that editors build in a WYSIWYG template, admins approve, and the kiosk swipes through until each post's expiry.

**Architecture:** Posts reuse the `news` table (new columns for kicker, logo, crop, source lines, expiry). All post rules — validation, expiry, visibility, projection — live in a new `app/services/Posts.py`; `NewsController` shrinks to thin create/update/delete/duplicate/show endpoints over it and keeps `_news_is_public` as its public name. One Jinja partial, `kiosk/_post_card.html`, renders the card for the kiosk, the editor canvas and the review preview. Issues, blocks, the issue calendar, print and categories are removed.

**Tech Stack:** Masonite 5 / masonite-orm / MySQL, Jinja, bleach, plain ES modules + Swiper, laravel-mix (Node 18), pytest, `node --test`.

**Spec:** `docs/superpowers/specs/2026-11-09-photo-posts-design.md`

## Global Constraints

- This checkout IS production (live MySQL, nginx serves it). Any `craft migrate --force`, data script, or `npm run prod` is a **stop-and-ask step**: the executor pauses and gets the user's explicit go-ahead before running it.
- Status gate unchanged: `_resolve_status_for_actor()` downgrades publish intents for non-admins; `_normalize_news_status()` fails closed to `draft`.
- `_news_is_public()` remains the single visibility gate at every public call site (Latest News, `WelcomeController._build_flash_articles()`), and now also excludes expired posts.
- Expiry: per-post `expires_at` DATETIME stored aware-UTC; editor input is campus-local (`CAMPUS_TZ`, `Asia/Manila`); unset at approval ⇒ `approved_at + 7 days`, stored.
- Editing a live post (any non-admin write) pulls it from the kiosk until re-approved.
- Uploads validated by magic bytes (`ImageUploads.read_upload`); photos get `.large`/`.thumb` derivatives (`ImageDerivatives`); deleting a post deletes photo + derivatives + its logo.
- Every write route keeps `_may_change_story()` ownership; text is plain and escaped (no HTML in post fields).
- Flat solid colors from `resources/css/kiosk-tokens.css` / `kiosk-palette.css`; **no gradients**.
- Card is square, centered in the 768×1024 kiosk viewport.
- New `resources/js|css` entries must be added to `webpack.mix.js`; builds under Node 18 (`export PATH="$HOME/.nvm/versions/node/v18.20.8/bin:$PATH"`).
- Every schema change regenerates `databases/schema.sql` (command in its header). Never commit data into it.
- **Work in a git worktree** (superpowers:using-git-worktrees), not this checkout: Tasks 3–8 leave the dashboard mid-transition, and this directory is what production serves. Only Task 1's additive migration and Task 9's ship steps touch production.
- Comments explain *why* (codebase convention). flake8/black line length 99.

## Fixed values (from spec, pinned here)

| Name | Value |
|---|---|
| `Posts.DEFAULT_EXPIRY_DAYS` | `7` |
| `Posts.KICKER_MAX` | `40` chars |
| `Posts.HEADLINE_MAX` | `110` chars |
| `Posts.BODY_MAX` | `420` chars (stored in `news.description`, so the flash ticker's `copy` keeps working) |
| `Posts.SOURCE_TEXT_MAX` | `60` chars |
| `Posts.SOURCE_LINES_MAX` | `3` |
| `Posts.SOURCE_ICONS` | `("facebook", "email", "instagram", "website", "link")` |
| `Posts.DEFAULT_SOURCE_LINES` | `[{"icon": "facebook", "text": "/TheGearsOfficial"}, {"icon": "email", "text": "/thegearspublication@gmail.com"}]` |
| crop | `{"x": 0..1, "y": 0..1, "zoom": 1.0..4.0}`; default `{"x": 0.5, "y": 0.5, "zoom": 1.0}` |
| empty kiosk copy | heading `No new posts right now`, line `Check back soon for the latest from The Gears.` |

## Review Focus

1. **Expiry picked in the past, or an approval after the chosen expiry passed** — submit is refused (422 "Pick an expiry in the future"); approve is refused (422) unless the admin sends a new future `expires_at`. Test in Task 2 and Task 5.
2. **Malformed `image_crop` / `source_lines` posted by hand** (non-JSON, zoom 99, unknown icon, 10 lines, `javascript:` text) — clamped or rejected, never stored raw, never rendered as markup. Test in Task 2.
3. **Editor submits with no photo** — refused for submit-to-review ("Add a photo before submitting"), allowed for draft save. Test in Task 3.
4. **Duplicate of a post whose photo/logo was later replaced or deleted** — duplicate copies files to fresh names and still succeeds if the source logo file is missing (falls back to site logo). Test in Task 6.
5. **Expiry boundary under UTC CI vs campus time** — a post expiring 08:00 Manila is public at 07:59 and not at 08:00 regardless of server TZ. Test in Task 2.

---

### Task 1: Schema — post columns (additive migration)

**Files:**
- Create: `databases/migrations/2026_11_09_000100_add_post_fields_to_news.py`
- Modify: `app/models/News.py` (`__fillable__`, `__dates__` add `expires_at`)
- Modify: `databases/schema.sql` (regenerated)
- Test: `tests/unit/test_post_schema.py`

**Interfaces:**
- Produces: `news.kicker VARCHAR(80) NULL`, `news.logo_path VARCHAR(255) NULL`, `news.image_crop TEXT NULL`, `news.source_lines TEXT NULL`, `news.expires_at DATETIME NULL`; `news.category_id` made NULLable (FK kept until Task 9).

- [ ] **Step 1: Write the failing test** — `test_schema_declares_post_columns` reads `databases/schema.sql`, finds the `CREATE TABLE \`news\`` block and asserts each of `` `kicker` ``, `` `logo_path` ``, `` `image_crop` ``, `` `source_lines` ``, `` `expires_at` datetime `` appears, and that the `category_id` line does not contain `NOT NULL`. `test_news_model_fillable_has_post_fields` asserts those five names are in `News.__fillable__` and `"expires_at" in News.__dates__`.
- [ ] **Step 2: Run** `venv/bin/python -m pytest tests/unit/test_post_schema.py -q` — Expected: FAIL.
- [ ] **Step 3: Write the migration** — schema-only, `up()` adds the five columns and `change()`s `category_id` to nullable; `down()` reverses. Docstring says why (spec link) and that it is additive so old code keeps running.
- [ ] **Step 4: Update `News.__fillable__` / `__dates__`.**
- [ ] **Step 5: STOP — ask the user** before `venv/bin/python craft migrate --force` (live DB). After go-ahead run it, then regenerate `databases/schema.sql` with the command in its header.
- [ ] **Step 6: Run** the test file and `venv/bin/python -m pytest tests/unit -q` — Expected: PASS, no regressions.
- [ ] **Step 7: Commit** migration, model, schema.sql, test — `feat(posts): add post columns to news`.

### Task 2: `Posts` service — validation, expiry, visibility, projection

**Files:**
- Create: `app/services/Posts.py`
- Test: `tests/unit/test_posts_service.py`

**Interfaces:**
- Consumes: `Issues.CAMPUS_TZ` / campus-time helpers (move `CAMPUS_TZ` into `Posts` if `Issues.py` is deleted in Task 9 — Posts must not import Issues).
- Produces (all pure, no DB unless noted):
  - constants from the Fixed values table
  - `clean_text(value, max_len) -> str` — strips, collapses whitespace runs except single newlines in body, truncates to `max_len`, removes control chars.
  - `parse_crop(raw) -> dict` — JSON string or dict → clamped `{"x","y","zoom"}`; garbage → default.
  - `parse_source_lines(raw) -> list[dict]` — JSON → at most `SOURCE_LINES_MAX` `{icon, text}`; unknown icon → `"link"`; empty text lines dropped; `None`/garbage → `DEFAULT_SOURCE_LINES`.
  - `parse_local_expiry(value: str, now=None) -> datetime | None` — `"YYYY-MM-DDTHH:MM"` in campus time → aware UTC; empty → `None`; raises `ValueError("Pick an expiry in the future")` if not after `now`.
  - `default_expiry(approved_at: datetime) -> datetime` — `approved_at + timedelta(days=DEFAULT_EXPIRY_DAYS)`.
  - `is_expired(post, now=None) -> bool` — `expires_at` set and `<= now` (aware compare; naive values treated as UTC per the ORM trap in CLAUDE.md).
  - `crop_style(crop: dict) -> str` — `"object-position:{x%} {y%};transform:scale({zoom});transform-origin:{x%} {y%}"`.
  - `card_context(post, disk=None) -> dict` — JSON-safe projection used by every renderer: `id, kicker, headline, body, image_large, image_thumb, crop_style, logo_url` (post `logo_path` else `Branding.logo_url()`), `source_lines, status, expires_label` (campus-local `"%b %d, %Y %I:%M %p"`), `published_label`.

- [ ] **Step 1: Write failing tests** with these assertions:
  - `parse_crop('{"x":2,"y":-1,"zoom":99}') == {"x":1.0,"y":0.0,"zoom":4.0}`; `parse_crop("nope") == {"x":0.5,"y":0.5,"zoom":1.0}`.
  - `parse_source_lines('[{"icon":"tiktok","text":"a"}]+…10 items') ` → length 3, first icon `"link"`; `parse_source_lines(None) == DEFAULT_SOURCE_LINES`; a text of `"<script>"` is returned verbatim as text (escaping is the template's job) and truncated to 60.
  - `clean_text("x"*500, BODY_MAX)` has length 420.
  - `test_expiry_boundary_is_campus_time`: post with `expires_at` = 2026-11-10 00:00 UTC (08:00 Manila); `is_expired(post, now=<2026-11-09 23:59 UTC>) is False`, `now=<2026-11-10 00:00 UTC>` → True.
  - `parse_local_expiry("2026-11-10T08:00", now=<2026-11-09 12:00 UTC>) == datetime(2026,11,10,0,0,tzinfo=UTC)`; past value raises `ValueError` with the exact message.
  - `default_expiry(datetime(2026,11,9,tzinfo=UTC)) == datetime(2026,11,16,tzinfo=UTC)`.
  - `card_context` on a post without `logo_path` returns `Branding.logo_url()` (patched).
- [ ] **Step 2: Run** `venv/bin/python -m pytest tests/unit/test_posts_service.py -q` — FAIL.
- [ ] **Step 3: Implement `app/services/Posts.py`** to the signatures above.
- [ ] **Step 4: Run** — PASS.
- [ ] **Step 5: Commit** — `feat(posts): Posts service for post rules`.

### Task 3: Write endpoints — create/update/delete over Posts

**Files:**
- Modify: `app/controllers/gears/NewsController.py` (rewrite `store`, `destroy`; delete `layout`, `body`, `autosave`, `unassign` and block/slot helpers; `_news_is_public` adds `Posts.is_expired`)
- Modify: `routes/dashboard.py` (remove layout/body/autosave/unassign routes)
- Modify: `deploy/nginx-presspoint.conf` only if a photo+logo request can exceed 10M — it cannot with the image size cap in `ImageUploads`; confirm the cap and leave nginx alone if so.
- Test: `tests/unit/test_post_endpoints.py` (replaces `test_news_endpoints.py`, `test_news_body_review_gate.py`, `test_news_controller_priority.py`, `test_news_slots.py`, `test_news_headline_html.py` — delete those)
- Keep and adapt: `test_news_ownership.py`, `test_flash_status_filter.py`, `test_flash_ticker_plain_text.py`, `test_news_live_broadcast.py`

**Interfaces:**
- Consumes: Task 2 functions.
- Produces: `POST /news/dashboard` (form fields: `id?`, `kicker`, `headline`, `body`, `image` file?, `logo` file?, `remove_logo`, `image_crop` JSON, `source_lines` JSON, `expires_at` local string, `status` ∈ draft|review) → `json_success(payload={"id", "status", "card": card_context})`; `DELETE /news/dashboard/@id`.

- [ ] **Step 1: Write failing tests** (use existing request doubles / `actor_may_change_any_story` fixture as in `test_news_ownership.py`):
  - `test_editor_submit_goes_to_review` — `status=published` from editor stores `review`.
  - `test_submit_without_photo_refused` — `status=review`, no existing image → 422 `"Add a photo before submitting"`; same with `status=draft` → 200.
  - `test_past_expiry_refused` — 422 `"Pick an expiry in the future"`.
  - `test_editing_published_post_pulls_it` — existing `published` post, editor saves draft → status `draft`, `NewsCache` forgotten, `KioskBroadcast.section_changed("latest-news")` called.
  - `test_crop_and_sources_stored_clean` — garbage crop/sources stored as the `parse_*` outputs (JSON strings).
  - `test_logo_upload_and_remove` — logo saved through `ImageUploads.save_uploaded_image` to `Branding/posts/`; `remove_logo=1` deletes the file and nulls `logo_path`.
  - `test_destroy_removes_photo_derivatives_and_logo`.
  - `test_expired_post_not_public` — `_news_is_public` false for published+expired; flash articles exclude it.
- [ ] **Step 2: Run** — FAIL.
- [ ] **Step 3: Rewrite `store` / `destroy`**, keep `_may_change_story`, `_resolve_status_for_actor`, `_normalize_news_status`, `AjaxResponses`, `AuditLog`-free (editor actions aren't audited today). Body goes to `description`, headline to `title`; `rejection_reason` cleared on resubmit. Remove dead helpers and their imports.
- [ ] **Step 4: Run** new + kept tests — PASS. Delete the replaced test files.
- [ ] **Step 5: Commit** — `feat(posts): post create/update/delete endpoints`.

### Task 4: Card partial + kiosk Latest News

**Files:**
- Create: `templates/kiosk/_post_card.html` (vars: `card` from `card_context`, `post_editor` bool)
- Create: `templates/kiosk/_post_empty.html`
- Create: `resources/css/post-card.css` (shared kiosk + dashboard), add to `webpack.mix.js`
- Modify: `templates/kiosk/news.html` (one `.swiper-slide` per post; empty card when none)
- Modify: `app/controllers/gears/NewsController.py` `_build_news_payload` / `show` → list of `card_context` for public posts, newest `published_at` first; bump `NewsCache.KEY` to `kiosk:news:index:v9`
- Modify: `resources/js/kiosk-news.js` (drop auto-height/reader overlay; fixed square slides), `resources/css/kiosk-news.css`
- Delete: `templates/kiosk/_issue.html`, `_issue_calendar_dates.html`, `resources/css/newsletter-type.css` (+ mix entry)
- Test: `tests/unit/test_kiosk_posts.py` (replaces `test_kiosk_single_issue.py`, `test_news_payload_expiry.py`); `tests/js/kiosk-news-autoheight.test.mjs` deleted

**Interfaces:**
- Consumes: `Posts.card_context`, `_news_is_public`.
- Produces: `kiosk/_post_card.html` contract — root `<article class="post-card" data-post-id>`, regions `.post-card__photo` (img with `style="{{ card.crop_style }}"`), `.post-card__logo`, `.post-card__panel` > `.post-card__kicker` (omitted when empty), `.post-card__headline`, `.post-card__body`, `.post-card__sources` > `li[data-icon]`. In editor mode the same regions carry `data-field="kicker|headline|body"` and `contenteditable="plaintext-only"`.

- [ ] **Step 1: Failing tests:** rendering `/kiosk/embed/latest-news` with two published posts (one expired, one draft, one live) yields exactly one `.post-card`; zero live posts renders `No new posts right now`; kicker element absent when kicker empty; source text `<b>x</b>` appears escaped; order is newest first; card markup contains no `gradient` (grep the CSS file in a test: `"gradient" not in post-card.css`).
- [ ] **Step 2: Run** — FAIL.
- [ ] **Step 3: Build the partials, CSS (square via `aspect-ratio: 1`, width `min(100%, 720px)`, flat palette shapes as absolutely-positioned solid circles/arcs in `--brand-maroon`, `--brand-gold`, kiosk amber/terracotta), kiosk JS changes.** Inline SVG icons for the five `SOURCE_ICONS` in the partial.
- [ ] **Step 4: Run** pytest + `npm run test:js` — PASS.
- [ ] **Step 5: Commit** — `feat(posts): square post card on the kiosk`.

### Task 5: Review flow per post with expiry

**Files:**
- Modify: `app/controllers/gears/ReviewController.py` (`_decide`: on approve set `published_at = datetime.now(timezone.utc)`, `expires_at` from optional `expires_at` input via `Posts.parse_local_expiry`, else keep editor's, else `Posts.default_expiry(now)`; refuse 422 `"This post's expiry has passed. Set a new expiry to approve it."` if stored expiry ≤ now and none supplied; delete `_decide_issue`, `approve_issue`, `reject_issue`, `preview_issue`)
- Modify: `app/services/ReviewQueue.py` (`_STAMPED_FIELDS = ("title","description","image","kicker","logo_path","image_crop","source_lines","expires_at")`; delete issue helpers; `preview_context(story)` renders `kiosk/_post_card.html`)
- Modify: `templates/gears/partials/review-queue.html`, `review-preview-modal.html`, `resources/js/review-queue.js` (list posts; preview modal with expiry `datetime-local` input sent as `expires_at`)
- Modify: `routes/dashboard.py` (remove `/gears/review/issue/*`)
- Test: adapt `tests/unit/test_review_workflow.py`, `tests/js/review-preview-modal.test.mjs`

**Interfaces:**
- Consumes: Task 2 `parse_local_expiry`, `default_expiry`; Task 4 partial.
- Produces: `POST /gears/review/@id:int/approve` accepts optional `expires_at` (campus-local string) alongside `review_stamp`.

- [ ] **Step 1: Failing tests:** approve with no expiry stores `published_at + 7 days`; approve with past stored expiry and no override → 422 exact message; with override → published with the override; stamp changes when `kicker` / `image_crop` / `source_lines` change; issue routes return 404.
- [ ] **Step 2: Run** — FAIL. **Step 3: Implement.** **Step 4: Run** — PASS.
- [ ] **Step 5: Commit** — `feat(posts): per-post review with expiry`.

### Task 6: Library and duplicate (per post)

**Files:**
- Create: `app/services/PostLibrary.py` — `library_rows(user_id) -> list[dict]` (own posts, newest `updated_at` first, each `card_context` + `state` ∈ draft|review|live|expired|rejected) and `duplicate(user_id, post_id) -> News` (copies kicker/title/description/crop/source_lines; copies photo and logo files to fresh names via existing `ImageUploads` helpers; clears `expires_at`, `published_at`, `rejection_reason`; status `draft`; missing source logo ⇒ `logo_path=None`; failure deletes copies made). Raises `LookupError` for a post not owned by `user_id`.
- Modify: `NewsController` add `duplicate(request, response)`; `routes/dashboard.py` add `Route.post("/news/dashboard/@id:int/duplicate", "gears.NewsController@duplicate").name("news.duplicate").middleware("auth")`; remove `/gears/issues/*` routes.
- Delete: `app/services/IssueLibrary.py`, `app/controllers/gears/IssueLibraryController.py`, `templates/gears/issue-print.html`, `resources/js/issue-print.js`, `resources/css/issue-print.css` (+ mix entries), `tests/unit/test_issue_library_*.py`, `tests/js/issue-print.test.mjs`
- Test: `tests/unit/test_post_library.py`

- [ ] **Step 1: Failing tests:** library lists only caller's posts with correct `state` (expired published → `expired`); duplicate copies to new filenames, new row is draft with no expiry; another editor's id → 404 JSON; missing logo file → duplicate succeeds with `logo_path is None`; DB failure removes copied files.
- [ ] **Step 2: Run** — FAIL. **Step 3: Implement.** **Step 4: Run** — PASS.
- [ ] **Step 5: Commit** — `feat(posts): per-post library and duplicate`.

### Task 7: Editor template panel

**Files:**
- Rewrite: `templates/gears/partials/panel-news.html` — two columns: library list (`gears/partials/post-library.html`, the fragment) and the editor (`kiosk/_post_card.html` with `post_editor=True`) plus controls under it: photo drop/pick, logo change/remove, source-line editor (icon `<select>` + text, add/remove, max 3), **Set expiry** button opening a `ConfirmModal`-style dialog with `<input type="datetime-local">`, Save draft, Submit for review, rejection reason banner.
- Create: `resources/js/post-editor.js` (DOM wiring, multipart `fetch` to `news.store`, live-section refresh), `resources/js/post-crop.mjs`, `resources/js/post-sources.mjs`; add `post-editor.js` to `webpack.mix.js`; remove `news-dashboard.js` + `news-dashboard.css` entries/files and `story-library.js`.
- Modify: `app/services/DashboardContext.py` — replace `news_context`, `news_canvas_context`, `story_library_context`, `issue_calendar_context`, `news_categories_context`, `group_news_slots`, `BLOCK_TYPES`, `BLOCK_CAPACITY` with `post_editor_context(user_id)` and `post_library_context(user_id)`; `app/controllers/gears/DashboardController.py` `FRAGMENTS`/`STAMP_MODELS`/`_USER_SCOPED_SECTIONS` → sections `post-library` (stamp: `count:max(updated_at)` of the caller's own news rows) only.
- Tests: `tests/js/post-crop.test.mjs`, `tests/js/post-sources.test.mjs`, `tests/unit/test_post_editor_panel.py`; delete `tests/js/news-*.test.mjs`, `story-library.test.mjs`, `tests/unit/test_story_library_section.py`, `test_issue_composer.py`, `test_overview_news_counts.py` (adapt if its counts still render).

**Interfaces:**
- `post-crop.mjs`: `clampCrop({x,y,zoom}) -> {x,y,zoom}` (same bounds as `Posts.parse_crop`); `panBy(crop, dxPx, dyPx, frameSizePx) -> crop` (drag moves the focal point opposite to the pointer, scaled by `1/zoom`); `zoomBy(crop, factor) -> crop`; `toStyle(crop) -> string` identical to `Posts.crop_style`.
- `post-sources.mjs`: `serialize(rows) -> string` (JSON, drops empty text, caps at 3); `defaults() -> rows` equal to `DEFAULT_SOURCE_LINES`.

- [ ] **Step 1: Failing JS tests:** `clampCrop({x:2,y:-1,zoom:99})` → `{x:1,y:0,zoom:4}`; `panBy({x:.5,y:.5,zoom:2}, 100, 0, 400)` → `x === 0.375`; `toStyle({x:.25,y:.5,zoom:1.5})` equals `"object-position:25% 50%;transform:scale(1.5);transform-origin:25% 50%"` — and a pytest asserts `Posts.crop_style` returns the same string for the same input (keeps the two renderers identical). `serialize` drops blank rows and caps at 3.
- [ ] **Step 2: Failing pytest:** dashboard render contains `.post-card[data-post-editor]`, the expiry button, and no `data-news-slot` / `issue-calendar` markup; `fragment/post-library` returns only the caller's posts.
- [ ] **Step 3: Run** `npm run test:js` and pytest — FAIL. **Step 4: Implement.** Drag/zoom: pointer drag on `.post-card__photo` calls `panBy`; wheel/pinch and a zoom slider call `zoomBy`; result written to a hidden `image_crop` input. Paste into `contenteditable` is plain text only and respects the `*_MAX` caps (counter shown).
- [ ] **Step 5: Run** — PASS. **Step 6: Commit** — `feat(posts): WYSIWYG post editor panel`.

### Task 8: Remove the newsletter remnants

**Files (delete):** `app/services/Issues.py`, `IssueCalendar.py`, `NewsCategories.py`, `app/models/Issue.py`, `IssueEvent.py`, `NewsCategory.py`, `app/controllers/gears/IssueCalendarController.py`, `NewsCategoryController.py`, templates `gears/partials/news-slots.html`, `story-library-issues.html`, `issue-calendar-*.html`, `news-categories-list.html`, `resources/js/issue-calendar-offer.mjs`, their routes, mix entries and tests (`test_issue_calendar*.py`, `test_issues_service.py`, `test_news_categories.py`, `test_news_soft_delete_scope.py`, `tests/js/issue-calendar-offer.test.mjs`, `news-category-modal.test.mjs`).
**Modify:** `templates/gears/dashboard.html` (drop categories panel include), `WelcomeController` (no Issues import), CLAUDE.md "News composer" / "Story Library" / "Each newsletter has its own calendar" sections → a short "Photo posts" section.

- [ ] **Step 1:** `grep -rn "Issues\|IssueCalendar\|NewsCategor\|group_news_slots\|BLOCK_TYPES\|_issue.html" app templates resources routes tests` — expected after deletion: no hits.
- [ ] **Step 2: Run** `make ci` — Expected: lint, pytest, JS tests, `npm run prod` all green.
- [ ] **Step 3: Commit** — `refactor(posts): remove newsletter, issues, calendar, categories`.

### Task 9: Ship, purge old data, drop old schema

**Files:**
- Create: `scripts/purge_newsletters.py` — uses `QueryBuilder` table access, not models (the `Issue`/`IssueEvent` models are gone after Task 8); default dry run printing counts (news rows incl. soft-deleted, issues, issue_events, image files, notifications whose `link` targets a deleted story); `--confirm` deletes inside one transaction then removes files via `delete_image_and_variants` (files after commit). Refuses to run unless a backup path passed with `--backup` exists and is non-empty.
- Create: `databases/migrations/2026_11_09_000200_drop_newsletter_schema.py` — drops `issue_events`, `issues`, `news_categories`, and `news.issue_id`, `news.layout_type`, `news.priority`, `news.category_id` (FK first); `down()` recreates structure only.
- Test: `tests/unit/test_purge_newsletters.py` (dry run deletes nothing; `--confirm` without `--backup` exits non-zero).

- [ ] **Step 1: Failing tests, Step 2: run, Step 3: implement, Step 4: pass, Step 5: commit** — `chore(posts): purge script and drop-newsletter migration`.
- [ ] **Step 6: STOP — ask the user** before shipping: `npm run prod` (Node 18) then restart gunicorn (`./lyn.sh` per its comments).
- [ ] **Step 7: STOP — ask the user**, then: `mysqldump` full backup to `storage/backups/presspoint-2026-11-09.sql` (outside git), `venv/bin/python scripts/purge_newsletters.py` (dry run, show counts to user), then `--confirm --backup <path>` only after the user approves the counts.
- [ ] **Step 8: STOP — ask the user**, then `craft migrate --force` for the drop migration and regenerate `databases/schema.sql`; commit schema.sql.

## Verification (end to end)

- `make ci` green.
- Browser (snap-chromium recipe in memory): as editor, build a post (drop photo, drag + zoom, change logo, kicker, headline, body, edit a source line, set expiry), submit; as admin, preview + approve; `/kiosk/latest-news` at 768×1024 shows the square card matching the editor; swipe between two posts; welcome flash ticker shows the headline; edit the live post as editor → gone from kiosk; set an expiry 2 minutes out, wait past it plus `NewsCache.TTL` → gone and, with nothing left, the empty card shows.
