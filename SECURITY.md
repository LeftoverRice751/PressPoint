# Security — PressPoint / GEARS CMS

This document covers three things for `presspoint-gears.me`:

- what the site needs protected
- what already protects it
- where it is still weak, and the plan to close those gaps

Every claim points at the file that implements it, so this document can be checked against the code rather than trusted.

> **Disclosure note.** Section 3 lists weaknesses that are **not fixed yet**. While any 🔴 item remains open, keep this repository private, or remove section 3 before publishing it. Never put secret *values* in this file. Name env keys only.

---

## 0. Reporting a vulnerability

- Email **`<security contact — fill in>`** with steps to reproduce. Do **not** open a public GitHub issue.
- Expect an acknowledgement within 3 working days and a fix or mitigation plan within 14.
- Do not test against production in ways that change data or degrade the kiosk: no load testing, no mass account creation, and no attempts to lock other people's accounts.

---

## 1. What we are protecting

### Path a request takes

```
Visitor ──HTTPS──▶ Cloudflare ──tunnel (cloudflared, same host)──▶ nginx :80
                                                                    │
           static: /assets /storage /pano /models  ◀── served by nginx directly
                                                                    │
                                     gunicorn (5 processes, unix socket presspoint.sock)
                                                                    │
                         MySQL `presspoint` @127.0.0.1   ·   GearsNAS SMB mount   ·   Pusher (realtime)
```

### Who uses it

| Actor | Can do | Gate |
|---|---|---|
| Anonymous: kiosk terminal, phone scanning a QR code | Read published news, archives, map, tour, org board. Mint and finish a route session | none (public), throttled where it writes |
| `editor` | Upload archives, videos and events. Write news (always lands in `review`). Push a video to the kiosk. Lock or unlock the kiosk | `auth` |
| `admin` | All of the above, plus approve or reject stories and issues, and manage editors | `auth` + `admin` |
| `superadmin` | Manage admins | `auth` + `super_admin` |

### What an attacker would want

1. **Putting content on the campus terminal.** Defacement, or an unapproved story going public. This is the highest-impact outcome because the screen sits in a public hallway.
2. **CMS accounts.** Especially `admin`, which can publish.
3. **Personal data.** Staff emails, names and avatars in `users`, and the members on the org board.
4. **The host itself.** The NAS share is shared with editors over SMB. The database credentials live in `.env`.
5. **Availability.** Brute-forcing login, huge uploads, or making archive pages render on demand.

---

## 2. Controls already in place

### Authentication and sessions
- **Password hashing:** bcrypt (`HASHING_FUNCTION`).
- **Sessions are per tab.** Each tab gets a "slot" cookie holding the user's `remember_token`, resolved by `app/middlewares/LoadSlotUserMiddleware.py` and `app/tab_slots.py`.
- **Cookie flags.** Every cookie inherits `secure: True, samesite: Lax` from `config/session.py`. On top of that, Masonite's `Cookie` defaults are `HttpOnly` and encrypted (`EncryptCookies` in `Kernel.py`).
- **Password change** (`app/services/PasswordChange.py`) rotates `remember_token`, which signs out every other device. It answers with one generic failure message, so it can't be used to test whether a guessed current password is right. Policy: Masonite `strong` (8+ characters, two of each character class).
- **Generated passwords** use `secrets.token_urlsafe(16)` (`app/services/Credentials.py`). An email-change notice goes to **both** the old and the new address.
- **OTP reset codes** come from `secrets.randbelow(10**6)`. A code is matched on **token and email together**, and it expires (`app/controllers/auth/PasswordResetController.py`).

### Authorization
- **Route middleware:** `auth`, `admin` and `super_admin` (`app/middlewares/`). Role checks trim whitespace and ignore case.
- **Editors cannot publish.** `NewsController._resolve_status_for_actor()` downgrades any publish status to `review` for a non-admin, server-side. `_normalize_news_status()` **fails closed**: an unknown or missing status becomes `draft`.
- **Public visibility goes through one function**, `_news_is_public()`. It is used at all three public call sites, including `/kiosk/flash-updates`, and `tests/unit/test_flash_status_filter.py` guards it.
- **Profile routes act only on the signed-in user.** There is no `/profile/@id` route. `ProfileController` assigns fields one at a time because `User.__fillable__` contains `role`.

