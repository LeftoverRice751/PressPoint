// Admin review queue.
//
// The preview is deliberately fetched rather than rendered inline for every
// row: it goes through the kiosk's own _news_slots partial, and rendering one
// of those per submission into a queue that mostly gets scanned would be waste.
//
// Handlers are delegated from the queue host, not bound per card, because the
// list is re-rendered wholesale by the 20s live poll (data-live-section="review")
// — anything bound to a card would be lost on the first refresh.
(function () {
  var root = document.querySelector('[data-dashboard-shell]');
  if (!root) return;

  var host = root.querySelector('[data-review-queue-host]');
  if (!host) return;

  var tokenMeta = document.querySelector('meta[name="csrf-token"]');
  var csrf = tokenMeta ? tokenMeta.getAttribute('content') : '';

  function toast(msg, isError) {
    if (window.GearsDashboard && window.GearsDashboard.notify) {
      window.GearsDashboard.notify(msg, { error: !!isError });
    }
  }

  function cardOf(el) { return el.closest('[data-review-item]'); }
  function idOf(card) { return card && card.getAttribute('data-review-id'); }

  function refreshQueue() {
    if (window.DashboardLive && window.DashboardLive.refresh) {
      window.DashboardLive.refresh('review');
    }
    // The composer's Story Library shows status, so it is stale now too.
    if (window.DashboardLive && window.DashboardLive.refresh) {
      window.DashboardLive.refresh('news');
    }
  }

  // The sidebar badge is the admin's only signal that work is waiting, so it
  // has to follow the queue down as decisions are made.
  function syncBadge() {
    var badge = root.querySelector('[data-review-count]');
    if (!badge) return;
    var remaining = host.querySelectorAll('[data-review-item]').length;
    badge.textContent = String(remaining);
    badge.hidden = remaining === 0;
  }

  function decide(card, approve, reason) {
    var id = idOf(card);
    if (!id) return;

    var buttons = card.querySelectorAll('button');
    buttons.forEach(function (b) { b.disabled = true; });

    fetch('/gears/review/' + id + '/' + (approve ? 'approve' : 'reject'), {
      method: 'POST',
      headers: {
        'X-CSRF-TOKEN': csrf,
        'X-Requested-With': 'XMLHttpRequest',
        'Content-Type': 'application/json'
      },
      credentials: 'same-origin',
      body: JSON.stringify({ reason: reason || '' })
    })
      .then(function (r) { return r.json().catch(function () { return { ok: false }; }); })
      .then(function (json) {
        if (json && json.ok) {
          toast((json.messages && json.messages[0]) || 'Decision recorded.', false);
          // Drop the card immediately so a second admin looking at the same
          // queue does not act on a story that is already decided; the live
          // refresh behind it reconciles with the server.
          card.remove();
          syncBadge();
          refreshQueue();
          return;
        }

        buttons.forEach(function (b) { b.disabled = false; });
        toast((json && json.errors && json.errors[0]) || 'Could not record that decision.', true);
        // 409 means someone else already decided — the queue on screen is
        // stale, so pull the truth rather than leaving a dead card up.
        refreshQueue();
      })
      .catch(function () {
        buttons.forEach(function (b) { b.disabled = false; });
        toast('Request failed — please try again.', true);
      });
  }

  function loadPreview(card) {
    var id = idOf(card);
    var frame = card.querySelector('[data-review-preview-frame]');
    var target = card.querySelector('[data-review-preview-target]');
    if (!id || !frame || !target) return;

    if (!frame.hidden) { frame.hidden = true; return; }

    frame.hidden = false;
    target.innerHTML = '<p class="review-preview__loading">Loading preview…</p>';

    fetch('/gears/review/' + id + '/preview', {
      headers: { 'X-Requested-With': 'XMLHttpRequest', Accept: 'application/json' },
      credentials: 'same-origin'
    })
      .then(function (r) { return r.json(); })
      .then(function (json) {
        if (!json || !json.ok) {
          target.innerHTML = '<p class="review-preview__loading">Could not load the preview.</p>';
          return;
        }
        // Server-rendered markup from our own template, not user input.
        target.innerHTML = json.html;
      })
      .catch(function () {
        target.innerHTML = '<p class="review-preview__loading">Could not load the preview.</p>';
      });
  }

  host.addEventListener('click', function (event) {
    var card = cardOf(event.target);
    if (!card) return;

    if (event.target.closest('[data-review-preview]')) {
      loadPreview(card);
      return;
    }

    if (event.target.closest('[data-review-approve]')) {
      decide(card, true);
      return;
    }

    // "Send back" reveals the reason box; the confirm button inside it is what
    // actually submits. A reason is required, so there is no one-click reject.
    if (event.target.closest('[data-review-reject]') &&
        !event.target.closest('[data-review-reject-confirm]')) {
      var form = card.querySelector('[data-review-reject-form]');
      if (form) {
        form.hidden = false;
        var input = form.querySelector('[data-review-reason]');
        if (input) input.focus();
      }
      return;
    }

    if (event.target.closest('[data-review-reject-cancel]')) {
      var cancelForm = card.querySelector('[data-review-reject-form]');
      if (cancelForm) cancelForm.hidden = true;
      return;
    }

    if (event.target.closest('[data-review-reject-confirm]')) {
      var reasonInput = card.querySelector('[data-review-reason]');
      var reason = reasonInput ? reasonInput.value.trim() : '';
      if (!reason) {
        toast('Please say what needs to change before sending it back.', true);
        if (reasonInput) reasonInput.focus();
        return;
      }
      decide(card, false, reason);
    }
  });
})();
