# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

PressPoint is a Masonite 5 (Python) web app for LSPU's student publication, *The Gears*. It serves two very different audiences from one codebase:

- **Kiosk** — a public, unauthenticated touchscreen UI at `/kiosk/*`, designed for a 768x1024 portrait terminal on campus. News, PDF archives, campus wayfinding map, 360° virtual tour, org board, About LSPU.
- **GEARS CMS** — the authenticated editor dashboard at `/gears/*` plus the auth/admin surfaces, where staff upload archives, compose the news layout, push videos to the kiosk, and manage users.

Production runs at `presspoint-gears.me` behind Cloudflare → nginx → gunicorn (unix socket).

## Commands

All Python runs through the in-repo virtualenv (`venv/`); there is no activation step in these examples.

```bash
venv/bin/python craft serve              # dev server, http://localhost:8000
./lyn.sh                                 # production: gunicorn on presspoint.sock (5 worker processes)

npm run watch                            # rebuild assets on change (laravel-mix)
npm run prod                             # production build (adds version hashes)
# ^ both need Node 18 (.nvmrc). Under a newer default node the build dies with
#   "require is not defined in ES module scope" from yargs. Prefix with:
#   export PATH="$HOME/.nvm/versions/node/v18.20.8/bin:$PATH"

venv/bin/python -m pytest -q             # test suite
venv/bin/python -m pytest tests/unit/test_news_slots.py::NewsSlotsTestCase::test_x   # single test
make lint                                # flake8 (max-line-length 99)
make format                              # black (line-length 99), then lint

venv/bin/python craft migrate            # also: migrate:status, migrate:rollback, migrate:refresh
venv/bin/python craft seed:run           # runs databases/seeds/database_seeder.py
venv/bin/python craft routes:list
venv/bin/python craft tinker             # python shell with the container loaded
```

**`craft serve` is single-threaded and must stay that way.** Masonite resolves `Response` as a container singleton, so `--threaded` (and gunicorn `--threads`/`gthread`) races on one shared response object. Concurrency comes from separate gunicorn *processes* only — see the comment block in `lyn.sh` before changing worker settings.

**The `.env` in this repo is the production config** (`APP_ENV=production`, `APP_URL=https://presspoint-gears.me`, live MySQL `presspoint`). Any `craft migrate`/`seed:run` here writes to the real database. `masonite.sqlite3` at the repo root is an empty leftover — nothing uses it.

Known current state of the suite: `pytest tests/unit/` gets 116 passing / 1 failing (`test_kiosk_broadcasts.py::test_upload_broadcasts_saved_video_path`) — don't assume a green baseline.

## Architecture

### Request path

`wsgi.py` → `Kernel.py` (binds every location: controllers, models, views, migrations…) → `routes/web.py`, which concatenates six route modules: `public`, `dashboard`, `auth`, `map`, `news`, `super_admin`. Every route is inside the `web` middleware group (session, load user, CSRF).

Route middleware keys (`Kernel.route_middleware`): `auth` (logged-in or redirect to login), `admin` (`role == "admin"`), `super_admin` (`role == "superadmin"`), and `throttle` — a *keyed* middleware used as `.middleware("throttle:auth")`; it takes an argument, so it must never sit bare in a group. `throttle:auth` resolves to `GuestAuthLimiter` (registered in `AppProvider.boot()`), which keys by `CF-Connecting-IP` because a bare `throttle:5/minute` would count globally and let one attacker lock everyone out of login.

`DatabaseReconnectMiddleware` runs on every request as HTTP middleware and clears the singleton QueryBuilder's cached MySQL connection. Without it, MySQL REPEATABLE READ pins each gunicorn worker to a stale snapshot and editors see old data until restart. Don't remove it while the ORM connection is a container singleton.

Controllers stay thin; the real logic lives in `app/services/` (a namespace package — there is no `__init__.py`, imports are `from app.services import X`).

Controllers are grouped by surface: `app/controllers/kiosk/` (the public touchscreen), `app/controllers/gears/` (the authenticated dashboard), `app/controllers/auth/` (sign-in, password reset, super admin). Route strings carry the folder — `"kiosk.WelcomeController@show"`, `"gears.NewsController@store"` — and so do test patch targets (`app.controllers.gears.NewsController.News`). A few controllers straddle both surfaces (`ArchivesController` serves the kiosk reader *and* the dashboard upload); they sit with the audience they primarily serve. Anything resolving a path relative to `__file__` inside a controller is now three levels from the repo root, not two.

### Storage: two roots, one URL space

`app/services/StorageRouter.py` is the single resolver. Paths whose first segment is in `NAS_FOLDERS` (`Archives`, `Videos`, `About`, `Branding`) resolve to the GearsNAS Samba mount (`GEARSNAS_BASE`, default `/mnt/nas_storage/gears_data`); everything else resolves to `storage/framework/public`. Editors read/write the same NAS files over SMB, which is why `ArchiveServices` renders with a group-writable umask (0664/0775).

