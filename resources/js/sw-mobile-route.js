/* Service Worker — Presspoint mobile-route offline cache
 *
 * Scope: / (entire origin, granted via Service-Worker-Allowed response header)
 *
 * Each QR code hands one phone a 30-minute walking session. Once the page has
 * loaded, everything it needs to keep tracking (route geometry, the WGS84<->
 * pixel transform, the campus layer's own embedded GeoJSON) is already static
 * data the page holds in memory — GPS itself doesn't need network either
 * (navigator.geolocation reads the phone's own chip). The only reason the
 * page would break offline is that its assets and its one data fetch aren't
 * cached anywhere. This fixes that half.
 *
 * Two strategies, chosen by what's being asked for:
 *   - Cache-first for the fixed shell (JS/CSS/fonts/Leaflet/the Tailwind CDN
 *     link) — immutable per deploy, so a hit never needs a network check.
 *   - Network-first, falling back to cache, for the page navigation itself
 *     and GET /api/route-sessions/<token> — prefer live truth whenever
 *     there's a connection (a finished/expired session should show as such
 *     the moment the phone reconnects), fall back to the last successful
 *     response when there isn't one.
 *
 * POST /api/route-sessions/<token>/finish is deliberately NOT handled here —
 * mobile-route.js owns retrying that itself; replaying a queued POST from a
 * service worker is a worse fit than a small retry loop in the page.
 *
 * Receives a PRECACHE message from mobile-route.js right after it registers
 * this worker, listing the exact (already version-stamped) asset URLs the
 * page just loaded plus its own session-data URL — explicit, because the
 * very first load's own resource fetches happen before this worker can be
 * controlling that navigation, so relying on interception alone would miss
 * them on a phone's first-ever visit.
 *
 * To bust the cache after a deploy, bump CACHE_NAME below (e.g. pp-route-v2).
 * The activate handler deletes old-named caches.
 */

const CACHE_NAME = 'pp-route-v1';
const NETWORK_FIRST_PREFIXES = ['/m/route/', '/api/route-sessions/'];

self.addEventListener('install', () => {
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) =>
        Promise.all(
          keys
            .filter((k) => k.startsWith('pp-route-') && k !== CACHE_NAME)
            .map((k) => caches.delete(k))
        )
      )
      .then(() => self.clients.claim())
  );
});

const isNetworkFirst = (url) => NETWORK_FIRST_PREFIXES.some((prefix) => url.pathname.startsWith(prefix));

self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') return;

  const url = new URL(event.request.url);
  const sameOriginPath = url.origin === self.location.origin ? url.pathname : null;

  // Only intercept what this worker actually knows how to handle: the
  // mobile-route page/API family (network-first) or something already sitting
  // in this cache from a prior PRECACHE (cache-first). Everything else -- the
  // rest of the site -- passes straight through untouched.
  if (sameOriginPath && isNetworkFirst(url)) {
    event.respondWith(
      caches.open(CACHE_NAME).then(async (cache) => {
        try {
          const response = await fetch(event.request);
          if (response.ok) cache.put(event.request, response.clone());
          return response;
        } catch (_) {
          const cached = await cache.match(event.request, { ignoreVary: true });
          if (cached) return cached;
          throw _;
        }
      })
    );
    return;
  }

  event.respondWith(
    caches.open(CACHE_NAME).then(async (cache) => {
      const cached = await cache.match(event.request, { ignoreVary: true });
      if (cached) return cached;

      // Not something we precached -- let the browser handle it normally
      // rather than guessing whether it belongs to this cache at all.
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
      // Cross-origin (e.g. the Tailwind CDN link) responses are opaque but
      // still cacheable and replayable -- the standard trick every offline
      // PWA shell uses to hold a CDN library it doesn't control headers for.
      fetch(url, { mode: url.startsWith(self.location.origin) ? 'same-origin' : 'no-cors' })
        .then((r) => { if (r.ok || r.type === 'opaque') cache.put(url, r); })
        .catch(() => {});
    });
  });
});
