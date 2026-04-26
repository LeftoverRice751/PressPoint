document.addEventListener('DOMContentLoaded', () => {
  const root = document.querySelector('[data-archive-shell]');

  if (!root) {
    return;
  }

  const track = root.querySelector('[data-archive-track]');
  const cards = Array.from(root.querySelectorAll('[data-archive-card]'));
  const yearButtons = Array.from(root.querySelectorAll('[data-archive-year-button]'));
  const prevButton = root.querySelector('[data-archive-prev]');
  const nextButton = root.querySelector('[data-archive-next]');
  const titleEl = root.querySelector('[data-archive-title]');
  const typeEl = root.querySelector('[data-archive-type]');
  const yearEl = root.querySelector('[data-archive-published]');
  const headerYearEl = root.querySelector('[data-archive-year-label]');
  const selectedYearValue = parseInt((root.getAttribute('data-selected-year') || '').trim(), 10);

  let currentYear = Number.isFinite(selectedYearValue)
    ? selectedYearValue
    : (yearButtons.length
      ? parseInt(yearButtons[Math.floor(Math.random() * yearButtons.length)].dataset.year || '', 10)
      : null);

  let currentIndex = 0;

  function getVisibleCards() {
    if (!Number.isFinite(currentYear)) {
      return [];
    }

    return cards.filter((card) => parseInt(card.dataset.year || '', 10) === currentYear);
  }

  function setYearButtonState() {
    yearButtons.forEach((button) => {
      const buttonYear = parseInt(button.dataset.year || '', 10);
      const isActive = Number.isFinite(currentYear) && buttonYear === currentYear;
      button.classList.toggle('is-active', isActive);
      button.setAttribute('aria-pressed', String(isActive));
    });

    if (headerYearEl) {
      headerYearEl.textContent = Number.isFinite(currentYear) ? String(currentYear) : '—';
    }
  }

  function setCardState(card, offset, isActive) {
    const absoluteOffset = Math.abs(offset);
    const hidden = absoluteOffset > 2;
    const xOffset = offset * 210;
    const scale = isActive ? 1 : absoluteOffset === 1 ? 0.78 : 0.62;
    const rotation = offset * -18;
    const opacity = hidden ? 0 : isActive ? 1 : 0.68;

    card.style.opacity = String(opacity);
    card.style.zIndex = String(100 - absoluteOffset);
    card.style.transform = `translate(-50%, -50%) translateX(${xOffset}px) scale(${scale}) rotateY(${rotation}deg)`;
    card.setAttribute('aria-hidden', String(hidden));
    card.classList.toggle('is-active', isActive);
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

    if (!visibleCards.length) {
      cards.forEach((card) => {
        card.style.opacity = '0';
        card.style.transform = 'translate(-50%, -50%) scale(0.55)';
        card.setAttribute('aria-hidden', 'true');
        card.classList.remove('is-active');
      });
      setYearButtonState();
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
        return;
      }

      setCardState(card, visibleIndex - currentIndex, visibleIndex === currentIndex);
    });

    setYearButtonState();
    updateDetails(activeCard);
  }

  function selectYear(year, shouldRandomizeIndex = true) {
    currentYear = year;
    const visibleCards = getVisibleCards();

    if (shouldRandomizeIndex && visibleCards.length) {
      currentIndex = Math.floor(Math.random() * visibleCards.length);
    } else {
      currentIndex = 0;
    }

    render();
  }

  function move(direction) {
    const visibleCards = getVisibleCards();

    if (!visibleCards.length) {
      return;
    }

    currentIndex = (currentIndex + direction + visibleCards.length) % visibleCards.length;
    render();
  }

  yearButtons.forEach((button) => {
    button.addEventListener('click', () => {
      const year = parseInt(button.dataset.year || '', 10);
      if (!Number.isFinite(year)) {
        return;
      }

      selectYear(year, true);
    });
  });

  if (prevButton) {
    prevButton.addEventListener('click', () => move(-1));
  }

  if (nextButton) {
    nextButton.addEventListener('click', () => move(1));
  }

  cards.forEach((card) => {
    card.addEventListener('click', () => {
      const visibleCards = getVisibleCards();
      const visibleIndex = visibleCards.indexOf(card);

      if (visibleIndex === -1) {
        return;
      }

      currentIndex = visibleIndex;
      render();
    });
  });

  if (!Number.isFinite(currentYear) && yearButtons.length) {
    const fallbackYear = parseInt(yearButtons[0].dataset.year || '', 10);
    if (Number.isFinite(fallbackYear)) {
      currentYear = fallbackYear;
    }
  }

  render();
});
