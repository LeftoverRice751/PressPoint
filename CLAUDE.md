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
make ci                                  # what CI runs: lint + pytest + JS tests
venv/bin/pip install -r requirements.txt -r requirements-dev.txt   # or: make init-dev

venv/bin/python craft migrate            # also: migrate:status, migrate:rollback, migrate:refresh
venv/bin/python craft seed:run           # runs databases/seeds/database_seeder.py
venv/bin/python craft routes:list
venv/bin/python craft tinker             # python shell with the container loaded
```

**`craft serve` is single-threaded and must stay that way.** Masonite resolves `Response` as a container singleton, so `--threaded` (and gunicorn `--threads`/`gthread`) races on one shared response object. Concurrency comes from separate gunicorn *processes* only — see the comment block in `lyn.sh` before changing worker settings.

**The `.env` in this repo is the production config** (`APP_ENV=production`, `APP_URL=https://presspoint-gears.me`, live MySQL `presspoint`). Any `craft migrate`/`seed:run` here writes to the real database. `masonite.sqlite3` at the repo root is an empty leftover — nothing uses it.

Known current state of the suite: `pytest tests/unit/` is green at 335 passing, and `make lint` is green too — flake8 and black are in `requirements-dev.txt` now, and `setup.cfg` excludes `venv` (it only listed `.venv`, so linting used to walk all 85 installed packages and never finish).

**The unit suite is not database-free.** Roughly a dozen tests render real dashboard templates and read `locations`/`news`/`users` through the ORM; on a dev box they pass because `.env` points at the live MySQL. They only need the *tables*, not rows — CI runs the whole suite against an empty database. Do not set `APP_ENV=testing` to get a test database: that makes Masonite load `.env.testing`, which pins `DB_CONNECTION=sqlite`, and the suite would silently run against an empty sqlite file instead.

**`databases/migrations/` cannot rebuild the schema, and `databases/schema.sql` can.** A fresh `craft migrate` stops 23 migrations in: several migrations are data backfills written against the database as it stood at the time (`2026_05_17_172930_fix_news_defaults_and_add_notifications` runs `UPDATE news SET status = ...` before any migration adds `news.status`), and some are misdated relative to the migration that creates the table they alter (`2026_05_12_..._add_sort_order_to_members_table` predates `2026_07_02_..._create_members_table`; it now returns early when the table is absent, which is correct because the later create declares `sort_order` itself). `schema.sql` is a structure-only dump of the live database, it is what CI loads, and it is the baseline for the squash migration that should eventually replace the history. Regenerate it after any schema change — the command is in its header. **Never commit data into it.**

CI (`.github/workflows/ci.yml`) runs lint + the full pytest suite against a MySQL service loaded from `databases/schema.sql`, and separately `npm ci`, `npm run test:js` and `npm run prod` under Node 18. `make ci` runs the same checks locally. `package-lock.json` is tracked (it used to be gitignored, which made `npm ci` impossible); `storage/framework/cache/` and `storage/framework/logs/` are not (they used to be, so every rate-limit hit and logged exception showed up as a working-tree change).

## Architecture

### Request path

`wsgi.py` → `Kernel.py` (binds every location: controllers, models, views, migrations…) → `routes/web.py`, which concatenates six route modules: `public`, `dashboard`, `auth`, `map`, `news`, `super_admin`. Every route is inside the `web` middleware group (session, load user, CSRF).

Route middleware keys (`Kernel.route_middleware`): `auth` (logged-in or redirect to login), `admin` (`role == "admin"`), `super_admin` (`role == "superadmin"`), and `throttle` — a *keyed* middleware used as `.middleware("throttle:auth")`; it takes an argument, so it must never sit bare in a group. The named limiters (registered in `AppProvider.boot()`) are all `GuestAuthLimiter`, which keys by `CF-Connecting-IP` because a bare `throttle:5/minute` would count globally and let one attacker lock everyone out of login. Guest auth is split across three buckets — `auth` (login, 5/min), `password-reset` (send code / set password, 10/min) and `otp` (code verification, 5/min) — because the middleware keys on `limit_string + ip`, so one shared name means one shared allowance: a single honest reset spent three of five attempts and tripped the limit on a first-time OTP submit. Keep `otp` alone and tight: `verify_otp` matches a token across the whole `password_resets` table rather than against the requesting email, so it is the actual guessing surface.

