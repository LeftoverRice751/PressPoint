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
 *   - Bypass for anything that must never be stale: the no-store polls
 *     (/kiosk/flash-updates every 15s, /kiosk/idle-video, /kiosk/csrf), every
 *     non-GET (POST /api/route-sessions above all), and most of /pano/tiles/ —
 *     the panorama capture is ~360 MB and would blow the origin's storage
 *     quota on its own. The preview carve-out is the one exception; see
 *     PANO_PREVIEW below.
 *   - Stale-while-revalidate for kiosk *documents*, for /api/locations and
 *     /api/tour-scenes (which change about once a semester and whose callers
 *     already degrade to []), and for the three editor-mutable /storage/ media
 *     trees.
 *   - Cache-first for what is genuinely immutable: /assets/ (versioned per
 *     build — see below), /pano/vendor/, /pano/img/, and /storage/Archives/
 *     (a published issue's rasterised pages never change). /storage/Archives/
 *     moved here out of sw-archives.js; see the note on registrations at the
 *     bottom.
 *
 * Documents were network-first until welcome.html gained its stage viewport,
 * for one reason: the markup carries a per-session CSRF token that the campus
 * map and tour QR handoff POSTs read out of <meta name="csrf-token">, so a
 * cached document would hand them a stale one. That token now has its own
 * always-fresh endpoint (GET /kiosk/csrf, bypassed below), and both callers
 * fall back to it, so the documents are static and can be served from cache
 * instantly and revalidated behind the visitor's back. This is what makes
 * opening a destination in the viewport cost nothing.
 *
 * Editor-mutable media (/storage/Branding/, /storage/About/, /storage/news/)
 * moved from cache-first to stale-while-revalidate at the same time. Unlike
 * /assets/ those URLs carry no version stamp, so cache-first meant an editor
 * replacing the site logo or a news image never reached a terminal at all
 * until someone bumped CACHE_NAME. SWR is just as instant and repairs itself.
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
 * Also receives EVICT from the shell (welcome-screen.js via kiosk-live.js)
 * when an editor's change is announced over Pusher: it drops one section's
 * cached document and media so the reload that follows fetches fresh. With
 * stale-while-revalidate a reload alone would re-serve the stale entry.
 *
 * Registrations: the kiosk terminal must run this worker and only this worker.
 * sw-archives.js and sw-mobile-route.js both also claim scope /, so a kiosk
 * that has already registered sw-archives.js gets it unregistered by
 * partials/kiosk-sw.html. Those two files stay in place for the phone
 * surfaces (/m/archives, /m/route), which never load a kiosk page.
 */

// v3: documents and editor-mutable media changed strategy (see the header), so
// entries stored under the old rules have to go. v2 was the page-N.png ->
// page-N.webp rename. The shell assets a bump also evicts are re-fetched once.
const CACHE_NAME = 'pp-kiosk-v3';

// Never touched: must be live, or is far too large to hold.
const BYPASS_PREFIXES = [
  '/pano/tiles/',
  '/kiosk/flash-updates',
  '/kiosk/idle-video',
  // The whole point of this endpoint is to be fresher than the document that
  // would otherwise have carried it. Caching it would restore exactly the
  // staleness it exists to remove.
  '/kiosk/csrf',
];

/*
 * The one carve-out from the /pano/tiles/ bypass.
 *
 * The bypass is right about the capture as a whole — 362 MB across 205 scenes
 * — but the distribution is lopsided, and the interesting slice is tiny:
 *
 *     all 205 preview.jpg .......  20 MB
 *     one scene, level 1/ ......  228 KB
 *     one scene, level 2/ ......  704 KB
 *     everything .............   362 MB
 *
 * preview.jpg is the low-resolution cube Marzipano paints the instant you
 * enter a scene, before a single sharp tile has arrived. Holding all 205 of
 * them costs 5.5% of the capture and means every one of the 205 scene switches
 * paints immediately instead of showing a blank cube while tiles stream in.
 * The numbered level directories stay bypassed — that is where the 342 MB is.
 */
const PANO_PREVIEW = /^\/pano\/tiles\/[^/]+\/preview\.jpg$/;

// Effectively static JSON. Both callers already fall back to [] on failure.
const REVALIDATE_PREFIXES = ['/api/locations', '/api/tour-scenes'];

/*
 * Editor-mutable, and so served stale-while-revalidate rather than cache-first.
 *
 * These carry no version stamp (unlike /assets/), so cache-first pinned them
 * for the life of the cache: a replaced site logo or news image simply never
 * arrived on a terminal. SWR keeps the instant hit and repairs on the next
 * load.
 *
 * Enumerated rather than written as a bare '/storage/' prefix on purpose: that
 * would also match /storage/Videos/, which VideoController.serve_storage
 * answers with a 206 for a Range request. A 206 passes Response.ok (which is
 * 200-299), so a blanket rule would happily store one chunk of the idle video
 * under the URL of the whole file and then serve that truncated body forever.
 * See the status === 200 checks in the handlers.
 */
const MEDIA_PREFIXES = [
  '/storage/Branding/',   // site_logo(), on every kiosk page
  '/storage/About/',      // About LSPU imagery and audio
  '/storage/news/',       // news_image() webp derivatives
];

// What a live-update EVICT drops, per kiosk section. Both the document and
// the media go, because a story's replaced image is exactly as stale as its
// HTML. Archive pages are deliberately absent: they are immutable per issue,
// so only the covers (the shelf) are evicted. Must match
// app/services/KioskBroadcast.py SECTIONS.
const EVICT_SECTIONS = {
  'latest-news':   { document: '/kiosk/embed/latest-news',   media: '/storage/news/' },
  'about-lspu':    { document: '/kiosk/embed/about-lspu',    media: '/storage/About/' },
  'gears-archive': { document: '/kiosk/embed/gears-archive', media: '/storage/Archives/covers/' },
};

// Immutable per build (/assets/ carries ?v=<mtime>) or per deploy. A published
// issue's rasterised pages never change either, which is why Archives is here
// and the other three /storage/ trees are not.
const ASSET_PREFIXES = [
  '/assets/',
  '/pano/vendor/',
  '/pano/img/',
  '/storage/Archives/',
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

  // The preview carve-out is checked BEFORE the bypass, because
  // '/pano/tiles/' is one of the bypass prefixes and would otherwise swallow
  // it. See PANO_PREVIEW.
  const isPanoPreview = sameOrigin && PANO_PREVIEW.test(url.pathname);

  if (!isPanoPreview && sameOrigin && startsWithAny(url.pathname, BYPASS_PREFIXES)) return;

  /*
   * Documents: stale-while-revalidate. Serve the cached copy immediately and
   * refresh it in the background for next time.
   *
   * This was network-first until the CSRF token moved out of the markup and
   * into GET /kiosk/csrf (see the header, and WelcomeController.csrf). It is
   * also the path the menu's .feature-card prefetch travels — an iframe load
   * is a mode:'navigate' request just as a top-level navigation is — which is
   * how the other five destinations end up cached without any extra traffic.
   */
  if (event.request.mode === 'navigate' && sameOrigin && isKioskDocument(url)) {
    event.respondWith(
      caches.open(CACHE_NAME).then(async (cache) => {
        const cached = await cache.match(event.request, { ignoreVary: true });

        const network = fetch(event.request)
          .then((response) => {
            if (response.status === 200) cache.put(event.request, response.clone());
            return response;
          })
          .catch(async () => {
            if (cached) return cached;
            // Never seen this page offline -- fall back to the menu if we have
            // it, since that is where the back bar was heading anyway.
            const menu = await cache.match('/kiosk', { ignoreVary: true });
            return menu || offlineFallback();
          });

        if (!cached) return network;

        // Let the revalidation finish after the response is handed back. Without
        // waitUntil the worker may be killed the moment respondWith settles, so
        // the refresh this strategy is named for would routinely never land and
        // the cache would go permanently stale.
        event.waitUntil(network.catch(() => {}));
        return cached;
      })
    );
    return;
  }

  if (
    sameOrigin &&
    (startsWithAny(url.pathname, REVALIDATE_PREFIXES) ||
      startsWithAny(url.pathname, MEDIA_PREFIXES))
  ) {
    const isJson = startsWithAny(url.pathname, REVALIDATE_PREFIXES);
    event.respondWith(
      caches.open(CACHE_NAME).then(async (cache) => {
        const cached = await cache.match(event.request, { ignoreVary: true });
        const network = fetch(event.request)
          .then((response) => {
            if (response.status === 200) cache.put(event.request, response.clone());
            return response;
          })
          // Cold cache and no network. For the two JSON endpoints, hand back an
          // empty list rather than letting respondWith resolve to undefined
          // (which surfaces as a network error); both callers -- kiosk-map.js
          // and kiosk-tour.js -- already .catch(() => []), so this is the shape
          // they expect. A missing image should stay a failed image request,
          // not a JSON body, so media rethrows.
          .catch((err) => {
            if (cached) return cached;
            if (!isJson) throw err;
            return new Response('[]', {
              status: 200,
              headers: { 'Content-Type': 'application/json' },
            });
          });

        if (!cached) return network;
        event.waitUntil(network.catch(() => {}));
        return cached;
      })
    );
    return;
  }

  if (isPanoPreview || (sameOrigin && startsWithAny(url.pathname, ASSET_PREFIXES))) {
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
  if (!event.data) return;

  if (event.data.type === 'PRECACHE') {
    const urls = Array.isArray(event.data.urls) ? event.data.urls : [];
    if (!urls.length) return;
    event.waitUntil(precacheUrls(urls));
    return;
  }

  if (event.data.type === 'PRECACHE_ROUTES') {
    const routes = Array.isArray(event.data.routes) ? event.data.routes : [];
    if (!routes.length) return;
    event.waitUntil(precacheRoutes(routes));
    return;
  }

  if (event.data.type === 'EVICT') {
    const target = EVICT_SECTIONS[event.data.section];
    if (!target) return;
    event.waitUntil(evictSection(target));
  }
});

/*
 * Drop one section's cached document and media so the next fetch misses.
 *
 * Sent by the shell (welcome-screen.js, via kiosk-live.js) the moment an
 * editor's change is announced over Pusher, BEFORE any frame reload: with
 * stale-while-revalidate a reload alone would re-serve the stale entry and
 * appear to do nothing. No CACHE_NAME bump is involved -- the strategy is
 * unchanged, the worker is just being told that a specific entry is dead.
 */
function evictSection(target) {
  return caches.open(CACHE_NAME).then(async (cache) => {
    const keys = await cache.keys();
    const doomed = keys.filter((req) => {
      const url = new URL(req.url);
      if (url.origin !== self.location.origin) return false;
      return url.pathname === target.document || url.pathname.startsWith(target.media);
    });
    await Promise.all(doomed.map((req) => cache.delete(req)));
  });
}

function precacheUrls(urls) {
  return caches.open(CACHE_NAME).then((cache) =>
    Promise.all(
      urls.map((url) =>
        cache.match(url).then((hit) => {
          if (hit) return null;
          // Cross-origin responses come back opaque but are still cacheable and
          // replayable — the standard offline-shell trick for a CDN whose
          // headers we don't control.
          const crossOrigin = !url.startsWith(self.location.origin) && /^https?:/i.test(url);
          return fetch(url, { mode: crossOrigin ? 'no-cors' : 'same-origin' })
            .then((r) => {
              if (r.ok || r.type === 'opaque') return cache.put(url, r);
              return null;
            })
            .catch(() => null);
        })
      )
    )
  );
}

/*
 * Warm the whole kiosk from an idle terminal.
 *
 * PRECACHE (above) can only ever list what the current document already
 * loaded, so a destination stayed uncached until somebody visited it — the
 * first visitor of the day paid full price for every screen, and a terminal
 * whose campus link went down overnight could only offer whatever had been
 * opened before it dropped.
 *
 * This kiosk is idle most of the day and its destination set is a known, fixed
 * six, so the attract screen is free time to fetch all of them. Each document
 * goes through the normal cache put, and its asset graph is scraped out of the
 * returned HTML and precached too.
 *
 * The scrape is a regex over markup we generated ourselves, which is the same
 * bargain partials/kiosk-sw.html already makes against the live DOM — it just
 * cannot use the DOM here, because a service worker has no parser and these
 * documents are never loaded. It deliberately matches only /assets/, so a
 * malformed match can at worst fetch a URL from our own build output.
 */
const ASSET_URL_PATTERN = /(?:src|href)="(\/assets\/[^"]+)"/g;

function precacheRoutes(routes) {
  return caches.open(CACHE_NAME).then(async (cache) => {
    for (const route of routes) {
      if (typeof route !== 'string' || !route.startsWith('/')) continue;

      try {
        // mode:'same-origin', not 'navigate': a navigate-mode fetch from a
        // worker is not allowed. The document is stored under its URL either
        // way, which is what the navigate handler above matches on.
        const response = await fetch(route, {
          credentials: 'same-origin',
          cache: 'no-cache',
        });
        if (response.status !== 200) continue;

        const html = await response.clone().text();
        await cache.put(route, response);

        const assets = new Set();
        let match;
        ASSET_URL_PATTERN.lastIndex = 0;
        while ((match = ASSET_URL_PATTERN.exec(html)) !== null) {
          assets.add(match[1]);
        }
        if (assets.size) await precacheUrls([...assets]);
      } catch (_) {
        // One unreachable destination must not abandon the other five.
      }
    }
  });
}