### Brute-force protection
- **Separate throttle buckets per client IP:** `auth` (5/min), `password-reset` (10/min), `otp` (5/min), `password-change`, `route-sessions` (`AppProvider.boot()`, `app/rate_limiters.py`).
- **Stale attempt counters are expired** correctly (`expire_stale_attempts`), and counter updates are atomic across processes via `fcntl.flock` (`app/cache_drivers.py`). Tests: `tests/unit/test_auth_rate_limit_window.py` and `test_cache_locking.py`.

### Request forgery
- **CSRF is on for every route** through the `web` middleware group.
- **The only exemption is `/api/route-sessions/*/finish`** (`app/middlewares/VerifyCsrfToken.py`). It is authorised instead by a 192-bit `secrets.token_hex(24)` in the URL that expires after 30 minutes.

### Content and file handling
- **Story HTML is sanitised** with `bleach` against an allowlist of formatting tags only (`NewsController._sanitize_news_html`).
- **Uploads are identified by magic bytes, not by filename** (`FileVerificationService`, `ImageUploads.read_upload`).
- **Every path from the database or a user** passes `StorageRouter.is_safe_path()` before it is served or deleted.
- **Kiosk video pushes accept local `/storage/` paths only** (`EditorialController._sanitize_video_src`).
- **The PDF reader** runs pdf.js with annotations and XFA disabled.

### Browser hardening
- **`X-Content-Type-Options: nosniff`** comes from the app (`SecurityHeadersMiddleware`) and from every nginx location that serves files.
- **Content-Security-Policy** (`app/security_headers.py`):
  - a per-request 128-bit script nonce
  - `object-src 'none'`
  - `frame-ancestors 'self'`
  - `form-action 'self'`
  - only two allowed script CDNs (cdnjs, Pusher)
- **CORS on `api/*`:** `GET` only, from our own origin, no credentials (`config/security.py`).

### Edge (nginx, `deploy/nginx-presspoint.conf`)
- **Real visitor IP:** taken from `CF-Connecting-IP`, but **only** when the connection comes from 127.0.0.1 (the tunnel).
- **Denied files:** dotfiles (except `.well-known`), plus `.env .sql .sqlite .py .sh .log .bak .zip …`.
- **Gray Raven:** an access log plus an IP blocklist (`/etc/nginx/gray_raven/blocklist.conf`).

### Secrets and repository hygiene
- `.env` is gitignored and has **never** been committed (`git log --all -- .env` is empty).
- `databases/schema.sql` is structure only. Data must never be committed into it.
- CI (`.github/workflows/ci.yml`) runs lint and the full test suite against a real MySQL schema on every push.

---

## 3. Known weaknesses

Severity is the effect on this deployment if the weakness were exploited.

| # | Sev | Weakness | Where |
|---|---|---|---|
| W1 | ✅ Fixed | ~~The CSP only reports and never blocks~~ | `app/security_headers.py` |
| W2 | ✅ Fixed | ~~Rate-limit key can be spoofed with request headers~~ | `app/rate_limiters.py` |
| W3 | ✅ Fixed | ~~Session tokens and OTP codes stored in plaintext~~ | `users.remember_token`, `password_resets.token` |
| W4 | ✅ Fixed | ~~Missing HSTS / Referrer-Policy / Permissions-Policy~~ | `SecurityHeadersMiddleware`, nginx |
| W5 | ✅ Fixed | ~~Production `.env` says `APP_ENV=dev` and holds unused secret slots~~ | `.env` |
| W6 | ✅ Fixed | ~~No dependency or static security scanning~~ | `.github/workflows/ci.yml` |
| W7 | 🟡 Partly | ~~No audit trail~~ (done); no two-factor login yet | — |
| W8 | ✅ Fixed | ~~500 MB request-body limit applies to every route~~ | nginx `client_max_body_size` |
| W9 | ✅ Fixed | ~~gunicorn logs written to `/tmp`~~ | `lyn.sh` |
| W10 | ✅ Fixed | ~~Container runs as root, binds `0.0.0.0`, uses `npm install`~~ | `Dockerfile` |
| W11 | ✅ Fixed | ~~Any editor can lock or unlock the public kiosk~~ (kept, now audited and announced) | `routes/dashboard.py` |
| W12 | ✅ Fixed | ~~Leftover sqlite config and file~~ | `config/notification.py`, `masonite.sqlite3` |

