/*
 * Storage consent gate.
 *
 * Exposes a tiny global (window.PressPointConsent) that other page scripts
 * ask before touching optional storage. Two rules make this worth having
 * rather than a decorative banner:
 *
 *   1. Optional storage is REALLY gated. mobile-archives.js will not register
 *      the service worker or write a preference until this says yes, so
 *      "Essential only" leaves nothing behind but the session cookie.
 *   2. The answer is asynchronous. A visitor who has not chosen yet gets
 *      neither branch -- callers register with onGranted() and are called
 *      back if and when consent lands, so nothing races the banner.
 *
 * Storing the decision in localStorage is itself essential-tier: refusing to
 * remember a refusal would re-prompt on every single visit.
 */

(function () {
  var STORAGE_KEY = 'presspoint.consent';
  var VERSION = 1;

  // Private-mode Safari throws on localStorage access rather than returning
  // null, and an exception here would take the whole page down with it.
  function safeRead() {
    try {
      return window.localStorage.getItem(STORAGE_KEY);
    } catch (error) {
      return null;
    }
  }

  function safeWrite(value) {
    try {
      window.localStorage.setItem(STORAGE_KEY, value);
      return true;
    } catch (error) {
      return false;
    }
  }

  function parse(raw) {
    if (!raw) return null;
    try {
      var parsed = JSON.parse(raw);
      if (!parsed || parsed.version !== VERSION) return null;
      return parsed;
    } catch (error) {
      return null;
    }
  }

  var stored = parse(safeRead());
  var granted = !!(stored && stored.optional === true);
  var decided = !!stored;
  var listeners = [];

  function flush() {
    if (!granted) return;
    var pending = listeners.splice(0, listeners.length);
    pending.forEach(function (fn) {
      try {
        fn();
      } catch (error) {
        /* one bad consumer must not block the rest */
      }
    });
  }

  var consent = {
    /* Synchronous read, for code that can simply skip its optional work. */
    hasOptional: function () {
      return granted;
    },
    hasDecided: function () {
      return decided;
    },
    /*
     * Deferred read, for code that must run its optional work as soon as it
     * is allowed to. Fires immediately if consent is already on file, else
     * waits for the banner. Never fires under "Essential only".
     */
    onGranted: function (fn) {
      if (typeof fn !== 'function') return;
      if (granted) {
        fn();
        return;
      }
      listeners.push(fn);
    },
    set: function (optional) {
      granted = optional === true;
      decided = true;
      safeWrite(JSON.stringify({
        version: VERSION,
        optional: granted,
        at: new Date().toISOString(),
      }));
      document.dispatchEvent(new CustomEvent('consent:changed', {
        detail: { optional: granted },
      }));
      flush();
    },
  };

  window.PressPointConsent = consent;

  document.addEventListener('DOMContentLoaded', function () {
    var banner = document.querySelector('[data-cookie-consent]');
    if (!banner) return;

    // Already answered: never show the sheet again, just honour the answer.
    if (decided) {
      flush();
      return;
    }

    var accept = banner.querySelector('[data-cookie-accept]');
    var decline = banner.querySelector('[data-cookie-decline]');

    function close(optional) {
      consent.set(optional);
      banner.classList.remove('is-visible');
      // Wait out the slide-down before hiding, or the sheet vanishes instantly.
      window.setTimeout(function () {
        banner.hidden = true;
      }, 240);
    }

    if (accept) accept.addEventListener('click', function () { close(true); });
    if (decline) decline.addEventListener('click', function () { close(false); });

    banner.hidden = false;
    // Two frames: one to clear `hidden`, one for the transition to have a
    // start value to animate from.
    window.requestAnimationFrame(function () {
      window.requestAnimationFrame(function () {
        banner.classList.add('is-visible');
      });
    });
  });
})();
