# Post Element Layout Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Editors can drag and resize the logo (over the photo) and the event title, headline and summary (inside the cream panel), and the kiosk renders exactly that layout.

**Architecture:** A nullable `news.element_layout` JSON column. NULL keeps today's flow layout; a complete layout switches the shared card template into a positioned mode where each piece is an absolutely placed `cqw` box. Pure geometry/formatting lives in `app/services/Posts.py` and `resources/js/post-layout.mjs` (string parity pinned on both sides); a new `resources/js/post-editor-layout.mjs` adds grips, corner handles and logo dragging to the editor only.

**Tech Stack:** Masonite 5 / masonite-orm / MySQL, Jinja, plain ES modules, laravel-mix (Node 18), pytest, `node --test`.

**Spec:** `docs/superpowers/specs/2026-11-10-post-element-layout-design.md` (addendum to `docs/superpowers/specs/2026-11-09-photo-posts-design.md`)

## Global Constraints

- All layout numbers are `cqw` (1% of card width); the card is a 100×100 cqw square.
- Stored shape: `{"panel_h": n, "logo": {"x","y","s"}, "kicker": {"x","y","w","h","s"}, "headline": {...}, "body": {...}}`; logo x,y relative to the card, text x,y relative to the panel; all five keys required.
- Ranges: x,y 0–100; w 5–100; h 1–70; s 0.5–2.5 (logo and text); panel_h 25–70. Numbers stored rounded to 2 decimals.
- Geometry: text box `x ≥ 0`, `x + w·s ≤ 100`, `y ≥ 0`, `y + h·s ≤ panel_h`; no two text boxes intersect (touching edges allowed); logo `y + 11·s ≤ 100 − panel_h`, `x ≤ 100`.
- Logo box height is `11cqw·s`, max width `34cqw·s`.
- 422 copy: malformed/out-of-range → `"Could not read the layout. Reload the post and try again."`; geometry → `"The layout doesn't fit — move or shrink a piece."`
- NULL / empty `element_layout` = flow mode, unchanged from today. Existing posts must render byte-identically.
- No gradients; no `|safe`; one renderer (`templates/kiosk/_post_card.html`).
- Commit trailer: `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.

## Review Focus

1. A post typed longer after it was positioned: the stored `h` must be re-measured before save, or the kiosk clips the last line → Task 4 test `remeasure updates h before serialize`.
2. A draft whose text overflows must still save (geometry is enforced only for review/publish intents) → Task 2 test `test_draft_saves_layout_that_does_not_fit`.
3. A legacy/flow post (NULL layout) must render exactly as before → Task 3 test `test_flow_card_markup_unchanged_without_layout`.
4. A logo dragged while the photo is being panned must not pan the photo → Task 4 wiring test `logo pointerdown stops propagation`.
5. Non-finite numbers (`NaN`, `Infinity`, strings) in posted JSON → Task 1 test `test_parse_layout_rejects_non_finite`.

---

### Task 1: Layout rules in the Posts service

**Files:**
- Modify: `app/services/Posts.py`
- Test: `tests/unit/test_post_layout.py` (create)

**Interfaces:**
- Produces:
  - `LAYOUT_PIECES = ("kicker", "headline", "body")`, `LOGO_BASE_H = 11`, `LOGO_BASE_MAX_W = 34`
  - `parse_layout(raw) -> dict | None` — `None`/`""`/`"null"` → `None`; otherwise a normalised dict (floats rounded to 2 dp) or raises `ValueError` for malformed JSON, missing keys, non-finite or out-of-range numbers.
  - `layout_problems(layout: dict) -> list[str]` — geometry violations per the Global Constraints (empty list when it fits). Messages name the piece, e.g. `"headline overlaps body"`, `"body is outside the panel"`, `"logo is outside the photo"`.
  - `layout_styles(layout: dict | None) -> dict | None` — `{"panel": str, "logo": str, "kicker": str, "headline": str, "body": str}` using `_two_decimals`:
    - panel: `height:{panel_h}cqw`
    - logo: `left:{x}cqw;top:{y}cqw;--s:{s}`
    - text: `left:{x}cqw;top:{y}cqw;width:{w·s}cqw;height:{h·s}cqw;--s:{s}`
  - `card_context()` gains `"layout"` (parsed dict or None, garbage → None, never raises) and `"layout_styles"`.

- [ ] **Step 1: Write failing tests** in `tests/unit/test_post_layout.py`:
  - `test_parse_layout_empty_is_none` (`None`, `""`, `"null"` → None)
  - `test_parse_layout_valid_round_trip` (a fitting layout comes back with values rounded to 2 dp, e.g. `x=10.004 → 10.0`)
  - `test_parse_layout_rejects_missing_piece` (no `"body"` → ValueError)
  - `test_parse_layout_rejects_non_finite` (`"NaN"`, `float("inf")`, `"abc"` → ValueError)
  - `test_parse_layout_rejects_out_of_range` (s=3, panel_h=80, w=2 → ValueError)
  - `test_layout_problems_fits` → `[]`
  - `test_layout_problems_overlap` (headline box intersecting body → contains `"headline overlaps body"`)
  - `test_layout_problems_touching_edges_ok` (headline bottom == body top → `[]`)
  - `test_layout_problems_outside_panel` (`x + w·s = 101` → problem)
  - `test_layout_problems_logo_on_panel` (`logo.y + 11·s > 100 − panel_h` → problem)
  - `test_layout_styles_strings` — literal expected strings, e.g. layout `{"panel_h":44,"logo":{"x":40,"y":4,"s":1},"kicker":{"x":10,"y":5,"w":30,"h":3.5,"s":1.2},...}` gives logo `"left:40cqw;top:4cqw;--s:1"` and kicker `"left:10cqw;top:5cqw;width:36cqw;height:4.2cqw;--s:1.2"`. Use the same literals in Task 3's JS test (parity).
  - `test_card_context_layout_garbage_is_none` (`element_layout="{bad"` → `layout` None, no raise)
- [ ] **Step 2:** `venv/bin/python -m pytest tests/unit/test_post_layout.py -q` → FAIL (AttributeError).
- [ ] **Step 3:** Implement the three functions and the `card_context` keys in `Posts.py`. Geometry uses the rounded values; touching edges are not overlap (strict `<`).
- [ ] **Step 4:** Same command → PASS; `venv/bin/python -m pytest tests/unit/test_posts_service.py -q` still passes.
- [ ] **Step 5:** Commit `feat(posts): layout rules (parse, geometry, styles)`.

### Task 2: Persist the layout

**Files:**
- Modify: `databases/migrations/2026_11_09_000100_add_post_fields_to_news.py` (add `element_layout` TEXT NULL; add to `POST_COLUMNS`)
- Modify: `databases/schema.sql` (add `` `element_layout` text COLLATE utf8mb4_unicode_ci, `` after `source_lines`)
- Modify: `app/models/News.py` (`__fillable__` += `element_layout`)
- Modify: `app/controllers/gears/NewsController.py` (`store`)
- Modify: `app/services/PostLibrary.py` (`editor_fields` += `"layout"`; `duplicate` copies the column)
- Modify: `app/services/ReviewQueue.py` (`_STAMPED_FIELDS` += `"element_layout"`)
- Test: `tests/unit/test_post_endpoints.py`, `tests/unit/test_post_library.py`, `tests/unit/test_post_schema.py`, and the existing review-queue stamp test file (find with `grep -rln content_stamp tests/unit`)

**Interfaces:**
- Consumes: `Posts.parse_layout`, `Posts.layout_problems` (Task 1).
- Produces: form field `element_layout` (JSON string; empty = flow mode) on `news.store`; `editor_fields(post)["layout"]` (dict or None); stamp covers the layout.

Rules in `store`: empty → store NULL (on update, write NULL with `cast=False`-style direct update only if needed — a TEXT column has no `__dates__` trap, so assigning `None` is fine). `ValueError` from `parse_layout` → 422 with the malformed copy, for any status. `layout_problems` non-empty → 422 with the geometry copy **only** when status is `review` or a publish intent (same gate as the photo/headline check). Stored value is `json.dumps(parsed)`.

- [ ] **Step 1: Write failing tests:**
  - `test_store_saves_layout` (valid layout JSON → `element_layout` saved as normalised JSON)
  - `test_store_empty_layout_is_null`
  - `test_store_malformed_layout_422` (copy matches)
  - `test_submit_layout_that_does_not_fit_422` (status `review`, overlapping boxes → geometry copy)
  - `test_draft_saves_layout_that_does_not_fit` (status `draft`, same layout → saved)
  - `test_duplicate_copies_layout`, `test_editor_fields_layout`
  - stamp test: changing only `element_layout` changes `content_stamp`
  - schema test: `element_layout` present in `schema.sql` and the migration's `POST_COLUMNS`
- [ ] **Step 2:** Run those tests → FAIL.
- [ ] **Step 3:** Implement.
- [ ] **Step 4:** `venv/bin/python -m pytest tests/unit -q -k "post or review"` → PASS.
- [ ] **Step 5:** Commit `feat(posts): store element layout`.

### Task 3: Positioned render mode + JS layout module

**Files:**
- Modify: `templates/kiosk/_post_card.html`
- Modify: `resources/css/post-card.css`
- Modify: `resources/js/post-crop.mjs` (export the formatter as `formatNumber`; `toStyle` unchanged)
- Create: `resources/js/post-layout.mjs`
- Test: `tests/js/post-layout.test.mjs` (create), `tests/unit/test_kiosk_posts.py`

**Interfaces:**
- Consumes: `card.layout`, `card.layout_styles` (Task 1).
- Produces (`post-layout.mjs`, DOM-free):
  - constants mirroring Python: `PIECES`, `LOGO_BASE_H = 11`, ranges
  - `toStyles(layout) -> {panel, logo, kicker, headline, body}` — byte-identical to `Posts.layout_styles`
  - `clampBox(box, area) -> box` — keeps `{x,y,w,h,s}` (scaled size `w·s × h·s`) inside `area = {x0,y0,x1,y1}`
  - `overlaps(a, b) -> bool` — strict intersection of scaled boxes
  - `problems(layout, {footerH, logoW}) -> string[]` — same messages as `Posts.layout_problems`, plus the text area excludes the footer (`y + h·s ≤ panel_h − footerH`) and the logo's measured width (`x + logoW ≤ 100`)
  - `nudge(box, dx, dy, area) -> box`
  - `round2(n) -> number`

Template: when `card.layout` is set, the `<article>` gets class `post-card--positioned` and the panel/logo/kicker/headline/body get `style="{{ card.layout_styles.<piece> }}"` (autoescaped strings, no `|safe`). Without a layout, markup is byte-identical to today. Kiosk keeps omitting an empty kicker.

CSS (`.post-card--positioned` only): photo `position:absolute; inset:0 0 auto 0; height: calc(100cqw − var(--panel-h) + 5cqw)` (or equivalent so the photo fills above the panel with the 5cqw tuck); panel `position:absolute; left:0; right:0; bottom:0; margin:0; display:block; padding:0`; footer `position:absolute; left:0; right:0; bottom:3cqw`; pieces `position:absolute; margin:0; overflow:hidden; box-sizing:border-box`; font sizes become `calc(<today's size> * var(--s, 1))`; logo `transform:none; height:calc(11cqw * var(--s,1)); max-width:calc(34cqw * var(--s,1))`. Flow-mode rules untouched.

- [ ] **Step 1: Write failing tests:**
  - JS: `toStyles` matches the literal strings from Task 1's `test_layout_styles_strings`; `clampBox` (box past right edge pulled back; scaled size respected); `overlaps` (touching → false, 0.1 overlap → true); `problems` (footer region counts; logo width counts); `nudge` stops at edge.
  - Python: `test_flow_card_markup_unchanged_without_layout` (render `_post_card.html` for a card without layout; assert no `post-card--positioned` and no `style=` on panel/kicker/headline/body); `test_positioned_card_renders_styles` (layout present → class and the exact style strings).
- [ ] **Step 2:** `npm run test:js` and the two pytest tests → FAIL.
- [ ] **Step 3:** Implement module, template and CSS.
- [ ] **Step 4:** Tests → PASS; `post-crop.test.mjs` and `test_post_crop_parity.py` still pass.
- [ ] **Step 5:** Commit `feat(posts): positioned card render mode`.

### Task 4: Editor interaction

**Files:**
- Create: `resources/js/post-editor-layout.mjs`
- Modify: `resources/js/post-editor.js` (create the controller; `load()` applies `row.layout`; `save()` appends `element_layout`; submit disabled while problems exist)
- Modify: `resources/js/post-editor-photo.mjs` only if the logo needs a hook (logo pointerdown must not reach the photo frame)
- Modify: `resources/css/post-editor.css` (overlay frames, grip, corner handle, `.is-misplaced` red outline — solid colours)
- Test: `tests/js/post-editor-layout.test.mjs` (create; pure helpers + a source-level wiring test in the style of `tests/js/post-editor-wiring.test.mjs`)

**Interfaces:**
- Consumes: `post-layout.mjs` (Task 3), row `layout` from `editor_fields` (Task 2).
- Produces: `createLayoutEditor({ card, onChange, onProblems }) -> { load(layout|null), serialize() -> string, problems() -> string[], remeasure() }`
  - `serialize()` returns `""` while in flow mode, else `JSON.stringify(layout)` after `remeasure()`.
  - Pure, exported for tests: `snapshot(measures, cardPx) -> layout` (px rects → cqw, s=1, rounded) and `pxToCqw(px, cardPx)`.

Behaviour (spec): overlay frame per piece (outside the contenteditable — never inject children into it) with a move grip (`<button aria-label="Move headline">`) and a corner resize handle; logo dragged by the image itself; pointer events (mouse + touch); first drag/resize/nudge snapshots every piece (text measured at `width: fit-content` capped to the panel width; empty kicker measured with its placeholder) and switches the card to `post-card--positioned`; drag clamps to the area; resize changes only `s` within 0.5–2.5 and stops when the box would leave the area; a drop/resize that overlaps another piece returns to the last valid box; arrow keys on a focused grip nudge 1cqw (Shift 5cqw); every text input re-measures `h` and re-runs `problems()`; problems add `.is-misplaced` to the piece, disable Submit for review with the message `"A piece doesn't fit — move or shrink it."` in the errors list; Save draft stays enabled. Kiosk/review never load this module.

- [ ] **Step 1: Write failing tests:** `snapshot converts px to cqw and sets s=1`; `pxToCqw`; `remeasure updates h before serialize` (inject a measure function); `serialize is empty in flow mode`; wiring: `post-editor.js appends element_layout`, `logo pointerdown stops propagation`, `submit is disabled while problems exist`.
- [ ] **Step 2:** `npm run test:js` → FAIL.
- [ ] **Step 3:** Implement; add any new entry to `webpack.mix.js` only if it is a new bundle entry (it is imported by `post-editor.js`, so it should not be).
- [ ] **Step 4:** `npm run test:js` → PASS; `export PATH="$HOME/.nvm/versions/node/v18.20.8/bin:$PATH" && npm run prod` builds; then `git checkout -- mix-manifest.json`.
- [ ] **Step 5:** Commit `feat(posts): drag and resize card pieces in the editor`.

### Controller steps (not dispatched)

- Before Task 2: `ALTER TABLE presspoint_preview.news ADD COLUMN element_layout TEXT NULL AFTER source_lines` (preview DB only; the worktree `.env` points there).
- After Task 4: browser pass on the :8001 preview — drag/resize each piece, overlap refused, edge stop, overflow blocks submit, approve as admin, kiosk card matches the editor.
- Update `CLAUDE.md` "Photo posts" with two lines on `element_layout` (flow vs positioned, server geometry gate on review only).
