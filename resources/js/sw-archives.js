/* Service Worker — Presspoint archive asset cache
 *
 * Scope: / (entire origin, granted via Service-Worker-Allowed response header)
 * Strategy: cache-first for /storage/Archives/**
 *   Miss → fetch from network, store in Cache Storage, return response
 *   Hit  → return from Cache Storage immediately (zero network cost)
 *
 * Receives PRECACHE messages from kiosk-archives.js to proactively cache
 * cover images before any user opens an archive.
 *
 * To bust the cache after replacing archive files, bump CACHE_NAME below
 * (e.g. pp-archives-v2). The activate handler deletes old-named caches.
 *
 * Phone surface only (/m/archives) as of the kiosk offline work. The kiosk
 * terminal runs sw-kiosk.js instead, which carries this same /storage/Archives/
 * cache-first block alongside its shell caching -- both workers claim scope /,
 * so running the two on one device meant them racing over the same requests.
 * partials/kiosk-sw.html unregisters this worker when it finds it on a kiosk.
 * mobile-archives.js still registers it, and must keep doing so.
 */

// v2: archive pages moved from page-N.png to page-N.webp at a higher raster.
// Nothing stale can be *served* -- the URLs changed, so the old entries are
// simply never requested again -- but they are hundreds of MB of dead weight
// on a phone, and renaming the cache is what reclaims them (see activate).
const CACHE_NAME = 'pp-archives-v3';
const ARCHIVE_PATH = '/storage/Archives/';

self.addEventListener('install', () => {
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) =>
        Promise.all(
          keys
            .filter((k) => k.startsWith('pp-archives-') && k !== CACHE_NAME)
            .map((k) => caches.delete(k))
        )
      )
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);
  if (!url.pathname.startsWith(ARCHIVE_PATH)) return;
  if (event.request.method !== 'GET') return;

  event.respondWith(
    caches.open(CACHE_NAME).then(async (cache) => {
      const cached = await cache.match(event.request, { ignoreVary: true });
      if (cached) return cached;

      try {
        const response = await fetch(event.request);
        if (response.ok) {
          cache.put(event.request, response.clone());
        }
        return response;
      } catch (_) {
        return new Response('Offline — archive not yet cached', { status: 503 });
      }
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
        if (!hit) {
          fetch(url, { priority: 'low' })
            .then((r) => { if (r.ok) cache.put(url, r); })
            .catch(() => {});
        }
      });
    });
  });
});