In production **nginx serves both roots directly** (`deploy/nginx-presspoint.conf`) and only falls back to Python on a miss. The regex location there mirrors `NAS_FOLDERS` — **keep the two in sync**. `VideoController.serve_storage` is the Python fallback and reads ranges into memory, so it must not become the hot path again.

Always run DB- or user-supplied paths through `StorageRouter.is_safe_path()` before serving or deleting.

### Frontend assets

One laravel-mix entry per page, compiled to `storage/compiled/{js,css}` and served at `/assets/…` (mapped by `STATICFILES` in `config/filesystem.py`, and by nginx in production). Templates link them by hand: `<link rel="stylesheet" href="/assets/css/kiosk-map.css">`. **A new `resources/js|css` file does nothing until it is added to `webpack.mix.js`.**

Vendor CSS (Swiper, Quill) and vendor JS (pdf.js, the 2.5D map layer, the service worker) are `mix.copy`'d verbatim rather than JS-imported — Mix extracts JS-imported CSS to `storage/compiled/js/<entry>.css`, an unlinked path that silently shadows the real stylesheet.

Page JS is plain IIFE/`DOMContentLoaded` ES, no framework. Server → client wiring is via `data-*` attributes on a root element (e.g. `[data-dashboard-shell]`, `data-video-push-url`), and CSRF via the `<meta name="csrf-token">` in `templates/base.html`.

### Dashboard liveness

`DashboardController` exposes `fragment/@section` and `stamps`. A fragment re-renders **the same Jinja partial the full page uses**, so an injected row can never differ from a freshly-rendered one; `_section_stamp()` is a cheap `count:max(updated_at)` marker the browser polls every 20s (`resources/js/dashboard-live.js`) to detect another editor's changes without refetching rows. Panels opt in with `data-live-section` / `data-live-target`. Adding a section means adding to both `FRAGMENTS` and `STAMP_MODELS`.

Per-section context builders live in `app/services/DashboardContext.py`; `full_context()` composes them for the full page render.

### Realtime (Pusher)

Broadcasts are best-effort and never fatal: every call site checks `_pusher_configured()` and swallows exceptions, and the JSON response reports `broadcast: true/false`. Channels in use: `kiosk-channel` (lock/unlock the kiosk), `editorial` (`play-video` push from the dashboard), `flash-updates-channel` (`new-news`). `EditorialController._sanitize_video_src` only accepts local `/storage/` paths — no absolute URLs.

### News composer

A story's placement is `layout_type` ∈ {`main`, `secondary` (max 4), `widget` (max 2), `unassigned`} plus an **ascending** `priority` (lower renders first, so "Position #1" is literally true). `group_news_slots()` in `DashboardContext` is the single source of truth for that split and is used by both the kiosk render and the editor canvas; `unassigned` stories are excluded from every bucket *including* the main fallback, so an unplaced story can never become the lead.

Bodies are authored in Quill and sanitized with `bleach` against a formatting-only allowlist on write (`NewsController._sanitize_news_html`) because the kiosk renders them as HTML. Uploaded images get `.large`/`.thumb` WebP derivatives (`app/services/ImageDerivatives.py`, exposed to templates as the `news_image` Jinja filter registered in `AppProvider.register()`); deleting a story must delete the derivatives too or they orphan forever.

Note `AppProvider.register()` vs `boot()`: view filters and shared values must be registered in `register()` — `boot()` runs per request *after* the template has rendered.

### Org board

`organizations` (a department or a student org, told apart by `kind`) each own a tree of `members` — `members.organization_id`, plus a self-referencing `parent_id` for the reporting line. Nothing else joins to them.

This used to be a `departments` table with a UNIQUE `location_id` into `locations`, auto-populated from every Department-type location on each dashboard render, with both the dashboard and the kiosk filtering out any row that didn't resolve back to such a location. An editor could not add a row — that's why it was replaced. **Don't reintroduce a locations join here.**

- `app/services/OrgBoardTree.py` builds the tree for both surfaces. `member_node()`'s keys are a JSON contract read by `templates/kiosk/org-board.html` and `resources/js/org-board-editor.js` — renaming one side alone silently breaks the board.
- A chart never nests across organizations: a member whose parent sits elsewhere is promoted to a root instead.
- `members.organization_id` is `ON DELETE CASCADE`, so `OrgBoardController.destroy_organization` refuses to delete an organization that still has members. Without that guard, removing a college wipes its whole chart with no warning.
- The three organization `<select>`s are fed by `organization_groups` and re-synced after a live fragment refresh from the JSON block in `gears/partials/organizations-list.html`, so a newly added organization is immediately assignable without a reload.

