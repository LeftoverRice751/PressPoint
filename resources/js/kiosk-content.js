/*
 * Kiosk content frame — the carousel's other half.
 *
 * The carousel IS the kiosk's navigation. Moving it to a section renders that
 * section here immediately: no preview, no View button, no confirming tap, and
 * no "Kiosk menu" step to get back out. This module owns the frame that the
 * content renders into, and the browser history that mirrors it.
 *
 * It replaces kiosk-viewport.js, which modelled the older interaction —
 * warm/open/close, an is-open flag, a dismiss control. All of that was the
 * preview architecture; what survives from it is the teardown discipline
 * below, which is the part that actually matters on a terminal that runs for
 * weeks.
 *
 * ## Why a frame and not injected markup
 *
 * The six destinations stay their own documents. Rendering them inline would
 * be a rewrite of the CSS layer rather than a refactor: kiosk-tour.css sets
 * `* { user-select: none }` and `html, body { overflow: hidden; background:
 * var(--n-900) }`, org-board.css also claims `html, body { overflow: hidden }`
 * and sizes its deck against `.ob-page` being position:fixed, kiosk-map.js is
 * one DOMContentLoaded handler that silently never fires if injected later,
 * kiosk-tour.js calls startTour() at parse time with no disposal, and
 * [data-archive-shell] exists in BOTH archives.html and kiosk-tour.html while
 * kiosk-archive-book.js binds to it with a document-wide querySelector.
 *
 * A frame sidesteps all of that and hands us document teardown for free, which
 * is the single hardest thing to get right in an SPA.
 *
 * ## The URL contract
 *
 * Each section has two paths (app/services/KioskSections.py):
 *   path       what the visitor sees; history.pushState() writes it; serves
 *              the shell, so a deep link arrives with its section active.
 *   embed_path what THIS frame loads: the destination's own document.
 * They must differ, or the frame would load the shell inside the shell.
 */