`throttle` maps to **our** `app/middlewares/ThrottleRequestsMiddleware.py`, not Masonite's. Upstream stores the attempt count and its window as two cache entries and only the `<key>-timer` one carries a TTL — `RateLimiter.hit()` increments through `FileDriver.increment()`, which re-`put`s the counter with `seconds=None` (ten years) — and the counter is zeroed only inside `too_many_attempts()`'s `attempts >= max` branch. A count that stopped short of the limit therefore carried into every later window forever. Our subclass evicts a counter whose window has closed before the base class reads it (`expire_stale_attempts` in `app/rate_limiters.py`); `tests/unit/test_auth_rate_limit_window.py` guards it.

The other half of that story is atomicity. `AppProvider.register()` re-registers the `"file"` cache driver as **our** `app/cache_drivers.py:LockingFileDriver`, because upstream's `FileDriver.add()`/`increment()` are unlocked read-modify-writes (`put(key, get(key) + 1)`) and production serves five gunicorn *processes* against one cache directory — two simultaneous login attempts could both read 3 and both write 4, losing an attempt, or catch a half-written file and raise on `int("")`. The subclass takes an `fcntl.flock` on a dotfile beside the entry (`.lock-<key>`, invisible to `FileDriver.flush()`'s `glob("*")`). **Switching the store to Redis does not fix this** — Masonite's `RedisDriver.increment()` is spelled the same way rather than using Redis' atomic `INCR`. `tests/unit/test_cache_locking.py` proves it across real processes, and deliberately also pins the upstream bug so the subclass can be retired if a future Masonite fixes it.

`DatabaseReconnectMiddleware` runs on every request as HTTP middleware and clears the singleton QueryBuilder's cached MySQL connection. Without it, MySQL REPEATABLE READ pins each gunicorn worker to a stale snapshot and editors see old data until restart. Don't remove it while the ORM connection is a container singleton.

Controllers stay thin; the real logic lives in `app/services/` (a namespace package — there is no `__init__.py`, imports are `from app.services import X`).

Controllers are grouped by surface: `app/controllers/kiosk/` (the public touchscreen), `app/controllers/gears/` (the authenticated dashboard), `app/controllers/auth/` (sign-in, password reset, super admin). Route strings carry the folder — `"kiosk.WelcomeController@show"`, `"gears.NewsController@store"` — and so do test patch targets (`app.controllers.gears.NewsController.News`). A few controllers straddle both surfaces (`ArchivesController` serves the kiosk reader *and* the dashboard upload); they sit with the audience they primarily serve. Anything resolving a path relative to `__file__` inside a controller is now three levels from the repo root, not two.

### Storage: two roots, one URL space

`app/services/StorageRouter.py` is the single resolver. Paths whose first segment is in `NAS_FOLDERS` (`Archives`, `Videos`, `About`, `Branding`, `Profiles`) resolve to the GearsNAS Samba mount (`GEARSNAS_BASE`, default `/mnt/nas_storage/gears_data`); everything else resolves to `storage/framework/public`. Editors read/write the same NAS files over SMB, which is why `ArchiveServices` renders with a group-writable umask (0664/0775).

In production **nginx serves both roots directly** (`deploy/nginx-presspoint.conf`) and only falls back to Python on a miss. The regex location there mirrors `NAS_FOLDERS` — **keep the two in sync**. `VideoController.serve_storage` is the Python fallback and reads ranges into memory, so it must not become the hot path again.

Always run DB- or user-supplied paths through `StorageRouter.is_safe_path()` before serving or deleting.

### Frontend assets

One laravel-mix entry per page, compiled to `storage/compiled/{js,css}` and served at `/assets/…` (mapped by `STATICFILES` in `config/filesystem.py`, and by nginx in production). Templates link them by hand: `<link rel="stylesheet" href="/assets/css/kiosk-map.css">`. **A new `resources/js|css` file does nothing until it is added to `webpack.mix.js`.**

Vendor CSS (Swiper, Quill) and vendor JS (pdf.js, the 2.5D map layer, the service worker) are `mix.copy`'d verbatim rather than JS-imported — Mix extracts JS-imported CSS to `storage/compiled/js/<entry>.css`, an unlinked path that silently shadows the real stylesheet.

Page JS is plain IIFE/`DOMContentLoaded` ES, no framework. Server → client wiring is via `data-*` attributes on a root element (e.g. `[data-dashboard-shell]`, `data-video-push-url`), and CSRF via the `<meta name="csrf-token">` in `templates/base.html`.

**Dashboard template layout.** `templates/gears/dashboard.html` is now a ~107-line shell: the `head`/`shell_data`/`shell_nav`/`js` blocks, and a `shell_panels` block that is nothing but one `{% include %}` per panel, in DOM order. Each CMS panel lives in `templates/gears/partials/panel-<name>.html` (it was one 1,628-line file, so any two people editing the dashboard conflicted). Two things to know before moving markup between them:

