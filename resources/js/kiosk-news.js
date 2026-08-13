/*
 * Kiosk Latest News — front-page behaviour.
 *
 * Two jobs, no dependencies:
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

(function () {
  'use strict';

  var IDLE_MS = 120000;
  var HUB_URL = '/kiosk';

  /* ── Reader overlay ─────────────────────────────────────────── */

  var copy    = document.querySelector('.feature-story__copy');
  var trigger = document.querySelector('[data-news-more]');
  var reader  = document.getElementById('news-reader');
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
    document.body.style.overflow = 'hidden';
    readerPart('body').scrollTop = 0;
    reader.querySelector('[data-reader-close]').focus();
  }

  function closeReader() {
    if (!reader || !isOpen) return;
    reader.hidden = true;
    isOpen = false;
    document.body.style.overflow = '';
    if (trigger) trigger.focus();
  }

  // Only clamp when the copy actually overflows — a short story should
  // read in full on the front page rather than hide behind a tap.
  //
  // A multi-column box reports scrollHeight === clientHeight even when
  // clipped (overflow runs into further columns, not downward), so the
  // usual scrollHeight test silently never fires. Measure the unclamped
  // height instead and compare it against the clamped one.
  function measure() {
    if (!copy || !trigger) return;

    copy.classList.remove('is-clamped');
    var natural = copy.getBoundingClientRect().height;

    copy.classList.add('is-clamped');
    var clamped = copy.getBoundingClientRect().height;

    if (natural > clamped + 8) {
      trigger.classList.add('is-visible');
    } else {
      copy.classList.remove('is-clamped');
      trigger.classList.remove('is-visible');
    }
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

  ['pointerdown', 'touchstart', 'touchmove', 'keydown', 'wheel', 'scroll'].forEach(function (evt) {
    window.addEventListener(evt, markActive, { passive: true });
  });

  setInterval(function () {
    if (Date.now() - lastActivity >= IDLE_MS) {
      window.location.href = HUB_URL;
    }
  }, 15000);
})();
