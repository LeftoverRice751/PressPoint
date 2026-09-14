/*
 * Live editor -> kiosk updates: the idle gate.
 *
 * welcome-screen.js receives {section, stamp} events on the public
 * "kiosk-content" Pusher channel (app/services/KioskBroadcast.py) and hands
 * them here. This file decides what to do with one; it touches no DOM, which
 * is why it is a factory taking its effects as arguments and why it has a
 * node test (tests/js/kiosk-live.test.mjs) and welcome-screen.js does the
 * wiring.
 *
 * The event is a signal, never content. Two rules follow:
 *
 *   1. Evict immediately, always. sw-kiosk.js serves the section documents and
 *      their media stale-while-revalidate, so a frame reload on its own would
 *      re-serve the stale entry and look like nothing happened. Eviction is
 *      invisible, so nothing is gained by deferring it, and it guarantees the
 *      visitor's next tap on that section is fresh even if no reload follows.
 *
 *   2. Reload conditionally. Unattended (attract screen showing): reload now.
 *      A visitor mid-read: remember the section as dirty and flush when the
 *      attract screen next appears, which is at most KIOSK_IDLE_TIMEOUT after
 *      their last touch. Nobody ever has the page pulled out from under them.
 *
 * Two frames exist and the attract one is the visible one. ATTRACT_SRC is the
 * news embed, so a latest-news event while the NEWSLETTER attract is showing
 * must also re-src that iframe -- that is what a passer-by is looking at. An
 * idle VIDEO is never disturbed; only the hidden content frame refreshes
 * behind it.
 *
 * The stamp is a server millisecond timestamp. An event not newer than the
 * last applied for its section is ignored. Bursts (a multi-step save emits
 * several events in a row, each with a distinct stamp) are collapsed by a
 * short per-section debounce on the reload -- not on the eviction.
 */
(function () {
  'use strict';

  var SECTIONS = ['latest-news', 'about-lspu', 'gears-archive'];
  var DEBOUNCE_MS = 750;

  function create(deps) {
    var setTimer = deps.setTimeout || window.setTimeout.bind(window);
    var clearTimer = deps.clearTimeout || window.clearTimeout.bind(window);

    var lastStamp = {};   // section -> last stamp applied
    var pending = {};     // section -> debounce timer id
    var dirty = {};       // section -> true, awaiting the next attract

    function safe(fn) {
      // A public terminal never shows plumbing failures. Every effect is
      // somebody else's code (the SW, the frame) and any of it can be absent.
      try { return fn(); } catch (_) { return undefined; }
    }

    function apply(section) {
      delete pending[section];
      if (!safe(deps.isAttract)) {
        dirty[section] = true;
        return;
      }
      if (section === 'latest-news' && safe(deps.attractMode) === 'newsletter') {
        safe(function () { deps.reloadAttract(); });
      }
      safe(function () { deps.reloadContent(section); });
    }

    function onEvent(payload) {
      if (!payload || typeof payload !== 'object') return;
      var section = payload.section;
      var stamp = payload.stamp;
      if (SECTIONS.indexOf(section) === -1) return;
      if (typeof stamp !== 'number' || !isFinite(stamp)) return;
      if (lastStamp[section] !== undefined && stamp <= lastStamp[section]) return;
      lastStamp[section] = stamp;

      safe(function () { deps.evict(section); });

      if (pending[section] !== undefined) clearTimer(pending[section]);
      pending[section] = setTimer(function () { apply(section); }, DEBOUNCE_MS);
    }

    function onAttract(opts) {
      var contentJustNavigated = !!(opts && opts.contentJustNavigated);
      var sections = Object.keys(dirty);
      dirty = {};
      // showNewsletterAttract() re-srcs the attract iframe on every attract,
      // and a reset of the content frame is itself a fresh fetch; after the
      // eviction both come from the network. So only a content frame that
      // was NOT just reset needs an explicit reload here.
      if (contentJustNavigated) return;
      sections.forEach(function (section) {
        safe(function () { deps.reloadContent(section); });
      });
    }

    return {
      onEvent: onEvent,
      onAttract: onAttract,
      dirty: function () { return Object.keys(dirty); },
    };
  }

  window.__kioskLiveCreate = create;
})();
