# Live editor → kiosk content updates — Design

Date: 2026-09-10
Status: approved, ready for implementation planning

## Problem

An editor publishes a story, saves an About section, or uploads an archive
issue, and the campus terminal keeps showing the old content. Today the only
paths to freshness are a manual reload of the terminal or the service
worker's stale-while-revalidate repair, which lands **one visit late** — the
visitor who triggers the revalidation still reads the stale copy.

`sw-kiosk.js` (v3) serves kiosk embed documents and editor-mutable media
(`/storage/news/`, `/storage/About/`, `/storage/Branding/`) stale-while-
revalidate. That is deliberate and is what makes opening a destination cost
nothing. It is also why a naive "push a reload event" design would appear to
do nothing at all: the reload would re-serve the same cache entry.

**Any real-time design here is therefore a cache-invalidation design first
and a transport design second.**

## Scope

In scope — three surfaces:

- **News** — publish/approve/reject, and news canvas layout changes.
- **About LSPU** — sections, milestones, seal, hymn audio/video.
- **Archives** — a newly uploaded issue, once its pages have rendered.

Explicitly out of scope:

- Org board, campus map, branding/logo. They change rarely; the existing SWR
  repair is adequate and adding them is a later, additive change.
- The flash ticker. It already polls `/kiosk/flash-updates` every 15s and
  `app/events/NewNews.py` already broadcasts `new-news` on
  `flash-updates-channel`. A second refresh path would fight the poll.

## Architecture

    Editor saves (News / About / Archives)
      └─> KioskBroadcast.section_changed(section_id)        [new service]
            └─> Soketi, Pusher protocol, 127.0.0.1:6001     [new process]
                  └─> wss:// → shell: kiosk-live.js on "kiosk-content"  [new client]
                        ├─> immediately: postMessage EVICT → sw-kiosk.js
                        └─> reload the content frame — now, or at next attract

### The event is a signal, never content

The payload is `{section, stamp}` and nothing else. The kiosk re-fetches from
the server on receipt.

Consequences, all of them good:

- A dropped, duplicated or out-of-order event can never render wrong content.
  The worst case is a redundant re-fetch of something already correct.
- The channel carries no editorial content, so it can be a **public** channel:
  no auth endpoint, no signed subscription, nothing to leak. Section ids and
  opaque stamps disclose nothing a kiosk visitor cannot already see.
- Payload size limits and broadcast ordering stop being correctness concerns.

### Stamps

`stamp` reuses the `count:max(updated_at)` idiom from
`DashboardContext.section_stamp()`. The client ignores an event whose stamp is
equal to or older than the one it last applied, which collapses the burst of
events a multi-step editor save produces into a single refresh.

## Server side

New `app/services/KioskBroadcast.py`. Public surface is one function:

    section_changed(section_id) -> bool   # True if the broadcast went out

It is **best-effort**, matching the established pattern: it checks
`_pusher_configured()` and swallows every exception. A broadcast failure must
never fail, block or slow an editor's save. Endpoints that already report
`broadcast: true/false` in their JSON keep doing so.

### Absorbing the duplicated `_pusher_configured()`

`_pusher_configured()` is currently copy-pasted verbatim in four controllers:
`gears/KioskController.py:8`, `gears/VideoController.py:26`,
`gears/EditorialController.py:12`, `gears/NewsController.py:310`. This work
adds a fifth caller, which is the point at which a fifth copy stops being
acceptable. The service becomes the single definition and the existing four
delegate to it.

This is deliberately a *delegation*, not a rewrite: the four existing call
sites keep their current behavior exactly. Consolidating the predicate is in
scope because we are adding to it; changing what those controllers broadcast
is not.

### Broadcast call sites

| Editor action | Location | Section emitted |
|---|---|---|
| Approve a story | `gears/ReviewController@approve` | `latest-news` |
| Reject a story | `gears/ReviewController@reject` | `latest-news` |
| Save/resubmit a story | `gears/NewsController@store` | `latest-news` |
| Canvas layout change | `gears/NewsController@layout` | `latest-news` |
| Delete a story | `gears/NewsController@destroy` | `latest-news` |
| Section save | `kiosk/AboutController@save_section` | `about-lspu` |
| Milestone create/update/delete/reorder | `kiosk/AboutController` | `about-lspu` |
| Seal / hymn audio / hymn video upload | `kiosk/AboutController` | `about-lspu` |
| Archive upload, after pages render | `ArchivesController@store` | `gears-archive` |
| Archive delete | `ArchivesController@destroy` | `gears-archive` |

`ReviewController@approve` is the single most consequential site: approval is
the moment a story becomes publicly visible on the terminal.

**Archives timing.** `store()` renders pages in a background sweep
(`_sweep_archive_pages_in_background`). The broadcast fires when the issue is
actually readable — cover present and the eager page pre-warm done — not when
the upload lands. Broadcasting early would refresh the kiosk into a shelf
entry that opens onto nothing.

## Transport

Soketi — an open-source server speaking the Pusher protocol — on
`127.0.0.1:6001`, under systemd.

Chosen over a raw `websockets` process because `config/broadcast.py` already
reads `PUSHER_HOST` / `PUSHER_PORT` / `ssl`: those keys exist precisely so
Masonite's pusher driver can address a self-hosted, protocol-compatible
server. Every existing broadcast call site, the `pusher-js` client, and the
whole best-effort pattern keep working unchanged. A raw server would mean
writing and owning a broadcast driver, a browser client, channel auth, and a
reconnect/backoff loop.

Chosen over hosted pusher.com because the deployment must not depend on a
third-party account.

Deployment pieces:

