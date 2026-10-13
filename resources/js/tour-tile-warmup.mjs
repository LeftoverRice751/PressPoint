/*
 * Pull the whole panorama capture into the kiosk's tile cache, once.
 *
 * Marzipano only ever asks for the tiles of the scene on screen, so without
 * this every scene a visitor walks into streams its tiles in one by one — on
 * the first visit of the day and, before sw-kiosk.js held /pano/tiles/ at all,
 * on every visit. The terminal is idle most of the time and the capture is a
 * fixed 6,355 files, so the first tour start of a capture downloads all of it
 * in the background and every later visit paints from Cache Storage.
 *
 * Page-driven on purpose, rather than one PRECACHE message to the worker: a
 * service worker event is killed after a few minutes however long its
 * waitUntil promise is, and ~360 MB over the campus link can take longer than
 * that. Here every tile is its own fetch event, which sw-kiosk.js stores
 * through its normal /pano/tiles/ handler, and a sweep cut short by a reload
 * simply resumes next time — anything already held is skipped by caches.match.
 */

// Marzipano's cube faces, in the order its ImageUrlSource fills {f}.
const FACES = ['b', 'd', 'f', 'l', 'r', 'u'];

// Must match PANO_CACHE in resources/js/sw-kiosk.js.
export const PANO_CACHE = 'pp-pano-v1';

// Headroom the sweep refuses to eat into. Archive pages share this origin's
// quota and are far more expensive to rebuild than tiles.
const QUOTA_MARGIN_BYTES = 600 * 1024 * 1024;

export function captureQuery(capture) {
  return capture ? '?c=' + encodeURIComponent(capture) : '';
}

/*
 * Every URL the capture serves, cheapest-and-most-useful first: all previews
 * (what paints the instant a scene opens), then each scene's coarse level,
 * then the sharp one. A sweep interrupted halfway has therefore made every
 * scene presentable before it made any scene crisp.
 *
 * Mirrors the template kiosk-tour.js hands Marzipano, and Marzipano's own
 * tiling: a fallbackOnly level is served from preview.jpg and has no tiles,
 * and a level of `size` px in `tileSize` tiles is ceil(size / tileSize)
 * tiles square per face.
 */
export function tileUrlsForScenes(scenes, capture) {
  const query = captureQuery(capture);
  const base = (scene) => '/pano/tiles/' + scene.id;
  const urls = (scenes || []).map((scene) => base(scene) + '/preview.jpg' + query);

  const deepest = Math.max(0, ...(scenes || []).map((s) => (s.levels || []).length));
  for (let z = 0; z < deepest; z++) {
    for (const scene of scenes) {
      const level = (scene.levels || [])[z];
      if (!level || level.fallbackOnly) continue;
      const span = Math.ceil(level.size / level.tileSize);
      for (const face of FACES) {
        for (let y = 0; y < span; y++) {
          for (let x = 0; x < span; x++) {
            urls.push(`${base(scene)}/${z}/${face}/${y}/${x}.jpg${query}`);
          }
        }
      }
    }
  }
  return urls;
}

async function hasRoomFor(storage) {
  if (!storage || !storage.estimate) return true;
  try {
    const { quota, usage } = await storage.estimate();
    if (!quota) return true;
    return quota - (usage || 0) > QUOTA_MARGIN_BYTES;
  } catch (_) {
    return true;
  }
}

/*
 * Drop tiles of any capture but this one. After a re-export the new stamp
 * means nothing old is ever *served* (every URL changed), but the previous
 * capture is still ~360 MB of dead weight in this origin's quota.
 *
 * Unstamped entries go too: they are what the Tour Mapping preview requests
 * if an editor ever opens the dashboard on the terminal's browser.
 */
export async function pruneOtherCaptures(cache, capture) {
  if (!capture) return;
  let keys;
  try {
    keys = await cache.keys();
  } catch (_) {
    return;
  }
  const doomed = keys.filter((req) => {
    try {
      return new URL(req.url).searchParams.get('c') !== capture;
    } catch (_) {
      return false;
    }
  });
  await Promise.all(doomed.map((req) => cache.delete(req).catch(() => false)));
}

/*
 * Returns a promise that settles when the sweep finishes or gives up; it never
 * rejects. `env` is injectable for the tests; in the browser it defaults to the
 * real globals.
 *
 * Skips entirely without a controlling service worker: the fetches would only
 * land in the HTTP cache, which is small, LRU and exactly what was failing to
 * keep the tour around in the first place.
 */
export async function warmTourTiles(urls, env = {}) {
  const nav = env.navigator || (typeof navigator !== 'undefined' ? navigator : null);
  const cacheStorage = env.caches || (typeof caches !== 'undefined' ? caches : null);
  const doFetch = env.fetch || (typeof fetch !== 'undefined' ? fetch : null);
  const concurrency = env.concurrency || 2;

  if (!nav || !nav.serviceWorker || !nav.serviceWorker.controller) return;
  if (!cacheStorage || !doFetch || !urls || !urls.length) return;

  let cache;
  try {
    cache = await cacheStorage.open(PANO_CACHE);
  } catch (_) {
    return;
  }

  await pruneOtherCaptures(cache, env.capture);

  // Only what is missing. Checked up front so a fully warmed terminal costs
  // 6,355 index lookups and no bytes.
  const missing = [];
  for (const url of urls) {
    try {
      if (!(await cache.match(url, { ignoreVary: true }))) missing.push(url);
    } catch (_) {
      missing.push(url);
    }
  }
  if (!missing.length) return;
  if (!(await hasRoomFor(nav.storage))) return;

  let next = 0;
  let failures = 0;
  async function lane() {
    while (next < missing.length) {
      const url = missing[next++];
      try {
        // priority:'low' so the tiles of the scene the visitor is actually
        // looking at, which Marzipano requests at the default priority, are
        // never queued behind this.
        const response = await doFetch(url, { priority: 'low', credentials: 'same-origin' });
        // Drain the body. sw-kiosk.js stores a clone, and a tee whose other
        // branch is never read buffers the whole tile in memory until GC.
        if (response && response.body) await response.arrayBuffer();
      } catch (_) {
        // The campus link dropped. Stop rather than burn through 6,000 failed
        // requests; whatever landed is kept and the next tour start resumes.
        if (++failures >= 5) {
          next = missing.length;
        }
      }
    }
  }
  await Promise.all(Array.from({ length: concurrency }, lane));
}
