/*
 * Gears Archives menu — Swiper coverflow.
 *
 * Deterministic by design: cards arrive newest-first from the server and
 * every filter change lands on slide 0 (the newest match). No randomness.
 *
 * Contract with kiosk-archive-book.js (the reader bundle):
 *   - clicking the centered slide dispatches CustomEvent('archive:open')
 *     on document with { dataset, originRect } in detail;
 *   - the reader answers with 'archive:reader-open' / 'archive:reader-close'
 *     so this menu can hand the keyboard over while reading.
 *
 * NOTE: do not `import 'swiper/css'` here — laravel-mix extracts JS-imported
 * CSS to storage/compiled/js/<entry>.css, which nothing links. The bundle CSS
 * is vendored by webpack.mix.js to /assets/css/swiper-bundle.min.css instead.
 */

import Swiper from 'swiper';
import {
  EffectCoverflow,
  Navigation,
  Keyboard,
  A11y,
  Manipulation, // provides appendSlide/removeAllSlides used by applyFilter
} from 'swiper/modules';

document.addEventListener('DOMContentLoaded', () => {
  const root = document.querySelector('[data-archive-shell]');

  if (!root) {
    return;
  }

  const swiperEl = root.querySelector('[data-archive-swiper]');
  const wrapperEl = swiperEl ? swiperEl.querySelector('.swiper-wrapper') : null;
  const yearButtons = Array.from(root.querySelectorAll('[data-archive-year-button]'));
  const categoryButtons = Array.from(root.querySelectorAll('[data-archive-category-button]'));
  const titleEl = root.querySelector('[data-archive-title]');
  const typeEl = root.querySelector('[data-archive-type]');
  const yearEl = root.querySelector('[data-archive-published]');
  const headerYearEl = root.querySelector('[data-archive-year-label]');
  const countEl = root.querySelector('[data-archive-count]');

  // Master list survives filtering; Swiper's removeAllSlides only detaches.
  const masterSlides = wrapperEl ? Array.from(wrapperEl.children) : [];

  const selectedYearValue = parseInt((root.getAttribute('data-selected-year') || '').trim(), 10);
  let currentYear = Number.isFinite(selectedYearValue) ? selectedYearValue : null;
  let currentCategory = 'all';

  function matchesCategory(card, category) {
    if (category === 'all') {
      return true;
    }
    const cardType = (card.dataset.type || '').toLowerCase();
    if (category === 'tabloid')    return cardType.includes('tabloid');
    if (category === 'magazine')   return cardType.includes('magazine');
    if (category === 'newsletter') return cardType.includes('newsletter');
    if (category === 'folio') {
      return !cardType.includes('tabloid')
          && !cardType.includes('magazine')
          && !cardType.includes('newsletter');
    }
    return false;
  }

  function getCategoryCards(category = currentCategory) {
    return masterSlides.filter((card) => matchesCategory(card, category));
  }

  function getFilteredCards() {
    if (!Number.isFinite(currentYear)) {
      return [];
    }
    return masterSlides.filter((card) =>
      parseInt(card.dataset.year || '', 10) === currentYear &&
      matchesCategory(card, currentCategory)
    );
  }

  function setYearButtonState() {
    const availableYears = new Set(
      getCategoryCards()
        .map((card) => parseInt(card.dataset.year || '', 10))
        .filter((value) => Number.isFinite(value))
    );

    yearButtons.forEach((button) => {
      const buttonYear = parseInt(button.dataset.year || '', 10);
      const isActive = Number.isFinite(currentYear) && buttonYear === currentYear;
      button.classList.toggle('is-active', isActive);
      button.setAttribute('aria-pressed', String(isActive));
      button.disabled = !availableYears.has(buttonYear);
    });

    if (headerYearEl) {
      headerYearEl.textContent = Number.isFinite(currentYear) ? String(currentYear) : '—';
    }
  }

  function setCategoryButtonState() {
    categoryButtons.forEach((button) => {
      const category = (button.dataset.category || 'all').toLowerCase();
      const isActive = category === currentCategory;
      const hasAny = category === 'all'
        || masterSlides.some((card) => matchesCategory(card, category));
      button.classList.toggle('is-active', isActive);
      button.setAttribute('aria-pressed', String(isActive));
      button.disabled = !hasAny;
    });
  }

  function syncDetails() {
    const slides = swiper ? swiper.slides : [];
    const active = slides.length ? slides[swiper.activeIndex] : null;

    if (!active) {
      if (titleEl) titleEl.textContent = 'No archives available';
      if (typeEl) typeEl.textContent = '—';
      if (yearEl) yearEl.textContent = '—';
      if (countEl) countEl.textContent = '';
      return;
    }

    if (titleEl) titleEl.textContent = active.dataset.title || 'Untitled archive';
    if (typeEl) typeEl.textContent = active.dataset.type || 'Archive';
    if (yearEl) {
      yearEl.textContent = Number.isFinite(currentYear)
        ? `Published ${currentYear}`
        : 'Year not set';
    }
    if (countEl) {
      countEl.textContent = slides.length > 1
        ? `${swiper.activeIndex + 1} / ${slides.length}`
        : '';
    }
  }

  // ── Swiper ──────────────────────────────────────────────

  let swiper = null;

  if (swiperEl && masterSlides.length) {
    swiper = new Swiper(swiperEl, {
      modules: [EffectCoverflow, Navigation, Keyboard, A11y, Manipulation],
      effect: 'coverflow',
      coverflowEffect: {
        rotate: 24,
        stretch: 0,
        depth: 160,
        modifier: 1,
        // Swiper's slide shadows are CSS gradients — banned by brand rules.
        slideShadows: false,
      },
      centeredSlides: true,
      slidesPerView: 'auto',
      grabCursor: true,
      slideToClickedSlide: true,
      speed: 420,
      keyboard: { enabled: true },
      navigation: {
        prevEl: '[data-archive-prev]',
        nextEl: '[data-archive-next]',
        disabledClass: 'is-disabled',
      },
      watchSlidesProgress: true,
      observer: true,
      observeParents: true,
    });

    swiper.on('slideChange', syncDetails);

    // Center-slide click opens the reader; side clicks only center the
    // slide (slideToClickedSlide). Swiper's preventClicks already swallows
    // the synthetic click after a drag, so a swipe can never open a book.
    swiper.on('click', () => {
      const slide = swiper.clickedSlide;
      if (!slide || !slide.hasAttribute('data-archive-card')) {
        return;
      }
      if (swiper.clickedIndex !== swiper.activeIndex) {
        return;
      }
      document.dispatchEvent(new CustomEvent('archive:open', {
        detail: {
          dataset: { ...slide.dataset },
          originRect: slide.getBoundingClientRect(),
        },
      }));
    });
  }

  function applyFilter() {
    if (!swiper) {
      setYearButtonState();
      setCategoryButtonState();
      return;
    }

    const filtered = getFilteredCards();
    swiper.removeAllSlides();
    if (filtered.length) {
      swiper.appendSlide(filtered);
    }
    swiper.slideTo(0, 0); // newest match — deterministic
    swiper.update();

    swiperEl.classList.toggle('is-empty', !filtered.length);
    setYearButtonState();
    setCategoryButtonState();
    syncDetails();
  }

  function selectYear(year) {
    currentYear = year;
    applyFilter();
  }

  function selectCategory(category) {
    const normalized = (category || 'all').toLowerCase();
    if (normalized === currentCategory) {
      return;
    }

    currentCategory = normalized;

    const availableYears = getCategoryCards()
      .map((card) => parseInt(card.dataset.year || '', 10))
      .filter((value) => Number.isFinite(value));

    if (!availableYears.includes(currentYear) && availableYears.length) {
      currentYear = Math.max(...availableYears); // newest year with content
    }

    applyFilter();
  }

  yearButtons.forEach((button) => {
    button.addEventListener('click', () => {
      if (button.disabled) {
        return;
      }
      const year = parseInt(button.dataset.year || '', 10);
      if (Number.isFinite(year)) {
        selectYear(year);
      }
    });
  });

  categoryButtons.forEach((button) => {
    button.addEventListener('click', () => {
      if (!button.disabled) {
        selectCategory(button.dataset.category);
      }
    });
  });

  // Keyboard handoff while the reader is open.
  document.addEventListener('archive:reader-open', () => {
    if (swiper) swiper.keyboard.disable();
  });
  document.addEventListener('archive:reader-close', () => {
    if (swiper) swiper.keyboard.enable();
  });

  // ── Init ────────────────────────────────────────────────

  if (!Number.isFinite(currentYear) && yearButtons.length) {
    const fallbackYear = parseInt(yearButtons[0].dataset.year || '', 10);
    if (Number.isFinite(fallbackYear)) {
      currentYear = fallbackYear;
    }
  }

  applyFilter();

  // Prime the HTTP cache and Service Worker cache for archive covers so
  // subsequent opens are instant regardless of connection speed.
  function prefetchUrls(urls) {
    if (!urls.length) return;
    const queue = urls.slice();
    function next() {
      const url = queue.shift();
      if (!url) return;
      fetch(url, { priority: 'low', mode: 'no-cors', credentials: 'same-origin' })
        .catch(() => {})
        .finally(() => setTimeout(next, 80));
    }
    setTimeout(next, 600);
  }

  const coverUrls = masterSlides
    .map((card) => (card.dataset.coverUrl || '').trim())
    .filter(Boolean);

  prefetchUrls(coverUrls);

  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('/sw-archives.js', { scope: '/' })
      .then((reg) => {
        const sw = reg.installing || reg.waiting || reg.active;
        if (!sw) return;
        const sendPrecache = (worker) => {
          worker.postMessage({ type: 'PRECACHE', urls: coverUrls });
        };
        if (reg.installing) {
          reg.installing.addEventListener('statechange', (e) => {
            if (e.target.state === 'activated') sendPrecache(e.target);
          });
        } else {
          sendPrecache(sw);
        }
      })
      .catch(() => {});
  }
});
