/* Service Worker — Presspoint kiosk offline shell
 *
 * Scope: / (entire origin, granted via the Service-Worker-Allowed response
 * header set by WelcomeController.serve_sw — the script itself is physically
 * under /assets/js/, so without that header its scope would be /assets/).
 *
 * Why this exists: the kiosk's "Kiosk menu" back button needed the network.
 * partials/kiosk-back.html already prefers history.back() so the menu comes
 * back from the bfcache, but that shortcut only fires when document.referrer
 * matches the link target — not on a deep link, a QR entry or a redirect —
 * and a page holding an open Pusher WebSocket is routinely evicted from the
 * bfcache anyway. Every one of those cases fell through to a real GET /kiosk,
 * which simply fails when the campus link is down.
 *
 * Four strategies, chosen by what is being asked for:
 *   - Bypass for anything that must never be stale: the two no-store polls
 *     (/kiosk/flash-updates every 15s, /kiosk/idle-video), every non-GET
 *     (POST /api/route-sessions above all), and /pano/tiles/ — the panorama
 *     capture is ~360 MB and would blow the origin's storage quota on its own.
 *   - Network-first, cache fallback for kiosk *documents*. Deliberately not
 *     cache-first: these responses carry a per-session CSRF token that the
 *     campus map and tour QR handoff POSTs depend on, so online they must stay
 *     exactly as fresh as they are today (see templates/welcome.html, which
 *     names this file). The cache is consulted only when the network fails.
 *   - Stale-while-revalidate for /api/locations and /api/tour-scenes, which
 *     change about once a semester and whose callers already degrade to [].
 *   - Cache-first for the fixed shell: /assets/ (immutable per build — see
 *     below), /pano/vendor/, /pano/img/, and the three /storage/ media trees
 *     the kiosk renders. /storage/Archives/ moved here out of sw-archives.js;
 *     see the note on registrations at the bottom.
 *
 * Cache-first on /assets/ is safe because app/services/AssetVersion.py stamps
 * every compiled URL with ?v=<mtime>. A rebuilt file gets a new URL, which is
 * a cache miss, which fetches fresh. Bumping CACHE_NAME is only needed when
 * *this worker's* strategy changes; the activate handler drops older caches.
 *
 * Receives a PRECACHE message from partials/kiosk-sw.html listing the exact
 * already-stamped URLs the page just loaded. Explicit, because a page's own
 * resource fetches on a first-ever visit happen before this worker controls
 * that navigation, so interception alone would miss them.
 *
 * Registrations: the kiosk terminal must run this worker and only this worker.
 * sw-archives.js and sw-mobile-route.js both also claim scope /, so a kiosk
 * that has already registered sw-archives.js gets it unregistered by
 * partials/kiosk-sw.html. Those two files stay in place for the phone
 * surfaces (/m/archives, /m/route), which never load a kiosk page.
 */

const CACHE_NAME = 'pp-kiosk-v1';

// Never touched: must be live, or is far too large to hold.
const BYPASS_PREFIXES = [
  '/pano/tiles/',
  '/kiosk/flash-updates',
  '/kiosk/idle-video',
];

// Effectively static JSON. Both callers already fall back to [] on failure.
const REVALIDATE_PREFIXES = ['/api/locations', '/api/tour-scenes'];

// Immutable per build (/assets/ carries ?v=<mtime>) or per deploy.
//
// The /storage/ entries are enumerated rather than written as a bare
// '/storage/' prefix on purpose: that would also match /storage/Videos/, which
// VideoController.serve_storage answers with a 206 for a Range request. A 206
// passes Response.ok (which is 200-299), so a blanket rule would happily store
// one chunk of the idle video under the URL of the whole file and then serve
// that truncated body forever. See the status === 200 check in the handler.
const ASSET_PREFIXES = [
  '/assets/',
  '/pano/vendor/',
  '/pano/img/',
  '/storage/Archives/',
  '/storage/Branding/',   // site_logo(), on every kiosk page
  '/storage/About/',      // About LSPU imagery and audio
  '/storage/news/',       // news_image() webp derivatives
];

//: The cache sw-archives.js filled on terminals that ran it before this worker
//: existed. Read through to it rather than re-downloading hundreds of MB of
//: rasterised archive pages; never deleted here, because /m/archives still
//: uses it on phones.
const LEGACY_ARCHIVE_CACHE = 'pp-archives-v1';

const startsWithAny = (pathname, prefixes) =>
  prefixes.some((prefix) => pathname.startsWith(prefix));

// A kiosk document. "/" is excluded on purpose: that path is the phone
// archives skin (ArchivesController@mobile), not part of this shell.
const isKioskDocument = (url) =>
  url.pathname === '/kiosk' || url.pathname.startsWith('/kiosk/');

const OFFLINE_DOCUMENT = `<!DOCTYPE html>
<html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Offline · The Gears</title>
<style>
  body { margin:0; min-height:100vh; display:flex; align-items:center;
         justify-content:center; background:#F4EFE6; color:#5A1218;
         font-family:system-ui,-apple-system,"Segoe UI",sans-serif;
         text-align:center; padding:2rem; }
  h1 { font-size:1.6rem; margin:0 0 .6rem; }
  p  { margin:0 0 1.6rem; color:#6b5a4e; }
  a  { display:inline-block; padding:.85rem 1.6rem; background:#5A1218;
       color:#F4EFE6; text-decoration:none; border-radius:999px; }
</style></head>
<body><div>
  <h1>This page isn't available offline</h1>
  <p>It hasn't been opened on this kiosk yet. The campus connection is down.</p>
  <a href="/kiosk">Back to the kiosk menu</a>
</div></body></html>`;