- **Jinja macros do not cross an `{% include %}`.** `organization_options` is defined inside `panel-org-board.html` with its only two callers; a macro left behind in `dashboard.html` is simply undefined in the partial.
- The panel partials are for the *full page render*. `DashboardController.FRAGMENTS` still re-renders the smaller data partials (`events-list`, `news-slots`, `archives-list`, `videos-list`), which are what a live refresh swaps in — adding a panel partial does not make it fragment-refreshable.

### Dashboard liveness

`DashboardController` exposes `fragment/@section` and `stamps`. A fragment re-renders **the same Jinja partial the full page uses**, so an injected row can never differ from a freshly-rendered one; `_section_stamp()` is a cheap `count:max(updated_at)` marker the browser polls every 20s (`resources/js/dashboard-live.js`) to detect another editor's changes without refetching rows. Panels opt in with `data-live-section` / `data-live-target`. Adding a section means adding to both `FRAGMENTS` and `STAMP_MODELS`.

Per-section context builders live in `app/services/DashboardContext.py`; `full_context()` composes them for the full page render.

Two shared query helpers live there, and new sections should use them rather than `Model.all()`:

- `ordered_by_id(model)` — the section's rows, ordered by the database. `Model.all()` + `sorted()` pulls the whole table, builds a model per row and then sorts the list; `ORDER BY id` lets MySQL walk the primary key. Same output, since the old key was `id` too.
- `grouped_counts(model, column)` — `{raw value: count}` from one `GROUP BY`. Values come back **raw** on purpose: `status` has aliases (`live`/`publish` both mean published) and `role`/`type` are matched case- and padding-insensitively, so none of them can be filtered safely in SQL — the caller folds them with the same normaliser the rest of the app uses. `super_admin_stats()` is eight integers and renders no rows; it used to load `users`, `news` (full HTML bodies included) and `archives` in their entirety to produce them.

### Realtime (Pusher)

Broadcasts are best-effort and never fatal: every call site checks `_pusher_configured()` and swallows exceptions, and the JSON response reports `broadcast: true/false`. Channels in use: `kiosk-channel` (lock/unlock the kiosk), `editorial` (`play-video` push from the dashboard), `flash-updates-channel` (`new-news`). `EditorialController._sanitize_video_src` only accepts local `/storage/` paths — no absolute URLs.

### News composer

A story's placement is `layout_type` ∈ {`main`, `secondary` (max 4), `widget` (max 2), `unassigned`} plus an **ascending** `priority` (lower renders first, so "Position #1" is literally true). `group_news_slots()` in `DashboardContext` is the single source of truth for that split and is used by both the kiosk render and the editor canvas; `unassigned` stories are excluded from every bucket *including* the main fallback, so an unplaced story can never become the lead.

Bodies are authored in Quill and sanitized with `bleach` against a formatting-only allowlist on write (`NewsController._sanitize_news_html`) because the kiosk renders them as HTML. Uploaded images get `.large`/`.thumb` WebP derivatives (`app/services/ImageDerivatives.py`, exposed to templates as the `news_image` Jinja filter registered in `AppProvider.register()`); deleting a story must delete the derivatives too or they orphan forever.

Note `AppProvider.register()` vs `boot()`: view filters and shared values must be registered in `register()` — `boot()` runs per request *after* the template has rendered.

**Concurrent editing.** The composer never sends "the card that moved": `currentCanvasBatch()` rebuilds the *whole* canvas from that browser's DOM on every drag. So `news.layout` takes a `base_stamp` — the `count:max(updated_at)` marker from `DashboardContext.section_stamp()`, the same one the liveness poll uses — and returns **409** if the table moved underneath it; the composer then force-reloads the canvas. It also re-counts each bucket across the whole table inside the transaction and 422s on overflow, because `[:4]`/`[:2]` in `group_news_slots` only *hides* an over-full bucket, leaving a story that reads as placed but renders nowhere. `author_id` / `updated_by_id` (both `ON DELETE SET NULL`) record who wrote and who last touched each story.

### Editorial review

Editors cannot publish. `NewsController._resolve_status_for_actor()` downgrades any publish-intent status (`approved`/`scheduled`/`published`) to `review` unless the actor's role is exactly `admin` — enforced server-side, so posting `status=published` by hand does not bypass it. An admin approves (→ `published`) or rejects (→ `draft` plus a required `rejection_reason`) from the Review panel; `store()` clears the reason on resubmit.

`_normalize_news_status()` **fails closed** — an unknown or missing status resolves to `draft`, not `approved`. It used to default to `approved`, which is publicly visible, so a request that merely omitted the field published to the kiosk.

