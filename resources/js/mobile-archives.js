/*
 * Gears Archives — phone selection surface.
 *
 * A skin, not a fork. The reading experience is kiosk-archive-book.js
 * unchanged; this file only decides WHICH archive gets opened and dispatches
 * the same CustomEvent('archive:open') the kiosk menu dispatches, with the
 * same { dataset, originRect } detail. If you change that payload, change it
 * in resources/js/kiosk-archives.js too or the two surfaces drift.
 *
 * Differences from the kiosk menu, all of them phone-driven:
 *   - no arrow buttons (a thumb swipes; arrows just eat screen height),
 *   - shallower coverflow so neighbouring covers only peek,
 *   - filters are scroll-snap chip rows, and the active chip is scrolled
 *     into view so a filter can never be selected off-screen,
 *   - cover prefetch and the offline service worker are gated on consent.
 *
 * NOTE: do not `import 'swiper/css'` here — laravel-mix extracts JS-imported
 * CSS to storage/compiled/js/<entry>.css, which nothing links. The bundle CSS
 * is vendored by webpack.mix.js to /assets/css/swiper-bundle.min.css instead.
 */

import Swiper from 'swiper';
import {
  EffectCoverflow,
  A11y,
  Manipulation, // provides appendSlide/removeAllSlides used by applyFilter
} from 'swiper/modules';

