/* Kiosk archive book overlay
 *
 * Listens for taps on the existing carousel cards and renders a 3D book
 * overlay on top. The carousel JS (kiosk-archives.js) is left untouched —
 * we hook clicks in the capture phase and only consume them when the
 * tapped card is already focused (matches the carousel's `is-active`
 * class). Otherwise the carousel handles the tap as usual.
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
  const backButton = overlay.querySelector('[data-archive-book-back]');
  const pager = overlay.querySelector('[data-archive-book-pager]');

  const SWIPE_THRESHOLD = 56;
  const FLIP_DURATION = 720;
  const TABLOID_FLIP_DURATION = 360;
  const ZOOM_DURATION = 520;

  const state = {
    archiveId: null,
    pageCount: 0,
    isTabloid: false,
    pageUrlBase: '',
    spreadIndex: 0,
    isAnimating: false,
    cardOrigin: null,
    preloaded: new Map(),
  };

  function pageUrl(pageNumber) {
    if (!state.pageUrlBase || pageNumber < 1 || pageNumber > state.pageCount) {
      return '';
    }
    return `${state.pageUrlBase}/${pageNumber}`;
  }

  function preloadPage(pageNumber) {
    if (!pageNumber || pageNumber < 1 || pageNumber > state.pageCount) return;
    if (state.preloaded.has(pageNumber)) return;
    const url = pageUrl(pageNumber);
    if (!url) return;
    const img = new Image();
    img.src = url;
    state.preloaded.set(pageNumber, img);
  }

  function preloadAround(spreadIdx) {
    if (state.isTabloid) {
      [spreadIdx - 1, spreadIdx, spreadIdx + 1, spreadIdx + 2].forEach(preloadPage);
      return;
    }
    [spreadIdx - 1, spreadIdx, spreadIdx + 1, spreadIdx + 2].forEach((idx) => {
      const sp = getSpreadPages(idx);
      if (sp.left) preloadPage(sp.left);
      if (sp.right) preloadPage(sp.right);
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

  function openBook(card) {
    if (state.isAnimating) return;
    state.isAnimating = true;

    state.archiveId = card.dataset.archiveId || '';
    state.pageCount = parseInt(card.dataset.pageCount || '0', 10) || 0;
    state.isTabloid = card.dataset.isTabloid === '1';
    state.pageUrlBase = card.dataset.pageUrlBase || '';
    state.cardOrigin = card.getBoundingClientRect();
    state.preloaded = new Map();

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
      setImageSrc(tabloidImg, pageUrl(1));
      setImageSrc(leftImg, '');
      setImageSrc(rightImg, '');
    } else {
      state.spreadIndex = 0;
      const coverUrl = card.dataset.firstPageUrl || pageUrl(1);
      setImageSrc(rightImg, coverUrl);
      setImageSrc(leftImg, '');
      setImageSrc(tabloidImg, '');
    }

    overlay.hidden = false;
    overlay.setAttribute('aria-hidden', 'false');
    // Force one frame so transitions take effect.
    requestAnimationFrame(() => {
      stage.style.transition = 'none';
      applyZoomTransform(state.cardOrigin);
      // Reflow then animate to identity.
      void stage.offsetWidth;
      overlay.classList.add('is-active');
      stage.style.transition = '';
      stage.style.transform = '';
      window.setTimeout(() => {
        if (!state.isTabloid) {
          animateCoverOpen();
        } else {
          state.isAnimating = false;
          preloadAround(1);
        }
      }, ZOOM_DURATION);
    });
  }

  function animateCoverOpen() {
    if (state.pageCount < 1) {
      // No pages — nothing to flip into.
      state.isAnimating = false;
      return;
    }

    const coverUrl = pageUrl(1);
    const pageTwoUrl = state.pageCount >= 2 ? pageUrl(2) : '';

    // Pre-set static spread underneath the flipper. Right page = page 2 so
    // it's visible the moment the flipper rotates past 90deg.
    setImageSrc(rightImg, pageTwoUrl);
    setImageSrc(leftImg, '');

    // Flipper carries the cover from the right half to the left half.
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
      // After the flip, the left page stays blank (back of cover).
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

  function flipForward() {
    if (state.isAnimating) return;
    if (state.spreadIndex >= getMaxSpread()) return;
    state.isAnimating = true;

    if (state.spreadIndex === 0) {
      animateCoverOpen();
      return;
    }

    const currentSpread = getSpreadPages(state.spreadIndex);
    const nextSpread = getSpreadPages(state.spreadIndex + 1);

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

  function flipBackward() {
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

  function tabloidFlip(direction) {
    if (state.isAnimating) return;
    const next = state.spreadIndex + direction;
    if (next < 1 || next > state.pageCount) return;
    state.isAnimating = true;

    book.classList.add(direction > 0 ? 'is-tabloid-flipping-up' : 'is-tabloid-flipping-down');

    window.setTimeout(() => {
      state.spreadIndex = next;
      setImageSrc(tabloidImg, pageUrl(next));
      // Force the new image into place without the trailing transform
      // (otherwise the swap looks like the new page is mid-animation).
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

  // First-spread preloading — kick off image fetches for every archive's
  // first two pages while the kiosk is idle on the carousel.
  function backgroundPreloadFirstSpreads() {
    const cards = root.querySelectorAll('[data-archive-card]');
    cards.forEach((card) => {
      const first = (card.dataset.firstPageUrl || '').trim();
      const second = (card.dataset.secondPageUrl || '').trim();
      [first, second].forEach((src) => {
        if (!src) return;
        const img = new Image();
        img.src = src;
      });
    });
  }

  if ('requestIdleCallback' in window) {
    window.requestIdleCallback(backgroundPreloadFirstSpreads, { timeout: 2000 });
  } else {
    window.setTimeout(backgroundPreloadFirstSpreads, 800);
  }
});