(function () {
  'use strict';

  var host = document.querySelector('[data-kiosk-content]');
  var frame = host ? host.querySelector('[data-kiosk-frame]') : null;
  var config = document.getElementById('kiosk-config');

  // No host (an older cached shell, or a test harness rendering only the
  // carousel): stay undefined. welcome-screen.js feature-detects exactly this
  // and lets the cards navigate the old way, so the kiosk degrades to a
  // working six-link menu rather than a dead one.
  if (!host || !frame) return;

  /* ── The section table, read back off the carousel ───────────────────────
   *
   * Built from the rendered cards rather than duplicated here as a JS literal.
   * app/services/KioskSections.py is the single source; the cards already
   * carry every field as data-menu-*, so reading them back keeps Python and
   * JS from drifting the first time somebody adds a destination.
   */
  var sections = Array.prototype.map.call(
    document.querySelectorAll('.feature-card'),
    function (card) {
      return {
        id: card.getAttribute('data-menu-id') || '',
        title: card.getAttribute('data-menu-title') || '',
        path: card.getAttribute('href') || '',
        embed: card.getAttribute('data-menu-embed') || '',
      };
    }
  ).filter(function (s) { return s.id && s.path && s.embed; });

  if (!sections.length) return;

  function sectionById(id) {
    for (var i = 0; i < sections.length; i++) {
      if (sections[i].id === id) return sections[i];
    }
    return null;
  }

  function sectionByPath(path) {
    var cleaned = String(path || '').split('?')[0].split('#')[0].replace(/\/+$/, '');
    for (var i = 0; i < sections.length; i++) {
      if (sections[i].path.replace(/\/+$/, '') === cleaned) return sections[i];
    }
    return null;
  }

  function indexOf(id) {
    for (var i = 0; i < sections.length; i++) {
      if (sections[i].id === id) return i;
    }
    return -1;
  }

  // Whatever the server rendered the frame with. Never guessed from the frame's
  // src, which would be wrong the moment a section redirects.
  var currentId =
    (host.getAttribute('data-active-section') || '').trim() ||
    (config && config.getAttribute('data-active-section')) ||
    sections[0].id;

  var defaultId =
    (config && config.getAttribute('data-default-section')) || sections[0].id;

  /* ── Loading the frame ─────────────────────────────────────────────────── */

  function loadFrame(section) {
    /*
     * location.replace(), NOT frame.src = ...
     *
     * This is the difference between Back working and Back being useless, and
     * it is not obvious: a frame's navigations join the TOP-LEVEL session
     * history. Assigning src pushes an entry per frame load, so with a
     * separate about:blank unload step each section change added three entries
     * — one of ours and two of the frame's — and the visitor's first Back
     * merely reloaded the frame they were already looking at. Measured on the
     * real page: our own pushState fired exactly once while history.length
     * grew by 2.
     *
     * location.replace() navigates the frame without adding an entry, so the
     * only history writes left are the deliberate ones in show(). Same-origin
     * throughout, so contentWindow.location is always reachable.
     *
     * It also still tears the old document down. That matters more here than
     * it looks: kiosk-tour.js holds a Marzipano WebGL context and a tile pump
     * it never disposes, kiosk-map.js a Leaflet map, kiosk-archive-book.js a
     * pdf.js worker. A replace unloads the outgoing document synchronously,
     * exactly as assigning src did — this terminal runs for weeks, and a
     * visitor flicking through the carousel must not climb until the GPU
     * process is killed.
     *
     * The src ATTRIBUTE is deliberately not updated: writing it would itself
     * be a navigation, undoing the whole point. data-src mirrors the real
     * location for tests and DevTools, and costs nothing.
     */
    var navigated = false;
    try {
      if (frame.contentWindow && frame.contentWindow.location) {
        frame.contentWindow.location.replace(section.embed);
        navigated = true;
      }
    } catch (_) {
      // Should not happen — same-origin throughout — but a frame in a strange
      // state must not take the kiosk's navigation down with it.
    }

    if (!navigated) {
      // Last resort. Costs a spurious history entry, which is far better than
      // a content area that silently stops changing.
      frame.setAttribute('src', section.embed);
    }

    frame.setAttribute('data-src', section.embed);
    frame.setAttribute('title', section.title);
    host.setAttribute('data-active-section', section.id);
  }

  function markActiveCard(section) {
    Array.prototype.forEach.call(document.querySelectorAll('.feature-card'), function (card) {
      var active = card.getAttribute('data-menu-id') === section.id;
      card.classList.toggle('is-active', active);
      card.setAttribute('aria-current', active ? 'page' : 'false');
    });
  }

  /* ── show ──────────────────────────────────────────────────────────────── */

  /**
   * Render a section. The one entry point — every gesture, popstate and the
   * idle reset all come through here.
   *
   * @param {string|object} target   section id, or a section object
   * @param {object} [opts]
   * @param {boolean} [opts.push]    write a history entry (default true)
   * @returns {boolean}              false when the target is unknown
   */
  function show(target, opts) {
    var section = typeof target === 'string' ? sectionById(target) : target;
    if (!section) return false;

    var options = opts || {};
    var push = options.push !== false;

    // Already here. Still fix up the carousel and history, because this is
    // reachable from a popstate that lands on the section already displayed —
    // but never reload the frame, which would throw away a live map or tour
    // for no reason.
    if (section.id !== currentId) {
      loadFrame(section);
      currentId = section.id;
    }

    markActiveCard(section);
    document.title = section.title + ' · Press Point';

    if (push && window.location.pathname !== section.path) {
      try {
        window.history.pushState({ kioskSection: section.id }, '', section.path);
      } catch (_) {
        // Degrade to a kiosk whose URL simply doesn't track the section. The
        // content is still correct, which is what the visitor sees.
      }
    }

    emit('kiosk-content:change', { section: section.id, index: indexOf(section.id) });
    return true;
  }

  function emit(type, detail) {
    try {
      document.dispatchEvent(new CustomEvent(type, { detail: detail || {} }));
    } catch (_) {
      /* CustomEvent is universally available on this hardware. */
    }
  }

  /* ── History ───────────────────────────────────────────────────────────── */

  // Normalise the entry we booted on, so the very first Back has somewhere
  // sensible to go and so /kiosk (which has no section of its own) is recorded
  // as the section it actually resolved to. replaceState, not pushState: this
  // is the same page the visitor already arrived at, not a new one.
  (function normaliseInitialEntry() {
    var section = sectionById(currentId);
    if (!section) return;
    try {
      window.history.replaceState({ kioskSection: section.id }, '', section.path);
    } catch (_) {
      /* ignore */
    }
  })();

  window.addEventListener('popstate', function (event) {
    // Prefer the state we wrote; fall back to parsing the path, which is what
    // happens when the entry predates this script or was written by something
    // else. Unknown paths land on the default rather than doing nothing — a
    // Back that visibly does nothing reads as a broken kiosk.
    var id = event.state && event.state.kioskSection;
    var section = (id && sectionById(id)) || sectionByPath(window.location.pathname);

    // push:false is the whole point — the browser has already moved the
    // history cursor, and pushing here would append a duplicate entry and make
    // Back walk in place.
    show(section || sectionById(defaultId), { push: false });
  });

  /* ── Messages from the framed page ─────────────────────────────────────── */

  window.addEventListener('message', function (ev) {
    if (ev.origin !== window.location.origin) return;

    var data = ev.data;
    if (!data || data.source !== 'kiosk-frame') return;

    // Only OUR frame. The attract overlay is a same-origin frame of this same
    // document, so an origin check alone would let the decorative newsletter
    // drive the shell.
    if (!frame.contentWindow || ev.source !== frame.contentWindow) return;

    if (data.type === 'activity') {
      // A touch inside the frame never reaches this document's listeners, so
      // without this relay the shell would drop its attract screen over
      // somebody actively reading the news or dragging the map.
      emit('kiosk-content:activity', {});
    }
  });

  /*
   * Re-fetch the frame in place, for a live update (welcome-screen.js via
   * kiosk-live.js). Only when `id` is the section on screen: any other
   * section is served fresh on its next visit anyway, because the shell
   * evicted it from the service worker cache before asking for this.
   *
   * location.reload(), like the replace() in loadFrame(), adds no history
   * entry -- writing src would.
   */
  function reload(id) {
    if (id !== currentId) return false;
    try {
      if (frame.contentWindow && frame.contentWindow.location) {
        frame.contentWindow.location.reload();
        return true;
      }
    } catch (_) {
      // Same-origin throughout; a frame in a strange state must not take
      // the kiosk down.
    }
    return false;
  }

  window.__kioskContent = {
    show: show,
    sections: function () { return sections.slice(); },
    current: function () { return currentId; },
    defaultId: function () { return defaultId; },
    reload: reload,
    indexOf: indexOf,
  };
})();
