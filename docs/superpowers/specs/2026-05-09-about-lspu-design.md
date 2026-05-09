# About LSPU — Design Spec

**Date:** 2026-05-09
**Status:** Approved for planning
**Surface:** Kiosk page + editor dashboard module

## 1. Goal

Add an "About LSPU" feature to the PressPoint kiosk system with editor-managed content. Six fixed sections, hub-and-spoke navigation, optimised for walk-up touch use on a kiosk. Editors maintain content from `gears/dashboard`.

## 2. Scope

The 6 sections (fixed, in this order):

1. **Mission, Vision & Mandate** — three sub-blocks (Mission / Vision / Mandate)
2. **Group Values & Performance Pledge** — two sub-blocks
3. **Historical Development** — vertical timeline of milestones
4. **Quality Policy** — single rich-text statement
5. **University Hymn** — formatted lyrics (text only, no audio)
6. **University Seal** — image + paragraph description

Out of scope: hymn audio, interactive seal hotspots, multi-language, public-web (non-kiosk) presentation.

## 3. Architecture Overview

Two faces, single backend:

- **Kiosk** (`GET /kiosk/about-lspu`) — Hub & Spoke landing with 6 colorful tiles. Tapping a tile swaps the detail view client-side (no full reload). 60 s of idle inside any detail returns to the hub.
- **Editor** (`GET /gears/about-lspu`, linked from `gears/dashboard`) — One page with 6 collapsible accordions, each a WYSIWYG form. History uses a milestone repeater. Seal includes an image upload field.

Server-side rendering via Masonite + Jinja2; sections fetched via Masonite ORM.

## 4. Data Model

Two new MySQL tables (Masonite migration):

```
about_sections
  id              BIGINT PK
  slug            VARCHAR(40)  UNIQUE  -- 'mission','values','history','quality','hymn','seal'
  title           VARCHAR(150)
  body_html       LONGTEXT NULL        -- sanitized rich text (used by quality, hymn)
  subsections     JSON NULL            -- multi-part: [{heading, body_html}, ...] (mission, values)
  image_path      VARCHAR(255) NULL    -- used by seal
  updated_at      TIMESTAMP
  updated_by_id   BIGINT FK -> users.id NULL

about_milestones
  id              BIGINT PK
  year            VARCHAR(20)          -- string allows ranges like "1952–1957"
  heading         VARCHAR(200)
  body_html       LONGTEXT
  image_path      VARCHAR(255) NULL
  sort_order      INT
  updated_at      TIMESTAMP
```

**Per-section field usage:**

| slug      | body_html | subsections                                                          | image_path | milestones |
|-----------|-----------|----------------------------------------------------------------------|------------|------------|
| mission   | —         | `[{heading: "Mission"}, {heading: "Vision"}, {heading: "Mandate"}]` | —          | —          |
| values    | —         | `[{heading: "Group Values"}, {heading: "Performance Pledge"}]`     | —          | —          |
| history   | optional intro | —                                                              | —          | yes        |
| quality   | yes       | —                                                                    | —          | —          |
| hymn      | yes       | —                                                                    | —          | —          |
| seal      | yes (description) | —                                                            | yes        | —          |

The seed migration creates all 6 rows so the kiosk page never sees missing sections.

**Why JSON for two sections only:** Mission/Vision/Mandate and Values/Pledge are fixed-shape multi-part blocks. JSON keeps the structure local without an extra table; the timeline is the only variable-length child collection, so it gets its own normalised table.

## 5. Kiosk Page UX

### Hub view

- Reuses the kiosk-tour hero pattern (`templates/kiosk/kiosk-tour.html:17-21`): gears logo + "PRESSPOINT" wordmark + subtitle.
- Page subtitle: "About LSPU".
- 3×2 tile grid (portrait kiosk default; falls back to 2×3 below 900 px width).
- Each tile: emoji icon, section title, one-line teaser, solid color background per section (no gradients):
  - mission → blue, values → amber, history → green, quality → purple, hymn → pink, seal → cyan
  - All tile backgrounds use single flat colors — no gradients anywhere in the About LSPU UI (kiosk or editor)
- Bottom-right pill: "◀ Back to Kiosk" (returns to `/kiosk`).

### Detail view

- Same page, no full reload. JS swaps content into a `<section id="about-stage">` panel.
- Detail header: ◀ Back to Hub · section title · idle indicator dot.
- Per-section layout:
  - **mission** → 3 stacked sub-cards (one per sub-block)
  - **values** → 2 stacked sub-cards
  - **history** → optional intro + vertical timeline rail with year chips and milestone cards alternating left/right (stacks single-column on narrow viewports)
  - **quality** → centered formal-statement card
  - **hymn** → lyrics in styled stanzas, large readable type
  - **seal** → seal image (left) + description (right); stacks on narrow viewports

### Idle handling

- Single JS timer. `pointerdown`, `touchstart`, `wheel`, `keydown` reset it.
- 60 s with no input outside the hub → fade transition back to hub view.
- Timer is not active on the hub itself.

## 6. Editor Dashboard UX

New route `/gears/about-lspu`, linked from a new card on `gears/dashboard`. Layout: stacked accordions, one per section, each independently saveable.

```
[ About LSPU Editor ]
─────────────────────────────────────────
▼ 🎯 Mission, Vision & Mandate          [Save]
   Mission    [WYSIWYG]
   Vision     [WYSIWYG]
   Mandate    [WYSIWYG]

▼ 🤝 Group Values & Performance Pledge  [Save]
   Group Values         [WYSIWYG]
   Performance Pledge   [WYSIWYG]

▼ 📜 Historical Development              [Save intro]
   Intro paragraph (optional)  [WYSIWYG]
   Milestones:
   [+ Add milestone]
   ┌─ Milestone ─────────────  [↑] [↓] [✕]
   │  Year     [____]
   │  Heading  [____]
   │  Body     [WYSIWYG]
   │  Image    [Upload]
   └────────────────────────────

▼ ⭐ Quality Policy                      [Save]
▼ 🎵 University Hymn                     [Save]
▼ 🛡️ University Seal                     [Save]
   Image  [Upload]   Description [WYSIWYG]
```

