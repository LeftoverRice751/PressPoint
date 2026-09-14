// Run with: node --test tests/js/
//
// sw-kiosk.js serves kiosk documents and editor-mutable media stale-while-
// revalidate, which is what makes the terminal feel instant -- and what makes a
// bare "reload the frame" do nothing visible, because the reload re-serves the
// same stale entry. EVICT is the message the shell sends first, so the reload
// that follows misses the cache and fetches fresh.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const SOURCE = readFileSync(join(here, '../../resources/js/sw-kiosk.js'), 'utf8');

const ORIGIN = 'https://presspoint-gears.me';

function boot(initialUrls) {
  const listeners = {};
  const store = new Map(initialUrls.map((u) => [u, { url: u }]));
  const cache = {
    keys: async () => Array.from(store.values()).map((r) => ({ url: r.url })),
    delete: async (req) => store.delete(typeof req === 'string' ? req : req.url),
    match: async () => undefined,
    put: async () => undefined,
  };
  const self = {
    location: { origin: ORIGIN },
    addEventListener(type, fn) { (listeners[type] ||= []).push(fn); },
    skipWaiting() {},
    clients: { claim() {} },
  };
  const caches = { open: async () => cache, keys: async () => [] };
  new Function('self', 'caches', 'fetch', SOURCE)(self, caches, async () => ({ status: 200 }));

  async function message(data) {
    const waits = [];
    for (const fn of listeners.message || []) {
      fn({ data, waitUntil: (p) => waits.push(p) });
    }
    await Promise.all(waits);
  }
  return { store, message };
}

const SEED = [
  `${ORIGIN}/kiosk/embed/latest-news`,
  `${ORIGIN}/storage/news/story-1.large.webp`,
  `${ORIGIN}/kiosk/embed/about-lspu`,
  `${ORIGIN}/storage/About/seal.webp`,
  `${ORIGIN}/kiosk/embed/gears-archive`,
  `${ORIGIN}/storage/Archives/covers/vol-1.webp`,
  `${ORIGIN}/storage/Archives/pages/vol-1/page-1.webp`,
  `${ORIGIN}/kiosk/embed/campus-map`,
];

test('EVICT latest-news drops the news document and its media only', async () => {
  const { store, message } = boot(SEED);
  await message({ type: 'EVICT', section: 'latest-news' });
  const left = Array.from(store.keys());
  assert.ok(!left.includes(`${ORIGIN}/kiosk/embed/latest-news`));
  assert.ok(!left.includes(`${ORIGIN}/storage/news/story-1.large.webp`));
  assert.ok(left.includes(`${ORIGIN}/kiosk/embed/about-lspu`));
  assert.ok(left.includes(`${ORIGIN}/storage/About/seal.webp`));
  assert.ok(left.includes(`${ORIGIN}/kiosk/embed/campus-map`));
});

test('EVICT gears-archive drops covers but never the rasterised pages', async () => {
  const { store, message } = boot(SEED);
  await message({ type: 'EVICT', section: 'gears-archive' });
  const left = Array.from(store.keys());
  assert.ok(!left.includes(`${ORIGIN}/kiosk/embed/gears-archive`));
  assert.ok(!left.includes(`${ORIGIN}/storage/Archives/covers/vol-1.webp`));
  assert.ok(left.includes(`${ORIGIN}/storage/Archives/pages/vol-1/page-1.webp`));
});

test('EVICT never touches another origin', async () => {
  const foreign = 'https://cdn.example.com/storage/news/story-1.large.webp';
  const { store, message } = boot([...SEED, foreign]);
  await message({ type: 'EVICT', section: 'latest-news' });
  assert.ok(store.has(foreign));
});

test('EVICT for an unknown section is a no-op', async () => {
  const { store, message } = boot(SEED);
  await message({ type: 'EVICT', section: 'org-chart' });
  assert.equal(store.size, SEED.length);
});

test('EVICT with no section is a no-op', async () => {
  const { store, message } = boot(SEED);
  await message({ type: 'EVICT' });
  assert.equal(store.size, SEED.length);
});
