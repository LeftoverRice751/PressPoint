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
  bookCanvasDensity,
  computeRenderScale,
  maxCanvasPixels,
  rasterHeadroom,
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

// ── rasterHeadroom ──────────────────────────────────────────
// The tabloid viewer swaps rasters as the reader pinches in: fit tier →
// detail tier → pdf.js. Each swap should happen when the raster on screen
// runs out of pixels, not at a fixed magnification — a 2400 px fit tier in a
// 700 css-px box at DPR 2 is still sharp at 1.7x, and asking pdf.js for that
// page means downloading the whole PDF for nothing.

test('headroom is the magnification at which the raster is 1:1 on screen', () => {
  // 2400x3200 raster fitted into 700x1000 css px at DPR 2: 700/2400 < 1000/3200
  // so width binds — 700 css px = 1400 device px across. 2400/1400.
  const headroom = rasterHeadroom({
    contentWidth: 2400, contentHeight: 3200,
    targetWidth: 700, targetHeight: 1000, dpr: 2,
  });
  assert.ok(Math.abs(headroom - 2400 / 1400) < 0.01, `got ${headroom}`);
});

test('headroom picks the binding axis of a fit-contain layout', () => {
  // Same raster in a wide, short box: width no longer binds, height does.
  const headroom = rasterHeadroom({
    contentWidth: 2400, contentHeight: 3200,
    targetWidth: 2000, targetHeight: 400, dpr: 1,
  });
  // 400 tall → 300 wide on screen; 2400/300.
  assert.ok(Math.abs(headroom - 8) < 0.01, `got ${headroom}`);
});

test('headroom never drops below 1', () => {
  // A raster smaller than the box is already being upscaled at fit.
  const headroom = rasterHeadroom({
    contentWidth: 600, contentHeight: 800,
    targetWidth: 700, targetHeight: 1000, dpr: 3,
  });
  assert.equal(headroom, 1);
});

test('headroom degrades to 1 on missing geometry rather than NaN', () => {
  assert.equal(rasterHeadroom({}), 1);
  assert.equal(rasterHeadroom({ contentWidth: 0, contentHeight: 0, targetWidth: 10, targetHeight: 10 }), 1);
});

// ── bookCanvasDensity ──────────────────────────────────────
//
// StPageFlip sizes its canvas backing store from getComputedStyle() — CSS
// pixels — and never reads devicePixelRatio, so on a 3x phone every folio
// page was drawn with a ninth of the screen's pixels and stretched back up.
// The server WebP and the oversampled pdf.js render were both thrown away at
// that one step. These pin the density the reader must re-apply.

test('book canvas backing store is CSS size times DPR', () => {
  const d = bookCanvasDensity({ cssWidth: 390, cssHeight: 546, dpr: 3, maxPixels: PIXELS_16MP });
  assert.equal(d.dpr, 3);
  assert.equal(d.width, 1170);
  assert.equal(d.height, 1638);
});

test('book canvas DPR is floored at 1 and capped at MAX_DPR', () => {
  assert.equal(bookCanvasDensity({ cssWidth: 100, cssHeight: 100, dpr: 0.5 }).dpr, 1);
  assert.equal(bookCanvasDensity({ cssWidth: 100, cssHeight: 100, dpr: undefined }).dpr, 1);
  assert.equal(bookCanvasDensity({ cssWidth: 100, cssHeight: 100, dpr: 4 }).dpr, MAX_DPR);
});

test('book canvas density backs off to fit the pixel budget', () => {
  // A two-page desktop spread at DPR 3 would be ~29 MP; a 16 MP budget must
  // pull the density down rather than hand iOS a canvas it silently blanks.
  const d = bookCanvasDensity({ cssWidth: 1800, cssHeight: 1800, dpr: 3, maxPixels: PIXELS_16MP });
  assert.ok(d.dpr < 3 && d.dpr >= 1, `dpr ${d.dpr}`);
  assert.ok(d.width * d.height <= PIXELS_16MP, `${d.width}x${d.height}`);
  assert.equal(d.width, Math.round(1800 * d.dpr));
});

test('book canvas density never returns a zero-sized store', () => {
  // A canvas measured before layout (0x0) still needs a real store — a 0-wide
  // canvas makes getContext('2d') drawing a no-op with no error.
  const d = bookCanvasDensity({ cssWidth: 0, cssHeight: 0, dpr: 2 });
  assert.ok(d.width >= 1 && Number.isFinite(d.width));
  assert.ok(d.height >= 1 && Number.isFinite(d.height));
});
