/* Render-resolution math for the archive reader.
 *
 * Pulled out of kiosk-archive-book.js so it can be tested directly: that file
 * has top-level imports (page-flip, openseadragon), which the house test
 * pattern (readFileSync + new Function, see tests/js/tour-charter.test.mjs)
 * cannot load. This module deliberately imports nothing and touches no DOM.
 *
 * Two bugs motivated it:
 *
 *   1. Render scale was decided once, at adapter mount, and cached pages were
 *      keyed by page number alone. After a resize or a pinch-zoom every page
 *      on screen was a bitmap rendered for the *old* box, CSS-upscaled into
 *      the new one — the reported "archives go blurry" symptom. renderKey()
 *      gives the cache a generation token so a stale-scale page can be told
 *      apart from a fresh one.
 *
 *   2. The old `pixelCap` clamped the longest *dimension*, not the pixel
 *      *area*. The tabloid path asked for 6000px on an 11x17 page, which is
 *      6000 x ~9270 = ~55 megapixels, around 220 MB of RGBA backing store.
 *      That survives on the kiosk and fails silently on a phone — and the
 *      failure path returns an empty string, which leaves the soft server
 *      preview on screen looking exactly like the bug we were fixing.
 *      computeRenderScale caps area instead.
 *
 * .mjs on purpose: package.json has no "type": "module", so a .js file with
 * `export` would not load under `node --test`. Webpack resolves the explicit
 * extension without configuration.
 */

// pdf.js renders happily past this, but a device pixel ratio above 3 buys no
// visible sharpness on any panel we ship to and costs the square of itself in
// memory.
export const MAX_DPR = 3;

// Canvas area budgets, in pixels. iOS Safari refuses to allocate a canvas
// larger than 16,777,216 px total and hands back a blank or null bitmap
// rather than throwing, so that is the floor for anything we cannot identify.
export const PIXELS_16MP = 16 * 1024 * 1024;
export const PIXELS_32MP = 32 * 1024 * 1024;
export const PIXELS_64MP = 64 * 1024 * 1024;

/*
 * How many canvas pixels this device can be trusted with.
 *
 * Deliberately NOT keyed on pointer type: the kiosk is a touchscreen and
 * reports `(pointer: coarse)` exactly like a phone, so a coarse-pointer test
 * would hand the one device that most needs resolution the smallest budget.
 * navigator.deviceMemory separates them — the kiosk PC reports 8+, a phone
 * reports 4 or less. Safari never reports it at all, which is why the unknown
 * case falls back to the pointer hint.
 */
export function maxCanvasPixels(env = {}) {
  const memory = Number(env.deviceMemory) || 0;
  if (memory >= 8) return PIXELS_64MP;
  if (memory >= 4) return PIXELS_32MP;
  if (memory > 0) return PIXELS_16MP;
  // deviceMemory unsupported (Safari, Firefox). A coarse pointer with no
  // memory hint is far more likely to be an iPhone than our kiosk.
  return env.coarsePointer ? PIXELS_16MP : PIXELS_32MP;
}

/*
 * Fit a PDF page into the box it will actually occupy, at the resolution that
 * box actually needs.
 *
 * `zoom` is the reader's own magnification (1 = fit). It multiplies the scale
 * rather than post-scaling the canvas, which is the whole point: a CSS-scaled
 * canvas is a stretched bitmap, a re-rendered one is sharp vector text.
 *
 * Returns `clampedBy: 'area'` when the budget bound, so callers can log it —
 * a tabloid that is permanently area-clamped is a signal the budget is wrong,
 * not that the render failed.
 */
export function computeRenderScale(opts = {}) {
  const pageWidth = Math.max(1, Number(opts.pageWidth) || 1);
  const pageHeight = Math.max(1, Number(opts.pageHeight) || 1);
  const targetWidth = Math.max(1, Number(opts.targetWidth) || 1);
  const targetHeight = Math.max(1, Number(opts.targetHeight) || 1);
  const zoom = Math.max(0.05, Number(opts.zoom) || 1);
  const maxPixels = Math.max(1, Number(opts.maxPixels) || PIXELS_16MP);
  const dpr = Math.min(Math.max(Number(opts.dpr) || 1, 1), MAX_DPR);

  // Fit-contain in CSS pixels, then up to device pixels and the reader's zoom.
  let scale = Math.min(targetWidth / pageWidth, targetHeight / pageHeight) * dpr * zoom;

  let clampedBy = null;
  const area = pageWidth * scale * pageHeight * scale;
  if (area > maxPixels) {
    // Area scales with the square of `scale`, so the correcting factor is the
    // square root of the overshoot.
    scale *= Math.sqrt(maxPixels / area);
    clampedBy = 'area';
  }

  // The canvas is sized with ceil (a floor would crop a sub-pixel edge off the
  // page), and ceiling both dimensions can put an exactly-budgeted render back
  // over the line — 16,777,216 became 16,778,140 on a tabloid. iOS enforces
  // that ceiling exactly, so trim until the *rounded* canvas fits, not just
  // the ideal one. Converges in one step; bounded so it can never spin.
  let canvasWidth = Math.max(1, Math.ceil(pageWidth * scale));
  let canvasHeight = Math.max(1, Math.ceil(pageHeight * scale));
  for (let guard = 0; guard < 4 && canvasWidth * canvasHeight > maxPixels; guard += 1) {
    scale *= Math.sqrt(maxPixels / (canvasWidth * canvasHeight)) * 0.999;
    canvasWidth = Math.max(1, Math.ceil(pageWidth * scale));
    canvasHeight = Math.max(1, Math.ceil(pageHeight * scale));
    clampedBy = 'area';
  }

  return { scale, dpr, clampedBy, canvasWidth, canvasHeight };
}

