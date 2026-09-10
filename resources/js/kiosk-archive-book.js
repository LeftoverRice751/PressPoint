/* Kiosk archive reader overlay.
 *
 * Renders each archive's PDF with pdf.js (rasterized to blob-URL images)
 * and hands the pages to a per-format reading adapter:
 *
 *   - Book (folios + magazines): StPageFlip — page-curl physics, drag to
 *     flip, tap page edges to turn.
 *   - DeepZoom (tabloids): OpenSeadragon — map-like pinch/pan/zoom over a
 *     high-resolution broadsheet page.
 *   - Scroll (newsletters): native vertical scroll with IntersectionObserver
 *     lazy rendering.
 *
 * Opens on CustomEvent('archive:open') dispatched by kiosk-archives.js and
 * answers with 'archive:reader-open' / 'archive:reader-close'.
 *
 * pdf.js itself stays out of this bundle: loaded lazily via a
 * webpack-ignored dynamic import from /assets/js/pdfjs/ (see webpack.mix.js).
 */

import { PageFlip } from 'page-flip';
import OpenSeadragon from 'openseadragon';
import { computeRenderScale, maxCanvasPixels, renderKey } from './archive-render-scale.mjs';
import { hasServerPage, serverPageUrl } from './archive-page-source.mjs';

