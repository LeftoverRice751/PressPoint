/* Kiosk archive book overlay
 *
 * Reads each archive's PDF directly with pdf.js and rasterises pages on
 * demand into the existing <img> slots used by the flip animation. The
 * raster is sized to the on-screen page slot times devicePixelRatio so
 * text stays crisp; the prerendered PNGs on the server are no longer
 * needed for the reader (covers and the carousel still use them).
 *
 * pdf.js itself is loaded lazily via a webpack-ignored dynamic import so
 * mix doesn't try to bundle the worker — the .mjs files are copied
 * verbatim into /assets/js/pdfjs/ by webpack.mix.js.
 */

document.addEventListener('DOMContentLoaded', () => {
  const root = document.querySelector('[data-archive-shell]');
  if (!root) return;

  const overlay = root.querySelector('[data-archive-book]');
  if (!overlay) return;

  const stage = overlay.querySelector('[data-archive-book-stage]');
  const book = overlay.querySelector('[data-archive-book-frame]');
  const leftImg = overlay.querySelector('[data-archive-book-left-image]');
  const rightImg = overlay.querySelector('[data-archive-book-right-image]');
  const flipper = overlay.querySelector('[data-archive-book-flipper]');
  const flipperFront = overlay.querySelector('[data-archive-book-flipper-front]');
  const flipperBack = overlay.querySelector('[data-archive-book-flipper-back]');
  const tabloidImg = overlay.querySelector('[data-archive-book-tabloid-image]');
  const rightSlot = overlay.querySelector('[data-archive-book-right]');
  const tabloidSlot = overlay.querySelector('[data-archive-book-tabloid]');
  const backButton = overlay.querySelector('[data-archive-book-back]');
  const pager = overlay.querySelector('[data-archive-book-pager]');

  const SWIPE_THRESHOLD = 56;
  const FLIP_DURATION = 720;
  const TABLOID_FLIP_DURATION = 360;
  const ZOOM_DURATION = 520;
  const MAX_DPR = 2;
  const RENDER_PIXEL_CAP = 2400;

  const state = {
    archiveId: null,
    pageCount: 0,
    isTabloid: false,
    fileUrl: '',
    spreadIndex: 0,
    isAnimating: false,
    cardOrigin: null,
    pdfDoc: null,
    pdfDocPromise: null,
    pageUrls: new Map(), // page number -> blob: URL
    pageRenders: new Map(), // page number -> Promise<string>
    targetSize: { width: 0, height: 0 },
  };

  // ------- pdf.js loader (lazy, single-shot) -------
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

  // ------- Archive loader overlay -------
  const archiveLoader = overlay ? overlay.querySelector('[data-archive-loader]') : null;
  function showArchiveLoader() {
    if (!archiveLoader) return;
    archiveLoader.hidden = false;
    requestAnimationFrame(() => archiveLoader.classList.add('is-visible'));
  }
  function hideArchiveLoader() {
    if (!archiveLoader) return;
    archiveLoader.classList.remove('is-visible');
    setTimeout(() => { archiveLoader.hidden = true; }, 220);
  }

  function measureTargetSize() {
    // The book is hidden until openBook runs; once `is-active` lands the
    // slot dimensions are stable (they're driven by viewport-relative CSS
    // vars), so we measure once per session and reuse.
    const slot = state.isTabloid ? tabloidSlot : rightSlot;
    if (!slot) {
      state.targetSize = { width: 800, height: 1100 };
      return;
    }
    const rect = slot.getBoundingClientRect();
    state.targetSize = {
      width: Math.max(1, Math.round(rect.width)),
      height: Math.max(1, Math.round(rect.height)),
    };
  }

  function pageUrl(pageNumber) {
    if (!pageNumber || pageNumber < 1 || pageNumber > state.pageCount) return '';
    return state.pageUrls.get(pageNumber) || '';
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
      });
      const doc = await task.promise;
      state.pdfDoc = doc;
      if (!state.pageCount) state.pageCount = doc.numPages;
      return doc;
    })();
    return state.pdfDocPromise;
  }

  async function renderPage(pageNumber) {
    const doc = await ensurePdfDoc();
    if (!doc) return '';
    if (pageNumber < 1 || pageNumber > doc.numPages) return '';

    const page = await doc.getPage(pageNumber);
    const dpr = Math.min(window.devicePixelRatio || 1, MAX_DPR);
    const target = state.targetSize;
    const baseViewport = page.getViewport({ scale: 1 });

    // Fit-contain inside the slot, then upscale to device pixels. Cap so
    // we never produce a bitmap larger than the kiosk needs.
    let scale = Math.min(
      target.width / baseViewport.width,
      target.height / baseViewport.height,
    ) * dpr;
    const maxDim = Math.max(baseViewport.width, baseViewport.height) * scale;
    if (maxDim > RENDER_PIXEL_CAP) scale *= RENDER_PIXEL_CAP / maxDim;

    const viewport = page.getViewport({ scale });
    const canvas = document.createElement('canvas');
    canvas.width = Math.ceil(viewport.width);
    canvas.height = Math.ceil(viewport.height);
    const ctx = canvas.getContext('2d', { alpha: false });
    ctx.fillStyle = '#fff8ec';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    await page.render({ canvasContext: ctx, viewport }).promise;
    page.cleanup();

    const blob = await new Promise((resolve) => canvas.toBlob(resolve, 'image/jpeg', 0.92));
    if (!blob) return '';
    const url = URL.createObjectURL(blob);
    state.pageUrls.set(pageNumber, url);
    return url;
  }

  function loadPage(pageNumber) {
    if (!pageNumber || pageNumber < 1 || pageNumber > state.pageCount) {
      return Promise.resolve('');
    }
    if (state.pageUrls.has(pageNumber)) {
      return Promise.resolve(state.pageUrls.get(pageNumber));
    }
    if (state.pageRenders.has(pageNumber)) {
      return state.pageRenders.get(pageNumber);
    }
    const promise = renderPage(pageNumber).catch(() => '').finally(() => {
      state.pageRenders.delete(pageNumber);
    });
    state.pageRenders.set(pageNumber, promise);
    return promise;
  }

  function preloadAround(spreadIdx) {
    if (state.isTabloid) {
      [spreadIdx - 1, spreadIdx, spreadIdx + 1, spreadIdx + 2].forEach(loadPage);
      return;
    }
    [spreadIdx - 1, spreadIdx, spreadIdx + 1, spreadIdx + 2].forEach((idx) => {
      const sp = getSpreadPages(idx);
      if (sp.left) loadPage(sp.left);
      if (sp.right) loadPage(sp.right);
    });
  }

  function getMaxSpread() {
    if (state.isTabloid) return state.pageCount;
    if (state.pageCount <= 1) return 0;
    return 1 + Math.ceil(Math.max(0, state.pageCount - 2) / 2);
  }

  function getSpreadPages(spreadIdx) {
    if (spreadIdx <= 0 || spreadIdx > getMaxSpread()) {
      return { left: null, right: null };
    }
    if (spreadIdx === 1) {
      return { left: null, right: 2 };
    }
    const leftPage = 2 * spreadIdx - 1;
    const rightPage = 2 * spreadIdx;
    return {
      left: leftPage <= state.pageCount ? leftPage : null,
      right: rightPage <= state.pageCount ? rightPage : null,
    };
  }

  function updatePager() {
    if (!pager) return;
    if (!state.pageCount) {
      pager.textContent = '—';
      return;
    }
    if (state.isTabloid) {
      pager.textContent = `Page ${state.spreadIndex} / ${state.pageCount}`;
      return;
    }
    if (state.spreadIndex === 0) {
      pager.textContent = 'Cover';
      return;
    }
    const sp = getSpreadPages(state.spreadIndex);
    const left = sp.left ? `${sp.left}` : '—';
    const right = sp.right ? `${sp.right}` : '—';
    pager.textContent = `Pages ${left}–${right} / ${state.pageCount}`;
  }

  function setImageSrc(node, src) {
    if (!node) return;
    if (src) {
      if (node.getAttribute('src') !== src) node.setAttribute('src', src);
    } else {
      node.removeAttribute('src');
    }
  }

  function resetFlipper() {
    flipper.classList.remove('is-active', 'is-right', 'is-left');
    flipper.style.transition = 'none';
    flipper.style.transform = 'rotateY(0deg)';
    setImageSrc(flipperFront, '');
    setImageSrc(flipperBack, '');
  }

  function applyZoomTransform(fromCardRect) {
    const stageRect = stage.getBoundingClientRect();
    if (!fromCardRect || !stageRect.width || !stageRect.height) {
      stage.style.transform = '';
      return;
    }
    const scale = Math.min(
      fromCardRect.width / stageRect.width,
      fromCardRect.height / stageRect.height,
    );
    const dx = (fromCardRect.left + fromCardRect.width / 2)
      - (stageRect.left + stageRect.width / 2);
    const dy = (fromCardRect.top + fromCardRect.height / 2)
      - (stageRect.top + stageRect.height / 2);
    stage.style.transform =
      `translate3d(${dx}px, ${dy}px, 0) scale(${scale})`;
  }

  function clearAllPages() {
    state.pageUrls.forEach((url) => {
      try { URL.revokeObjectURL(url); } catch (_) { /* noop */ }
    });
    state.pageUrls.clear();
    state.pageRenders.clear();
    if (state.pdfDoc) {
      try { state.pdfDoc.cleanup(); state.pdfDoc.destroy(); } catch (_) { /* noop */ }
    }
    state.pdfDoc = null;
    state.pdfDocPromise = null;
  }

  function openBook(card) {
    if (state.isAnimating) return;
    state.isAnimating = true;

    state.archiveId = card.dataset.archiveId || '';
    state.pageCount = parseInt(card.dataset.pageCount || '0', 10) || 0;
    state.isTabloid = card.dataset.isTabloid === '1';
    state.fileUrl = card.dataset.fileUrl || '';
    state.cardOrigin = card.getBoundingClientRect();
    clearAllPages();

    book.classList.remove(
      'is-open-spread',
      'is-tabloid',
      'is-tabloid-flipping-up',
      'is-tabloid-flipping-down',
    );
    resetFlipper();

    if (state.isTabloid) {
      state.spreadIndex = 1;
      book.classList.add('is-tabloid');
      setImageSrc(tabloidImg, '');
      setImageSrc(leftImg, '');
      setImageSrc(rightImg, '');
    } else {
      state.spreadIndex = 0;
      // Cover thumb is preloaded raster — keep it as the first paint while
      // pdf.js spins up. It gets replaced with the canvas-rendered version
      // before the cover-open animation starts.
      const coverThumb = card.dataset.firstPageUrl || card.dataset.coverUrl || '';
      setImageSrc(rightImg, coverThumb);
      setImageSrc(leftImg, '');
      setImageSrc(tabloidImg, '');
    }

    overlay.hidden = false;
    showArchiveLoader();
    overlay.setAttribute('aria-hidden', 'false');
    requestAnimationFrame(() => {
      stage.style.transition = 'none';
      applyZoomTransform(state.cardOrigin);
      void stage.offsetWidth;
      overlay.classList.add('is-active');
      stage.style.transition = '';
      stage.style.transform = '';
      window.setTimeout(async () => {
        measureTargetSize();
        try { await ensurePdfDoc(); } catch (_) { /* shown as empty */ }

        if (state.isTabloid) {
          const url = await loadPage(1);
          if (url) setImageSrc(tabloidImg, url);
          hideArchiveLoader();
          state.isAnimating = false;
          updatePager();
          preloadAround(1);
          return;
        }

        // Folio: render cover (page 1) and inside-cover (page 2), then
        // run the cover-open flip.
        const [coverUrl, pageTwoUrl] = await Promise.all([
          loadPage(1),
          state.pageCount >= 2 ? loadPage(2) : Promise.resolve(''),
        ]);
        if (coverUrl) setImageSrc(rightImg, coverUrl);
        animateCoverOpen(coverUrl, pageTwoUrl);
      }, ZOOM_DURATION);
    });
  }

  function animateCoverOpen(coverUrl, pageTwoUrl) {
    if (state.pageCount < 1) {
      state.isAnimating = false;
      hideArchiveLoader();
      return;
    }

    hideArchiveLoader();
    setImageSrc(rightImg, pageTwoUrl);
    setImageSrc(leftImg, '');

    flipper.className = 'archive-book__flipper is-active is-right';
    setImageSrc(flipperFront, coverUrl);
    setImageSrc(flipperBack, '');

    flipper.style.transition = 'none';
    flipper.style.transform = 'rotateY(0deg)';
    void flipper.offsetWidth;

    book.classList.add('is-open-spread');
    flipper.style.transition =
      `transform ${FLIP_DURATION}ms cubic-bezier(0.45, 0, 0.55, 1)`;
    flipper.style.transform = 'rotateY(-180deg)';

    window.setTimeout(() => {
      state.spreadIndex = 1;
      resetFlipper();
      setImageSrc(leftImg, '');
      setImageSrc(rightImg, pageTwoUrl);
      state.isAnimating = false;
      updatePager();
      preloadAround(1);
    }, FLIP_DURATION);
  }

  function animateCoverClose(onDone) {
    const coverUrl = pageUrl(1);

    flipper.className = 'archive-book__flipper is-active is-left';
    setImageSrc(flipperFront, '');
    setImageSrc(flipperBack, coverUrl);

    flipper.style.transition = 'none';
    flipper.style.transform = 'rotateY(0deg)';
    void flipper.offsetWidth;

    book.classList.remove('is-open-spread');
    flipper.style.transition =
      `transform ${FLIP_DURATION}ms cubic-bezier(0.45, 0, 0.55, 1)`;
    flipper.style.transform = 'rotateY(180deg)';

    window.setTimeout(() => {
      state.spreadIndex = 0;
      resetFlipper();
      setImageSrc(rightImg, coverUrl);
      setImageSrc(leftImg, '');
      updatePager();
      if (onDone) onDone();
    }, FLIP_DURATION);
  }

  async function flipForward() {
    if (state.isAnimating) return;
    if (state.spreadIndex >= getMaxSpread()) return;
    state.isAnimating = true;

    if (state.spreadIndex === 0) {
      const [coverUrl, pageTwoUrl] = await Promise.all([loadPage(1), loadPage(2)]);
      animateCoverOpen(coverUrl, pageTwoUrl);
      return;
    }

    const currentSpread = getSpreadPages(state.spreadIndex);
    const nextSpread = getSpreadPages(state.spreadIndex + 1);

    // Wait for the pages we need to draw on the flipper + landing spread.
    await Promise.all([
      currentSpread.right ? loadPage(currentSpread.right) : null,
      nextSpread.left ? loadPage(nextSpread.left) : null,
      nextSpread.right ? loadPage(nextSpread.right) : null,
    ].filter(Boolean));

    const currentRightUrl = currentSpread.right ? pageUrl(currentSpread.right) : '';
    const nextLeftUrl = nextSpread.left ? pageUrl(nextSpread.left) : '';
    const nextRightUrl = nextSpread.right ? pageUrl(nextSpread.right) : '';

    flipper.className = 'archive-book__flipper is-active is-right';
    setImageSrc(flipperFront, currentRightUrl);
    setImageSrc(flipperBack, nextLeftUrl);

    setImageSrc(rightImg, nextRightUrl);

    flipper.style.transition = 'none';
    flipper.style.transform = 'rotateY(0deg)';
    void flipper.offsetWidth;
    flipper.style.transition =
      `transform ${FLIP_DURATION}ms cubic-bezier(0.45, 0, 0.55, 1)`;
    flipper.style.transform = 'rotateY(-180deg)';

    window.setTimeout(() => {
      state.spreadIndex += 1;
      resetFlipper();
      setImageSrc(leftImg, nextLeftUrl);
      setImageSrc(rightImg, nextRightUrl);
      state.isAnimating = false;
      updatePager();
      preloadAround(state.spreadIndex);
    }, FLIP_DURATION);
  }

  async function flipBackward() {
    if (state.isAnimating) return;
    if (state.spreadIndex <= 0) return;
    state.isAnimating = true;

    if (state.spreadIndex === 1) {
      animateCoverClose(() => {
        state.isAnimating = false;
      });
      return;
    }

    const currentSpread = getSpreadPages(state.spreadIndex);
    const prevSpread = getSpreadPages(state.spreadIndex - 1);

    await Promise.all([
      currentSpread.left ? loadPage(currentSpread.left) : null,
      prevSpread.left ? loadPage(prevSpread.left) : null,
      prevSpread.right ? loadPage(prevSpread.right) : null,
    ].filter(Boolean));

    const currentLeftUrl = currentSpread.left ? pageUrl(currentSpread.left) : '';
    const prevLeftUrl = prevSpread.left ? pageUrl(prevSpread.left) : '';
    const prevRightUrl = prevSpread.right ? pageUrl(prevSpread.right) : '';

    flipper.className = 'archive-book__flipper is-active is-left';
    setImageSrc(flipperFront, currentLeftUrl);
    setImageSrc(flipperBack, prevRightUrl);

    setImageSrc(leftImg, prevLeftUrl);

    flipper.style.transition = 'none';
    flipper.style.transform = 'rotateY(0deg)';
    void flipper.offsetWidth;
    flipper.style.transition =
      `transform ${FLIP_DURATION}ms cubic-bezier(0.45, 0, 0.55, 1)`;
    flipper.style.transform = 'rotateY(180deg)';

    window.setTimeout(() => {
      state.spreadIndex -= 1;
      resetFlipper();
      setImageSrc(leftImg, prevLeftUrl);
      setImageSrc(rightImg, prevRightUrl);
      state.isAnimating = false;
      updatePager();
      preloadAround(state.spreadIndex);
    }, FLIP_DURATION);
  }

  async function tabloidFlip(direction) {
    if (state.isAnimating) return;
    const next = state.spreadIndex + direction;
    if (next < 1 || next > state.pageCount) return;
    state.isAnimating = true;

    await loadPage(next);

    book.classList.add(direction > 0 ? 'is-tabloid-flipping-up' : 'is-tabloid-flipping-down');

    window.setTimeout(() => {
      state.spreadIndex = next;
      setImageSrc(tabloidImg, pageUrl(next));
      book.classList.remove('is-tabloid-flipping-up', 'is-tabloid-flipping-down');
      tabloidImg.style.transition = 'none';
      tabloidImg.style.transform = 'translateY(0)';
      tabloidImg.style.opacity = '0';
      void tabloidImg.offsetWidth;
      tabloidImg.style.transition = '';
      tabloidImg.style.opacity = '';
      state.isAnimating = false;
      updatePager();
      preloadAround(state.spreadIndex);
    }, TABLOID_FLIP_DURATION);
  }

  function closeBook() {
    if (state.isAnimating) return;
    state.isAnimating = true;

    hideArchiveLoader();
    overlay.classList.remove('is-active');
    stage.style.transition = '';
    applyZoomTransform(state.cardOrigin);

    window.setTimeout(() => {
      overlay.hidden = true;
      overlay.setAttribute('aria-hidden', 'true');
      stage.style.transition = 'none';
      stage.style.transform = '';
      book.classList.remove(
        'is-open-spread',
        'is-tabloid',
        'is-tabloid-flipping-up',
        'is-tabloid-flipping-down',
      );
      resetFlipper();
      setImageSrc(leftImg, '');
      setImageSrc(rightImg, '');
      setImageSrc(tabloidImg, '');
      state.spreadIndex = 0;
      state.isAnimating = false;
      clearAllPages();
    }, ZOOM_DURATION);
  }

  // Card click — capture phase, only consume when the card is already focused.
  document.addEventListener('click', (event) => {
    const card = event.target.closest('[data-archive-card]');
    if (!card) return;
    if (overlay.classList.contains('is-active')) return;
    if (!card.classList.contains('is-active')) return;
    if (state.isAnimating) {
      event.stopImmediatePropagation();
      event.preventDefault();
      return;
    }
    event.stopImmediatePropagation();
    event.preventDefault();
    openBook(card);
  }, true);

  if (backButton) {
    backButton.addEventListener('click', (event) => {
      event.preventDefault();
      closeBook();
    });
  }

  // Touch swipe handling on the book stage.
  let pointerState = null;

  stage.addEventListener('pointerdown', (event) => {
    if (state.isAnimating) return;
    if (event.pointerType === 'mouse') return;
    pointerState = {
      id: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
    };
    try { stage.setPointerCapture(event.pointerId); } catch (_) { /* noop */ }
  });

  stage.addEventListener('pointermove', (event) => {
    if (!pointerState || event.pointerId !== pointerState.id) return;
    const dx = event.clientX - pointerState.startX;
    const dy = event.clientY - pointerState.startY;
    if (state.isTabloid) {
      if (Math.abs(dy) > Math.abs(dx)) event.preventDefault();
    } else {
      if (Math.abs(dx) > Math.abs(dy)) event.preventDefault();
    }
  }, { passive: false });

  function finishSwipe(event) {
    if (!pointerState || event.pointerId !== pointerState.id) return;
    const dx = event.clientX - pointerState.startX;
    const dy = event.clientY - pointerState.startY;
    pointerState = null;

    try { stage.releasePointerCapture(event.pointerId); } catch (_) { /* noop */ }

    if (state.isTabloid) {
      if (Math.abs(dy) > SWIPE_THRESHOLD && Math.abs(dy) > Math.abs(dx)) {
        tabloidFlip(dy < 0 ? 1 : -1);
      }
    } else {
      if (Math.abs(dx) > SWIPE_THRESHOLD && Math.abs(dx) > Math.abs(dy)) {
        if (dx < 0) flipForward();
        else flipBackward();
      }
    }
  }

  stage.addEventListener('pointerup', finishSwipe);
  stage.addEventListener('pointercancel', () => { pointerState = null; });

  // Warm pdf.js itself (not any specific document) while the carousel is
  // idle, so the first archive open doesn't pay the worker boot latency.
  function warmPdfjs() { getPdfjs().catch(() => {}); }
  if ('requestIdleCallback' in window) {
    window.requestIdleCallback(warmPdfjs, { timeout: 2000 });
  } else {
    window.setTimeout(warmPdfjs, 800);
  }
});
