// Run with: npm run test:js  (node --test tests/js/*.test.mjs)
//
// These cover the three things that made archived issues render blurry:
//
//   1. Render scale ignored the box the page actually lands in, so a page
//      rendered for a 370px column stayed that size when the reader was
//      resized to twice the width — a stretched bitmap, not sharp text.
//   2. The cache was keyed by page number alone, with no record of the scale
//      a page was rendered at, so nothing could tell a fresh page from a
//      stale-scale one. renderKey() is that record.
//   3. The old clamp bounded the longest *dimension* at 6000px. On a tabloid
//      that is ~55 megapixels (~220 MB of RGBA), which iOS Safari refuses to
//      allocate — silently, returning a blank bitmap, which left the soft
//      server preview on screen looking like the very bug being fixed.

import test from 'node:test';
import assert from 'node:assert/strict';

import {
  computeRenderScale,
  maxCanvasPixels,
  renderKey,
  MAX_DPR,
  PIXELS_16MP,
  PIXELS_32MP,
  PIXELS_64MP,
} from '../../resources/js/archive-render-scale.mjs';

// US Letter and US Tabloid at PDF's 72pt-per-inch user space, which is what
// pdf.js reports from page.getViewport({ scale: 1 }).
const LETTER = { pageWidth: 612, pageHeight: 792 };
const TABLOID = { pageWidth: 792, pageHeight: 1224 };

const BIG_BUDGET = PIXELS_64MP;

test('resolution follows the target box, not a fixed size', () => {
  const narrow = computeRenderScale({
    ...LETTER, targetWidth: 648, targetHeight: 838, dpr: 1, maxPixels: BIG_BUDGET,
  });
  const wide = computeRenderScale({
    ...LETTER, targetWidth: 1296, targetHeight: 1676, dpr: 1, maxPixels: BIG_BUDGET,
  });

  // Doubling the box the page occupies must double the pixels rendered into
  // it. This is the resize case: without it the narrow render is what stays
  // on screen after the reader grows.
  assert.ok(wide.canvasWidth > narrow.canvasWidth * 1.9);
  assert.equal(narrow.clampedBy, null);
  assert.equal(wide.clampedBy, null);
});

test('device pixel ratio multiplies the render, and is capped at MAX_DPR', () => {
  const box = { ...LETTER, targetWidth: 648, targetHeight: 838, maxPixels: BIG_BUDGET };

  const at1 = computeRenderScale({ ...box, dpr: 1 });
  const at2 = computeRenderScale({ ...box, dpr: 2 });
  assert.ok(at2.canvasWidth > at1.canvasWidth * 1.9);

  // A panel claiming DPR 4 buys nothing visible and costs the square of
  // itself in memory.
  const at4 = computeRenderScale({ ...box, dpr: 4 });
  const at3 = computeRenderScale({ ...box, dpr: MAX_DPR });
  assert.equal(at4.dpr, MAX_DPR);
  assert.equal(at4.canvasWidth, at3.canvasWidth);
});

test('reader zoom re-renders rather than stretching', () => {
  const box = { ...TABLOID, targetWidth: 1400, targetHeight: 2100, dpr: 1, maxPixels: BIG_BUDGET };

  const fit = computeRenderScale({ ...box, zoom: 1 });
  const zoomed = computeRenderScale({ ...box, zoom: 2.5 });

  // Pinching to 2.5x must ask pdf.js for 2.5x the pixels. Anything else is
  // OpenSeadragon upscaling a flat bitmap, which is the tabloid blur.
  assert.ok(zoomed.scale > fit.scale * 2.4);
  assert.ok(zoomed.canvasWidth > fit.canvasWidth * 2.4);
});

test('a tabloid is clamped by pixel AREA, not by longest dimension', () => {
  // Exactly what DeepZoomAdapter used to request: 6000 on the long edge.
  const capped = computeRenderScale({
    ...TABLOID, targetWidth: 6000, targetHeight: 6000, dpr: 1, maxPixels: PIXELS_16MP,
  });

  const area = capped.canvasWidth * capped.canvasHeight;
  assert.equal(capped.clampedBy, 'area');
  assert.ok(area <= PIXELS_16MP, `area ${area} exceeded the 16MP budget`);

  // The old longest-dimension clamp would have allowed ~55 megapixels here.
  // Pin that it no longer can, so a future "just raise pixelCap" cannot
  // quietly reintroduce the allocation failure.
  assert.ok(area < 20 * 1024 * 1024);

  // Clamping must not distort the page.
  const sourceRatio = TABLOID.pageWidth / TABLOID.pageHeight;
  const canvasRatio = capped.canvasWidth / capped.canvasHeight;
  assert.ok(Math.abs(sourceRatio - canvasRatio) / sourceRatio < 0.01);
});

test('a page that fits the budget is never clamped', () => {
  const fine = computeRenderScale({
    ...LETTER, targetWidth: 1400, targetHeight: 1900, dpr: 2, maxPixels: PIXELS_64MP,
  });
  assert.equal(fine.clampedBy, null);
  assert.ok(fine.canvasWidth * fine.canvasHeight <= PIXELS_64MP);
});

test('maxCanvasPixels separates the kiosk from a phone', () => {
  // The kiosk is a touchscreen, so it reports (pointer: coarse) exactly like a
  // phone. Only deviceMemory tells them apart — keying on pointer type would
  // hand the device that most needs resolution the smallest budget.
  assert.equal(maxCanvasPixels({ deviceMemory: 8, coarsePointer: true }), PIXELS_64MP);
  assert.equal(maxCanvasPixels({ deviceMemory: 4, coarsePointer: true }), PIXELS_32MP);
  assert.equal(maxCanvasPixels({ deviceMemory: 2, coarsePointer: true }), PIXELS_16MP);

  // Safari never reports deviceMemory; fall back to the pointer hint.
  assert.equal(maxCanvasPixels({ coarsePointer: true }), PIXELS_16MP);
  assert.equal(maxCanvasPixels({ coarsePointer: false }), PIXELS_32MP);
  assert.equal(maxCanvasPixels({}), PIXELS_32MP);
});

test('renderKey changes when — and only when — the render would differ', () => {
  const base = { targetWidth: 648, targetHeight: 838, dpr: 2, zoom: 1 };
  const key = renderKey(base);

  assert.notEqual(key, renderKey({ ...base, targetWidth: 1296 }));
  assert.notEqual(key, renderKey({ ...base, targetHeight: 1676 }));
  assert.notEqual(key, renderKey({ ...base, dpr: 1 }));
  assert.notEqual(key, renderKey({ ...base, zoom: 2 }));

  assert.equal(key, renderKey({ ...base }));
});

test('renderKey absorbs sub-pixel layout jitter', () => {
  // A scrollbar appearing, or two resize events rounding differently, must not
  // invalidate the cache and re-render every visible page for no visible gain.
  const key = renderKey({ targetWidth: 648, targetHeight: 838, dpr: 2, zoom: 1 });
  assert.equal(key, renderKey({ targetWidth: 650, targetHeight: 839, dpr: 2, zoom: 1 }));

  // A change large enough to see still busts it.
  assert.notEqual(key, renderKey({ targetWidth: 700, targetHeight: 838, dpr: 2, zoom: 1 }));
});