document.addEventListener('DOMContentLoaded', () => {
  const root = document.querySelector('[data-archive-shell]');
  if (!root) return;

  const overlay = root.querySelector('[data-archive-book]');
  if (!overlay) return;

  const stage = overlay.querySelector('[data-reader-stage]');
  const bookMount = overlay.querySelector('[data-reader-book]');
  const zoomMount = overlay.querySelector('[data-reader-zoom]');
  const scrollMount = overlay.querySelector('[data-reader-scroll]');
  const chrome = overlay.querySelector('[data-reader-chrome]');
  const backButton = overlay.querySelector('[data-reader-back]');
  const pager = overlay.querySelector('[data-reader-pager]');
  const navBlock = overlay.querySelector('[data-reader-nav]');
  const navPrev = overlay.querySelector('[data-reader-prev]');
  const navNext = overlay.querySelector('[data-reader-next]');
  const backdrop = overlay.querySelector('[data-archive-book-backdrop]');

  const ZOOM_DURATION = 520;
  const isTouchUi = window.matchMedia('(hover: none), (pointer: coarse)').matches;

  // Canvas area this device can be trusted with. Read once: neither the RAM
  // nor the pointer type changes mid-session. MAX_DPR now lives in
  // archive-render-scale.mjs alongside the clamp that applies it.
  const PIXEL_BUDGET = maxCanvasPixels({
    deviceMemory: navigator.deviceMemory,
    coarsePointer: isTouchUi,
  });

  // Settle delay before a resize is acted on. Re-rendering every page mid-drag
  // would queue dozens of renders the reader never sees.
  const RESIZE_DEBOUNCE = 200;

  // Same idea for the tabloid's pinch-zoom, plus a threshold: a re-render only
  // pays for itself once the reader has zoomed meaningfully past what the
  // current raster holds. Below this they are looking at a bitmap magnified by
  // less than a quarter, which is not worth a visible swap.
  const ZOOM_RESHARPEN_DEBOUNCE = 250;
  const ZOOM_RESHARPEN_THRESHOLD = 1.25;

  /*
   * Diagnostics for tuning the kiosk, off unless ?readerdebug is in the URL.
   *
   * The render math multiplies by devicePixelRatio, so a panel that reports
   * DPR 1 when it is physically 1080p renders at half the pixels it needs and
   * there is no way to tell from the page itself. Open the reader with
   * ?readerdebug=1 on the actual terminal and read these numbers off the
   * console rather than guessing at the constants.
   */
  /*
   * Fetch the PDF on open rather than after the 2s deferral.
   *
   * Nothing sets this any more, and the reason is worth keeping. The kiosk
   * template used to, because the server's page raster was fixed at zoom 1.8
   * (908x1296) against a 768x1024 DPR-2 panel — visibly soft — so the terminal
   * pulled the whole ~100 MB PDF on open purely to let pdf.js re-rasterise
   * pages the server had already rendered. Pages are now WebP at zoom 3.0
   * (1512x2160, and smaller on disk than the old PNGs), so there is no blur
   * left to race: the document is fetched only if the reader pinch-zooms past
   * what the raster holds.
   *
   * The branch stays so re-enabling it is a one-attribute template change.
   */
  const EAGER_PDF = root.hasAttribute('data-reader-eager-pdf');

  const DEBUG = window.location.search.includes('readerdebug');
  function debugLog(label, data) {
    if (!DEBUG) return;
    // eslint-disable-next-line no-console
    console.log(`[archive-reader] ${label}`, {
      dpr: window.devicePixelRatio,
      viewport: `${window.innerWidth}x${window.innerHeight}`,
      budgetMP: +(PIXEL_BUDGET / 1024 / 1024).toFixed(1),
      ...data,
    });
  }

  // Rendered pages are held to a memory budget rather than a fixed page
  // count, because page weight varies hugely with content and device pixel
  // ratio (measured: ~0.7 MB at DPR 1, ~4x that at DPR 2). A fixed window
  // either wastes memory on light documents or — as an earlier fixed radius
  // of 8 did — blanks pages ahead of a reader flipping quickly through a
  // heavy one. Deriving the window from observed page size means small
  // archives stay entirely resident (no eviction, no blanking at all) and
  // only genuinely large ones start dropping their farthest pages.
  const PAGE_CACHE_BUDGET = 96 * 1024 * 1024;
  const MIN_RESIDENT = 9;   // never thrash below a usable spread
  const MAX_RESIDENT = 64;  // ceiling regardless of how light pages are

  // Oversampling factor over the page's on-screen box, on top of DPR. Higher
  // means crisper text when the browser downscales the bitmap into the box.
  const OVERSAMPLE = 1.75;

  // Below this mount width the book shows a single page instead of a spread.
  // fitSpread owns this decision; the PageFlip settings are then derived from
  // its result so the library cannot disagree (see the mount comment).
  const BOOK_TWO_PAGE_MIN_WIDTH = 640;

  const state = {
    session: 0,          // increments per open; stale async work checks it
    dataset: null,
    pageCount: 0,
    fileUrl: '',
    originRect: null,
    adapter: null,
    pdfDoc: null,
    pdfDocPromise: null,
    pageUrls: new Map(),    // page number -> blob: URL
    pageBytes: new Map(),   // page number -> encoded size, drives the budget
    pageScale: new Map(),   // page number -> renderKey it was rendered at
    pageRenders: new Map(), // page number -> Promise<string>
    // The box a page is rendered for, and the reader's own magnification.
    // Every adapter sets this from its real on-screen geometry at mount and
    // again whenever that geometry changes — see setRenderOpts.
    renderOpts: { targetWidth: 1400, targetHeight: 1900, zoom: 1 },
    renderKey: '',          // cache generation; a page rendered under another is stale
    cursor: 1,              // reading position; drives cache eviction
    onPageEvicted: null,    // active adapter's hook to drop its own reference
    pageUrlBase: '',        // on-demand server render route
    pageStorageBase: '',    // direct nginx prefix for rendered pages
    pageExtension: '.webp', // extension pageStorageBase URLs are built with
    prewarmedPages: 0,      // contiguous run of server-rendered pages from 1
    directPages: 0,         // ...of those, how many nginx can serve by name
  };

  // ── Render generation ─────────────────────────────────
  /*
   * Resolution used to be decided once, at adapter mount, and pages were
   * cached by page number alone. Resizing the reader (or pinch-zooming a
   * tabloid) re-fitted the layout but re-used those bitmaps, so every page on
   * screen was a render for the old box, CSS-upscaled into the new one. That
   * is the "archives go blurry" report.
   *
   * setRenderOpts stamps a generation key onto the cache instead. A page whose
   * stamp no longer matches is still perfectly good to *look at* — it stays on
   * screen as the stretched stand-in while the sharp render runs — but
   * loadPage() will no longer accept it as final. Nothing is revoked here: a
   * blank page while re-rendering would be worse than a soft one.
   */
  function setRenderOpts(next) {
    const opts = {
      targetWidth: Math.max(1, Math.round(next.targetWidth || 0)),
      targetHeight: Math.max(1, Math.round(next.targetHeight || 0)),
      zoom: next.zoom || 1,
    };
    const key = renderKey({ ...opts, dpr: window.devicePixelRatio || 1 });
    if (key === state.renderKey) return false;
    state.renderOpts = opts;
    state.renderKey = key;
    debugLog('render generation', { key, ...opts });
    return true;
  }

  // A cached page is only reusable if it was rendered for the geometry we are
  // showing now. Every `state.pageUrls.has(n)` check that asks "do we already
  // have this page?" must go through here instead.
  function hasFresh(pageNumber) {
    return state.pageUrls.has(pageNumber)
      && state.pageScale.get(pageNumber) === state.renderKey;
  }

  // ── Server-rendered pages (the fast path) ──
  // These are ordinary HTTP URLs to images the server rasterised, NOT blob
  // URLs. They deliberately never enter state.pageUrls/pageBytes: those maps
  // drive URL.revokeObjectURL() and the memory budget, and putting plain URLs
  // in them would skew residentLimit() and revoke nothing.
  //
  // `prewarmedPages` is the whole document once an archive has been swept — it
  // used to be capped at 20 on both the server and here, and every page past
  // that fell through to a pdf.js render on the terminal's own CPU. The tier
  // logic lives in archive-page-source.mjs so it can be tested.
  function hasPreview(pageNumber) {
    return hasServerPage(state, pageNumber);
  }

  function previewUrl(pageNumber) {
    return serverPageUrl(state, pageNumber);
  }

  /*
   * True when the server has rendered every page of this document.
   *
   * This is the condition that retires pdf.js from normal reading. When it
   * holds, downloading the (often ~100 MB) PDF cannot improve anything the
   * reader is looking at: the server raster is 1512x2160 and the book fits a
   * page into at most half of a 768px-wide kiosk panel, so it is already
   * oversampled. The one thing it can still buy is pinch-zoom detail on a
   * tabloid, and ZoomAdapter.resharpen() asks for the document explicitly when
   * the reader actually zooms past what the raster holds.
   *
   * Before the whole-document sweep this was never true — the server stopped
   * at 20 pages — so the reader always fetched the PDF and always needed to.
   */
  function serverCoversDocument() {
    return state.pageCount > 0 && state.prewarmedPages >= state.pageCount;
  }

  // ── pdf.js pipeline (ported from the previous reader) ───

  let pdfjsPromise = null;
  function getPdfjs() {
    if (pdfjsPromise) return pdfjsPromise;
    pdfjsPromise = import(/* webpackIgnore: true */ '/assets/js/pdfjs/pdf.min.mjs')
      .then((mod) => {
        const lib = mod && mod.default ? mod.default : mod;
        if (lib && lib.GlobalWorkerOptions) {
          lib.GlobalWorkerOptions.workerSrc = '/assets/js/pdfjs/pdf.worker.min.mjs';
        }
        return lib;
      });
    return pdfjsPromise;
  }

  const archiveLoader = overlay.querySelector('[data-archive-loader]');
  function showLoader() {
    if (!archiveLoader) return;
    archiveLoader.hidden = false;
    requestAnimationFrame(() => archiveLoader.classList.add('is-visible'));
  }
  function hideLoader() {
    if (!archiveLoader) return;
    archiveLoader.classList.remove('is-visible');
    setTimeout(() => { archiveLoader.hidden = true; }, 220);
  }

  async function ensurePdfDoc() {
    if (state.pdfDoc) return state.pdfDoc;
    if (state.pdfDocPromise) return state.pdfDocPromise;
    if (!state.fileUrl) return null;

    state.pdfDocPromise = (async () => {
      const pdfjs = await getPdfjs();
      const task = pdfjs.getDocument({
        url: state.fileUrl,
        // Stream + range requests give us first-page-fast even on big PDFs.
        disableAutoFetch: false,
        disableStream: false,
        disableRange: false,

        // Hardening. The kiosk is an unattended public terminal and an archive
        // PDF is editor-uploaded content we rasterise verbatim, so the document
        // gets no active surface at all:
        //
        //  - enableXfa:false refuses XFA forms outright. XFA is an entire
        //    XML/JS application format embedded in the PDF; pdf.js renders it
        //    through XfaLayer, i.e. real DOM built from file-controlled input.
        //    We only ever want the static page raster.
        //  - isEvalSupported:false is a no-op on pdfjs-dist 5.x (the eval-based
        //    font path was removed) but is kept so a downgrade or a resolution
        //    to an older transitive copy cannot quietly re-enable it.
        //
        // Note what is deliberately NOT here: `enableScripting`. In pdf.js 5 it
        // is not a getDocument option — it belongs to AnnotationLayer/the
        // bundled viewer, which is where PDFScriptingManager actually runs a
        // document's /JS actions. This reader uses the bare API and never
        // constructs an annotation layer, so there is no scripting engine to
        // switch off; the equivalent lever on this code path is annotationMode
        // below. Do not "fix" that by adopting pdf.js's viewer.
        enableXfa: false,
        isEvalSupported: false,

        // Where the worker fetches its image-decoder WebAssembly from. pdf.js
        // 5 moved JPEG2000 (openjpeg), JBIG2 and ICC colour (qcms) out of the
        // worker bundle into separate .wasm files, and with no wasmUrl it just
        // warns and drops those images — which on a scanned newspaper archive
        // means blank pages, since print PDFs lean on JPEG2000 heavily.
        //
        // Trailing slash is required: pdf.js concatenates the filename
        // directly onto this string. The files are put there by webpack.mix.js
        // (see the note there about what is deliberately NOT copied).
        //
        // Reached by fetch() from inside the worker, so the CSP needs
        // connect-src 'self' and 'wasm-unsafe-eval' — both already in
        // app/security_headers.py.
        wasmUrl: '/assets/js/pdfjs/wasm/',
      });
      const doc = await task.promise;
      state.pdfDoc = doc;
      // Only adopt the document's count if we didn't already have one. The
      // adapters now build their page arrays (and PageFlip) from the dataset
      // count before this resolves, so silently changing it here would leave
      // runQueue indexing past the end of those arrays.
      if (!state.pageCount) state.pageCount = doc.numPages;
      return doc;
    })();
    return state.pdfDocPromise;
  }

  // ── Deferred PDF warm-up ──────────────────────────────
  // Opening no longer waits on the document: the server-rendered previews are
  // painted first. The PDF (often ~100 MB) is fetched once the reader is
  // actually engaged, so someone who opens an archive and immediately backs
  // out never pays for it — but anyone who reads still gets pages upgraded to
  // the near-lossless renders. When nothing is prewarmed there is nothing to
  // show, so the fetch starts at once and behaviour matches the old reader.
  const PDF_WARM_DELAY = 2000;
  const PDF_WARM_LOOKAHEAD = 4; // start early enough to cover the last previews
  let pdfWarmTimer = null;
  let pdfWarmStarted = false;

  function startPdfWarm() {
    if (pdfWarmStarted) return;
    pdfWarmStarted = true;
    if (pdfWarmTimer) { window.clearTimeout(pdfWarmTimer); pdfWarmTimer = null; }
    const session = state.session;
    ensurePdfDoc().then((doc) => {
      if (!doc || session !== state.session) return;
      const adapter = state.adapter;
      // Let the adapter kick off whatever it defers until the doc exists
      // (the book's render queue, the zoom view's sharp swap).
      if (adapter && typeof adapter.onPdfReady === 'function') adapter.onPdfReady(session);
    }).catch(() => { /* previews stay on screen; nothing to undo */ });
  }

  function schedulePdfWarm(force) {
    if (pdfWarmStarted || pdfWarmTimer) return;
    // Every page is already on screen at full quality; fetching the document
    // would be ~100 MB spent to redraw what the reader is looking at. Only an
    // explicit `force` (the tabloid's pinch-zoom resharpen) overrides this.
    if (!force && serverCoversDocument()) return;
    if (!hasPreview(1)) { startPdfWarm(); return; }
    // The kiosk opts out of the deferral entirely (see EAGER_PDF): the delay
    // exists to save a phone from downloading ~100 MB it may not read, and on
    // the terminal it only buys two seconds of staring at a preview PNG whose
    // resolution was fixed at upload time. That wait is the blur.
    if (EAGER_PDF) { startPdfWarm(); return; }
    pdfWarmTimer = window.setTimeout(() => { pdfWarmTimer = null; startPdfWarm(); }, PDF_WARM_DELAY);
  }

  function resetPdfWarm() {
    if (pdfWarmTimer) { window.clearTimeout(pdfWarmTimer); pdfWarmTimer = null; }
    pdfWarmStarted = false;
  }

  // Called whenever the reading position moves: any real interaction means the
  // reader is engaged, and nearing the end of the previews means we need the
  // document now rather than in two seconds.
  function noteReadingProgress(pageNumber) {
    state.cursor = pageNumber || state.cursor;
    if (pdfWarmStarted) return;
    // Turning a page used to be the signal to go and get the document, because
    // the previews ran out at page 20 and the reader was about to walk off the
    // end of them. With the whole document rendered there is no end to walk
    // off, and a page turn is no longer a reason to download anything.
    if (serverCoversDocument()) return;
    if (state.cursor > 1 || state.cursor + PDF_WARM_LOOKAHEAD >= state.prewarmedPages) {
      startPdfWarm();
    }
  }

  // The page's natural size, taken from a preview PNG so the adapters can lay
  // themselves out without the PDF. Falls back to the document when there is
  // no preview to measure.
  function previewAspect(pageNumber) {
    const url = previewUrl(pageNumber || 1);
    if (!url) return Promise.resolve(null);
    return new Promise((resolve) => {
      const probe = new Image();
      probe.onload = () => {
        resolve(probe.naturalWidth && probe.naturalHeight
          ? { width: probe.naturalWidth, height: probe.naturalHeight }
          : null);
      };
      probe.onerror = () => resolve(null);
      probe.src = url;
    });
  }

  // Every adapter needs the page's width/height ratio to lay out. Prefer the
  // preview (no PDF needed); fall back to cracking the document.
  async function pageMetrics() {
    const fromPreview = await previewAspect(1);
    if (fromPreview) return fromPreview;

    const doc = await ensurePdfDoc();
    if (!doc) return null;
    pdfWarmStarted = true; // the document is already loading; don't re-trigger
    const page = await doc.getPage(1);
    const vp = page.getViewport({ scale: 1 });
    page.cleanup();
    return { width: vp.width, height: vp.height };
  }

  // Near-lossless WebP. The reader used to encode pages as JPEG q0.92, and
  // JPEG's ringing around glyph edges is exactly what made archive body copy
  // look mushy. Measured on a real archive page at the same resolution, WebP
  // q0.98 came out at 421 KB against JPEG q0.92's 466 KB — better text for
  // fewer bytes. `blobType` latches after the first encode so the fallback
  // probe only runs once.
  let blobType = null;
  function encodeCanvas(canvas) {
    return new Promise((resolve) => {
      if (blobType === 'image/jpeg') {
        canvas.toBlob(resolve, 'image/jpeg', 0.98);
        return;
      }
      canvas.toBlob((blob) => {
        // A browser without a WebP encoder silently hands back a PNG, which
        // would be ~4x the bytes — take high-quality JPEG in that case.
        if (blob && blob.type === 'image/webp') {
          blobType = 'image/webp';
          resolve(blob);
          return;
        }
        blobType = 'image/jpeg';
        canvas.toBlob(resolve, 'image/jpeg', 0.98);
      }, 'image/webp', 0.98);
    });
  }

  // How many pages the budget affords at the weight we're actually seeing.
  // The prefetch queue and the evictor both read this, so the queue can never
  // render a page the evictor would immediately drop (which would spin).
  function residentLimit() {
    const seen = state.pageBytes.size;
    if (!seen) return MAX_RESIDENT;
    let total = 0;
    state.pageBytes.forEach((bytes) => { total += bytes; });
    const average = total / seen;
    if (!average) return MAX_RESIDENT;
    return Math.max(MIN_RESIDENT, Math.min(MAX_RESIDENT, Math.floor(PAGE_CACHE_BUDGET / average)));
  }

  function cacheRadius() {
    return Math.max(1, Math.floor((residentLimit() - 1) / 2));
  }

  // Drop rendered pages that have fallen outside the affordable window around
  // the reading position, handing the active adapter a chance to release its
  // own reference so it re-requests the page instead of painting a dead blob.
  function trimPageCache() {
    const radius = cacheRadius();
    if (state.pageUrls.size <= radius * 2 + 1) return;
    const doomed = [];
    state.pageUrls.forEach((url, n) => {
      if (Math.abs(n - state.cursor) > radius) doomed.push([n, url]);
    });
    doomed.forEach(([n, url]) => {
      state.pageUrls.delete(n);
      state.pageBytes.delete(n);
      state.pageScale.delete(n);
      try { URL.revokeObjectURL(url); } catch (_) { /* noop */ }
      if (state.onPageEvicted) state.onPageEvicted(n);
    });
  }

  async function renderPage(pageNumber) {
    const doc = await ensurePdfDoc();
    if (!doc) return '';
    // Resolved by the time a doc exists; getPdfjs() hands back its cached
    // promise, so this is not a second module fetch. Needed for AnnotationMode
    // in the render call below.
    const pdfjs = await getPdfjs();
    if (pageNumber < 1 || pageNumber > doc.numPages) return '';

    const page = await doc.getPage(pageNumber);
    const { targetWidth, targetHeight, zoom } = state.renderOpts;
    // Captured before the await below: a resize mid-render must not let a page
    // be stamped with a generation it was not actually rendered for.
    const key = state.renderKey;
    const baseViewport = page.getViewport({ scale: 1 });

    // Fit-contain in the adapter's box, up to device pixels and the reader's
    // own zoom, then clamped by canvas AREA. The old clamp bounded the longest
    // dimension, which let a tabloid ask for ~55 megapixels — an allocation
    // iOS refuses silently, returning a blank bitmap.
    const fit = computeRenderScale({
      pageWidth: baseViewport.width,
      pageHeight: baseViewport.height,
      targetWidth,
      targetHeight,
      zoom,
      dpr: window.devicePixelRatio || 1,
      maxPixels: PIXEL_BUDGET,
    });

    const viewport = page.getViewport({ scale: fit.scale });
    const canvas = document.createElement('canvas');
    canvas.width = fit.canvasWidth;
    canvas.height = fit.canvasHeight;
    const ctx = canvas.getContext('2d', { alpha: false });
    ctx.fillStyle = '#FBF8F1';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    // annotationMode DISABLE drops the whole annotation tree before it is
    // walked: no widgets, no /JS or /AA action objects reaching the display
    // layer, no link or embedded-file targets, no annotation appearance streams
    // painted from file-controlled data. We rasterise page content only, which
    // is all a reader ever sees here anyway — the reader has no clickable
    // layer over the canvas, so nothing is lost visually.
    await page.render({
      canvasContext: ctx,
      viewport,
      annotationMode: pdfjs.AnnotationMode.DISABLE,
    }).promise;
    page.cleanup();

    const blob = await encodeCanvas(canvas);
    if (!blob) return '';
    const url = URL.createObjectURL(blob);
    // Re-rendering a page at a new generation leaves the old blob referenced by
    // nothing; without this every resize leaks one object URL per page.
    // Revoked on a delay, not immediately: BookAdapter.markDirty debounces its
    // updateFromImages swap by 600ms, so PageFlip can still be drawing from the
    // old URL when this resolves, and a revoked URL draws as a broken image.
    const previous = state.pageUrls.get(pageNumber);
    if (previous && previous !== url) {
      window.setTimeout(() => {
        try { URL.revokeObjectURL(previous); } catch (_) { /* noop */ }
      }, 1200);
    }
    state.pageUrls.set(pageNumber, url);
    state.pageBytes.set(pageNumber, blob.size);
    state.pageScale.set(pageNumber, key);
    debugLog(`page ${pageNumber} rendered`, {
      key,
      canvas: `${canvas.width}x${canvas.height}`,
      megapixels: +((canvas.width * canvas.height) / 1024 / 1024).toFixed(1),
      clampedBy: fit.clampedBy,
      cssBox: `${targetWidth}x${targetHeight}`,
      kb: Math.round(blob.size / 1024),
    });
    return url;
  }

  function loadPage(pageNumber) {
    if (!pageNumber || pageNumber < 1 || (state.pageCount && pageNumber > state.pageCount)) {
      return Promise.resolve('');
    }
    // Only a page rendered for the geometry we are showing now counts as a
    // hit. A stale-generation blob stays on screen (the adapters keep painting
    // it) but must not short-circuit the sharp re-render.
    if (hasFresh(pageNumber)) {
      return Promise.resolve(state.pageUrls.get(pageNumber));
    }
    if (state.pageRenders.has(pageNumber)) {
      return state.pageRenders.get(pageNumber);
    }
    // Never force the document open from here. Until the deferred warm-up has
    // run, previews are what's on screen and a sharp render simply isn't
    // available yet; adapters re-request their visible pages from onPdfReady.
    if (!state.pdfDoc) {
      schedulePdfWarm();
      return Promise.resolve('');
    }
    const promise = renderPage(pageNumber).catch(() => '').finally(() => {
      state.pageRenders.delete(pageNumber);
      trimPageCache();
    });
    state.pageRenders.set(pageNumber, promise);
    return promise;
  }

  function clearAllPages() {
    state.pageUrls.forEach((url) => {
      try { URL.revokeObjectURL(url); } catch (_) { /* noop */ }
    });
    state.pageUrls.clear();
    state.pageRenders.clear();
    state.pageBytes.clear();
    state.pageScale.clear();
    state.renderKey = '';
    state.cursor = 1;
    resetPdfWarm();
    if (state.pdfDoc) {
      try { state.pdfDoc.cleanup(); state.pdfDoc.destroy(); } catch (_) { /* noop */ }
    }
    state.pdfDoc = null;
    state.pdfDocPromise = null;
  }

  // ── Chrome (back + pager), tap-to-toggle on touch ───────

  function setPager(text) {
    if (pager) pager.textContent = text;
  }

  let chromeFadeTimer = null;
  function showChrome({ autoFade = false } = {}) {
    overlay.classList.add('is-chrome-visible');
    if (chromeFadeTimer) window.clearTimeout(chromeFadeTimer);
    if (autoFade && isTouchUi) {
      chromeFadeTimer = window.setTimeout(() => {
        overlay.classList.remove('is-chrome-visible');
        chromeFadeTimer = null;
      }, 2500);
    }
  }
  function toggleChrome() {
    if (chromeFadeTimer) {
      window.clearTimeout(chromeFadeTimer);
      chromeFadeTimer = null;
    }
    overlay.classList.toggle('is-chrome-visible');
  }

  /*
   * Clean-tap detector: passive listeners only, so it can never interfere
   * with StPageFlip's drag/curl or native scrolling. A tap = one pointer
   * from start to finish (a second finger poisons it — pinch guard),
   * < 10px movement, < 300ms. `centerBand` restricts the accepted zone
   * horizontally so page-edge taps stay page-turns in book mode.
   */
  function makeTapDetector(el, { onTap, centerBand = 1 }) {
    const live = new Set();
    let start = null;

    el.addEventListener('pointerdown', (e) => {
      live.add(e.pointerId);
      if (live.size === 1) {
        start = { x: e.clientX, y: e.clientY, t: performance.now() };
      } else {
        start = null;
      }
    }, { passive: true });

    el.addEventListener('pointermove', (e) => {
      if (start && Math.hypot(e.clientX - start.x, e.clientY - start.y) > 10) {
        start = null;
      }
    }, { passive: true });

    el.addEventListener('pointerup', (e) => {
      const s = start;
      start = null;
      live.delete(e.pointerId);
      if (!s || live.size > 0) return;
      if (performance.now() - s.t > 300) return;
      const r = el.getBoundingClientRect();
      if (!r.width) return;
      const rel = (e.clientX - r.left) / r.width;
      const edge = (1 - centerBand) / 2;
      if (rel < edge || rel > 1 - edge) return;
      onTap(e);
    }, { passive: true });

    el.addEventListener('pointercancel', (e) => {
      live.delete(e.pointerId);
      start = null;
    }, { passive: true });
  }

  // ── Adapters ────────────────────────────────────────────

  /*
   * Book: StPageFlip for folios and magazines. All pages must exist up
   * front, so unrendered pages start as a solid-paper placeholder and a
   * background queue swaps real renders in via updateFromImages — only
   * while the book is at rest, never mid-curl.
   */
  const BookAdapter = {
    name: 'book',
    flip: null,
    host: null,
    urls: [],
    queueToken: 0,
    dirtyTimer: null,
    resizeTimer: null,
    onResize: null,
    columns: 0,
    cursor: 1,

    placeholder() {
      const canvas = document.createElement('canvas');
      canvas.width = 100;
      canvas.height = 140;
      const ctx = canvas.getContext('2d');
      ctx.fillStyle = '#FBF8F1';
      ctx.fillRect(0, 0, 100, 140);
      return canvas.toDataURL('image/png');
    },

    /*
     * Page geometry for a given mount box.
     *
     * StPageFlip renders onto a canvas that is stretched to 100% of its
     * block (its own stylesheet), and CanvasRender.clear() wipes that whole
     * canvas with hardcoded `white` every frame. In `size: 'stretch'` the
     * page is then fitted inside the block and clamped when it is too tall
     * (Render.ts), so any block height the page does not consume is painted
     * white — the bands above and below the page on a tall phone screen.
     *
     * The cure is to leave no spare block: size the host to exactly the
     * spread. That means deciding orientation here rather than letting the
     * library surprise us, mirroring its own rule — portrait below
     * minWidth * 2. Keep this in sync with the PageFlip settings below.
     */
    fitSpread(mountRect, aspect) {
      const width = Math.max(1, mountRect.width);
      const height = Math.max(1, mountRect.height);
      const columns = width < BOOK_TWO_PAGE_MIN_WIDTH ? 1 : 2;

      // Widest page that fits the mount in this orientation, shrunk further
      // if its height would overflow. No lower clamp: a floor here would let
      // the host grow past what fits, and the overflow would come straight
      // back as white.
      let pageW = width / columns;
      let pageH = pageW * aspect;
      if (pageH > height) {
        pageH = height;
        pageW = pageH / aspect;
      }

      // Integers, decided once and reused by both the host size and the
      // PageFlip settings. Rounding in two places is what leaves a 1px white
      // hairline: the library derives its ratio from the rounded width/height,
      // so anything it re-derives has to be built from the same integers.
      pageW = Math.max(1, Math.floor(pageW));
      pageH = Math.max(1, Math.floor(pageH));

      return { pageW, pageH, columns };
    },

    /* Host = the spread exactly, so the canvas has no leftover to whiten.
       .reader-mount--book already centers it (flex). */
    sizeHost(mountRect, aspect) {
      if (!this.host) return null;
      const fit = this.fitSpread(mountRect, aspect);
      this.host.style.width = `${fit.pageW * fit.columns}px`;
      this.host.style.height = `${fit.pageH}px`;
      return fit;
    },

    /*
     * minWidth/maxWidth are derived from the fitted page, not fixed design
     * numbers. In stretch mode the library reads minWidth ONLY to choose
     * orientation (`blockWidth < minWidth * 2`) and maxWidth ONLY as an upper
     * clamp; minHeight/maxHeight are never read at all. floor(pageW) makes
     * that orientation test agree with fitSpread's `columns` in both
     * orientations, and ceil(pageW) stops the clamp shrinking the page inside
     * the host we just sized. Any disagreement between the two reappears as
     * white bands, so both come from one source on purpose.
     */
    buildFlip(host, pageW, pageH) {
      return new PageFlip(host, {
        // fitSpread already returned integers — do not re-round here.
        width: pageW,
        height: pageH,
        size: 'stretch',
        minWidth: pageW,
        maxWidth: pageW,
        minHeight: pageH,
        maxHeight: pageH,
        showCover: true,
        usePortrait: true,
        mobileScrollSupport: false,
        // Desktop turns pages with the side arrows / keyboard only — no
        // mouse-drag curl. Touch (kiosk, mobile) keeps swipe-to-flip.
        useMouseEvents: isTouchUi,
        flippingTime: 800,
        maxShadowOpacity: 0.3,
        showPageCorners: true,
        clickEventForward: false,
      });
    },

    async mount(container) {
      const session = state.session;
      // Metrics come from a preview PNG when one exists, so the book can be
      // laid out and painted without touching the PDF at all.
      const metrics = await pageMetrics();
      if (!metrics || session !== state.session) return;

      const mountRect = container.getBoundingClientRect();
      const aspect = metrics.height / metrics.width;

      const { pageW, pageH, columns } = this.fitSpread(mountRect, aspect);

      setRenderOpts({
        targetWidth: pageW * OVERSAMPLE,
        targetHeight: pageH * OVERSAMPLE,
      });

      // Cached once: eviction re-uses it for every page it drops.
      this.blank = this.placeholder();
      this.urls = new Array(state.pageCount).fill(this.blank);

      // Evicted pages fall back to their preview if one exists, else the blank
      // sheet; runQueue re-renders them when the reader comes back into range.
      state.cursor = 1;
      state.onPageEvicted = (n) => {
        if (!this.urls.length) return;
        this.urls[n - 1] = previewUrl(n) || this.blank;
        this.markDirty(session);
      };
      // The book opens on the server's pre-rendered pages — no PDF fetch, no
      // waiting on a render. This used to await pages 1-3, which meant nothing
      // appeared until the whole (up to ~100 MB) document had been downloaded
      // and three pages rasterised.
      for (let n = 1; n <= state.pageCount; n += 1) {
        const preview = previewUrl(n);
        if (preview) this.urls[n - 1] = preview;
      }

      // PageFlip.destroy() removes its container element from the DOM,
      // so it gets a disposable host div — never the mount itself.
      const host = document.createElement('div');
      host.className = 'reader-book__host';
      container.appendChild(host);
      this.host = host;
      this.sizeHost(mountRect, aspect);

      this.flip = this.buildFlip(host, pageW, pageH);
      this.columns = columns;
      this.flip.loadFromImages(this.urls);

      this.flip.on('flip', (e) => {
        setPager(`PAGES — ${e.data + 1} / ${state.pageCount}`);
        this.cursor = e.data + 1; // prioritize renders near the reader
        // A page turn is the clearest "reader is engaged" signal there is —
        // this is what usually starts the deferred PDF fetch.
        noteReadingProgress(this.cursor);
        this.syncNav();
        // The queue only fills a window around the cursor, so moving the
        // cursor has to restart it (runQueue bumps the token, retiring the
        // previous loop) or pages ahead would never render.
        this.runQueue(session);
      });

      setPager(`PAGES — 1 / ${state.pageCount}`);
      this.syncNav();

      // Rotating a phone mid-read used to leave the book at its old size —
      // nothing in the reader listened for resize at all.
      this.onResize = () => {
        if (this.resizeTimer) window.clearTimeout(this.resizeTimer);
        this.resizeTimer = window.setTimeout(() => {
          this.resizeTimer = null;
          this.relayout(container, aspect, session);
        }, RESIZE_DEBOUNCE);
      };
      window.addEventListener('resize', this.onResize);

      // Attached to the per-session host so the listeners die with it.
      makeTapDetector(host, { onTap: toggleChrome, centerBand: 0.4 });
      schedulePdfWarm();
      this.runQueue(session);
    },

    /*
     * Re-fit after a resize or rotation, holding the reader's place.
     *
     * A same-orientation change only needs the host re-sized and PageFlip
     * re-measured. Crossing the one-page/two-page threshold needs a rebuild:
     * orientation is decided from minWidth, which is baked into the instance
     * at construction, so update() alone would leave the library drawing a
     * spread the host is no longer shaped for — bands again.
     */
    relayout(container, aspect, session) {
      if (session !== state.session || !this.flip || !this.host) return;

      const mountRect = container.getBoundingClientRect();
      if (!mountRect.width || !mountRect.height) return;

      const fit = this.fitSpread(mountRect, aspect);
      const page = this.flip.getCurrentPageIndex();

      // The book used to be re-fitted here without re-rendering, so after a
      // resize every page was a bitmap rasterised for the old spread, scaled
      // into the new one. Re-stamp the generation from the geometry we are
      // actually about to draw; runQueue below then re-renders what is near
      // the reader, and markDirty swaps each in once the book is at rest.
      const rescaled = setRenderOpts({
        targetWidth: fit.pageW * OVERSAMPLE,
        targetHeight: fit.pageH * OVERSAMPLE,
      });

      if (fit.columns !== this.columns) {
        const host = document.createElement('div');
        host.className = 'reader-book__host';
        try { this.flip.destroy(); } catch (_) { /* noop */ }
        try { this.host.remove(); } catch (_) { /* noop */ }
        container.appendChild(host);
        this.host = host;
        this.sizeHost(mountRect, aspect);
        this.flip = this.buildFlip(host, fit.pageW, fit.pageH);
        this.columns = fit.columns;
        this.flip.loadFromImages(this.urls);
        this.flip.on('flip', (e) => {
          setPager(`PAGES — ${e.data + 1} / ${state.pageCount}`);
          this.cursor = e.data + 1;
          noteReadingProgress(this.cursor);
          this.syncNav();
          this.runQueue(session);
        });
        // destroy() took the tap detector's element with it.
        makeTapDetector(host, { onTap: toggleChrome, centerBand: 0.4 });
      } else {
        this.sizeHost(mountRect, aspect);
        try { this.flip.update(); } catch (_) { /* noop */ }
      }

      if (page > 0 && this.flip.getCurrentPageIndex() !== page) {
        try { this.flip.turnToPage(page); } catch (_) { /* noop */ }
      }
      this.syncNav();
      if (rescaled) this.runQueue(session);
    },

    // The document finished loading after the previews were already up: start
    // filling in sharp renders around wherever the reader has got to.
    onPdfReady(session) {
      if (session !== state.session) return;
      this.runQueue(session);
    },

    syncNav() {
      if (!this.flip) return;
      const idx = this.flip.getCurrentPageIndex();
      if (navPrev) navPrev.disabled = idx <= 0;
      if (navNext) navNext.disabled = idx >= state.pageCount - 1;
    },

    async runQueue(session) {
      const token = ++this.queueToken;
      const total = state.pageCount;
      // Nothing to render until the document exists; previews are already on
      // screen and onPdfReady() restarts this. Without this guard the loop
      // below would spin on a page loadPage() can never satisfy.
      if (!state.pdfDoc) return;

      // A page whose render failed can never satisfy remaining(), so without
      // this the loop would re-request it forever and peg the kiosk's CPU.
      const failed = new Set();

      const remaining = () => {
        // Nearest unrendered page to the reading position first, and only
        // within the cache window — rendering the whole document would just
        // feed pages to trimPageCache() and spin forever.
        let best = 0;
        let bestDist = Infinity;
        const radius = cacheRadius();
        const lo = Math.max(1, this.cursor - radius);
        const hi = Math.min(total, this.cursor + radius);
        for (let n = lo; n <= hi; n += 1) {
          if (hasFresh(n) || failed.has(n)) continue;
          const dist = Math.abs(n - this.cursor);
          if (dist < bestDist) { best = n; bestDist = dist; }
        }
        return best;
      };

      let n = remaining();
      while (n && token === this.queueToken && session === state.session) {
        const url = await loadPage(n); // sequential: keeps the pdf worker calm
        if (token !== this.queueToken || session !== state.session) return;
        if (url) {
          this.urls[n - 1] = url;
          this.markDirty(session);
        } else if (!state.pdfDoc) {
          return; // document went away mid-flight; previews still stand
        } else {
          failed.add(n);
        }
        n = remaining();
      }
    },

    markDirty(session) {
      if (this.dirtyTimer) window.clearTimeout(this.dirtyTimer);
      this.dirtyTimer = window.setTimeout(() => {
        this.dirtyTimer = null;
        if (!this.flip || session !== state.session) return;
        if (this.flip.getState() !== 'read') {
          this.markDirty(session); // still animating — try again shortly
          return;
        }
        const current = this.flip.getCurrentPageIndex();
        this.flip.updateFromImages(this.urls);
        if (this.flip.getCurrentPageIndex() !== current) {
          try { this.flip.turnToPage(current); } catch (_) { /* noop */ }
        }
        setPager(`PAGES — ${current + 1} / ${state.pageCount}`);
      }, 600);
    },

    next() { if (this.flip) this.flip.flipNext('top'); },
    prev() { if (this.flip) this.flip.flipPrev('top'); },

    unmount(container) {
      this.queueToken += 1;
      if (this.dirtyTimer) {
        window.clearTimeout(this.dirtyTimer);
        this.dirtyTimer = null;
      }
      if (this.resizeTimer) {
        window.clearTimeout(this.resizeTimer);
        this.resizeTimer = null;
      }
      if (this.onResize) {
        window.removeEventListener('resize', this.onResize);
        this.onResize = null;
      }
      if (this.flip) {
        try { this.flip.destroy(); } catch (_) { /* noop */ }
        this.flip = null;
      }
      if (this.host) {
        try { this.host.remove(); } catch (_) { /* noop */ }
        this.host = null;
      }
      this.urls = [];
      this.blank = null;
      this.columns = 0;
      this.cursor = 1;
      state.onPageEvicted = null;
      container.innerHTML = '';
    },
  };

  /*
   * DeepZoom: OpenSeadragon for tabloids. One high-resolution page at a
   * time, explored like a map; prev/next in the chrome swaps pages.
   */
  const DeepZoomAdapter = {
    name: 'zoom',
    viewer: null,
    page: 1,
    container: null,
    onZoom: null,
    zoomTimer: null,
    renderedZoom: 1, // magnification the current raster was rendered for

    /*
     * The magnification to render for, as a multiple of fit-to-page.
     *
     * Expressed relative to getHomeZoom() rather than read off getZoom()
     * directly. OSD's raw zoom is in viewport units whose scale depends on the
     * tile source — for these single-image sources it reads ~0.0018 at fit, and
     * feeding that number to the renderer produced a page rendered at 39x28
     * pixels. Home zoom is by definition the zoom at which the page fits, so
     * their ratio is magnification in any units OSD chooses.
     *
     * getZoom() without an argument returns the value the viewport is settling
     * on; getZoom(true) returns it mid-animation, which is how the spring got
     * caught halfway in the first place. Floored at 1: below fit we are
     * downscaling, which is already sharp.
     */
    zoomTarget() {
      if (!this.viewer) return 1;
      try {
        const zoom = this.viewer.viewport.getZoom();
        const home = this.viewer.viewport.getHomeZoom();
        if (!Number.isFinite(zoom) || !Number.isFinite(home) || home <= 0) return 1;
        return Math.max(1, zoom / home);
      } catch (_) {
        return 1;
      }
    },

    // The box the page is drawn into, for setRenderOpts.
    box() {
      const el = this.container;
      return {
        targetWidth: Math.max(320, (el && el.clientWidth) || 1024),
        targetHeight: Math.max(320, (el && el.clientHeight) || 1024),
      };
    },

    async mount(container) {
      const session = state.session;
      this.container = container;
      // Start at fit-to-page and let the zoom handler below raise it. The old
      // fixed 6000x6000 request was ~55 megapixels on an 11x17 broadsheet —
      // over every mobile canvas limit, and still not sharp once pinched past
      // it, because the raster never changed no matter how far you zoomed.
      this.renderedZoom = 1;
      setRenderOpts({ ...this.box(), zoom: 1 });
      state.cursor = 1;
      // OSD holds at most three pages, so the cache never reaches the trim
      // threshold here — but make sure no previous adapter's hook survives.
      state.onPageEvicted = null;

      // Open on the server preview when there is one, so a tabloid appears
      // immediately instead of after the whole PDF downloads. onPdfReady()
      // swaps in the high-resolution render for pinch-zoom detail.
      let url = previewUrl(1);
      if (!url) {
        const doc = await ensurePdfDoc();
        if (!doc || session !== state.session) return;
        url = await loadPage(1);
      }
      if (session !== state.session || !url) return;

      this.page = 1;
      this.viewer = OpenSeadragon({
        element: container,
        showNavigationControl: false,
        tileSources: { type: 'image', url },
        visibilityRatio: 1,
        constrainDuringPan: true,
        minZoomImageRatio: 0.9,
        // Deliberately generous now. This is the ceiling on how far OSD will
        // let you zoom relative to the raster it currently holds; it used to be
        // the only thing standing between the reader and an obviously
        // upscaled bitmap, because the raster never changed. The zoom handler
        // below now re-renders from the PDF as you go in, so a low ceiling
        // would only stop you reaching the detail we can actually supply.
        maxZoomPixelRatio: 8,
        animationTime: 0.9,
        gestureSettingsTouch: {
          pinchToZoom: true,
          flickEnabled: true,
          dragToPan: true,
          dblClickToZoom: true,
        },
        gestureSettingsMouse: {
          clickToZoom: false, // frees the quick click for the chrome toggle
          dblClickToZoom: true,
          scrollToZoom: true,
        },
        crossOriginPolicy: false,
      });

      // OSD's own quick-click discrimination: pinches and drags never
      // fire `quick`, so this cannot fight the pan/zoom gestures.
      this.viewer.addHandler('canvas-click', (ev) => {
        if (ev.quick) toggleChrome();
      });

      // Pinching in used to magnify a flat bitmap and nothing else — the one
      // place in the reader where zooming could only ever make things blurrier.
      this.onZoom = () => {
        if (this.zoomTimer) window.clearTimeout(this.zoomTimer);
        this.zoomTimer = window.setTimeout(() => {
          this.zoomTimer = null;
          this.resharpen(session);
        }, ZOOM_RESHARPEN_DEBOUNCE);
      };
      this.viewer.addHandler('zoom', this.onZoom);
      this.viewer.addHandler('resize', this.onZoom);

      this.syncNav();
      setPager(`PAGES — 1 / ${state.pageCount}`);
      schedulePdfWarm();
      loadPage(2); // warm the next page (no-op until the document is loaded)
    },

    /*
     * Re-render the current page for the magnification now on screen.
     *
     * OSD's viewport zoom is in viewport units — the image spans 1.0 whatever
     * its pixel size — so the value survives an open() with a different raster,
     * which is what makes swapping in a sharper one seamless.
     *
     * Only ever renders *up*: a reader who zooms out is looking at a downscaled
     * bitmap, which is sharp, and re-rendering smaller would trade nothing for
     * a visible flicker.
     */
    resharpen(session) {
      if (session !== state.session || !this.viewer || !this.container) return;
      const zoom = this.zoomTarget();
      if (zoom <= this.renderedZoom * ZOOM_RESHARPEN_THRESHOLD) return;
      // Nothing to re-render from until the document has arrived; onPdfReady
      // calls back here once it has. Forced: this is the one place the PDF
      // still earns its download, because the reader has zoomed past what the
      // server raster holds and only the vector source can go further.
      if (!state.pdfDoc) { schedulePdfWarm(true); return; }

      this.renderedZoom = zoom;
      const target = this.page;
      const changed = setRenderOpts({ ...this.box(), zoom });
      if (!changed) return;

      // Hold the reader's place: viewer.open() resets the viewport to
      // fit-page, which would throw away exactly the position they zoomed to.
      const bounds = this.viewer.viewport.getBounds();
      loadPage(target).then((url) => {
        if (session !== state.session || !this.viewer) return;
        if (this.page !== target || !url) return;
        this.viewer.addOnceHandler('open', () => {
          try { this.viewer.viewport.fitBounds(bounds, true); } catch (_) { /* noop */ }
        });
        this.viewer.open({ type: 'image', url });
      });
    },

    // Replace the preview this opened with once the sharp render exists —
    // pinch-zoom on a tabloid is exactly where resolution matters. Only swaps
    // if the reader is still on that page, so it can't yank the view away.
    onPdfReady(session) {
      if (session !== state.session || !this.viewer) return;
      const target = this.page;
      // The reader may already have pinched in while the preview was up, so
      // render for where they are now, not for fit-page.
      const bounds = this.viewer.viewport.getBounds();
      const zoom = this.zoomTarget();
      this.renderedZoom = zoom;
      setRenderOpts({ ...this.box(), zoom });
      loadPage(target).then((url) => {
        if (session !== state.session || !this.viewer) return;
        if (this.page !== target || !url) return;
        this.viewer.addOnceHandler('open', () => {
          try { this.viewer.viewport.fitBounds(bounds, true); } catch (_) { /* noop */ }
        });
        this.viewer.open({ type: 'image', url });
      });
    },

    syncNav() {
      if (navPrev) navPrev.disabled = this.page <= 1;
      if (navNext) navNext.disabled = this.page >= state.pageCount;
    },

    async goTo(n) {
      const target = Math.max(1, Math.min(n, state.pageCount));
      if (!this.viewer || target === this.page) return;
      const session = state.session;

      // A new page opens at fit-to-page, so drop back to fit-page resolution
      // first. Without this, paging on from a deeply-zoomed spread renders the
      // next page — and the neighbours warmed at the bottom of this method —
      // at the old magnification: many times the pixels the reader can see,
      // straight into the area cap.
      this.renderedZoom = 1;
      setRenderOpts({ ...this.box(), zoom: 1 });

      // Prefer an already-rendered page, else the preview, else wait on the
      // render. Only the last case is worth a loader.
      let url = state.pageUrls.get(target) || previewUrl(target);
      if (!url) {
        showLoader();
        url = await loadPage(target);
        hideLoader();
      }
      if (session !== state.session || !this.viewer || !url) return;

      this.page = target;
      noteReadingProgress(target);
      this.viewer.open({ type: 'image', url });
      // If that was a preview or a page rendered for another magnification,
      // upgrade it as soon as a render is available.
      if (!hasFresh(target)) this.onPdfReady(session);
      this.syncNav();
      setPager(`PAGES — ${target} / ${state.pageCount}`);
      loadPage(target + 1);
      loadPage(target - 1);
    },

    next() { this.goTo(this.page + 1); },
    prev() { this.goTo(this.page - 1); },

    unmount(container) {
      if (this.zoomTimer) {
        window.clearTimeout(this.zoomTimer);
        this.zoomTimer = null;
      }
      if (this.viewer) {
        // destroy() drops OSD's own handlers with it; the reference is cleared
        // so a debounced resharpen that already fired finds nothing to do.
        try { this.viewer.destroy(); } catch (_) { /* noop */ }
        this.viewer = null;
      }
      this.onZoom = null;
      this.container = null;
      this.renderedZoom = 1;
      this.page = 1;
      if (navBlock) navBlock.hidden = true;
      container.innerHTML = '';
    },
  };

  /*
   * Scroll: newsletters read as one continuous document. Native vertical
   * scrolling; IntersectionObserver renders pages just ahead of the reader.
   */
  const ScrollAdapter = {
    name: 'scroll',
    io: null,
    scroller: null,
    pages: [],
    onScroll: null,
    onResize: null,
    resizeTimer: null,

    async mount(container) {
      const session = state.session;
      // Aspect comes from a preview PNG when available, so the scroller can be
      // built and painted without downloading the PDF first.
      const metrics = await pageMetrics();
      if (!metrics || session !== state.session) return;

      const defaultRatio = `${Math.round(metrics.width)} / ${Math.round(metrics.height)}`;

      const scroller = document.createElement('div');
      scroller.className = 'reader-scroll__inner';
      this.pages = [];

      for (let n = 1; n <= state.pageCount; n += 1) {
        const holder = document.createElement('div');
        holder.className = 'reader-scroll__page';
        holder.dataset.page = String(n);
        holder.style.aspectRatio = defaultRatio;
        const img = document.createElement('img');
        img.alt = `Page ${n}`;
        img.draggable = false;
        holder.appendChild(img);
        scroller.appendChild(holder);
        this.pages.push(holder);
      }

      container.appendChild(scroller);
      this.scroller = scroller;

      // Oversample the real on-screen width so the downscale into the box
      // lands on crisp glyph edges rather than soft ones.
      const measure = () => Math.max(
        320,
        Math.round(scroller.clientWidth || container.clientWidth),
      );
      const applyBox = () => setRenderOpts({
        targetWidth: measure() * OVERSAMPLE,
        // Width-constrained fit; the height bound rarely binds, and the area
        // cap in computeRenderScale is what actually protects memory now.
        targetHeight: 20000,
      });
      applyBox();

      state.cursor = 1;
      // Pages showing a server preview rather than a sharp render. Tracked so
      // onPdfReady() knows exactly what still needs upgrading.
      this.previewOnly = new Set();

      const paint = (holder, url, isPreview) => {
        const img = holder.querySelector('img');
        if (!img) return;
        img.onload = () => {
          // Correct the placeholder ratio only if meaningfully off, so late
          // loads don't jolt the scroll position.
          const real = img.naturalWidth / img.naturalHeight;
          const assumed = metrics.width / metrics.height;
          if (Math.abs(real - assumed) / assumed > 0.01) {
            holder.style.aspectRatio = `${img.naturalWidth} / ${img.naturalHeight}`;
          }
          holder.classList.add('is-rendered');
        };
        img.src = url;
        const n = parseInt(holder.dataset.page || '', 10);
        // Marks a page that is showing the server's fixed-resolution preview
        // rather than a render for this screen. The CSS turns it into a quiet
        // "sharpening" hint, so a soft page reads as in-progress instead of
        // as the finished article.
        holder.classList.toggle('is-preview', !!isPreview);
        if (isPreview) this.previewOnly.add(n); else this.previewOnly.delete(n);
      };

      // Paint the server's pre-rendered page at once, then ask for the sharp
      // render. Before the deferred warm-up has run loadPage() resolves empty
      // and the preview simply stays up.
      this.requestPage = (holder, n) => {
        const preview = previewUrl(n);
        // When the server has rendered the whole document the preview is not a
        // placeholder, it is the finished page -- so paint it as final and ask
        // for nothing more. Marking it `is-preview` here would leave the CSS's
        // "sharpening" hint on every page of the archive, permanently, waiting
        // for a pdf.js render that is never coming (see serverCoversDocument).
        if (preview && serverCoversDocument()) {
          paint(holder, preview, false);
          return;
        }
        if (preview && !state.pageUrls.has(n)) paint(holder, preview, true);
        loadPage(n).then((url) => {
          if (session !== state.session || !url) return;
          // The page may have been evicted between render and paint (the
          // reader scrolled on); its URL is revoked, so painting it would
          // show a broken image. onPageEvicted has already re-observed it.
          // Comparing the URL rather than just the key also catches a render
          // that a later, sharper one has already superseded.
          if (state.pageUrls.get(n) !== url) return;
          paint(holder, url, false);
        });
      };

      // An evicted page falls back to its preview, and goes back under
      // observation so it can be re-rendered — this.io.unobserve() is
      // one-shot by design.
      state.onPageEvicted = (n) => {
        const holder = this.pages[n - 1];
        if (!holder || !this.io) return;
        const preview = previewUrl(n);
        if (preview) {
          paint(holder, preview, true);
        } else {
          const img = holder.querySelector('img');
          if (img) img.removeAttribute('src');
          holder.classList.remove('is-rendered');
        }
        this.io.observe(holder);
      };

      this.io = new IntersectionObserver((entries) => {
        entries.forEach((entry) => {
          if (!entry.isIntersecting) return;
          this.io.unobserve(entry.target);
          const n = parseInt(entry.target.dataset.page || '', 10);
          this.requestPage(entry.target, n);
        });
      }, { root: scroller, rootMargin: '150% 0px' });

      this.pages.forEach((holder) => this.io.observe(holder));

      let ticking = false;
      this.onScroll = () => {
        if (ticking) return;
        ticking = true;
        requestAnimationFrame(() => {
          ticking = false;
          this.syncPager();
        });
      };
      scroller.addEventListener('scroll', this.onScroll, { passive: true });

      /*
       * This adapter had no resize handling at all: a newsletter rendered for a
       * narrow column stayed at that resolution when the window grew or a phone
       * was rotated, and the browser simply stretched it. Re-stamp the
       * generation from the new column width and put every page back under
       * observation — the IntersectionObserver, not a loop, then decides which
       * are actually near the reader and worth re-rendering.
       */
      this.onResize = () => {
        if (this.resizeTimer) window.clearTimeout(this.resizeTimer);
        this.resizeTimer = window.setTimeout(() => {
          this.resizeTimer = null;
          if (session !== state.session || !this.io) return;
          if (!applyBox()) return;
          this.pages.forEach((holder) => this.io.observe(holder));
        }, RESIZE_DEBOUNCE);
      };
      window.addEventListener('resize', this.onResize);

      makeTapDetector(scroller, { onTap: toggleChrome });
      setPager(`PAGES — 1 / ${state.pageCount}`);
      this.syncNav();
      schedulePdfWarm();
    },

    // Document arrived after the previews: upgrade the pages still showing
    // one. Re-observing lets the IntersectionObserver decide which are
    // actually near the viewport rather than rendering all of them at once.
    onPdfReady(session) {
      if (session !== state.session || !this.io) return;
      this.previewOnly.forEach((n) => {
        const holder = this.pages[n - 1];
        if (holder) this.io.observe(holder);
      });
    },

    syncNav() {
      const n = this.currentPage();
      if (navPrev) navPrev.disabled = n <= 1;
      if (navNext) navNext.disabled = n >= state.pageCount;
    },

    currentPage() {
      if (!this.scroller) return 1;
      const mid = this.scroller.getBoundingClientRect().top
        + this.scroller.clientHeight / 2;
      for (const holder of this.pages) {
        const r = holder.getBoundingClientRect();
        if (r.top <= mid && r.bottom >= mid) {
          return parseInt(holder.dataset.page || '1', 10);
        }
      }
      return 1;
    },

    syncPager() {
      // Scrolling is this adapter's "reader is engaged" signal and also keeps
      // the cache window centred on what's on screen.
      noteReadingProgress(this.currentPage());
      setPager(`PAGES — ${state.cursor} / ${state.pageCount}`);
      this.syncNav();
    },

    next() {
      const n = Math.min(this.currentPage() + 1, state.pageCount);
      this.pages[n - 1]?.scrollIntoView({ behavior: 'smooth' });
    },
    prev() {
      const n = Math.max(this.currentPage() - 1, 1);
      this.pages[n - 1]?.scrollIntoView({ behavior: 'smooth' });
    },

    unmount(container) {
      if (this.io) {
        this.io.disconnect();
        this.io = null;
      }
      if (this.scroller && this.onScroll) {
        this.scroller.removeEventListener('scroll', this.onScroll);
      }
      if (this.resizeTimer) {
        window.clearTimeout(this.resizeTimer);
        this.resizeTimer = null;
      }
      if (this.onResize) {
        window.removeEventListener('resize', this.onResize);
        this.onResize = null;
      }
      this.scroller = null;
      this.onScroll = null;
      this.pages = [];
      this.previewOnly = new Set();
      this.requestPage = null;
      state.onPageEvicted = null;
      container.innerHTML = '';
    },
  };

  function pickAdapter(dataset) {
    if (dataset.isTabloid === '1') {
      return { adapter: DeepZoomAdapter, mount: zoomMount };
    }
    if ((dataset.type || '').toLowerCase().includes('newsletter')) {
      return { adapter: ScrollAdapter, mount: scrollMount };
    }
    return { adapter: BookAdapter, mount: bookMount }; // folio + magazine
  }

  // ── Open / close ────────────────────────────────────────

  function applyZoomTransform(fromRect) {
    const stageRect = stage.getBoundingClientRect();
    if (!fromRect || !stageRect.width || !stageRect.height) {
      stage.style.transform = '';
      return;
    }
    const scale = Math.min(
      fromRect.width / stageRect.width,
      fromRect.height / stageRect.height,
    );
    const dx = (fromRect.left + fromRect.width / 2)
      - (stageRect.left + stageRect.width / 2);
    const dy = (fromRect.top + fromRect.height / 2)
      - (stageRect.top + stageRect.height / 2);
    stage.style.transform = `translate3d(${dx}px, ${dy}px, 0) scale(${scale})`;
  }

  let isBusy = false;

  async function openReader(detail) {
    if (isBusy || overlay.classList.contains('is-active')) return;
    isBusy = true;
    state.session += 1;
    const session = state.session;

    state.dataset = detail.dataset || {};
    state.fileUrl = state.dataset.fileUrl || '';
    state.pageCount = parseInt(state.dataset.pageCount || '0', 10) || 0;
    // Instant-open contract (see ArchiveServices.count_prewarmed_pages): these
    // pages are already rasterised on the server and can be painted before the
    // PDF has been fetched at all. 0 means nothing is prewarmed — the reader
    // then behaves as it always did and loads the document immediately.
    state.pageUrlBase = state.dataset.pageUrlBase || '';
    state.pageStorageBase = state.dataset.pageStorageBase || '';
    state.pageExtension = state.dataset.pageExtension || '.webp';
    state.directPages = parseInt(state.dataset.directPages || '0', 10) || 0;
    state.prewarmedPages = parseInt(state.dataset.prewarmedPages || '0', 10) || 0;
    state.originRect = detail.originRect || null;
    clearAllPages();

    const { adapter, mount } = pickAdapter(state.dataset);
    state.adapter = adapter;
    state.activeMount = mount;

    [bookMount, zoomMount, scrollMount].forEach((el) => { if (el) el.hidden = true; });
    setPager('—');

    overlay.hidden = false;
    overlay.setAttribute('aria-hidden', 'false');
    showLoader();
    document.dispatchEvent(new CustomEvent('archive:reader-open'));

    requestAnimationFrame(() => {
      stage.style.transition = 'none';
      applyZoomTransform(state.originRect);
      void stage.offsetWidth;
      overlay.classList.add('is-active');
      stage.style.transition = '';
      stage.style.transform = '';

      window.setTimeout(async () => {
        if (session !== state.session) return;
        if (mount) mount.hidden = false;
        let mounted = false;
        try {
          await adapter.mount(mount);
          mounted = true;
        } catch (err) {
          console.error('[archive-reader] adapter mount failed', err);
          setPager('Could not open this archive');
        }
        if (session !== state.session) return;
        hideLoader();
        // Page-turn arrows on desktop only; touch (kiosk, mobile) swipes.
        if (navBlock) navBlock.hidden = isTouchUi || !mounted;
        showChrome({ autoFade: true });
        isBusy = false;
      }, ZOOM_DURATION);
    });
  }

  function closeReader() {
    if (isBusy || !overlay.classList.contains('is-active')) return;
    isBusy = true;
    state.session += 1;

    if (chromeFadeTimer) {
      window.clearTimeout(chromeFadeTimer);
      chromeFadeTimer = null;
    }
    overlay.classList.remove('is-chrome-visible');
    hideLoader();

    if (state.adapter && state.activeMount) {
      try { state.adapter.unmount(state.activeMount); } catch (_) { /* noop */ }
    }
    state.adapter = null;

    overlay.classList.remove('is-active');
    stage.style.transition = '';
    applyZoomTransform(state.originRect);

    window.setTimeout(() => {
      overlay.hidden = true;
      overlay.setAttribute('aria-hidden', 'true');
      stage.style.transition = 'none';
      stage.style.transform = '';
      [bookMount, zoomMount, scrollMount].forEach((el) => { if (el) el.hidden = true; });
      clearAllPages();
      isBusy = false;
      document.dispatchEvent(new CustomEvent('archive:reader-close'));
    }, ZOOM_DURATION);
  }

  // ── Wiring ──────────────────────────────────────────────

  document.addEventListener('archive:open', (event) => {
    openReader(event.detail || {});
  });

  if (backButton) {
    backButton.addEventListener('click', (event) => {
      event.preventDefault();
      event.stopPropagation();
      closeReader();
    });
  }

  if (backdrop) {
    backdrop.addEventListener('click', () => closeReader());
  }

  if (navPrev) {
    navPrev.addEventListener('click', (event) => {
      event.stopPropagation();
      if (state.adapter) state.adapter.prev();
    });
  }

  if (navNext) {
    navNext.addEventListener('click', (event) => {
      event.stopPropagation();
      if (state.adapter) state.adapter.next();
    });
  }

  document.addEventListener('keydown', (event) => {
    if (!overlay.classList.contains('is-active')) return;
    if (event.key === 'Escape') {
      closeReader();
    } else if (event.key === 'ArrowRight' || event.key === 'ArrowDown') {
      if (state.adapter) state.adapter.next();
    } else if (event.key === 'ArrowLeft' || event.key === 'ArrowUp') {
      if (state.adapter) state.adapter.prev();
    }
  });

  // Warm pdf.js itself (not any specific document) while the menu is
  // idle, so the first archive open doesn't pay the worker boot latency.
  function warmPdfjs() { getPdfjs().catch(() => {}); }
  if ('requestIdleCallback' in window) {
    window.requestIdleCallback(warmPdfjs, { timeout: 2000 });
  } else {
    window.setTimeout(warmPdfjs, 800);
  }

  // Diagnostic handle, ?readerdebug only. OpenSeadragon keeps no registry of
  // its viewers, so without this there is no way to drive the tabloid's zoom
  // from outside — which is exactly the path that needs checking on a real
  // terminal, and the one that hid a render at 39x28 pixels.
  if (DEBUG) {
    window.__archiveReader = { state, adapters: { BookAdapter, DeepZoomAdapter, ScrollAdapter } };
  }
});