/*
 * Backing-store size for StPageFlip's canvas.
 *
 * The library sizes its canvas from getComputedStyle() — CSS pixels — and
 * never reads devicePixelRatio (grep its dist: zero hits). Every folio page
 * was therefore drawImage()'d into a store with 1/dpr² of the screen's pixels
 * and CSS-stretched back up, discarding the 2400 px server WebP and the
 * oversampled pdf.js render alike at that one step. Tabloids never showed it
 * because OpenSeadragon is DPR-aware. The reader applies this after every
 * path on which the library resets canvas.width (which also resets the 2D
 * transform): construction, its 1 ms "safari fix" update, its own window
 * resize listener, and our relayout.
 *
 * Same MAX_DPR cap and area budget as computeRenderScale, for the same
 * reasons: a two-page desktop spread at DPR 3 is ~29 MP, and iOS blanks a
 * canvas over 16 MP rather than throwing.
 */
export function bookCanvasDensity(opts = {}) {
  const cssWidth = Math.max(1, Number(opts.cssWidth) || 1);
  const cssHeight = Math.max(1, Number(opts.cssHeight) || 1);
  const maxPixels = Math.max(1, Number(opts.maxPixels) || PIXELS_16MP);
  let dpr = Math.min(Math.max(Number(opts.dpr) || 1, 1), MAX_DPR);

  const area = cssWidth * dpr * cssHeight * dpr;
  if (area > maxPixels) {
    dpr = Math.max(1, dpr * Math.sqrt(maxPixels / area));
  }

  return {
    dpr,
    width: Math.max(1, Math.round(cssWidth * dpr)),
    height: Math.max(1, Math.round(cssHeight * dpr)),
  };
}

/*
 * Cache generation token. Two pages rendered under the same key are
 * interchangeable; a page whose key no longer matches is a stale bitmap that
 * must be re-rendered before it can be treated as final.
 *
 * Rounded so that sub-pixel layout jitter (a scrollbar appearing, a 1px
 * rounding difference between two resize events) does not invalidate the whole
 * cache and re-render every visible page for no visible gain.
 */
export function renderKey(opts = {}) {
  const w = Math.round((Number(opts.targetWidth) || 0) / 8) * 8;
  const h = Math.round((Number(opts.targetHeight) || 0) / 8) * 8;
  const dpr = Math.min(Math.max(Number(opts.dpr) || 1, 1), MAX_DPR).toFixed(2);
  const zoom = Math.max(0.05, Number(opts.zoom) || 1).toFixed(2);
  return `${w}x${h}@${dpr}z${zoom}`;
}

/*
 * The magnification at which a raster on screen runs out of pixels.
 *
 * The tabloid viewer swaps rasters as the reader pinches in — fit tier, then
 * the server's detail tier, then a pdf.js render — and each swap should be
 * triggered by the raster on screen actually being exhausted, not by a fixed
 * magnification. A 2400 px fit tier in a 700 css-px box at DPR 2 is still
 * sharp at 1.6x; asking pdf.js for it at 1.25x means downloading the whole
 * PDF to redraw what is already crisp.
 *
 * Fit-contain: the raster is displayed at the size the binding axis allows,
 * so headroom is content pixels over displayed device pixels on that axis.
 * Floored at 1 — a raster smaller than the box is already being upscaled.
 */
export function rasterHeadroom(opts = {}) {
  const contentWidth = Number(opts.contentWidth) || 0;
  const contentHeight = Number(opts.contentHeight) || 0;
  const targetWidth = Number(opts.targetWidth) || 0;
  const targetHeight = Number(opts.targetHeight) || 0;
  const dpr = Math.max(Number(opts.dpr) || 1, 1);
  if (contentWidth <= 0 || contentHeight <= 0 || targetWidth <= 0 || targetHeight <= 0) return 1;

  const displayScale = Math.min(targetWidth / contentWidth, targetHeight / contentHeight);
  const displayedWidthDevicePx = contentWidth * displayScale * dpr;
  return Math.max(1, contentWidth / displayedWidthDevicePx);
}