### Archives

Editors upload PDFs to the NAS; `ArchiveServices` (PyMuPDF/`fitz`) rasterizes pages to PNG at `PAGE_RENDER_ZOOM = 1.8`, eagerly pre-warming the first 20 pages and rendering the rest on demand via `ArchivesController.page`. Covers live under `Archives/covers/`, pages under `Archives/pages/<slug>/page-N.png` (1-indexed to match what a reader sees). `resources/js/sw-archives.js` is a cache-first service worker for `/storage/Archives/**`, served from `/sw-archives.js` — bump `CACHE_NAME` after replacing archive files.

### Campus map and wayfinding — read this before touching coordinates

`locations.latitude` / `locations.longitude` **are not WGS84**. They are pixel positions on `storage/public/campus-map.png` (1218x1113) in Leaflet `CRS.Simple` space: `latitude` is y, `longitude` is x. The column names are historical; every consumer treats them as pixels.

**There are two pixel spaces, and only one is safe to draw in.** The 2.5D layer keeps the QGIS convention — y running *down* from the top, so negative (`lat = -y`, campus at y ∈ [-1065, -30]). Stored `latitude` is the same digitisation already flipped y-up by one image height, left over from the flat imageOverlay the layer replaced. `app/services/Campus25dMapping.py` owns the conversion (`MAP_IMAGE_HEIGHT`, `to_layer_y()`, `layer_point()`) and is the only place that should know the offset.

- **Draw with `map_x` / `map_y`** from the `/api/locations` payload, never `latitude` / `longitude`. The latter are emitted only for the building pane's readout; drawing with them puts the feature a full 1113 px off the campus. That was the "route lines outside the map" bug.
- `resources/geo/` holds the QGIS source data and its own `README.md` explaining which files matter (`campus_loc.points` — the four ground control points — is the irreplaceable one). Nothing in that folder is served to browsers.
- **Wayfinding runs on a graph, not per-building polylines.** `resources/geo/lspu-data.gpkg` holds 34 walkways digitised in QGIS in real WGS84; `scripts/build_campus_graph.py` converts them into layer space and welds them into `resources/geo/campus_graph.json` (114 nodes, 153 edges, 34 of 37 locations anchored). `app/services/MapWayfinderService.py` parses that at import and runs Dijkstra over it. The WGS84↔pixel projective transform lives **only** in that script — offline, never on the request path. Edit walkways in QGIS, rerun the script, commit both files; see `resources/geo/README.md`.
- The kiosk draws the 2.5D layer (`resources/js/campus-2.5d.layer.js`, a vendored self-contained Leaflet plugin with embedded GeoJSON) instead of the flat PNG. `Campus25dMapping.py` bridges that layer's string feature ids ("H", "17", "19b") to numeric `locations.id` via `resources/geo/campus_25d_mapping.json`; regenerate it with `venv/bin/python scripts/generate_campus_25d_mapping.py` (prints a review table; `--write` to save). Unmapped locations fall back to a pin at their own `map_x`/`map_y`.
- `tests/unit/test_campus_layer_space.py` guards all of this against the flip coming back.
- The walkway network is a **star**: every line radiates from one hub near the Main Gate, so a route between two arbitrary buildings currently detours via that hub. It doesn't show on the kiosk because the start is pinned to SSB, a few pixels from the hub. Drawing cross-links in QGIS fixes it with no code change.

**QR route handoff:** kiosk POSTs `/api/route-sessions` → server mints a token (30 min TTL, start fixed to `KIOSK_START_LOCATION_NAME = "student services building"`) and returns a public URL built from `APP_URL`, not the request host, because the phone must reach the tunnel. The phone loads `/m/route/@token` (no auth), reads geometry from `/api/route-sessions/@token`, and marks it done via `.../finish`. The kiosk resets after 60s idle; the phone's session survives that.

## Conventions

- Comments in this codebase explain *why*, often citing the bug that motivated the code. Match that register — when you work around a framework quirk, say which one.
- Editor-facing POST/DELETE endpoints support both AJAX and plain form posts: use `app/services/AjaxResponses.py` (`wants_json` / `json_success` / `json_errors`) so the upload meter gets JSON while the redirect-with-flash path still degrades gracefully.
- Uploaded files are validated by magic bytes (`FileVerificationService`, via `ImageUploads.read_upload`), never by the browser-supplied filename.
- Site-wide settings go through the service that owns the key (e.g. `Branding.set_logo`), not direct `SiteSetting` writes. `site_logo()` is shared into every template by `AppProvider`.
- The MySQL schema has drifted from `databases/migrations/` — check the live table before trusting a migration file for column names.
- UI styling: solid/flat colors, no gradients.
