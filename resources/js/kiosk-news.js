/*
 * Kiosk Latest News -- photo-post carousel.
 *
 * Two jobs:
 *
 *   1. The carousel. One square card per slide (templates/kiosk/news.html).
 *      Swiper's stylesheet is linked by hand from the vendored copy -- never
 *      `import 'swiper/css'` here, because Mix extracts JS-imported CSS to
 *      storage/compiled/js/<entry>.css, an unlinked path that silently shadows
 *      the real stylesheet. Every slide is the same square, so there is no
 *      autoHeight and no per-slide re-measuring.
 *
 *   2. Idle reset. Returns to the kiosk hub after 120s without a
 *      pointer/key/scroll event, but only when this page is the whole document.
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

  /* ── Carousel ───────────────────────────────────────────────── */

  var swiperEl = document.querySelector('[data-news-swiper]');
  var newsSwiper = null;

  // With one post (or the empty card) dots and arrows pointing at nothing read
  // as broken chrome on a public screen, so the navigation hides itself until
  // a second post exists.
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
      // taps stop hit-testing on a touchscreen.
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
    });
  }

  /* ── Idle reset ─────────────────────────────────────────────── */

  var lastActivity = Date.now();

  function markActive() {
    lastActivity = Date.now();
  }

  // Framed -- as the shell's content, or as its attract loop -- this timer is
  // not merely redundant, it is actively wrong: navigating to /kiosk would
  // load the entire kiosk shell INSIDE the frame. The shell runs the one
  // navigating idle timer for the whole kiosk, and partials/kiosk-frame.html
  // relays activity up to it.
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
