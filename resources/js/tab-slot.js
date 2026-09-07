/*
 * Per-tab sign-in slot.
 *
 * The server decides which account a request belongs to from a `u=<slot>`
 * selector (app/tab_slots.py). This keeps that selector attached to everything
 * this document does, so an editor tab and an admin tab in the same browser
 * stay independently signed in.
 *
 * Three jobs, all no-ops on slot 0 so the common single-login case pays
 * nothing and URLs stay clean:
 *   1. remember the slot in sessionStorage -- the one browser store that is
 *      genuinely per-tab -- and put `u=` back on the address bar if a link
 *      dropped it;
 *   2. stamp `u=` onto same-origin link clicks and form submissions;
 *   3. add an X-Tab-Slot header to same-origin fetch() calls, which is what
 *      keeps dashboard-live.js's 20s poll and every upload POST on this tab's
 *      identity without editing those files.
 */
(function () {
  'use strict';

  var STORAGE_KEY = 'gears.tabSlot';
  var PARAM = 'u';
  var HEADER = 'X-Tab-Slot';

  var root = document.querySelector('[data-dashboard-shell]');
  var slot = parseInt((root && root.getAttribute('data-tab-slot')) || '0', 10);
  if (isNaN(slot) || slot < 0) slot = 0;

  function stored() {
    try {
      var raw = window.sessionStorage.getItem(STORAGE_KEY);
      var n = raw === null ? NaN : parseInt(raw, 10);
      return isNaN(n) || n < 0 ? null : n;
    } catch (e) {
      // Private mode and blocked site data both throw on access, not on read.
      return null;
    }
  }

  var remembered = stored();

  // The page rendered on slot 0 but this tab remembers another one: a link
  // somewhere dropped the parameter. Put it back before anything else runs,
  // otherwise the tab silently adopts slot 0's account -- the exact failure
  // slots exist to prevent. Guarded on the parameter being absent so this can
  // never bounce in a loop.
  if (slot === 0 && remembered) {
    var here = new URL(window.location.href);
    if (!here.searchParams.has(PARAM)) {
      here.searchParams.set(PARAM, String(remembered));
      window.location.replace(here.toString());
      return;
    }
  }

  if (slot === 0) return;

  try {
    window.sessionStorage.setItem(STORAGE_KEY, String(slot));
  } catch (e) {
    /* Non-fatal: the URL is the source of truth, this is only the backup. */
  }

  var value = String(slot);

  function sameOrigin(url) {
    try {
      return new URL(url, window.location.href).origin === window.location.origin;
    } catch (e) {
      return false;
    }
  }

  function stamp(url) {
    var parsed = new URL(url, window.location.href);
    if (!parsed.searchParams.has(PARAM)) parsed.searchParams.set(PARAM, value);
    return parsed.toString();
  }

  // Keep the address bar honest: a redirect the server stamped already has it,
  // but a plain in-page navigation may not, and the address bar is what a
  // reload replays.
  var current = new URL(window.location.href);
  if (!current.searchParams.has(PARAM) && window.history.replaceState) {
    current.searchParams.set(PARAM, value);
    window.history.replaceState(window.history.state, '', current.toString());
  }

  document.addEventListener(
    'click',
    function (event) {
      if (event.defaultPrevented || event.button !== 0) return;
      if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;

      var anchor = event.target && event.target.closest ? event.target.closest('a[href]') : null;
      if (!anchor) return;

      var href = anchor.getAttribute('href');
      // Leave in-page anchors, downloads and non-http schemes alone.
      if (!href || href.charAt(0) === '#' || anchor.hasAttribute('download')) return;
      if (/^(mailto:|tel:|javascript:)/i.test(href)) return;
      if (!sameOrigin(href)) return;

      anchor.setAttribute('href', stamp(href));
    },
    true
  );

  document.addEventListener(
    'submit',
    function (event) {
      var form = event.target;
      if (!form || form.tagName !== 'FORM') return;

      var action = form.getAttribute('action') || window.location.href;
      if (!sameOrigin(action)) return;

      // The slot rides in the query string even on a POST: app/tab_slots.py
      // reads QUERY_STRING rather than request.input(), so that a form field
      // named "u" can never switch which account the request runs as.
      form.setAttribute('action', stamp(action));
    },
    true
  );

  var nativeFetch = window.fetch;
  if (typeof nativeFetch === 'function') {
    window.fetch = function (input, init) {
      var url = typeof input === 'string' ? input : input && input.url;
      if (!url || !sameOrigin(url)) return nativeFetch.apply(this, arguments);

      var options = init ? Object.assign({}, init) : {};
      var headers = new Headers(options.headers || (typeof input === 'object' && input.headers) || {});
      headers.set(HEADER, value);
      options.headers = headers;

      return nativeFetch.call(this, input, options);
    };
  }

  var open = window.XMLHttpRequest && window.XMLHttpRequest.prototype.open;
  if (open) {
    window.XMLHttpRequest.prototype.open = function (method, url) {
      var result = open.apply(this, arguments);
      if (sameOrigin(url)) {
        try {
          this.setRequestHeader(HEADER, value);
        } catch (e) {
          /* setRequestHeader before open() is impossible here; ignore. */
        }
      }
      return result;
    };
  }
})();