**W1 — The CSP is Report-Only.**
- **Problem:** `REPORT_ONLY = True` sends `Content-Security-Policy-Report-Only`. The browser logs violations but blocks nothing. The nonce, `object-src 'none'` and `frame-ancestors 'self'` therefore protect nothing today. No `X-Frame-Options` header exists either, so the CMS can currently be framed by another site (clickjacking).
- **Fix:** watch the console on the kiosk and the dashboard for a clean week, then set `REPORT_ONLY = False`. Until then, add `X-Frame-Options: SAMEORIGIN`.
- **Status: fixed (2026-10-18).**
  - **What changed:**
    - `REPORT_ONLY = False`, so the policy is enforced.
    - `SecurityHeadersMiddleware` sends `X-Frame-Options: SAMEORIGIN`.
    - The un-nonced inline script in `gears/shell.html` and the speculation-rules block in `welcome.html` now carry the nonce. Chrome 155 rejected the latter despite `'inline-speculation-rules'`.
    - `kiosk-tokens.css` self-hosts JetBrains Mono instead of `@import`ing Google Fonts, which the policy blocks.
  - **How it was verified:** a headless crawl of all 19 public pages showed 0 violations. With enforcement on, these all still work:
    - the tour starts
    - the map draws
    - the archive reader opens
    - pdf.js still gets its blob worker and WebAssembly
  - **What is now blocked:** an injected inline script no longer runs, and a cross-origin frame of `/login` is refused.
  - **Tests:** `test_the_policy_is_enforced_not_report_only` and `test_after_forbids_cross_origin_framing`.
  - **Not crawled:** the authenticated dashboard (no test account). Watch the browser console the first time you use each panel.
  - **Rollback:** `REPORT_ONLY = True`.

**W2 — The rate-limit key trusts client headers.**
- **Problem:** `GuestAuthLimiter._client_ip()` reads `CF-Connecting-IP`, then `X-Forwarded-For`, straight from the request. nginx's `include proxy_params` forwards the client's own `CF-Connecting-IP` header unchanged. Cloudflare overwrites that header, so the tunnel path is safe. But anyone who reaches nginx **directly** (the campus LAN on port 80, or a misrouted DNS record) can send a new fake IP with every request and get **unlimited login and OTP guesses**. A 6-digit OTP falls in about 10⁶ attempts.
- **Fix:** in nginx, set `proxy_set_header CF-Connecting-IP $remote_addr;` and `proxy_set_header X-Forwarded-For $remote_addr;` in both proxy locations. `$remote_addr` is already the real-IP-resolved address, so the client can no longer choose the key. Also firewall port 80 so only the local tunnel reaches it, e.g. bind `listen 127.0.0.1:80`.
- **Status: fixed in the app (2026-10-18), with no nginx change needed.**
  - **The new rule:** `_client_ip()` now reads only `X-Real-IP`, a header nginx's `proxy_params` *overwrites* with the realip-resolved `$remote_addr`. It reads it only when the connection came from the proxy (gunicorn's unix socket, or loopback). For any other connection the key is the socket address and every header is ignored. `CF-Connecting-IP` and `X-Forwarded-For` are never read.
  - **Measured on a dev server:** before the fix, 8 of 8 logins were accepted with a rotating header. After it, a 429 comes back from the 6th attempt for a rotating `CF-Connecting-IP`, `X-Forwarded-For` or `X-Real-IP` sent directly from a LAN address.
  - **Test:** `tests/unit/test_rate_limit_client_ip.py`.
  - **Still worth doing:** firewalling port 80 to the tunnel, as defence in depth.

