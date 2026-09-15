/*
 * Kiosk Latest News — front-page behaviour.
 *
 * Three jobs:
 *
 *   0. The story carousel. Slide 1 is the broadsheet the composer arranges;
 *      slides 2..N are the remaining approved stories, one each. Swiper's
 *      stylesheet is linked by hand in templates/kiosk/news.html from the
 *      vendored copy — never `import 'swiper/css'` here, because Mix extracts
 *      JS-imported CSS to storage/compiled/js/<entry>.css, an unlinked path
 *      that silently shadows the real stylesheet.
 *
 *   1. Reader overlay. The lead story's body is clamped to a readable
 *      block on the front page so the rest of the issue stays above the
 *      fold. If it overflows, "Continue reading" opens the full text at
 *      reader type. This is the only tap target on the page, so it also
 *      gives the kiosk something to respond to.
 *
 *   2. Idle reset. The old inline script reloaded after 30s without a
 *      pointer/key event — but reading IS inactivity, so a standing
 *      reader had the page yanked out from under them mid-story. Scroll
 *      now counts as activity, the window is 120s, and idle returns to
 *      the kiosk hub instead of reloading in place.
 */

import Swiper from 'swiper';
import { Navigation, Pagination, Keyboard, A11y } from 'swiper/modules';

(function () {
  'use strict';

  var IDLE_MS = 120000;
  var HUB_URL = '/kiosk';
  // Framed at all -- by the kiosk shell's content frame, or by its attract
  // overlay. Same-origin, so no try/catch is needed around window.top.
  var isFramed = window.top !== window.self;
  // How many lines of the lead story the front page shows before "Continue
  // reading". Pairs with `.feature-story__copy.is-clamped`'s max-height in
  // kiosk-news.css, which is the no-JS fallback — change both together.
  var CLAMP_LINES = 9;

  /* ── Reader overlay ─────────────────────────────────────────── */

  var copy    = document.querySelector('.feature-story__copy');
  var trigger = document.querySelector('[data-news-more]');
  var reader  = document.getElementById('news-reader');

  // Re-size the carousel wrapper to the ACTIVE slide. `var newsSwiper` below
  // is hoisted, so this is safe to call from measure() before the carousel
  // is built -- it is simply a no-op until then.
  function refitCarousel() {
    if (newsSwiper && typeof newsSwiper.updateAutoHeight === 'function') {
      newsSwiper.updateAutoHeight();
    }
  }
  var isOpen  = false;

  function readerPart(name) {
    return reader ? reader.querySelector('[data-reader-' + name + ']') : null;
  }

  function openReader() {
    if (!reader || !copy) return;

    var story  = copy.closest('.feature-story');
    var kicker = story && story.querySelector('.feature-story__kicker');
    var title  = story && story.querySelector('.feature-story__title');
    var meta   = story && story.querySelector('.feature-story__meta');

    if (kicker) readerPart('kicker').textContent = kicker.textContent;
    if (title)  readerPart('title').textContent  = title.textContent;
    if (meta)   readerPart('meta').textContent   = meta.textContent;
    readerPart('body').innerHTML = copy.innerHTML;

    reader.hidden = false;
    isOpen = true;
    // The overlay sits above the carousel, which still owns horizontal drags.
    setCarouselInteractive(false);
    document.body.style.overflow = 'hidden';
    readerPart('body').scrollTop = 0;
    reader.querySelector('[data-reader-close]').focus();
  }

  function closeReader() {
    if (!reader || !isOpen) return;
    reader.hidden = true;
    isOpen = false;
    setCarouselInteractive(true);
    document.body.style.overflow = '';
    if (trigger) trigger.focus();
  }

  // Only clamp when the copy actually overflows — a short story should
  // read in full on the front page rather than hide behind a tap.
  //
  // Measures the unclamped height against the clamped one rather than
  // testing scrollHeight > clientHeight. This started as a workaround for
  // the old two-column body (a multi-column box reports scrollHeight ===
  // clientHeight even when clipped, because overflow runs into further
  // columns instead of downward). The body is a single column now, so the
  // scrollHeight test would work — but this one is equally correct and
  // already proven, so it stays.
  // Where to cut so the last visible line is a WHOLE line.
  //
  // A plain `max-height: 9 lines` only lands on a line boundary if every
  // line in the block sits on the line-height grid, and none of them do:
  // paragraphs carry their own margins, and a Quill body can also hold
  // headings and blockquotes with line-heights of their own. The result was
  // a tenth row of glyphs sliced through the middle. So measure the real
  // line boxes and cut at the bottom of the last one that fits inside the
  // budget. Returns 0 when there is nothing to measure, meaning "leave the
  // CSS max-height alone".
  function wholeLineCut(budget) {
    var top = copy.getBoundingClientRect().top;
    var limit = top + budget;
    var range = document.createRange();
    range.selectNodeContents(copy);
    var cut = 0;
    Array.prototype.forEach.call(range.getClientRects(), function (rect) {
      var bottom = rect.bottom - top;
      if (rect.bottom <= limit && bottom > cut) cut = bottom;
    });
    return cut;
  }

  function measure() {
    if (!copy || !trigger) return;

    copy.classList.remove('is-clamped');
    copy.style.maxHeight = '';
    var natural = copy.getBoundingClientRect().height;

    // Derived, not read back off the clamped element: with `is-clamped` on,
    // a SHORT body reports its own height rather than the cap, so reading
    // the rect there would compare `natural` against itself and the trigger
    // would never appear.
    var lineHeight = parseFloat(window.getComputedStyle(copy).lineHeight) || 0;
    var budget = lineHeight * CLAMP_LINES;

    if (!budget || natural <= budget + 8) {
      trigger.classList.remove('is-visible');
      refitCarousel();
      return;
    }

    var cut = wholeLineCut(budget);
    copy.classList.add('is-clamped');
    if (cut > 0) copy.style.maxHeight = cut + 'px';
    trigger.classList.add('is-visible');
    // The clamp just changed the lead slide's height under a wrapper that
    // was sized before it ran.
    refitCarousel();
  }

  if (copy && trigger && reader) {
    // Images change the column flow, so re-measure once they've settled.
    measure();
    window.addEventListener('load', measure);
    window.addEventListener('resize', measure);

    trigger.addEventListener('click', openReader);
    reader.querySelector('[data-reader-close]').addEventListener('click', closeReader);
    document.addEventListener('keydown', function (event) {
      if (event.key === 'Escape') closeReader();
    });
  }

  /* ── Story carousel ─────────────────────────────────────────── */

  var swiperEl = document.querySelector('[data-news-swiper]');
  var newsSwiper = null;

  // A slide is a complete ISSUE. With one issue published there is one slide,
  // and dots plus arrows pointing at nothing read as broken chrome on a public
  // screen -- so the navigation hides itself until a second issue exists, and
  // then appears on its own with no change here.
  var slideCount = swiperEl ? swiperEl.querySelectorAll('.swiper-slide').length : 0;
  var navEl = document.querySelector('.news-swiper__nav');
  var pagerEl = document.querySelector('[data-news-pagination]');
  if (slideCount < 2) {
    if (navEl) navEl.hidden = true;
    if (pagerEl) pagerEl.hidden = true;
  }

  if (swiperEl && slideCount) {
    newsSwiper = new Swiper(swiperEl, {
      // No EffectCoverflow, matching welcome-screen.js: coverflow's
      // translateZ pushes the peeking slides behind .swiper-wrapper, so side
      // taps stop hit-testing on a touchscreen. A flat slide is also the
      // right register for a broadsheet.
      modules: [Navigation, Pagination, Keyboard, A11y],
      // 'auto' + a CSS-sized .swiper-slide is the house pattern; never a
      // numeric slidesPerView.
      slidesPerView: 'auto',
      centeredSlides: true,
      speed: 420,
      grabCursor: true,
      keyboard: { enabled: true },
      navigation: {
        prevEl: '[data-news-prev]',
        nextEl: '[data-news-next]',
        disabledClass: 'is-disabled',
      },
      pagination: {
        el: '[data-news-pagination]',
        clickable: true,
      },
      watchSlidesProgress: true,
      // Slides are whole issues and differ wildly in height (a quote-heavy
      // one ran to ~2000px next to an ~800px one). .swiper-wrapper is a flex
      // row, so without this it is as tall as the TALLEST slide and the
      // static pagination under it sat 1,200px below the bottom of a short
      // issue -- the page ended mid-screen with no dots or arrows in sight.
      autoHeight: true,
    });

    // Swiper 14 re-measures autoHeight on slide change and on update(), but
    // not when an <img> inside a slide finishes loading -- and an issue is
    // mostly photographs, so the wrapper sized at init is too short until
    // they land. 'load' does not bubble; capture on the carousel root.
    swiperEl.addEventListener('load', function (event) {
      if (event.target && event.target.tagName === 'IMG') refitCarousel();
    }, true);

    // The lead's clamp is measured against a laid-out element. On first paint
    // only slide 1 is on screen, so a later slide measured while off-screen
    // would compute a nonsense height — re-measure whenever the broadsheet
    // comes back into view.
    newsSwiper.on('slideChange', function () {
      if (newsSwiper.activeIndex === 0) measure();
    });
  }

  // Swiper owns horizontal drags on the whole page, including inside the
  // reader overlay that sits above it — so a reader trying to select or drag
  // text would swipe the story out from under themselves. Freeze the
  // carousel while the overlay is open.
  function setCarouselInteractive(enabled) {
    if (!newsSwiper) return;
    newsSwiper.allowTouchMove = enabled;
  }

  /* ── Scroll hint ────────────────────────────────────────────── */

  // The stripe's hint promises more content below; drop it once there
  // isn't any, so it never tells the reader something untrue.
  var hint = document.querySelector('.news-back__hint');

  function syncHint() {
    if (!hint) return;
    var atEnd = window.innerHeight + window.scrollY >= document.body.scrollHeight - 8;
    hint.style.visibility = atEnd ? 'hidden' : 'visible';
  }

  syncHint();
  window.addEventListener('scroll', syncHint, { passive: true });
  window.addEventListener('resize', syncHint);

  /* ── Idle reset ─────────────────────────────────────────────── */

  var lastActivity = Date.now();

  function markActive() {
    lastActivity = Date.now();
  }

  // Only when this page is the whole document.
  //
  // Framed -- as the shell's content, or as its attract loop -- this timer is
  // not merely redundant, it is actively wrong: navigating to /kiosk would
  // load the entire kiosk shell INSIDE the frame, nesting the terminal in its
  // own content area. The shell runs the one navigating idle timer for the
  // whole kiosk now, and partials/kiosk-frame.html relays activity up to it so
  // it can tell a visitor reading an article from an abandoned terminal.
  //
  // The reader overlay stays wired up either way -- in the attract frame it is
  // unreachable behind pointer-events:none, and in the content frame it is
  // exactly what a reader wants.
  if (!isFramed) {
    ['pointerdown', 'touchstart', 'touchmove', 'keydown', 'wheel', 'scroll'].forEach(
      function (evt) {
        window.addEventListener(evt, markActive, { passive: true });
      }
    );

    setInterval(function () {
      if (Date.now() - lastActivity < IDLE_MS) return;
      window.location.href = HUB_URL;
    }, 15000);
  }
})();
