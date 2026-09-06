// Run with: npm run test:js  (node --test tests/js/*.test.mjs)
//
// The archive reader used to route every page image through the on-demand
// Python route, and only for the first 20 pages of a document. Both halves of
// that were bugs:
//
//   1. The 20-page cap meant page 21 onward had no server render to paint, so
//      the reader downloaded the (often ~100 MB) PDF and rasterised each page
//      itself, sequentially, on the kiosk terminal's CPU. That is what "later
//      pages take forever to load" was — it was never the network.
//   2. Even the 20 fast pages cost a gunicorn round-trip and a 302 each, were
//      rate-limited at 30/min per IP, and could not be cached by the service
//      worker, which only caches /storage/Archives/.
//
// These pin the routing so neither can come back silently.

import test from 'node:test';
import assert from 'node:assert/strict';

import { hasServerPage, serverPageUrl } from '../../resources/js/archive-page-source.mjs';

// A fully-swept modern archive: every page rendered as WebP on the NAS.
const swept = {
  pageStorageBase: '/storage/Archives/pages/doc',
  pageUrlBase: '/kiosk/archives/3/pages',
  pageExtension: '.webp',
  directPages: 180,
  prewarmedPages: 180,
};

// Uploaded before the WebP switch: fully rendered, but as .png, so the reader
// cannot build the URL itself and must ask the server which extension it is.
const legacy = { ...swept, directPages: 0 };

test('a swept archive addresses nginx directly, with no Python hop', () => {
  assert.equal(serverPageUrl(swept, 1), '/storage/Archives/pages/doc/page-1.webp');
  assert.equal(serverPageUrl(swept, 140), '/storage/Archives/pages/doc/page-140.webp');
});

test('page 140 is served exactly like page 1 — no 20-page cliff', () => {
  // The regression that motivated all of this: past the old cap these returned
  // '' and the reader fell through to a client-side pdf.js render.
  assert.ok(hasServerPage(swept, 21));
  assert.ok(hasServerPage(swept, 180));
  assert.notEqual(serverPageUrl(swept, 21), '');
  assert.notEqual(serverPageUrl(swept, 180), '');
});

test('a legacy archive falls back to the on-demand route, which knows the extension', () => {
  assert.equal(serverPageUrl(legacy, 1), '/kiosk/archives/3/pages/1');
  assert.equal(serverPageUrl(legacy, 96), '/kiosk/archives/3/pages/96');
});

test('a half-swept archive switches routes at the boundary', () => {
  const midSweep = { ...swept, directPages: 40, prewarmedPages: 180 };

  assert.equal(serverPageUrl(midSweep, 40), '/storage/Archives/pages/doc/page-40.webp');
  assert.equal(serverPageUrl(midSweep, 41), '/kiosk/archives/3/pages/41');
});

test('nothing is claimed past the rendered run', () => {
  const partial = { ...swept, directPages: 12, prewarmedPages: 12 };

  assert.equal(hasServerPage(partial, 13), false);
  assert.equal(serverPageUrl(partial, 13), '');
});

test('an archive with no server pages at all yields nothing', () => {
  // The signal for the reader to load the PDF immediately.
  const bare = { pageStorageBase: '', pageUrlBase: '', directPages: 0, prewarmedPages: 0 };

  assert.equal(hasServerPage(bare, 1), false);
  assert.equal(serverPageUrl(bare, 1), '');
});

test('page numbers below 1 are never addressable', () => {
  assert.equal(hasServerPage(swept, 0), false);
  assert.equal(serverPageUrl(swept, -3), '');
});

test('counts arriving as strings from the dataset are coerced', () => {
  // state.* is read off data-* attributes, so these can be strings.
  const fromDataset = { ...swept, directPages: '180', prewarmedPages: '180' };

  assert.equal(serverPageUrl(fromDataset, 99), '/storage/Archives/pages/doc/page-99.webp');
});

test('the extension defaults to .webp when the server did not say', () => {
  const noExtension = { ...swept, pageExtension: '' };

  assert.equal(serverPageUrl(noExtension, 5), '/storage/Archives/pages/doc/page-5.webp');
});