**W3 — Session tokens and OTP codes are stored in plaintext.**
- **Problem:** A session *is* `users.remember_token`, looked up by equality. A leaked database dump, backup or read-only SQL injection therefore gives a working session for every user, with no password cracking. `password_resets.token` holds live OTP codes the same way.
- **Fix:** store `sha256(token)` and look up by the hash. The cookie keeps the raw value. Do the same for OTP codes. On rollout, every user is logged out once.
- **Status: fixed (2026-10-18).**
  - **What is stored:** `app/services/SessionTokens.py` stores `h1:` + HMAC-SHA256(APP_KEY, token). It is *keyed*, not a bare SHA-256, because a 6-digit OTP hashed without a key is reversed by trying all 10⁶ codes. `User.set_remember_token` is overridden, so Masonite's own `attempt()` writes the hash, and the plaintext exists only on the in-memory instance and in the encrypted cookie. Tokens are now `token_urlsafe(32)`, 256 bits; the old uuid4 had 122.
  - **Rollout:** nobody was signed out. A plaintext row is accepted once, then rewritten as its hash. A value that is already a hash is never accepted as a cookie, so a copied row cannot be replayed.
  - **OTP codes:** stored as `otp_digest(email, code)`. The session keeps the digest, and the change-password form no longer carries the code in its URL.
  - **Leftovers:** `scripts/purge_legacy_session_tokens.py` reports, or with `--apply` clears, rows never upgraded. On 2026-10-18 there were 4 sessions and 4 reset codes.
  - **Verified live:** login writes a hash; a hash copied from the column and replayed as a cookie goes to `/login`; a legacy plaintext session works and is upgraded.
  - **Tests:** `test_session_tokens.py`, `test_password_reset_binding.py::OtpAtRestTestCase`.

**W4 — Missing hardening headers.**
- **Problem:** No `Strict-Transport-Security`, `Referrer-Policy` or `Permissions-Policy` header comes from the app or from nginx. Cloudflare can add HSTS, but nothing in this repository guarantees it.
- **Fix:** add these to `SecurityHeadersMiddleware` and to the nginx `location /` block. Remember nginx's rule that a location with its own `add_header` drops every inherited one.
  - `Strict-Transport-Security: max-age=31536000; includeSubDomains`
  - `Referrer-Policy: strict-origin-when-cross-origin`
  - `Permissions-Policy: camera=(), microphone=(), geolocation=(self)`
- **Status: fixed (2026-10-18) in `SecurityHeadersMiddleware`.**
  - **HSTS:** `max-age=31536000`, deliberately *without* `includeSubDomains` or `preload`: nothing here knows what else lives in the zone, and preload is a one-way door.
  - **Permissions-Policy:** denies camera, microphone, payment and USB. It keeps geolocation and screen-wake-lock for the phone route's GPS voice, and fullscreen for the tour. All three were verified still allowed inside the kiosk's iframes.
  - **Not needed in nginx:** the static locations serve no HTML.

**W5 — Production environment drift.**
- **Problem:** The production `.env` has `APP_ENV=dev`, while CLAUDE.md documents it as `production`. Any code path that branches on the environment behaves as development. The file also carries slots for services this app does not use: S3, Slack, Vonage, JWT, Mailgun and the queue. Each unused secret is one more thing that can leak and that no one will remember to rotate.
- **Fix:**
  - Set `APP_ENV=production` and confirm `APP_DEBUG=False`.
  - Delete the unused keys.
  - `chmod 600 .env`, owned by the gunicorn user.
- **Status: fixed (2026-10-18).**
  - **What changed:** `APP_ENV=production`, and `.env` went from mode **775** (world-readable *and* executable) to **600**. 22 unused keys were removed: S3, JWT, Slack, Vonage, Mailgun, queue, Redis, and a dead `CACHE_DRIVER=redis` (`config/cache.py` hardcodes `local`). The backup is `.env.bak-2026-10-18`, mode 600 and gitignored.
  - **Verified:** queue, cache and mail resolve to the same drivers as before, and all public pages and login work on a dev server.
  - **Side effect:** `craft migrate` now asks for confirmation (or `--force`) before touching the database. Under `dev` it never did.

