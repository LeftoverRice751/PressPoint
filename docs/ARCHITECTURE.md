# PressPoint Architecture

PressPoint is a [Masonite 5](https://docs.masoniteproject.com/) (Python) web application for
*The Gears*, LSPU's student publication. One codebase serves two audiences that never share a
screen:

| Surface | URL space | Who | What |
|---|---|---|---|
| **Kiosk** | `/kiosk/*`, `/m/route/*`, `/api/*` | Anonymous campus visitors on a 768×1024 portrait touchscreen | News, PDF archives, campus wayfinding, 360° virtual tour, org board, About LSPU |
| **GEARS CMS** | `/gears/*`, `/users`, `/auth/super_admin`, `/login` … | Staff with a role (`editor`, `admin`, `superadmin`) | Compose the news layout, upload archives, push videos, approve stories, manage accounts |

Production: `presspoint-gears.me` — Cloudflare → nginx → gunicorn (unix socket, 5 worker
*processes*, no threads) → Masonite. See [`deploy/nginx-presspoint.conf`](../deploy/nginx-presspoint.conf)
and [`lyn.sh`](../lyn.sh).

Companion documents: [`ARCHITECTURE_DIAGRAM.md`](../ARCHITECTURE_DIAGRAM.md) (Mermaid views of the
same system), [`docs/diagrams/`](diagrams/) (draw.io user-flow charts), and
[`CLAUDE.md`](../CLAUDE.md) (working notes and known traps).

---

## 1. Layered view

```
┌───────────────────────────────────────────────────────────────────┐
│  Browsers                                                         │
│   Kiosk terminal      Editor / Admin / Super admin      Phone (QR)│
└─────────┬──────────────────────┬──────────────────────────┬───────┘
          │ HTTPS                │                          │
┌─────────▼──────────────────────▼──────────────────────────▼───────┐
│  Cloudflare  →  nginx                                             │
│   • serves /assets, /storage/*, /pano/* straight from disk        │
│   • proxies everything else to presspoint.sock                    │
└─────────┬─────────────────────────────────────────────────────────┘
┌─────────▼─────────────────────────────────────────────────────────┐
│  gunicorn (5 sync worker processes)  →  wsgi.py  →  Kernel.py     │
│                                                                   │
│   HTTP middleware (every request)                                 │
│     SecurityHeaders → MaintenanceMode → EncryptCookies            │
│     → DatabaseReconnect → TabSlot                                 │
│   Route group "web" (every route)                                 │
│     Session → LoadSlotUser → VerifyCsrfToken                      │
│   Per-route keys: auth · admin · super_admin · throttle:<name>    │
│                                                                   │
│   routes/web.py = public + dashboard + auth + map + news          │
│                   + super_admin                                   │
│                                                                   │
│   Controllers (thin)         Services (the logic)                 │
│    app/controllers/kiosk/     app/services/*.py                   │
│    app/controllers/gears/     (namespace package, no __init__)    │
│    app/controllers/auth/                                          │
│                                                                   │
│   Models (Masonite ORM)      Templates (Jinja2)                   │
│    app/models/*.py            templates/{kiosk,gears,auth}/       │
└───┬──────────────┬──────────────────┬──────────────────┬──────────┘
    │              │                  │                  │
┌───▼────┐  ┌──────▼──────┐  ┌────────▼────────┐  ┌──────▼───────┐
│ MySQL  │  │ File cache  │  │ Storage roots   │  │ Pusher       │
│presspoint│ │ (locked)    │  │ NAS (SMB) +     │  │ (best-effort)│
│        │  │ rate limits │  │ storage/public  │  │              │
└────────┘  └─────────────┘  └─────────────────┘  └──────────────┘
```

---

## 2. Request pipeline

### 2.1 Boot

`wsgi.py` builds the application and hands it to `Kernel.py`, which binds every location
(controllers, models, views, migrations, …), registers the two middleware tables and loads
`routes/web.py`. `routes/web.py` is nothing but the concatenation of six route modules, and the
whole list is wrapped in the `web` middleware group.

### 2.2 HTTP middleware (order matters)

Defined in `Kernel.http_middleware`:

1. `SecurityHeadersMiddleware`
2. `MaintenanceModeMiddleware`
3. `EncryptCookies`
4. `DatabaseReconnectMiddleware` — clears the singleton QueryBuilder's cached MySQL connection so
   each gunicorn worker sees fresh data instead of a stale REPEATABLE READ snapshot. **Its
   `after()` returns the response**, and Masonite's pipeline stops at the first `after()` that
   does not return the request, so nothing listed *below* it ever gets an `after()` call.
5. `TabSlotMiddleware` — must run after `EncryptCookies` (needs the decrypted jar) and before the
   `web` group (Session and LoadSlotUser need `request.tab_slot`).

### 2.3 Route middleware

| Key | Class | Behaviour |
|---|---|---|
| `web` | Session, LoadSlotUser, VerifyCsrfToken | Applied to every route. `LoadSlotUserMiddleware` replaces Masonite's `LoadUserMiddleware` because the framework hard-codes the cookie name `token`. |
| `auth` | `AuthenticationMiddleware` | No user → redirect to `auth.login`. Also stamps `Cache-Control: no-store, private` so a CSRF token is never served from a cache. |
| `admin` | `AdminMiddleware` | `role != "admin"` → redirect to `gears.dashboard`. |
| `super_admin` | `SuperAdminMiddleware` | `role != "superadmin"` → redirect to `gears.dashboard`. |
| `throttle:<name>` | `ThrottleRequestsMiddleware` (ours) | Keyed; never used bare. Named limiters `auth` (5/min), `password-reset` (10/min), `otp` (5/min), all keyed by `CF-Connecting-IP`. |

Role checks are always `strip().lower()` — the live `users.role` column has drifted and holds
values with stray casing.

### 2.4 Tab slots (multi-account sign-in)

`app/tab_slots.py`. Auth is a single `token` cookie (`users.remember_token`); cookies are
per-origin, so signing in as an admin in a second tab used to hijack the editor's tab. The fix is
up to `MAX_SLOTS = 4` identity cookies at once, with each tab selecting its own via a `?u=N`
query parameter (page loads / redirects) or an `X-Tab-Slot` header (AJAX). Slot 0 keeps the bare
cookie names so the guest flows and existing sessions are unchanged. Every logout is slot-scoped.

### 2.5 Rate limiting and the cache

Both live in `app/`: `ThrottleRequestsMiddleware` evicts a counter whose window has closed
(upstream leaks attempts across windows), and `cache_drivers.LockingFileDriver` — re-registered
as the `"file"` driver in `AppProvider.register()` — wraps `add()`/`increment()` in an
`fcntl.flock` because five processes share one cache directory. Switching to Redis would *not*
help; Masonite's Redis driver has the same non-atomic read-modify-write.

---

## 3. Roles and surfaces

```
                    ┌────────────┐
   POST /login ───▶ │ LoginController.store │
                    └─────┬──────┘
          role == editor  │  role == admin        role == superadmin
      ┌───────────────────┼───────────────────┬─────────────────────┐
      ▼                   ▼                   ▼                     ▼
 /gears/dashboard      /users            /auth/super_admin     (no/unknown role)
 editor dashboard      admin console     super admin console   back to /login
 (auth)                (auth, admin)     (auth, super_admin)   with error
```

| Role | Lands on | Can | Cannot |
|---|---|---|---|
| `editor` | `/gears/dashboard` | Compose news, upload archives, push videos, edit map/tour/org board/about | Publish — any publish-intent status is downgraded to `review` server-side (`NewsController._resolve_status_for_actor`) |
| `admin` | `/users` | Approve/reject the review queue, create/delete editors, view stats | Reach the editor dashboard (`DashboardController.show` bounces admins back) |
| `superadmin` | `/auth/super_admin` | Create admins (credentials emailed), reset an admin's password, delete admins/editors, see org-wide stats | See or act on another super admin — filtered out of the list *and* re-checked in `destroy` |

Each console's logout route is guarded by `auth` **only**, so a session whose role changed
underneath it can still sign out.

---

## 4. Route modules → controllers

| Module | Prefix | Controllers | Notes |
|---|---|---|---|
| `routes/public.py` | `/kiosk/*` | `kiosk.WelcomeController`, `KioskShellController`, `ArchivesController`, `AboutController`, `TourController` | Unauthenticated. `/kiosk/flash-updates` emits full story bodies, so it goes through `_news_is_public()` like the front page. |
| `routes/map.py` | `/kiosk/map`, `/api/locations`, `/api/route-sessions`, `/m/route/@token` | `kiosk.MapController` | QR route hand-off to phones. |
| `routes/news.py` | `/gears/news/*` | `gears.NewsController`, `NewsCategoryController` | Composer, layout batch save, categories. |
| `routes/dashboard.py` | `/gears/*` | `gears.DashboardController`, `EventController`, `VideoController`, `OrgBoardController`, `ProfileController`, `NotificationController`, `ReviewController`, `BrandingController`, `EditorialController`, `KioskController` | `auth` throughout; review/approve is `auth, admin`. |
| `routes/auth.py` | `/login`, `/forgot-password*`, `/change-password`, `/users*` | `auth.LoginController`, `PasswordResetController`, `gears.UserController` | Guest routes throttled; `/users` is the admin console. |
| `routes/super_admin.py` | `/auth/super_admin*` | `auth.SuperAdminController` | See §7. |

Controller folders mirror the audience they serve; route strings and test patch targets carry
the folder (`"gears.NewsController@store"`, `app.controllers.gears.NewsController.News`).

---

## 5. Services (where the logic lives)

`app/services/` is a namespace package — `from app.services import X`.

| Service | Responsibility |
|---|---|
| `DashboardContext` | Per-section context builders, `full_context()`, `section_stamp()` (the `count:max(updated_at)` liveness marker), `group_news_slots()` (single source of truth for main/secondary/widget placement), `super_admin_stats()` (pure SQL aggregates via `grouped_counts`). |
| `AdminConsole` | Stats for `/users`: editor count, awaiting review, published, drafts, oldest pending. |
| `ReviewQueue` | Stories at `status = "review"` for admins. |
| `NewsCategories`, `NewsCache` | Category CRUD + soft-delete scope, and the cache that fronts kiosk news reads. |
| `Notifications` | Writes the `notifications` table directly; Masonite's notification package is deliberately unused. |
| `Credentials` | Generates passwords and emails them (used by super admin invite/reset). |
| `Profiles`, `Branding`, `AboutContent`, `AboutValues`, `KioskSections`, `CharterArchive` | Owners of their respective settings/content; site-wide keys go through these, never raw `SiteSetting` writes. |
| `StorageRouter` | The single path resolver (§6) plus `is_safe_path()`. |
| `ArchiveServices` | PDF → PNG rasterisation with PyMuPDF; pre-warms 20 pages, renders the rest on demand. |
| `ImageUploads`, `ImageDerivatives`, `FileVerificationService` | Magic-byte validation, `.large`/`.thumb` WebP derivatives (the `news_image` Jinja filter). |
| `Campus25dMapping`, `CampusGeoTransform`, `MapWayfinderService` | Pixel-space conversions and Dijkstra over `resources/geo/campus_graph.json`. |
| `TourScenesCatalog` | Parses `resources/js/data.js` (Marzipano scene graph) for the tour drawer and search. |
| `OrgBoardTree` | Builds the organisation/member tree; its node keys are a JSON contract with the kiosk template and the editor JS. |
| `AjaxResponses`, `PublicUrl`, `AssetVersion`, `FusionServices` | Small helpers: JSON-or-redirect responses, `APP_URL`-based public URLs, cache-busting. |

`AppProvider.register()` (not `boot()`) registers view filters and shared template values —
`boot()` runs per request *after* the template has rendered.

---

## 6. Data and storage

### 6.1 MySQL

Database `presspoint`. **`databases/schema.sql` is the source of truth** — a structure-only dump of
the live database that CI loads. `databases/migrations/` cannot rebuild the schema from scratch
(data backfills and misdated files); regenerate `schema.sql` after any change.

Key tables and relationships:

```
users ─────┐ author_id / updated_by_id (SET NULL)
           ▼
news ──────▶ news_categories (category_id, NOT NULL; news has soft deletes)
           └─ layout_type ∈ {main, secondary≤4, widget≤2, unassigned}, priority ASC
           └─ status ∈ {draft, review, published, …} — unknown → draft (fails closed)

organizations ──▶ members (organization_id CASCADE, parent_id self-ref)
locations ──▶ tour_scenes (scene_id → location_id)      # editor wiring only
locations.latitude/longitude = PIXELS on campus-map.png, not WGS84
archives, videos, events, kiosks, site_settings, notifications, password_resets,
route_sessions (QR hand-off tokens, 30 min TTL)
```

`.env` in the repo is the **production** config; `masonite.sqlite3` is an unused leftover.

### 6.2 Two storage roots, one URL space

`StorageRouter` resolves any path whose first segment is in `NAS_FOLDERS`
(`Archives`, `Videos`, `About`, `Branding`, `Profiles`) to the GearsNAS Samba mount
(`GEARSNAS_BASE`, default `/mnt/nas_storage/gears_data`); everything else goes to
`storage/framework/public`. nginx serves both roots directly and only falls through to
`VideoController.serve_storage` on a miss — the nginx regex must be kept in sync with
`NAS_FOLDERS`.

### 6.3 Cache

File cache under `storage/framework/cache/`, via `LockingFileDriver`. Holds rate-limit counters
and the news cache.

---

## 7. Super admin console (`/auth/super_admin`)

The smallest surface, and the one with the most privilege. Every route except logout carries
`auth, super_admin`.

| Route | Handler | What it does |
|---|---|---|
| `GET /auth/super_admin` | `show` | Renders `auth/super_admin.html` with all users **except super admins** plus `super_admin_stats()` (admin/editor counts, news, events, archives, newsletters, locations). |
| `POST /auth/super_admin` | `store` | Validates username + unique email → generates a password → creates a `role="admin"` user → emails credentials via `Credentials.send_credentials`. If the email fails the user still exists and an error says so. |
| `POST /auth/super_admin/@id/reset-password` | `reset_password` | Only for `role == admin` accounts with an email. Generates a password, **sends first, saves second** — a failed send leaves the old password intact so the admin is never locked out. Plaintext never reaches the browser. |
| `DELETE /auth/super_admin/@id` | `destroy` | Refuses if the target is a super admin (the UI never offers it, but a crafted DELETE must not either); otherwise deletes. |
| `POST /auth/super_admin/logout` | `logout` | `auth` only. Removes the user, deletes the slot-scoped `token` cookie and clears the slot session. |

The user-flow chart for this surface is in
[`docs/diagrams/super-admin-flowchart.drawio`](diagrams/super-admin-flowchart.drawio).

---

## 8. Dashboard liveness and concurrency

- Every 20 s `resources/js/dashboard-live.js` polls `/gears/dashboard/stamps`; a changed
  `count:max(updated_at)` stamp triggers a fetch of `/gears/dashboard/fragment/@section`, which
  re-renders **the same Jinja partial** the full page used. Sections opt in with
  `data-live-section` / `data-live-target`; adding one means adding to both
  `DashboardController.FRAGMENTS` and `STAMP_MODELS`. The notification bell's unread count rides
  on the same poll.
- The news composer sends the whole canvas on every drag with a `base_stamp`; `news.layout`
  returns **409** if the table moved and **422** if a bucket would overflow, both checked inside a
  transaction.

---

## 9. Realtime (Pusher)

Best-effort, never fatal. Every call site checks `_pusher_configured()` and swallows exceptions;
JSON responses report `broadcast: true/false`.

| Channel | Event | Trigger |
|---|---|---|
| `kiosk-channel` | lock / unlock | `KioskController` |
| `editorial` | `play-video` | `EditorialController` (only local `/storage/` paths) |
| `flash-updates-channel` | `new-news` | `NewsController` on publish |

A self-hosted WebSocket replacement is specified in
`docs/superpowers/specs/2026-09-10-kiosk-live-updates-design.md`.

---

## 10. Frontend assets

- laravel-mix, one entry per page (`webpack.mix.js`) → `storage/compiled/{js,css}` → served at
  `/assets/…`. A new `resources/js|css` file does nothing until it is listed in
  `webpack.mix.js`. Build needs Node 18.
- Vendor CSS/JS (Swiper, Quill, pdf.js, the 2.5D map layer, the archives service worker) is
  `mix.copy`'d, not imported.
- Page JS is plain ES (IIFE / `DOMContentLoaded`), no framework. Server → client data travels in
  `data-*` attributes; CSRF via `<meta name="csrf-token">`.
- `templates/gears/dashboard.html` is a shell that `{% include %}`s one
  `partials/panel-<name>.html` per CMS panel. Jinja macros do not cross an include.

---

## 11. Kiosk subsystems at a glance

| Subsystem | Data | Key files |
|---|---|---|
| News front page | `news` via `group_news_slots()`, gated by `_news_is_public()` (three call sites) | `kiosk/news.html`, `kiosk/_news_slots.html`, `resources/js/kiosk-news.js` |
| Archives | PDFs on NAS, rasterised pages under `Archives/pages/<slug>/page-N.png`, cache-first service worker | `ArchiveServices`, `resources/js/sw-archives.js` |
| Campus map | `locations` in pixel space, 2.5D Leaflet layer, wayfinding graph, QR hand-off | `Campus25dMapping`, `MapWayfinderService`, `resources/geo/` |
| Virtual tour | Marzipano scene graph (`data.js`, 205 scenes), gitignored tiles, `tour_scenes` mapping | `TourScenesCatalog`, `resources/js/kiosk-tour.js` |
| Org board | `organizations` → `members` tree | `OrgBoardTree` |
| About LSPU | Sections, milestones, values, videos | `AboutContent`, `AboutValues` |

---

## 12. Testing and CI

- `venv/bin/python -m pytest -q` — unit suite (needs the MySQL *tables*, not rows).
- `make lint` / `make format` — flake8 / black, line length 99.
- `npm run test:js` — JS tests under `tests/js/`.
- `make ci` mirrors `.github/workflows/ci.yml`: lint + pytest against a MySQL service loaded
  from `databases/schema.sql`, plus `npm ci`, `test:js` and `npm run prod` under Node 18.
