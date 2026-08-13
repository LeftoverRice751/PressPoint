/**
 * Keeps dashboard lists current without reloading the page.
 *
 * A section refreshes by fetching server-rendered HTML from the same Jinja
 * partial the full page uses, so an injected row can never differ from one that
 * arrived with the initial render. Two triggers:
 *
 *   1. The editor's own create/update/delete calls refresh(section) directly.
 *   2. A poll compares per-section change stamps and refreshes only the
 *      sections that actually moved — so another editor's work shows up too,
 *      without refetching anything unchanged.
 *
 * Panels opt in with data-live-section="<name>"; the container replaced on
 * refresh is marked data-live-target.
 */
(function () {
  'use strict';

  var root = document.querySelector('[data-dashboard-shell]');
  if (!root) {
    return;
  }

  var FRAGMENT_URL = '/gears/dashboard/fragment/';
  var STAMPS_URL = '/gears/dashboard/stamps';
  var POLL_INTERVAL_MS = 20000;

  var stamps = {};
  var pollTimer = null;
  var inFlight = {};

  function panelFor(section) {
    return root.querySelector('[data-live-section="' + section + '"]');
  }

  function sections() {
    return Array.prototype.map.call(
      root.querySelectorAll('[data-live-section]'),
      function (panel) {
        return panel.getAttribute('data-live-section');
      }
    );
  }

  function getJson(url) {
    return fetch(url, {
      headers: { 'X-Requested-With': 'XMLHttpRequest', Accept: 'application/json' },
      credentials: 'same-origin'
    }).then(function (response) {
      return response.json().catch(function () {
        return null;
      }).then(function (payload) {
        if (!response.ok || !payload || !payload.ok) {
          throw new Error('Request failed');
        }
        return payload;
      });
    });
  }

  /**
   * True when the editor is mid-edit somewhere in this panel. A polled refresh
   * backs off rather than throwing away typing; the editor's own actions
   * refresh regardless.
   */
  function isBusy(panel) {
    var active = document.activeElement;
    if (active && panel.contains(active) && /^(INPUT|TEXTAREA|SELECT)$/.test(active.tagName)) {
      return true;
    }

    var dialog = panel.querySelector('dialog[open]');
    if (dialog) {
      return true;
    }

    var fields = panel.querySelectorAll('input, textarea, select');
    for (var i = 0; i < fields.length; i += 1) {
      var field = fields[i];
      if (field.type === 'file') {
        if (field.files && field.files.length) {
          return true;
        }
        continue;
      }
      if (field.type === 'checkbox' || field.type === 'radio') {
        if (field.checked !== field.defaultChecked) {
          return true;
        }
        continue;
      }
      if (field.tagName === 'SELECT') {
        // A <select> has no defaultValue, so compare against the option the
        // markup marked selected. Using field.defaultValue here would be
        // undefined and read as "changed" for every panel holding a select.
        var options = field.options || [];
        for (var j = 0; j < options.length; j += 1) {
          if (options[j].selected !== options[j].defaultSelected) {
            return true;
          }
        }
        continue;
      }
      if (field.value !== field.defaultValue) {
        return true;
      }
    }

    return false;
  }

  /** Re-run the wiring that only ran on page load, for freshly injected nodes. */
  function rewire(panel) {
    if (window.UploadMeter) {
      if (window.UploadMeter.wireDropzones) {
        window.UploadMeter.wireDropzones(panel);
      }
      if (window.UploadMeter.wireForms) {
        window.UploadMeter.wireForms(panel);
      }
    }

    if (window.GearsDashboard && window.GearsDashboard.syncEmptyStates) {
      window.GearsDashboard.syncEmptyStates();
    }

    panel.dispatchEvent(new CustomEvent('live:refreshed', {
      detail: { section: panel.getAttribute('data-live-section') },
      bubbles: true
    }));
  }

  function refresh(section) {
    var panel = panelFor(section);
    if (!panel || inFlight[section]) {
      return Promise.resolve(false);
    }

    inFlight[section] = true;
    panel.classList.add('is-live-refreshing');

    return getJson(FRAGMENT_URL + encodeURIComponent(section))
      .then(function (payload) {
        var target = panel.querySelector('[data-live-target]');
        if (target) {
          target.innerHTML = payload.html;
        }

        // Several cards in a panel can report the same count (the video panel
        // has one on the preview and one on the library), so update them all.
        Array.prototype.forEach.call(
          panel.querySelectorAll('[data-section-count]'),
          function (holder) {
            holder.setAttribute('data-section-count', String(payload.count));
          }
        );

        stamps[section] = payload.stamp;
        rewire(panel);
        return true;
      })
      .catch(function () {
        return false;
      })
      .finally(function () {
        inFlight[section] = false;
        panel.classList.remove('is-live-refreshing');
      });
  }

  function poll() {
    if (document.visibilityState !== 'visible') {
      return Promise.resolve();
    }

    return getJson(STAMPS_URL)
      .then(function (payload) {
        var next = payload.stamps || {};

        sections().forEach(function (section) {
          if (!(section in next)) {
            return;
          }

          // First look just records where things stand.
          if (!(section in stamps)) {
            stamps[section] = next[section];
            return;
          }

          if (stamps[section] === next[section]) {
            return;
          }

          var panel = panelFor(section);
          if (!panel || isBusy(panel)) {
            return; // try again on the next tick
          }

          refresh(section);
        });
      })
      .catch(function () {
        // A failed poll is not worth surfacing; the next tick retries.
      });
  }

  function startPolling() {
    if (pollTimer) {
      return;
    }
    pollTimer = window.setInterval(poll, POLL_INTERVAL_MS);
  }

  function stopPolling() {
    if (!pollTimer) {
      return;
    }
    window.clearInterval(pollTimer);
    pollTimer = null;
  }

  // ===== triggers from the editor's own actions =====

  // Upload forms opt in with data-upload-reload="false" so upload-meter.js hands
  // us the JSON instead of reloading the page.
  root.addEventListener('upload:success', function (event) {
    var form = event.target.closest('[data-live-form]');
    if (!form) {
      return;
    }
    refresh(form.getAttribute('data-live-form'));
  });

  // Delete forms keep their real action and their data-confirm modal; we
  // intercept the submit that confirm-modal.js replays and post it as JSON.
  root.addEventListener('submit', function (event) {
    var form = event.target.closest('[data-live-delete]');
    if (!form) {
      return;
    }

    event.preventDefault();
    var section = form.getAttribute('data-live-delete');
    var tokenMeta = document.querySelector('meta[name="csrf-token"]');
    var token = tokenMeta ? tokenMeta.getAttribute('content') : '';

    var formData = new FormData(form);
    if (token && !formData.has('__token')) {
      formData.append('__token', token);
    }

    fetch(form.getAttribute('action'), {
      method: 'POST',
      headers: {
        'X-CSRF-TOKEN': token,
        'X-Requested-With': 'XMLHttpRequest',
        Accept: 'application/json'
      },
      body: formData,
      credentials: 'same-origin'
    })
      .then(function (response) {
        return response.json().catch(function () { return null; });
      })
      .then(function (payload) {
        if (!payload || !payload.ok) {
          var errors = (payload && payload.errors) || ['Could not delete that item.'];
          throw new Error(Array.isArray(errors) ? errors.join(' ') : String(errors));
        }
        notify('Deleted.');
        return refresh(section);
      })
      .catch(function (error) {
        notify(error.message || 'Could not delete that item.', true);
      });
  });

  function notify(message, isError) {
    if (window.GearsDashboard && window.GearsDashboard.notify) {
      window.GearsDashboard.notify(message, { error: Boolean(isError) });
    }
  }

  document.addEventListener('visibilitychange', function () {
    if (document.visibilityState === 'visible') {
      poll();
      startPolling();
    } else {
      stopPolling();
    }
  });

  window.DashboardLive = {
    refresh: refresh,
    poll: poll,
    startPolling: startPolling,
    stopPolling: stopPolling
  };

  // Seed the stamps so the first poll compares against the rendered page rather
  // than refreshing everything once for no reason.
  poll().then(startPolling);
})();
