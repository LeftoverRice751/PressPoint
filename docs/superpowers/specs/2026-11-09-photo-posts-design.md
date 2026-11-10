# Photo Posts — replace the newsletter on Latest News

> Design document (brainstorming output). After approval it is committed as
> `docs/superpowers/specs/2026-11-09-photo-posts-design.md`, then turned into an
> implementation plan via superpowers:writing-plans.

## Intent and why

Latest News on the kiosk is currently a broadsheet "newsletter": an *issue* made of
block slots (`lead`, `brief`, `photo_essay`, `editorial`, `quote`, `notice`), with a
per-issue events calendar, print/PDF, and next-morning-08:00 expiry. The publication
(The Gears) wants to ditch that for single **photo posts** — the social-card format
they already publish (sample: big photo, logo on top, white card with kicker,
headline, short paragraph, social footer). Simpler for editors to make, simpler for
students to read at the terminal.

## What a visitor sees (kiosk, `/kiosk/latest-news`)

- One post per screen, **square card centered** on the 768×1024 portrait kiosk, with
  the existing kiosk chrome/dots around it. Swipe left/right between published posts
  (same interaction as today's newsletter swiper).
- Card layout (top → bottom):
  1. Large photo, framed exactly as the editor cropped it (pan + zoom).
  2. Logo over the top of the photo — per-post upload; falls back to the site logo
     (`Branding.logo_url()` / `site_logo`).
  3. White rounded container overlapping the photo's bottom edge containing:
     optional **event title** (typed kicker, e.g. "HAPPENING NOW", bold display font
     in system colors) → **headline** → **paragraphs** (short body).
  4. **Source footer**: one or more lines, each an icon + text (e.g. Facebook
     `/TheGearsOfficial`, email `/thegearspublication@gmail.com`).
- The card is the whole post — no tap-through article.
- Decorative shapes from the sample are replaced with **flat shapes in the system
  palette** (kiosk tokens: maroon #6b2516, gold #f4be27, cream #e9dac4, plus kiosk
  palette amber/terracotta/crimson). **No gradients.**

## What an editor sees (dashboard News section)

- A ready-made **WYSIWYG template** of the card. No wizard; fill in any order:
  - drag & drop (or pick) a photo onto the canvas, then **drag to pan and zoom** to frame it;
  - change the logo (upload) or leave the site logo;
  - type event title (optional), headline, paragraphs;
  - edit source lines (default: the Gears Facebook + email; add/remove/edit lines,
    choosing an icon per line);
  - a button under the template opens a **date + time modal** to set expiry.
- Submit → admin approval (existing Review panel). Editors cannot publish.
- **Library**: editor sees their past posts and can **duplicate** one into a new draft.

## Decisions (user's)

- Admin approval kept, per post.
- Per-post expiry datetime via modal; **unset → 7 days after approval**.
- Library + duplicate kept. **Events calendar dropped. Print/PDF dropped.**
- **Existing newsletters deleted from the database** (production!).
- Source footer editable per post, defaulting to Gears pages.
- Photo: drag + zoom framing. Square card on kiosk. Event title is typed text.
- Default logo = site logo.
- **Editing a live post pulls it back to review** (leaves the kiosk until re-approved),
  same rule as today's `store()`.
- **All posts expired → a friendly Gears-branded "No new posts right now" card.**
  No "newest anyway" fallback.
- **Categories dropped**: no picker, the dashboard categories panel and
  `NewsCategories` go; `news.category_id` becomes nullable/dropped by migration.
- **Delete scope: every existing `news` row (drafts included), all `issues` and
  `issue_events`, and their image files + derivatives**, after a backup.

## Goals / non-goals / anti-goals

- Goals: editor builds a post in one screen that looks like the kiosk result; kiosk
  swipes through current approved posts; approval and the public-visibility gate
  remain airtight.
- Non-goals: full article bodies, free-form layout (moving elements around), events
  calendar, print/export, issue grouping.
- Anti-goals: a draft/pending post ever reaching the kiosk or the welcome flash ticker;
  editor preview differing from kiosk render; gradients; text overflowing the square.

## Constraints from the codebase (keep)

- `_news_is_public()` gate at all call sites incl. `WelcomeController._build_flash_articles()`
  (flash ticker must keep working from post headline/paragraphs).
- `_resolve_status_for_actor()` downgrade + `_normalize_news_status()` fail-closed.
- `ReviewQueue.content_stamp()` / `_STAMPED_FIELDS` must include every new rendered
  field (event title, logo, crop, source lines, expiry).
- `_may_change_story()` ownership check on every write; bleach sanitize text;
  `ImageUploads.read_upload` magic-byte validation; `ImageDerivatives` for photos,
  deleted with the post.
- One renderer: the editor canvas, review preview and kiosk all use the same Jinja
  card partial (replacing `kiosk/_issue.html`).
- Expiry date maths through `CAMPUS_TZ`; store aware UTC. Visibility rides `NewsCache.TTL`.
- Every new rendered field gets a migration + `databases/schema.sql` regen.
- Dashboard liveness: keep `news` / `story-library` sections in `FRAGMENTS`/`STAMP_MODELS`.
- New JS/CSS entries added to `webpack.mix.js`. Node 18 for builds.

## Builder's calls (my defaults — flagged for review)

- Reuse the `news` table rather than a new `posts` table: `title`=headline,
  `content`=paragraphs (plain/sanitized, length-capped so it fits the square),
  new columns: `kicker` (event title), `logo_path`, `image_crop` (JSON: x, y, zoom),
  `source_lines` (JSON list of `{icon, text}`), `expires_at` (DATETIME, UTC).
  `layout_type`/`priority`/`issue_id` become unused (dropped after cut-over).
- Drop the `issues` concept from the editor flow; the Library lists the editor's own
  posts (`IssueLibrary` reworked to per-post duplicate).
- Kiosk order: newest approval first.
- Icon set for source lines: Facebook, email, Instagram, website, generic link (inline SVG).
- Text length caps tuned so the longest allowed content fits the square at kiosk size.
- Old-data deletion runs as a one-off script behind a `mysqldump` backup and explicit
  confirmation at run time; deletes stories, issues, issue_events and their image files.
- Expiry lives **inside `_news_is_public()`**, so an expired post leaves every public
  surface (Latest News, lead teaser, welcome flash ticker) at once.
- The 7-day default is **computed and stored at approval** (`expires_at = approved + 7d`
  when unset), so the stamp and duplicates see a concrete value. Duplicating clears
  `expires_at`.
- Approving a post whose chosen expiry has already passed is refused (422) with a
  message; the admin can set a new expiry in the Review panel (expiry picker there too).
  Changing expiry, like any rendered field, re-enters review for editors.
- **Shipping order** (checkout is production): (1) ship the new post flow and kiosk
  render, with the old newsletter code removed in the same deploy; (2) then run the
  deletion script; (3) then the migration that drops `issues`/`issue_events`/category
  columns, plus a `schema.sql` regen. A brief empty Latest News (showing the empty card)
  between steps is acceptable.
- `notifications` rows pointing at deleted stories are deleted with them; `audit_logs`
  stays untouched (append-only).
- Remove dead code: `IssueCalendar`, `issue-print.*`, `issue-calendar-*` partials,
  `_issue.html`, block-type composer logic in `news-dashboard.js`, and their tests.

## Verification

- Unit: visibility gate (draft/review/expired never public, 7-day default),
  status downgrade, stamp covers new fields, ownership, sanitization, crop/source JSON
  validation, duplicate, delete removes derivatives + logo.
- JS tests for crop math and source-line editor.
- Browser (snap-chromium recipe): build a post, submit, approve, see it on
  `/kiosk/latest-news` at 768×1024, swipe, expiry drops it (and from the flash ticker);
  with zero live posts the empty card shows; editing a live post pulls it.
- `make ci` green.
