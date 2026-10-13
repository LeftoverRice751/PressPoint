/*
 * Story Library drawer -- the "This issue" / "Published newsletters" tabs and
 * the Published tab's Duplicate action.
 *
 * Separate from news-dashboard.js on purpose: that file is the composer
 * (3,000+ lines), and nothing here touches the canvas. Duplicate ends in a
 * full reload of the news page, which is how the composer picks up a new
 * open issue -- the same outcome as a news.layout 409 forcing a canvas reload.
 *
 * Click handling is delegated on the drawer because the Published pane is a
 * [data-live-target]: a live refresh replaces its rows, and per-row listeners
 * would go with them.
 */
(function () {
  function init() {
    var drawer = document.querySelector('[data-news-library-drawer]');
    if (!drawer) return;

    var tabs = Array.prototype.slice.call(drawer.querySelectorAll('[data-library-tab]'));
    var panes = Array.prototype.slice.call(drawer.querySelectorAll('[data-library-pane]'));

    function show(name) {
      tabs.forEach(function (tab) {
        var on = tab.getAttribute('data-library-tab') === name;
        tab.setAttribute('aria-selected', String(on));
        tab.classList.toggle('is-active', on);
      });
      panes.forEach(function (pane) {
        pane.hidden = pane.getAttribute('data-library-pane') !== name;
      });
    }

    tabs.forEach(function (tab) {
      tab.addEventListener('click', function () { show(tab.getAttribute('data-library-tab')); });
    });

    var csrfMeta = document.querySelector('meta[name="csrf-token"]');
    var csrf = csrfMeta ? csrfMeta.getAttribute('content') : '';

    function post(url, discard) {
      var body = new URLSearchParams();
      body.set('__token', csrf);
      if (discard) body.set('discard', '1');
      return fetch(url, {
        method: 'POST',
        credentials: 'same-origin',
        headers: {
          'X-Requested-With': 'XMLHttpRequest',
          'Accept': 'application/json',
          'X-CSRF-TOKEN': csrf
        },
        body: body
      }).then(function (res) {
        return res.json().then(function (data) { return { status: res.status, data: data || {} }; });
      });
    }

    function done() {
      window.location.assign('/gears/dashboard?page=news');
    }

    function fail(data) {
      var msg = (data && data.errors && data.errors[0]) || 'Could not duplicate the newsletter.';
      if (window.ConfirmModal) {
        window.ConfirmModal.ask({ title: 'Duplicate failed', body: msg, confirmLabel: 'OK', cancelLabel: 'Close' });
      }
    }

    function duplicate(button) {
      var row = button.closest('[data-library-issue]');
      var url = row && row.getAttribute('data-library-duplicate-url');
      if (!url || button.disabled) return;
      button.disabled = true;

      post(url, false).then(function (first) {
        if (first.status === 409 && first.data.needs_confirm) {
          var n = first.data.draft_story_count || 0;
          return window.ConfirmModal.ask({
            title: 'Replace your current draft?',
            body: 'Your current draft has ' + n + (n === 1 ? ' story' : ' stories') +
              '. Discarding moves it to the trash (it can be restored) and opens this newsletter as your new draft.',
            confirmLabel: 'Discard my current draft and duplicate',
            cancelLabel: 'Cancel',
            danger: true
          }).then(function (ok) {
            if (!ok) return null;
            return post(url, true);
          });
        }
        return first;
      }).then(function (result) {
        if (!result) return;
        if (result.data.ok) return done();
        fail(result.data);
      }).catch(function () {
        fail(null);
      }).then(function () {
        button.disabled = false;
      });
    }

    drawer.addEventListener('click', function (event) {
      var target = event.target;
      var button = target && target.closest ? (target.getAttribute('data-library-duplicate') !== null ? target : target.closest('[data-library-duplicate]')) : null;
      if (!button) return;
      event.preventDefault();
      duplicate(button);
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