- Each accordion has its own form; saving one section does not blow away dirty state in another.
- Milestone reorder uses arrow buttons (no drag-and-drop in this iteration).
- Auth: existing auth middleware + an `editor` role check (gracefully redirect to login if missing).
- WYSIWYG library: **Quill** (lightweight, no API key, MIT-licensed). Toolbar restricted to: bold, italic, underline, ordered list, unordered list, link, h3, h4, blockquote, clean.
- Server-side sanitisation: **bleach** (Python). Allowed tags: `p, br, strong, em, u, ul, ol, li, a, h3, h4, blockquote`. Allowed attributes: `a[href, title, rel]`. Strip everything else, including inline `on*` handlers, `<script>`, `<style>`, `<iframe>`.

## 7. Routes & Controller

```python
# routes/public.py (already has /kiosk/about-lspu — replace stub controller method)
Route.get ("/kiosk/about-lspu",                       "AboutController@kiosk").name("kiosk.about-lspu")

# routes/dashboard.py — new entries, behind auth + editor role middleware
Route.get ("/gears/about-lspu",                       "AboutController@editor").name("gears.about-lspu")
Route.post("/gears/about-lspu/sections/@slug",        "AboutController@save_section")
Route.post("/gears/about-lspu/milestones",            "AboutController@create_milestone")
Route.post("/gears/about-lspu/milestones/@id",        "AboutController@update_milestone")
Route.post("/gears/about-lspu/milestones/@id/delete", "AboutController@delete_milestone")
Route.post("/gears/about-lspu/milestones/@id/reorder","AboutController@reorder_milestone")
Route.post("/gears/about-lspu/seal/upload",           "AboutController@upload_seal")
```

`app/controllers/AboutController.py` — methods:
- `kiosk()` — loads all 6 sections (eager) + milestones ordered by `sort_order`, renders `templates/kiosk/about-lspu.html`.
- `editor()` — loads same data, renders `templates/gears/about-lspu.html`.
- `save_section(slug)` — validates slug, sanitises body_html and any subsection HTML, persists, sets flash, redirects.
- `create_milestone()` / `update_milestone(id)` / `delete_milestone(id)` / `reorder_milestone(id)` — CRUD.
- `upload_seal()` — validates mimetype + size, writes to `storage/about/`, updates `seal.image_path`.

Models: `app/models/AboutSection.py`, `app/models/AboutMilestone.py` (standard `masonite-orm` Models). `subsections` cast to JSON on load.

Static files served via existing `Route.get("/storage/@path:any", "VideoController@serve_storage")`.

## 8. Error Handling & Edge Cases

- **Missing section row** → controller falls back to a stub "Coming soon" card for that tile (never crashes); seed prevents this on fresh deploys.
- **Image upload validation** → mimetype in `{image/jpeg, image/png, image/webp}`, size ≤ 4 MB, generated random filename to avoid path traversal/clobbering.
- **HTML sanitisation** → bleach strips all disallowed tags/attrs before persistence. Defence-in-depth: also `|safe`-render only sanitised content in templates.
- **CSRF** → Masonite's built-in middleware (already global) covers all POST endpoints.
- **Concurrent edits** → last-write-wins; acceptable for a single editorial team.
- **Auth/role bypass** → middleware redirects unauthenticated users; non-editor roles get 403.

## 9. Testing

- **Feature tests:**
  - `save_section` rejects unknown slug
  - `save_section` strips `<script>` from body_html
  - `upload_seal` rejects non-image mimetype and >4 MB
  - `create_milestone` / `delete_milestone` round-trip
  - `/kiosk/about-lspu` renders with all 6 tiles + at least one milestone visible
  - Unauthenticated request to `/gears/about-lspu` redirects
- **Manual:**
  - Editor full-flow on each section
  - Kiosk idle timer (60 s in detail view returns to hub)
  - Seal image upload + visibility on kiosk

## 10. Files to Add / Modify

**New:**
- `databases/migrations/<ts>_create_about_sections_table.py`
- `databases/migrations/<ts>_create_about_milestones_table.py`
- `databases/migrations/<ts>_seed_about_sections.py` (or a seeder)
- `app/models/AboutSection.py`
- `app/models/AboutMilestone.py`
- `app/controllers/AboutController.py`
- `templates/kiosk/about-lspu.html`
- `templates/gears/about-lspu.html`
- `resources/css/about-lspu-kiosk.css` (or `.scss` per existing pipeline)
- `resources/css/about-lspu-editor.css`
- `resources/js/about-lspu-kiosk.js`
- `resources/js/about-lspu-editor.js`
- `tests/feature/test_about_lspu.py`

**Modify:**
- `routes/public.py` — keep route, repoint to `AboutController@kiosk`
- `routes/dashboard.py` — add editor + save routes
- `templates/gears/dashboard.html` — add "About LSPU" card linking to editor
- `webpack.mix.js` — register new CSS/JS bundles
- `requirements.txt` — add `bleach`

## 11. Out of Scope (deliberate)

- Hymn audio playback, interactive lyrics
- Interactive (hotspot) seal
- Multi-language support
- Drag-and-drop milestone reordering
- Public (non-kiosk) About page
- Edit history / versioning

These can be added later without schema changes (audio path, hotspot JSON, locale column) but are not built now.