**W6 — No dependency or static analysis in CI.**
- **Problem:** CI runs flake8 and the tests but no `pip-audit`, `npm audit`, `bandit`, or Dependabot. Known vulnerabilities in Masonite, PyMuPDF, bleach, pdf.js, Leaflet and the rest go unnoticed.
- **Fix:** add a `security` job that runs `pip-audit -r requirements.txt`, `npm audit --omit=dev --audit-level=high` and `bandit -r app -ll`, and enable Dependabot for `pip` and `npm`.
- **Status: fixed (2026-10-18).**
  - **Scanning:** `make audit` runs pip-audit, bandit and npm audit; CI's new `security` job runs that same target; `.github/dependabot.yml` covers pip, npm and Actions.
  - **Vulnerable versions found and upgraded:**
    - **pdf.js** 5.7 → 6.4.299: arbitrary JS on opening a malicious PDF, GHSA-hq66-cqwq-w95j. The reader's exact render path gives identical output, checked pixel for pixel.
    - **bleach** 6.1 → 6.4: our XSS filter, 2 advisories.
    - **Pillow** 11.0 → 12.3: 17 decoder advisories.
    - **Transitive:** PyJWT, urllib3, Werkzeug, idna, pyasn1, cryptography 46 → 48.0.1.
    - **Dev tools:** pytest 7 → 9, black 24 → 26.
  - **Still ignored, each with its reason in the makefile:** 3 cryptography advisories, capped below 49 by masonite-framework 5.4.1, which we don't reach. Also 1 Twisted advisory in its IMAP server, which we don't use and which has no fix yet.
  - **bandit:** findings are annotated where they are false positives (config table names, the NAS share's deliberate 0664, an MD5 used as a cache-file name).

**W7 — No 2FA and no audit trail.**
- **Problem:** Admin accounts can publish to a public screen behind a password alone. Nothing records who approved a story, created a user or changed a role, beyond `updated_by_id` on news.
- **Fix:** an append-only `audit_log` table (actor, action, target, IP, timestamp) written on approve/reject, user create/delete, role or email change, and kiosk lock. Add TOTP 2FA for `admin` and `superadmin`.
- **Status: audit log done (2026-10-18); 2FA still open.**
  - **What is recorded:** `app/services/AuditLog.py` writes `audit_logs` (migration `2026_10_18_000100`):
    - login succeeded and failed (with the attempted username), and OTP reset completed
    - own password changed
    - user created, deleted, and password reset by a superadmin
    - story and issue approved or rejected
    - kiosk locked and unlocked
  - **Who and where:** the IP comes from the same unspoofable `client_ip()` the throttle uses. `actor_username` is a snapshot, so deleting an account keeps its history.
  - **Never blocks the action:** an audit write that fails is logged, not raised.
  - **Kept out of the real log:** the unit suite stubs the write seam, because on this machine it runs against the live database.
  - **Reading it:** no UI yet. Use the query in `AuditLog.py`'s docstring.

**W8 — 500 MB body limit on every route.**
- **Problem:** The limit is set server-wide, so `/login` and `/api/*` accept 500 MB bodies as well.
- **Fix:** keep 500M only on the upload routes (`/archives/dashboard`, `/videos/dashboard`) and set about 2M everywhere else.
- **Status: fixed in `deploy/nginx-presspoint.conf` (2026-10-26). Needs a reload of the live nginx to take effect.**
  - **Default:** 10M server-wide. The only uploads outside the allowlist are images, which the app caps at 4 MB.
  - **Allowlist (500M):** one exact-path regex location for `/videos/dashboard`, `/archives/dashboard`, `/events/dashboard/archive` and `/gears/about-lspu/hymn/{audio,video}`.
  - **Verified through a private nginx built from this file, in front of `lyn.sh`:**
    - 20 MB to `/login`, `/api/route-sessions` or the avatar upload → **413 from nginx**.
    - 120 MB video, 90 MB hymn video and 20 MB PDF → passed through, including with the `?u=` tab-slot query.
    - 600 MB → 413.
    - The look-alike path `/videos/dashboard/x` gets the 10M default.

**W9 — Logs in `/tmp`.**
- **Problem:** gunicorn's access and error logs go to `/tmp`, which is world-writable and wiped on reboot. The audit trail disappears exactly when it is needed.
- **Fix:** use `/var/log/presspoint/` with logrotate.
- **Status: fixed (2026-10-26).**
  - **Where logs go:** `lyn.sh` writes `gunicorn-access.log`/`gunicorn-error.log` to `storage/framework/logs/`. It's gitignored, survives reboots, needs no sudo, and the path can be overridden with `LOG_DIR`.
  - **Access log now records who made each request.** On a unix socket gunicorn's default first field is empty, so every line began with `-` and never said who made it. It now logs nginx's `X-Real-IP` (the same address the throttle trusts) plus request duration.
  - **Rotation:** `deploy/logrotate-presspoint` rotates those and the framework's `exceptions.log`, which had grown unrotated to 3.8 MB: daily, 30 kept, compressed. Install it with the command in its header.
  - **Verified:** the real `lyn.sh` ran on a scratch socket and logged `198.51.100.23 … "GET /kiosk" 200 … 0.08s`.

**W10 — Dockerfile.**
- **Problem:** The container runs as root, binds `0.0.0.0:8000` and installs Node packages with `npm install` rather than `npm ci`. It is not the production path (that is `lyn.sh`), but it is a trap for anyone who deploys with it.
- **Fix:** add a `USER` line, use `npm ci`, and bind behind a proxy.
- **Status: fixed (2026-10-26).**
  - **Hardening:** the image runs as an unprivileged `app` user that owns only `storage/framework/`. The asset stage uses `npm ci`. The unpinned second `pip install gunicorn` is gone (it's pinned in `requirements.txt`).
  - **Upload validation fixed in containers:** `libmagic1` is installed. `python-magic` needs it, so upload validation could never have worked in this image.
  - **Port binding:** 0.0.0.0 stays, because it's the container's own interface. The Dockerfile says to publish it only as `-p 127.0.0.1:8000:8000`.
  - **Smaller build context:** `.dockerignore` now also excludes `.git`, `.worktrees`, the 360 MB of tiles, logs, cache and the socket.

**W11 — Kiosk lock is `auth` only.**
- **Problem:** Any editor can blank the public screen, and nothing records who did it.
- **Fix:** make it `admin`, or keep it open to editors but write each lock to the audit log (W7).
- **Status: fixed (2026-10-26) by keeping it an editor control.** Editors are the ones at the terminal.
  - **Audited:** every lock and unlock is in the audit log (W7).
  - **Announced:** it also goes to every admin's notification bell ("Eli Cruz locked the kiosk"), so it cannot go unnoticed. The admin who pressed it is not notified of their own action.
  - **Tests:** `test_kiosk_lock_alerts.py`.
  - **Not tested live,** on purpose: `.env` carries the real Pusher credentials, so a test lock would blank the actual campus screen.

**W12 — Leftover sqlite configuration.**
- **Problem:** `config/notification.py` points at a sqlite connection, and an empty `masonite.sqlite3` sits at the repo root. Both are harmless today, but they invite someone to "fix" the app onto the wrong database.
- **Fix:** delete both.
- **Status: fixed (2026-10-26).**
  - **Removed:** `masonite.sqlite3` and `.env.testing` (whose only line was `DB_CONNECTION=sqlite`) are deleted, and so is the `sqlite` connection in `config/database.py`.
  - **Repointed:** the unused queue and notification "database" drivers now name `mysql`.
  - **Result:** `APP_ENV=testing` no longer silently swaps the database, and naming a non-existent connection fails at the first query.
  - **Test:** `test_no_sqlite_decoy.py`.

---

## 4. Hardening roadmap

### Phase 1 — this week (config only, low risk)
1. ~~**W2:** fix the rate-limit key~~ (done in the app). Still bind nginx to loopback or firewall port 80 (`ufw deny 80` from outside, allow the tunnel).
2. ~~**W4:** hardening headers~~ (done).
3. ~~**W5:** fix `APP_ENV`, remove unused secrets, `chmod 600 .env`~~ (done). Still rotate `APP_KEY`, `DB_PASSWORD`, `MAIL_PASSWORD` and `PUSHER_SECRET` if `.env` has ever been copied off the server.
4. ~~**W9:** move the logs~~ (done). Install `deploy/logrotate-presspoint`.
5. **Cloudflare:** "Always Use HTTPS", minimum TLS 1.2, Bot Fight Mode, and a rate-limit rule on `POST /login` and `/forgot-password*` as a second layer behind the app's throttle.

### Phase 2 — this month (small code changes, each with a test)
1. ~~**W1:** enforce the CSP~~ (done 2026-10-18).
2. ~~**W3:** hash `remember_token` and OTP codes at rest~~ (done).
3. ~~**W6:** add the CI security job and Dependabot~~ (done).
4. ~~**W8 and W11:** per-route body limits; who may lock the kiosk~~ (done). Reload nginx to apply W8.
5. **Database:** give the runtime MySQL user `SELECT, INSERT, UPDATE, DELETE` only. Run migrations with a separate account.

### Phase 3 — mature posture
1. **W7:** ~~an audit log~~ (done), then TOTP 2FA for admins and superadmins, and a read-only audit view for superadmins.
2. **Cloudflare Access** (zero-trust SSO or an email one-time PIN) in front of `/gears/*`, `/login`, `/users*` and `/super-admin*`. The CMS then stops being reachable by the public internet at all, while `/kiosk/*`, `/m/*` and `/api/*` stay public.
3. **Backups:** encrypted, off-site nightly backups of MySQL and the NAS share, with a **tested** restore once a term.
4. **NAS mount:** mount with `noexec,nosuid,nodev`, and give the SMB share its own service account.
5. ~~**W10:** non-root container. **W12:** delete the sqlite leftovers~~ (done).
6. **External scanning:** a periodic OWASP ZAP baseline scan of the public pages, and a yearly review of this document.

---

## 5. Checklist for contributors

Before merging anything that touches the listed area:

- [ ] **Serving or deleting a file:** the path goes through `StorageRouter.is_safe_path()`.
- [ ] **Accepting an upload:** validate with `FileVerificationService` (magic bytes), never the filename or `Content-Type`.
- [ ] **Writing to `User`:** assign fields one at a time. `role` is fillable, so mass assignment is privilege escalation.
- [ ] **Showing news on any public surface:** gate it through `_news_is_public()`.
- [ ] **Rendering stored HTML:** sanitise on write with the existing bleach allowlist. Don't widen the allowlist casually.
- [ ] **Adding a route:** choose `auth`, `admin` or `super_admin` deliberately. Any guest POST gets a `throttle:<bucket>` of its own.
- [ ] **Adding a CSRF exemption:** only with an unguessable, expiring token replacing it. Document why in `VerifyCsrfToken.py`.
- [ ] **Adding a third-party script:** add it to the CSP in `app/security_headers.py` **and** to `CROSS_OK` in `templates/partials/kiosk-sw.html`.
- [ ] **Adding a NAS folder:** update `NAS_FOLDERS` and the nginx regex location together.
- [ ] **Handling secrets:** never commit `.env`, keys, or data in `databases/schema.sql`.
- [ ] **Logging:** never log passwords, OTP codes or `remember_token`.
- [ ] **Privileged action:** call `AuditLog.record("<subject>.<verb>", ...)` on its success path.
- [ ] **Session tokens:** resolve a cookie with `SessionTokens.find_user()`, never `User.where("remember_token", ...)`; `test_no_raw_remember_token_lookups_remain` enforces it.
- [ ] **Dependencies:** `make audit` passes. A new ignore goes in the makefile with the reason the vulnerable code is unreachable.

---

## 6. Operations runbook

**Force everyone to log out.** Rotate every session token:

```sql
UPDATE users SET remember_token = NULL;
```

**Block an attacker.** Add the IP to `/etc/nginx/gray_raven/blocklist.conf` (or let Battle Mode do it), then `sudo nginx -t && sudo systemctl reload nginx`. If an attacker has to be stopped at the edge, use a Cloudflare WAF rule.

**Take the site down.** `venv/bin/python craft down` turns on maintenance mode. `craft up` restores it.

**Rotate a secret.** Change it at the provider (MySQL user, mail host, Pusher), update `.env`, then restart gunicorn with `./lyn.sh`. Rotating `APP_KEY` invalidates every encrypted cookie, which logs everyone out.

**After an incident.** Preserve `/var/log/nginx/presspoint_gray_raven.log` and the gunicorn logs before they rotate. Note what was exposed, then add the gap to section 3 of this document.