document.addEventListener('DOMContentLoaded', () => {
  const root = document.querySelector('[data-mobile-archive]');

  if (!root) {
    return;
  }

  const coverflowEl = root.querySelector('[data-archive-coverflow]');
  const swiperEl = root.querySelector('[data-archive-swiper]');
  const wrapperEl = swiperEl ? swiperEl.querySelector('.swiper-wrapper') : null;
  const yearButtons = Array.from(root.querySelectorAll('[data-archive-year-button]'));
  const categoryButtons = Array.from(root.querySelectorAll('[data-archive-category-button]'));
  const titleEl = root.querySelector('[data-archive-title]');
  const typeEl = root.querySelector('[data-archive-type]');
  const publishedEl = root.querySelector('[data-archive-published]');
  const countEl = root.querySelector('[data-archive-count]');

  // Master list survives filtering; Swiper's removeAllSlides only detaches.
  const masterSlides = wrapperEl ? Array.from(wrapperEl.children) : [];

  const selectedYearValue = parseInt((root.getAttribute('data-selected-year') || '').trim(), 10);
  let currentYear = Number.isFinite(selectedYearValue) ? selectedYearValue : null;
  let currentCategory = 'all';

  // ── Optional storage (gated on consent) ─────────────────

  const consent = window.PressPointConsent;
  const PREFS_KEY = 'presspoint.archives.prefs';

  function readPrefs() {
    if (!consent || !consent.hasOptional()) return null;
    try {
      return JSON.parse(window.localStorage.getItem(PREFS_KEY) || 'null');
    } catch (error) {
      return null;
    }
  }

  function writePrefs() {
    if (!consent || !consent.hasOptional()) return;
    try {
      window.localStorage.setItem(PREFS_KEY, JSON.stringify({
        year: currentYear,
        category: currentCategory,
      }));
    } catch (error) {
      /* quota or private mode — a lost preference is not worth an error */
    }
  }

  // ── Filtering (same rules as the kiosk menu) ────────────

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

  /* A chip row scrolls horizontally, so the active chip can sit off-screen
     after a filter change. Pull it back into view — but only along the row,
     never the page, or selecting a year would yank the carousel off-screen. */
  function revealChip(button) {
    if (!button || typeof button.scrollIntoView !== 'function') return;
    button.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'center' });
  }

  function setYearButtonState({ reveal = false } = {}) {
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
      if (isActive && reveal) {
        revealChip(button);
      }
    });
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
      if (publishedEl) publishedEl.textContent = '—';
      if (countEl) countEl.textContent = '';
      return;
    }

    if (titleEl) titleEl.textContent = active.dataset.title || 'Untitled archive';
    if (typeEl) typeEl.textContent = active.dataset.type || 'Archive';
    if (publishedEl) {
      publishedEl.textContent = Number.isFinite(currentYear)
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

  /*
   * Set by wireSideTaps() when it handles a tap. Swiper's own 'click' handler
   * runs AFTER our pointerup, and by then slideNext()/slidePrev() has already
   * moved activeIndex -- so its `clickedIndex === activeIndex` test can match
   * the slide we just navigated to and open the reader on a tap that was only
   * meant to advance. Observed doing exactly that on the second side tap.
   */
  let sideTapAt = 0;
  const SIDE_TAP_SUPPRESS = 500; // ms

  if (swiperEl && masterSlides.length) {
    swiper = new Swiper(swiperEl, {
      modules: [EffectCoverflow, A11y, Manipulation],
      effect: 'coverflow',
      coverflowEffect: {
        // Shallower than the kiosk's (rotate 24 / depth 160): on a ~390px
        // viewport the kiosk values throw the neighbours so far back they
        // read as clutter rather than as "there is more this way".
        rotate: 16,
        stretch: 0,
        depth: 110,
        modifier: 1,
        // Swiper's slide shadows are CSS gradients — banned by brand rules.
        slideShadows: false,
      },
      centeredSlides: true,
      slidesPerView: 'auto',
      grabCursor: true,
      slideToClickedSlide: true,
      speed: 380,
      threshold: 4,       // ignore thumb jitter, so a tap stays a tap
      resistanceRatio: 0.7,
      watchSlidesProgress: true,
      observer: true,
      observeParents: true,
    });

    swiper.on('slideChange', syncDetails);

    // Centre-slide tap opens the reader; a tap on a peeking neighbour only
    // centres it (slideToClickedSlide). Swiper's preventClicks already
    // swallows the synthetic click after a drag, so a swipe can never open
    // an issue by accident.
    swiper.on('click', () => {
      const slide = swiper.clickedSlide;
      if (!slide || !slide.hasAttribute('data-archive-card')) {
        return;
      }
      if (swiper.clickedIndex !== swiper.activeIndex) {
        return;
      }
      if (Date.now() - sideTapAt < SIDE_TAP_SUPPRESS) {
        return; // this click was a side tap; it navigated, it must not open
      }
      document.dispatchEvent(new CustomEvent('archive:open', {
        detail: {
          dataset: { ...slide.dataset },
          originRect: slide.getBoundingClientRect(),
        },
      }));
    });
  }

  /*
   * Tap a peeking cover to bring it to the centre.
   *
   * Swiper's own slideToClickedSlide cannot do this here. Coverflow applies a
   * 3D rotateY to the neighbours, and Chrome's hit-testing through a
   * preserve-3d subtree does not follow them: elementFromPoint over a visibly
   * peeking cover returns .swiper-wrapper, so the slide never sees the click.
   * The kiosk hides the problem behind its prev/next arrow buttons; this
   * surface has no room for them, so the side regions are made tappable
   * instead -- geometry off the ACTIVE slide, which is hit-testable, rather
   * than off the neighbours, which are not.
   *
   * Guarded by a movement/duration check so the tail of a swipe is never
   * mistaken for a tap.
   */
  function wireSideTaps() {
    if (!swiper || !coverflowEl) return;

    const TAP_SLOP = 8;    // px of travel still considered a tap
    const TAP_TIME = 400;  // ms held before it stops being a tap
    let startX = 0;
    let startY = 0;
    let startAt = 0;

    coverflowEl.addEventListener('pointerdown', (event) => {
      startX = event.clientX;
      startY = event.clientY;
      startAt = Date.now();
    }, { passive: true });

    coverflowEl.addEventListener('pointerup', (event) => {
      if (Math.abs(event.clientX - startX) > TAP_SLOP) return;
      if (Math.abs(event.clientY - startY) > TAP_SLOP) return;
      if (Date.now() - startAt > TAP_TIME) return;

      const active = swiper.slides[swiper.activeIndex];
      if (!active) return;

      const rect = active.getBoundingClientRect();
      // Inside the active cover: that is the reader's tap, handled by the
      // swiper 'click' listener above. Leave it alone.
      if (event.clientX >= rect.left && event.clientX <= rect.right) return;

      sideTapAt = Date.now();

      if (event.clientX < rect.left) {
        swiper.slidePrev();
      } else {
        swiper.slideNext();
      }
    }, { passive: true });
  }

  wireSideTaps();

  function applyFilter({ reveal = false } = {}) {
    if (!swiper) {
      setYearButtonState({ reveal });
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
    root.classList.toggle('is-empty', !filtered.length);
    setYearButtonState({ reveal });
    setCategoryButtonState();
    syncDetails();
    writePrefs();
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

    // The year row may have just changed which pill is active, and that pill
    // can be well off to the right — scroll it back under the thumb.
    applyFilter({ reveal: true });
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

  // While the reader is open the page behind it must not scroll — on iOS a
  // stray body scroll shows through the overlay as a jumping backdrop.
  document.addEventListener('archive:reader-open', () => {
    document.body.classList.add('is-reading');
  });
  document.addEventListener('archive:reader-close', () => {
    document.body.classList.remove('is-reading');
  });

  // ── Init ────────────────────────────────────────────────

  const prefs = readPrefs();

  if (prefs && typeof prefs.category === 'string') {
    const remembered = prefs.category.toLowerCase();
    // Only honour a remembered category that still has content — an archive
    // can be deleted between visits.
    if (remembered === 'all' || masterSlides.some((card) => matchesCategory(card, remembered))) {
      currentCategory = remembered;
    }
  }

  if (prefs && Number.isFinite(parseInt(prefs.year, 10))) {
    const rememberedYear = parseInt(prefs.year, 10);
    if (getCategoryCards().some((card) => parseInt(card.dataset.year || '', 10) === rememberedYear)) {
      currentYear = rememberedYear;
    }
  }

  if (!Number.isFinite(currentYear) && yearButtons.length) {
    const fallbackYear = parseInt(yearButtons[0].dataset.year || '', 10);
    if (Number.isFinite(fallbackYear)) {
      currentYear = fallbackYear;
    }
  }

  applyFilter({ reveal: true });

  // ── Optional: prefetch + offline cache ──────────────────
  // Both are real storage on the visitor's device, so both sit behind
  // consent. Under "Essential only" neither ever runs and the page still
  // works — it just refetches covers over the network each visit.

  const coverUrls = masterSlides
    .map((card) => (card.dataset.coverUrl || '').trim())
    .filter(Boolean);

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

  function enableOfflineArchives() {
    prefetchUrls(coverUrls);

    if (!('serviceWorker' in navigator)) return;

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

  if (consent) {
    // Fires now if consent is already on file, later if the visitor accepts,
    // never if they choose essential-only.
    consent.onGranted(enableOfflineArchives);
  }
});