- systemd unit for the Soketi process.
- nginx `location /ws` proxying to `127.0.0.1:6001` with the `Upgrade` and
  `Connection` headers, in `deploy/nginx-presspoint.conf`.
- `.env`: `PUSHER_HOST`, `PUSHER_PORT`, and app id/key/secret shared with the
  Soketi config. Server-side `ssl` stays false — TLS terminates at nginx.
- `app/security_headers.py` `connect-src` gains our own origin's `wss://`.
  The existing `wss://*.pusher.com` entry can stay or go with the migration.
- Cloudflare proxies WebSockets by default; the tunnel needs no change.

## Client — the idle gate

New `resources/js/kiosk-live.js`, registered in `webpack.mix.js`, loaded by
**the shell only** (`welcome.html`) and never by the framed documents. One
connection per terminal, held by the one document that outlives every
section change.

On an event for section S, with a stamp newer than the last applied:

1. **Evict immediately, always.** Tell the service worker to drop S's cached
   entries. This is invisible — nothing on screen changes — so there is no
   reason to defer it, and it guarantees any later navigation is fresh even
   if the reload below never happens.
2. **Reload conditionally.**
   - If `attractShowing` is true, nobody is at the terminal: reload the
     content frame now.
   - Otherwise a visitor is mid-read: record S as dirty and flush it the next
     time the attract screen appears.

`attractShowing` in `welcome-screen.js` already covers both attract modes
(idle video and newsletter), so it is the correct single signal for
"unattended". `KIOSK_IDLE_TIMEOUT` is 30s, so a deferred update waits at most
30s past the visitor's last touch.

This split is the heart of the design: an unattended terminal — the normal
case — looks instant, and a visitor is never interrupted mid-read, yet the
kiosk is already correct the moment they walk away.

If the dirty section is not the one currently framed, the flush is free: the
eviction alone has already guaranteed the next visit to it is fresh.

### There are two frames, and the attract one is the visible one

`welcome-screen.js` holds the content frame *and* `attractIframe`, and
`ATTRACT_SRC` is `/kiosk/embed/latest-news` — the attract newsletter is a
second, independent render of the news section. So "reload now when
`attractShowing` is true" has to name which frame:

- A `latest-news` event while the **newsletter attract** is on screen must
  reload `attractIframe`. This is the highest-value case in the entire
  feature: the attract screen is what passers-by actually see, and it is
  showing news. Reloading only the hidden content frame would leave the most
  visible surface stale.
- A `latest-news` event while the **idle-video attract** is playing must not
  disturb the video. Evict, refresh the hidden content frame, leave the
  video alone.
- An `about-lspu` or `gears-archive` event never touches the attract screen;
  it refreshes the hidden content frame.

In every case the hidden content frame is also refreshed, so dropping the
attract screen reveals current content with no flash of stale markup.

## Service worker

`sw-kiosk.js` gains one message type beside `PRECACHE` and `PRECACHE_ROUTES`:

    { type: 'EVICT', section: 'latest-news' }

The worker maps the section to its embed document plus its media prefix and
deletes matching entries from `CACHE_NAME`.

Eviction covers **both** the document and the media, because a story's
replaced image is exactly as stale as its HTML:

| Section | Document | Media prefix |
|---|---|---|
| `latest-news` | `/kiosk/embed/latest-news` | `/storage/news/` |
| `about-lspu` | `/kiosk/embed/about-lspu` | `/storage/About/` |
| `gears-archive` | `/kiosk/embed/gears-archive` | `/storage/Archives/covers/` |

**No `CACHE_NAME` bump.** The caching *strategy* is unchanged; the worker is
only gaining a way to be told that a specific entry is dead. Bumping would
needlessly evict the shell and every archive page.

## Failure modes

| Failure | Behavior |
|---|---|
| Soketi down / unreachable | `pusher-js` reconnects with backoff. Kiosk degrades to exactly today's behavior: SWR freshness, one visit late. |
| Broadcast raises during a save | Swallowed. The save succeeds; the JSON reports `broadcast: false`. |
| Event arrives for an unknown section | Ignored. |
| Stale or duplicate event | Ignored via the stamp comparison. |
| Service worker not controlling the page | Eviction is a no-op; the frame reload still fetches from network. |

No error UI is shown on the terminal under any of these. A public kiosk must
never display plumbing failures to a visitor.

## Testing

**Python (`pytest`)**

- `KioskBroadcast.section_changed` emits the expected section for each editor
  action, patching the broadcast driver.
- A broadcast that raises does not fail the editor's save.
- `_pusher_configured` delegation keeps the four existing controllers'
  behavior identical.
- The archive broadcast fires after page rendering, not at upload.

**JavaScript (`tests/js/kiosk-live.test.mjs`)**

Following the existing `tests/js/kiosk-content.test.mjs` harness:

- Evicts immediately on receipt, in both the awake and attract states.
- Reloads the frame immediately when `attractShowing` is true.
- Defers the reload while a visitor is interacting, and flushes it on the
  next attract.
- Ignores an event whose stamp is not newer than the last applied.
- Reloads the attract iframe on a `latest-news` event while the newsletter
  attract is showing, and leaves an idle video playing untouched.
- Survives an absent service worker controller.

**Manual**

Dashboard and kiosk side by side in two browsers: approve a story with the
kiosk idle (expect a near-immediate swap), and approve one while touching the
kiosk (expect no interruption, then a swap once the attract screen returns).

## Out of scope / later

- Org board, map and branding sections — additive, same mechanism.
- Multiple terminals: the design already supports them (all subscribe to one
  public channel), but only one terminal is deployed today.
- Fragment-level patching that preserves scroll position. Rejected for now:
  it needs per-section client renderers kept in sync with server templates,
  and the idle gate makes the reload invisible in the common case anyway.
