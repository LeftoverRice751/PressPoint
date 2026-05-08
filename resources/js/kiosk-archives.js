document.addEventListener('DOMContentLoaded', () => {
  const root = document.querySelector('[data-archive-shell]');

  if (!root) {
    return;
  }

  const track = root.querySelector('[data-archive-track]');
  const cards = Array.from(root.querySelectorAll('[data-archive-card]'));
  const yearButtons = Array.from(root.querySelectorAll('[data-archive-year-button]'));
  const categoryButtons = Array.from(root.querySelectorAll('[data-archive-category-button]'));
  const titleEl = root.querySelector('[data-archive-title]');
  const typeEl = root.querySelector('[data-archive-type]');
  const yearEl = root.querySelector('[data-archive-published]');
  const headerYearEl = root.querySelector('[data-archive-year-label]');
  const selectedYearValue = parseInt((root.getAttribute('data-selected-year') || '').trim(), 10);
  const swipeThreshold = 48;
  const swipeLockDuration = 360;

  let currentYear = Number.isFinite(selectedYearValue)
    ? selectedYearValue
    : (yearButtons.length
      ? parseInt(yearButtons[Math.floor(Math.random() * yearButtons.length)].dataset.year || '', 10)
      : null);

  let currentCategory = 'all';
  let currentIndex = 0;
  let activeFlipIndex = null;
  let swipeState = null;
  let interactionLockedUntil = 0;
  let unlockTimer = null;
  let suppressClicksUntil = 0;
  let flipTimer = null;

  function isInteractionLocked() {
    return Date.now() < interactionLockedUntil;
  }

  function lockInteraction(duration = swipeLockDuration) {
    interactionLockedUntil = Date.now() + duration;

    if (unlockTimer) {
      window.clearTimeout(unlockTimer);
    }

    unlockTimer = window.setTimeout(() => {
      interactionLockedUntil = 0;
      unlockTimer = null;
    }, duration);
  }

  function suppressNextClicks(duration = swipeLockDuration) {
    suppressClicksUntil = Date.now() + duration;
  }

  function shouldIgnoreTap() {
    return Date.now() < suppressClicksUntil;
  }

  function clearFlipTimer() {
    if (flipTimer) {
      window.clearTimeout(flipTimer);
      flipTimer = null;
    }
  }

  function loadPageTwoFrame(card) {
    if (!card) {
      return;
    }

    const pageTwoFrame = card.querySelector('[data-archive-page-two]');
    if (!pageTwoFrame || pageTwoFrame.getAttribute('src')) {
      return;
    }

    const pageTwoSrc = (pageTwoFrame.dataset.pageTwoSrc || '').trim();
    if (pageTwoSrc) {
      pageTwoFrame.setAttribute('src', pageTwoSrc);
    }
  }

  function matchesCategory(card, category) {
    if (category === 'all') {
      return true;
    }
    const isTabloid = (card.dataset.isTabloid || '').trim() === '1';
    if (category === 'tabloid') {
      return isTabloid;
    }
    if (category === 'folio') {
      return !isTabloid;
    }
    return true;
  }

  function getCategoryCards(category = currentCategory) {
    return cards.filter((card) => matchesCategory(card, category));
  }

  function getVisibleCards() {
    if (!Number.isFinite(currentYear)) {
      return [];
    }

    return cards.filter((card) =>
      parseInt(card.dataset.year || '', 10) === currentYear &&
      matchesCategory(card, currentCategory)
    );
  }

  function setYearButtonState() {
    const categoryCards = getCategoryCards();
    const availableYears = new Set(
      categoryCards
        .map((card) => parseInt(card.dataset.year || '', 10))
        .filter((value) => Number.isFinite(value))
    );

    yearButtons.forEach((button) => {
      const buttonYear = parseInt(button.dataset.year || '', 10);
      const isActive = Number.isFinite(currentYear) && buttonYear === currentYear;
      const isAvailable = availableYears.has(buttonYear);
      button.classList.toggle('is-active', isActive);
      button.setAttribute('aria-pressed', String(isActive));
      button.disabled = !isAvailable;
    });

    if (headerYearEl) {
      headerYearEl.textContent = Number.isFinite(currentYear) ? String(currentYear) : '—';
    }
  }

  function setCategoryButtonState() {
    categoryButtons.forEach((button) => {
      const category = (button.dataset.category || 'all').toLowerCase();
      const isActive = category === currentCategory;
      const hasAny = category === 'all' || cards.some((card) => matchesCategory(card, category));
      button.classList.toggle('is-active', isActive);
      button.setAttribute('aria-pressed', String(isActive));
      button.disabled = !hasAny;
    });
  }

  function setCardState(card, offset, isActive, swipeOffset, swipeProgress) {
    const absoluteOffset = Math.abs(offset);
    const hidden = absoluteOffset > 2;
    const xOffset = offset * 210 + swipeOffset;
    const scale = isActive ? 1.08 : absoluteOffset === 1 ? 0.78 : 0.62;
    const rotation = isActive ? swipeOffset / 22 : offset * -18 + swipeOffset / 28;
    const opacity = hidden ? 0 : isActive ? 1 : 0.68;

    card.style.opacity = String(opacity);
    card.style.zIndex = String(100 - absoluteOffset);
    card.style.transform = `translate(-50%, -50%) translateX(${xOffset}px) scale(${scale}) rotateY(${rotation}deg)`;
    card.setAttribute('aria-hidden', String(hidden));
    card.classList.toggle('is-active', isActive);
    card.classList.toggle('is-focused', isActive);
    card.classList.toggle('is-flipped', isActive && activeFlipIndex === parseInt(card.dataset.index || '', 10));
    card.style.setProperty('--archive-swipe-progress', String(swipeProgress));
  }

  function queueFlip(activeCardIndex) {
    clearFlipTimer();

    if (!Number.isFinite(activeCardIndex)) {
      return;
    }

    flipTimer = window.setTimeout(() => {
      activeFlipIndex = activeCardIndex;
      render();
      flipTimer = null;
    }, swipeLockDuration);
  }

  function updateDetails(activeCard) {
    if (!activeCard) {
      if (titleEl) {
        titleEl.textContent = 'No archives available';
      }
      if (typeEl) {
        typeEl.textContent = 'Upload a PDF archive from the editor dashboard';
      }
      if (yearEl) {
        yearEl.textContent = '—';
      }
      return;
    }

    const title = activeCard.dataset.title || 'Untitled archive';
    const type = activeCard.dataset.type || 'Archive';

    if (titleEl) {
      titleEl.textContent = title;
    }

    if (typeEl) {
      typeEl.textContent = `${type} publication`;
    }

    if (yearEl) {
      yearEl.textContent = Number.isFinite(currentYear) ? `Published ${currentYear}` : 'Year not set';
    }
  }

  function render() {
    const visibleCards = getVisibleCards();
    const swipeOffset = swipeState ? swipeState.dragX : 0;
    const swipeProgress = swipeState ? Math.min(1, Math.abs(swipeOffset) / 220) : 0;

    if (!visibleCards.length) {
      cards.forEach((card) => {
        card.style.opacity = '0';
        card.style.transform = 'translate(-50%, -50%) scale(0.55)';
        card.setAttribute('aria-hidden', 'true');
        card.classList.remove('is-active');
        card.classList.remove('is-focused');
        card.classList.remove('is-flipped');
      });
      setYearButtonState();
      setCategoryButtonState();
      updateDetails(null);
      return;
    }

    if (currentIndex >= visibleCards.length) {
      currentIndex = 0;
    }

    const activeCard = visibleCards[currentIndex];

    cards.forEach((card) => {
      const visibleIndex = visibleCards.indexOf(card);
      if (visibleIndex === -1) {
        card.style.opacity = '0';
        card.style.transform = 'translate(-50%, -50%) scale(0.55)';
        card.setAttribute('aria-hidden', 'true');
        card.classList.remove('is-active');
        card.classList.remove('is-focused');
        card.classList.remove('is-flipped');
        return;
      }

      setCardState(card, visibleIndex - currentIndex, visibleIndex === currentIndex, swipeOffset, swipeProgress);
    });

    setYearButtonState();
    setCategoryButtonState();
    updateDetails(activeCard);
    if (activeCard && activeFlipIndex === parseInt(activeCard.dataset.index || '', 10)) {
      loadPageTwoFrame(activeCard);
    }
  }

  function selectCategory(category) {
    const normalized = (category || 'all').toLowerCase();
    if (normalized === currentCategory) {
      return;
    }

    currentCategory = normalized;
    activeFlipIndex = null;
    clearFlipTimer();

    const categoryCards = getCategoryCards();
    const availableYears = Array.from(
      new Set(
        categoryCards
          .map((card) => parseInt(card.dataset.year || '', 10))
          .filter((value) => Number.isFinite(value))
      )
    ).sort((a, b) => b - a);

    if (!availableYears.includes(currentYear) && availableYears.length) {
      currentYear = availableYears[0];
    }

    const visibleCards = getVisibleCards();
    currentIndex = visibleCards.length
      ? Math.floor(Math.random() * visibleCards.length)
      : 0;

    render();
  }

  function selectYear(year, shouldRandomizeIndex = true) {
    currentYear = year;
    activeFlipIndex = null;
    clearFlipTimer();
    const visibleCards = getVisibleCards();

    if (shouldRandomizeIndex && visibleCards.length) {
      currentIndex = Math.floor(Math.random() * visibleCards.length);
    } else {
      currentIndex = 0;
    }

    render();
  }

  function move(direction, options = {}) {
    const visibleCards = getVisibleCards();

    if (isInteractionLocked() || !visibleCards.length) {
      return;
    }

    activeFlipIndex = null;
    clearFlipTimer();
    if (options.source === 'swipe') {
      lockInteraction();
      suppressNextClicks();
    }

    currentIndex = (currentIndex + direction + visibleCards.length) % visibleCards.length;
    render();

    if (options.source === 'swipe') {
      return;
    }
  }

  yearButtons.forEach((button) => {
    button.addEventListener('click', () => {
      if (shouldIgnoreTap() || isInteractionLocked() || button.disabled) {
        return;
      }

      const year = parseInt(button.dataset.year || '', 10);
      if (!Number.isFinite(year)) {
        return;
      }

      selectYear(year, true);
    });
  });

  categoryButtons.forEach((button) => {
    button.addEventListener('click', () => {
      if (shouldIgnoreTap() || isInteractionLocked() || button.disabled) {
        return;
      }

      const category = (button.dataset.category || 'all').toLowerCase();
      selectCategory(category);
    });
  });

  cards.forEach((card) => {
    card.addEventListener('click', () => {
      if (shouldIgnoreTap() || isInteractionLocked()) {
        return;
      }

      const visibleCards = getVisibleCards();
      const visibleIndex = visibleCards.indexOf(card);

      if (visibleIndex === -1) {
        return;
      }

      clearFlipTimer();
      currentIndex = visibleIndex;
      activeFlipIndex = null;
      render();

      const hasPageTwo = (card.dataset.fileUrl || '').trim();
      if (hasPageTwo) {
        queueFlip(visibleIndex);
      }
    });
  });

  if (track) {
    track.style.touchAction = 'none';

    track.addEventListener('pointerdown', (event) => {
      if (event.pointerType !== 'touch' && event.pointerType !== 'pen') {
        return;
      }

      if (isInteractionLocked()) {
        return;
      }

      swipeState = {
        pointerId: event.pointerId,
        startX: event.clientX,
        startY: event.clientY,
        dragX: 0,
      };

      if (track.setPointerCapture) {
        try {
          track.setPointerCapture(event.pointerId);
        } catch (error) {
          // Ignore pointer capture failures on unsupported touch stacks.
        }
      }
    });

    track.addEventListener('pointermove', (event) => {
      if (!swipeState || event.pointerId !== swipeState.pointerId) {
        return;
      }

      const deltaX = event.clientX - swipeState.startX;
      const deltaY = event.clientY - swipeState.startY;

      if (Math.abs(deltaX) > Math.abs(deltaY)) {
        event.preventDefault();
        swipeState.dragX = deltaX;
        render();
      }
    }, { passive: false });

    function finishSwipe(event) {
      if (!swipeState || event.pointerId !== swipeState.pointerId) {
        return;
      }

      const deltaX = event.clientX - swipeState.startX;
      const deltaY = event.clientY - swipeState.startY;
      const wasHorizontalSwipe = Math.abs(deltaX) >= swipeThreshold && Math.abs(deltaX) > Math.abs(deltaY);
      const pointerId = swipeState.pointerId;
      const swipeDirection = deltaX < 0 ? 1 : -1;

      swipeState = null;

      if (track.releasePointerCapture) {
        try {
          track.releasePointerCapture(pointerId);
        } catch (error) {
          // Ignore release failures when the pointer capture is already gone.
        }
      }

      if (!wasHorizontalSwipe || isInteractionLocked()) {
        render();
        return;
      }

      move(swipeDirection, { source: 'swipe' });
    }

    track.addEventListener('pointerup', finishSwipe);
    track.addEventListener('pointercancel', () => {
      swipeState = null;
      render();
    });
  }

  if (!Number.isFinite(currentYear) && yearButtons.length) {
    const fallbackYear = parseInt(yearButtons[0].dataset.year || '', 10);
    if (Number.isFinite(fallbackYear)) {
      currentYear = fallbackYear;
    }
  }

  render();
});
