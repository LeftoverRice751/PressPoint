// Run with: node --test tests/js/
//
// The virtual tour's whole-capture cache (resources/js/tour-tile-warmup.mjs and
// the /pano/tiles/ handler in resources/js/sw-kiosk.js). Everything here fails
// silently: a wrong URL list warms tiles Marzipano never asks for, a missing
// stamp pins a re-shot tour forever, and a tile stored in the shell cache is
// thrown away by the next CACHE_NAME bump.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

import {
  PANO_CACHE,
  captureQuery,
  pruneOtherCaptures,
  tileUrlsForScenes,
  warmTourTiles,
} from '../../resources/js/tour-tile-warmup.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const APP_DATA_SOURCE = readFileSync(join(here, '../../resources/js/data.js'), 'utf8');
const SW_SOURCE = readFileSync(join(here, '../../resources/js/sw-kiosk.js'), 'utf8');

function loadAppData() {
  const window = {};
  new Function('window', APP_DATA_SOURCE)(window);
  return window.APP_DATA;
}

// The levels every scene in the shipped capture uses.
const LEVELS = [
  { tileSize: 256, size: 256, fallbackOnly: true },
  { tileSize: 512, size: 512 },
  { tileSize: 512, size: 1024 },
];

test('one scene is a preview plus 6 coarse and 24 sharp tiles', () => {
  const urls = tileUrlsForScenes([{ id: '0-jst-1', levels: LEVELS }], '');
  assert.equal(urls.length, 31);
  assert.equal(urls[0], '/pano/tiles/0-jst-1/preview.jpg');
  assert.ok(urls.includes('/pano/tiles/0-jst-1/1/b/0/0.jpg'));
  assert.ok(urls.includes('/pano/tiles/0-jst-1/2/u/1/1.jpg'));
  // The fallbackOnly level is served from preview.jpg and has no tiles.
  assert.ok(!urls.some((u) => u.includes('/0-jst-1/0/')));
});

test('the shipped capture lists exactly the 6,355 files on disk', () => {
  const urls = tileUrlsForScenes(loadAppData().scenes, '');
  assert.equal(urls.length, 6355);
  assert.equal(new Set(urls).size, urls.length);
});

test('previews come first, then every coarse level, then every sharp one', () => {
  const scenes = [{ id: 'a', levels: LEVELS }, { id: 'b', levels: LEVELS }];
  const urls = tileUrlsForScenes(scenes, '');
  const kind = (u) => (u.endsWith('preview.jpg') ? 0 : Number(u.split('/')[4]));
  const kinds = urls.map(kind);
  assert.deepEqual(kinds, [...kinds].sort((x, y) => x - y));
});

test('every URL carries the capture stamp, matching what Marzipano requests', () => {
  const urls = tileUrlsForScenes([{ id: 'a', levels: LEVELS }], '1759999999');
  assert.ok(urls.every((u) => u.endsWith('?c=1759999999')));
  assert.equal(captureQuery(''), '');
});

function fakeCache(initial = []) {
  const store = new Map(initial.map((u) => [u, { url: u }]));
  return {
    store,
    match: async (url) => store.get(url),
    keys: async () => Array.from(store.values()).map((r) => ({ url: r.url })),
    delete: async (req) => store.delete(req.url),
  };
}

test('prune drops other captures and unstamped tiles, keeps this one', async () => {
  const o = 'https://presspoint-gears.me';
  const cache = fakeCache([
    `${o}/pano/tiles/a/preview.jpg?c=new`,
    `${o}/pano/tiles/a/preview.jpg?c=old`,
    `${o}/pano/tiles/a/preview.jpg`,
  ]);
  await pruneOtherCaptures(cache, 'new');
  assert.deepEqual(Array.from(cache.store.keys()), [`${o}/pano/tiles/a/preview.jpg?c=new`]);
});

function env(cache, overrides = {}) {
  const fetched = [];
  return {
    fetched,
    env: {
      navigator: { serviceWorker: { controller: {} }, storage: null },
      caches: { open: async (name) => { assert.equal(name, PANO_CACHE); return cache; } },
      fetch: async (url) => { fetched.push(url); return { body: null }; },
      capture: 'c1',
      ...overrides,
    },
  };
}

test('the sweep fetches only what the cache does not already hold', async () => {
  const urls = ['/pano/tiles/a/preview.jpg?c=c1', '/pano/tiles/a/1/b/0/0.jpg?c=c1'];
  const cache = fakeCache([urls[0]]);
  const { fetched, env: e } = env(cache);
  await warmTourTiles(urls, e);
  assert.deepEqual(fetched, [urls[1]]);
});

test('the sweep does nothing without a controlling service worker', async () => {
  const { fetched, env: e } = env(fakeCache(), {
    navigator: { serviceWorker: { controller: null } },
  });
  await warmTourTiles(['/pano/tiles/a/preview.jpg?c=c1'], e);
  assert.deepEqual(fetched, []);
});

test('the sweep refuses to eat into a nearly full quota', async () => {
  const storage = { estimate: async () => ({ quota: 1000e6, usage: 900e6 }) };
  const { fetched, env: e } = env(fakeCache(), {
    navigator: { serviceWorker: { controller: {} }, storage },
  });
  await warmTourTiles(['/pano/tiles/a/preview.jpg?c=c1'], e);
  assert.deepEqual(fetched, []);
});

test('the sweep gives up after repeated network failures instead of hammering', async () => {
  const urls = Array.from({ length: 50 }, (_, i) => `/pano/tiles/a/${i}.jpg?c=c1`);
  let calls = 0;
  const { env: e } = env(fakeCache(), {
    fetch: async () => { calls++; throw new TypeError('offline'); },
  });
  await warmTourTiles(urls, e);
  assert.ok(calls < 10, `made ${calls} requests to a dead link`);
});

// --- sw-kiosk.js /pano/tiles/ handler ---------------------------------------

function bootWorker() {
  const listeners = {};
  const opened = {};
  const cacheFor = (name) =>
    (opened[name] ||= {
      store: new Map(),
      async match(req) { return this.store.get(req.url); },
      async put(req, res) { this.store.set(req.url, res); },
    });
  const self = {
    location: { origin: 'https://presspoint-gears.me' },
    addEventListener(type, fn) { (listeners[type] ||= []).push(fn); },
    skipWaiting() {},
    clients: { claim() {} },
  };
  const caches = { open: async (name) => cacheFor(name), keys: async () => [] };
  const fetchImpl = async () => ({ status: 200, clone() { return { cloned: true }; } });
  new Function('self', 'caches', 'fetch', SW_SOURCE)(self, caches, fetchImpl);

  async function request(url) {
    let responded;
    const waits = [];
    for (const fn of listeners.fetch) {
      fn({
        request: { url, method: 'GET', mode: 'no-cors' },
        respondWith: (p) => { responded = p; },
        waitUntil: (p) => waits.push(p),
      });
    }
    const response = responded ? await responded : undefined;
    await Promise.all(waits);
    return response;
  }
  return { opened, request };
}

test('the worker stores tiles in PANO_CACHE, not the shell cache', async () => {
  const { opened, request } = bootWorker();
  const url = 'https://presspoint-gears.me/pano/tiles/a/2/f/0/1.jpg?c=c1';
  const response = await request(url);
  assert.ok(response, 'the tile request was bypassed');
  assert.ok(opened[PANO_CACHE].store.has(url));
  const shell = Object.keys(opened).filter((n) => n.startsWith('pp-kiosk-'));
  assert.ok(shell.every((n) => !opened[n].store.has(url)));
});