Visibility is still the single `_news_is_public()` gate, and there are now **three** call sites, all of which must keep it: the front page, the lead teaser, and `WelcomeController._build_flash_articles()`. That last one had no status check at all — `/kiosk/flash-updates` is public and emits the full body, so drafts and pending stories were reaching the campus terminal regardless of any approval. `tests/unit/test_flash_status_filter.py` guards it.

The review preview renders `kiosk/_news_slots.html` with `news_editor=False` and the story as `main_story`, i.e. the kiosk's own template — don't build a second renderer for it.

### Notifications and profile

`notifications` (recreated after being dropped in `2026_08_23_120000`) is written directly through `app/services/Notifications.py`. **Masonite's notification package is deliberately unused** — its database driver in `config/notification.py` points at a `sqlite` connection on a MySQL app. The bell's unread count rides on the existing 20s `stamps` poll rather than a second timer.

`users.full_name` / `users.avatar_path` back the profile menu in the dashboard hero (which is also where logout lives now — it moved out of the sidebar). Avatars go to `Profiles/` on the NAS via `ImageUploads.save_uploaded_image`. **`User.__fillable__` includes `role`**, so `ProfileController` assigns attributes one at a time; a mass assignment there is privilege escalation.

### Org board

`organizations` (a department or a student org, told apart by `kind`) each own a tree of `members` — `members.organization_id`, plus a self-referencing `parent_id` for the reporting line. Nothing else joins to them.

This used to be a `departments` table with a UNIQUE `location_id` into `locations`, auto-populated from every Department-type location on each dashboard render, with both the dashboard and the kiosk filtering out any row that didn't resolve back to such a location. An editor could not add a row — that's why it was replaced. **Don't reintroduce a locations join here.**

- `app/services/OrgBoardTree.py` builds the tree for both surfaces. `member_node()`'s keys are a JSON contract read by `templates/kiosk/org-board.html` and `resources/js/org-board-editor.js` — renaming one side alone silently breaks the board.
- A chart never nests across organizations: a member whose parent sits elsewhere is promoted to a root instead.
- `members.organization_id` is `ON DELETE CASCADE`, so `OrgBoardController.destroy_organization` refuses to delete an organization that still has members. Without that guard, removing a college wipes its whole chart with no warning.
- The three organization `<select>`s are fed by `organization_groups` and re-synced after a live fragment refresh from the JSON block in `gears/partials/organizations-list.html`, so a newly added organization is immediately assignable without a reload.

### Virtual tour

A Marzipano cube-tile capture at `/kiosk/virtual-tour`, in three pieces that drift apart silently if you touch one alone:

- `resources/js/data.js` — the scene graph (205 scenes, `0-jst-1` … `204-jst-212`). Generated by the Marzipano Tool, which emits `var APP_DATA = `; we rewrite it to `window.APP_DATA = ` because `kiosk-tour.js` reads it off `window` and the bare `var` form does not attach there inside the mix bundle. Keep the leading `/* ... */` note about `targetYaw`, and keep `settings.autorotateEnabled: true` — the export ships it `false`, which kills the kiosk's idle spin. `app/services/TourScenesCatalog.py` parses this file with `json.loads`, so no comments *inside* the object and no trailing commas.
- `storage/public/pano/tiles/` — ~360 MB of imagery, **gitignored**. Only `pano/vendor` and `pano/img` are tracked. Deploy with `rsync -a --delete storage/public/pano/tiles/ <prod>:.../storage/public/pano/tiles/`. nginx serves `/pano/` directly (`deploy/nginx-presspoint.conf`); without that block the tiles stream out of a gunicorn worker.
- `tour_scenes` — editor wiring only (`scene_id` → `location_id` / `display_name`), managed on the dashboard's Tour Mapping page. This is what makes a panorama findable from tour search and wayfinding; the capture itself carries no building names. `TourController.mappings` iterates the *catalog* and looks rows up by `scene_id`, so a row whose scene no longer exists just disappears from `/api/tour-scenes` — harmless, but delete such rows after a re-export.

Re-exporting the tour is: drop the new `data.js` in with those two edits, replace the tiles, rsync, clear stale `tour_scenes` rows. **No template edit** — the scene drawer in `templates/kiosk/kiosk-tour.html` loops over `TourScenesCatalog.all_scenes()` passed by `WelcomeController.virtual_tour`. It used to be 45 hand-written anchors duplicating `data.js`; don't put them back. `tests/unit/test_tour_catalog.py` guards the catalog against missing tiles and dead hotspot targets.

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
- The MySQL schema has drifted from `databases/migrations/` — check the live table (or `databases/schema.sql`, which is a dump of it) before trusting a migration file for column names.
- UI styling: solid/flat colors, no gradients.