const offlineFallback = () =>
  new Response(OFFLINE_DOCUMENT, {
    status: 503,
    headers: { 'Content-Type': 'text/html; charset=utf-8' },
  });

self.addEventListener('install', () => {
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) =>
        Promise.all(
          keys
            .filter((k) => k.startsWith('pp-kiosk-') && k !== CACHE_NAME)
            .map((k) => caches.delete(k))
        )
      )
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  // Non-GET is never cacheable here. POST /api/route-sessions in particular
  // mints a one-shot token and must always reach the server.
  if (event.request.method !== 'GET') return;

  const url = new URL(event.request.url);
  const sameOrigin = url.origin === self.location.origin;

  if (sameOrigin && startsWithAny(url.pathname, BYPASS_PREFIXES)) return;

  // Documents: network-first, so the CSRF token in the markup stays fresh
  // whenever there is a connection at all. This is also the path the menu's
  // speculationrules prerender/prefetch travels, which is how the other five
  // kiosk pages end up cached without any extra traffic.
  if (event.request.mode === 'navigate' && sameOrigin && isKioskDocument(url)) {
    event.respondWith(
      caches.open(CACHE_NAME).then(async (cache) => {
        try {
          const response = await fetch(event.request);
          if (response.status === 200) cache.put(event.request, response.clone());
          return response;
        } catch (_) {
          const cached = await cache.match(event.request, { ignoreVary: true });
          if (cached) return cached;
          // Never seen this page offline -- fall back to the menu if we have
          // it, since that is where the back bar was heading anyway.
          const menu = await cache.match('/kiosk', { ignoreVary: true });
          return menu || offlineFallback();
        }
      })
    );
    return;
  }

  if (sameOrigin && startsWithAny(url.pathname, REVALIDATE_PREFIXES)) {
    event.respondWith(
      caches.open(CACHE_NAME).then(async (cache) => {
        const cached = await cache.match(event.request, { ignoreVary: true });
        const network = fetch(event.request)
          .then((response) => {
            if (response.status === 200) cache.put(event.request, response.clone());
            return response;
          })
          // Cold cache and no network: hand back an empty list rather than
          // letting respondWith resolve to undefined (which surfaces as a
          // network error). Both callers -- kiosk-map.js and kiosk-tour.js --
          // already .catch(() => []), so this is the shape they expect.
          .catch(() => cached || new Response('[]', {
            status: 200,
            headers: { 'Content-Type': 'application/json' },
          }));
        return cached || network;
      })
    );
    return;
  }

  if (sameOrigin && startsWithAny(url.pathname, ASSET_PREFIXES)) {
    event.respondWith(
      caches.open(CACHE_NAME).then(async (cache) => {
        const cached = await cache.match(event.request, { ignoreVary: true });
        if (cached) return cached;

        // Inherit whatever sw-archives.js already cached on this terminal.
        if (url.pathname.startsWith('/storage/Archives/')) {
          const legacy = await caches.open(LEGACY_ARCHIVE_CACHE)
            .then((c) => c.match(event.request, { ignoreVary: true }))
            .catch(() => null);
          if (legacy) {
            cache.put(event.request, legacy.clone());
            return legacy;
          }
        }

        const response = await fetch(event.request);
        // status === 200, not response.ok: ok spans 200-299 and would let a
        // 206 partial be stored as though it were the complete file.
        if (response.status === 200) cache.put(event.request, response.clone());
        return response;
      })
    );
    return;
  }

  // Cross-origin (the cdnjs qrcode build, the Pusher client) is only served
  // from cache if PRECACHE happened to store it; otherwise it passes straight
  // through. Everything else on the origin — the dashboard, auth, /m/ — is
  // none of this worker's business.
  event.respondWith(
    caches.open(CACHE_NAME).then(async (cache) => {
      const cached = await cache.match(event.request, { ignoreVary: true });
      if (cached) return cached;
      return fetch(event.request);
    })
  );
});

self.addEventListener('message', (event) => {
  if (!event.data || event.data.type !== 'PRECACHE') return;
  const urls = Array.isArray(event.data.urls) ? event.data.urls : [];
  if (!urls.length) return;

  caches.open(CACHE_NAME).then((cache) => {
    urls.forEach((url) => {
      cache.match(url).then((hit) => {
        if (hit) return;
        // Cross-origin responses come back opaque but are still cacheable and
        // replayable — the standard offline-shell trick for a CDN whose
        // headers we don't control.
        const crossOrigin = !url.startsWith(self.location.origin) && /^https?:/i.test(url);
        fetch(url, { mode: crossOrigin ? 'no-cors' : 'same-origin' })
          .then((r) => { if (r.ok || r.type === 'opaque') cache.put(url, r); })
          .catch(() => {});
      });
    });
  });
});
