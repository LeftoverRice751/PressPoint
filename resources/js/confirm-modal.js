/*
 * Gears dashboard — Confirm Modal.
 *
 * Replaces window.confirm() with a styled dialog that matches the
 * editorial palette. Two entry points:
 *
 *   1. ConfirmModal.ask({title, body, confirmLabel, cancelLabel, danger})
 *      Returns a Promise that resolves to true/false.
 *
 *   2. Auto-wiring via attributes — any clickable element with a
 *      `data-confirm="..."` attribute will be intercepted. The plan
 *      shows the confirm dialog first; if the user confirms, the click
 *      is replayed without the data-confirm attribute (so form submits
 *      and href navigations finish normally). If they cancel, nothing
 *      happens.
 *
 *      Optional attributes:
 *        data-confirm-title   — header (default "Are you sure?")
 *        data-confirm-label   — confirm button label (default "Confirm")
 *        data-confirm-cancel  — cancel button label (default "Cancel")
 *        data-confirm-danger  — presence makes the confirm button red
 */
(function () {
  var dialog = null;
  var titleEl = null;
  var bodyEl = null;
  var confirmBtn = null;
  var cancelBtn = null;
  var pendingResolve = null;
  var bypass = false;

  function build() {
    if (dialog) return;
    dialog = document.createElement('dialog');
    dialog.className = 'confirm-modal';
    dialog.innerHTML =
      '<div class="confirm-modal__panel" role="document">' +
        '<h2 class="confirm-modal__title"></h2>' +
        '<p class="confirm-modal__body"></p>' +
        '<div class="confirm-modal__footer">' +
          '<button type="button" class="confirm-modal__button" data-confirm-cancel-btn>Cancel</button>' +
          '<button type="button" class="confirm-modal__button confirm-modal__button--primary" data-confirm-ok-btn>Confirm</button>' +
        '</div>' +
      '</div>';

    titleEl = dialog.querySelector('.confirm-modal__title');
    bodyEl = dialog.querySelector('.confirm-modal__body');
    confirmBtn = dialog.querySelector('[data-confirm-ok-btn]');
    cancelBtn = dialog.querySelector('[data-confirm-cancel-btn]');

    document.body.appendChild(dialog);

    confirmBtn.addEventListener('click', function () { resolve(true); });
    cancelBtn.addEventListener('click', function () { resolve(false); });

    dialog.addEventListener('cancel', function (event) {
      event.preventDefault();
      resolve(false);
    });

    dialog.addEventListener('click', function (event) {
      if (event.target === dialog) resolve(false);
    });

    dialog.addEventListener('keydown', function (event) {
      if (event.key === 'Enter' && document.activeElement !== cancelBtn) {
        event.preventDefault();
        resolve(true);
      }
    });
  }

  function resolve(value) {
    if (!pendingResolve) return;
    var r = pendingResolve;
    pendingResolve = null;
    try { dialog.close(); } catch (e) { dialog.hidden = true; }
    r(value);
  }

  function ask(opts) {
    build();
    opts = opts || {};
    titleEl.textContent = opts.title || 'Are you sure?';
    bodyEl.textContent = opts.body || '';
    bodyEl.hidden = !opts.body;
    confirmBtn.textContent = opts.confirmLabel || 'Confirm';
    cancelBtn.textContent = opts.cancelLabel || 'Cancel';

    confirmBtn.classList.remove('confirm-modal__button--primary', 'confirm-modal__button--danger');
    if (opts.danger) {
      confirmBtn.classList.add('confirm-modal__button--danger');
    } else {
      confirmBtn.classList.add('confirm-modal__button--primary');
    }

    return new Promise(function (resolver) {
      pendingResolve = resolver;
      if (typeof dialog.showModal === 'function') {
        try { dialog.showModal(); }
        catch (e) { dialog.hidden = false; }
      } else {
        dialog.hidden = false;
      }
      window.setTimeout(function () { confirmBtn.focus(); }, 30);
    });
  }

  function findConfirmTrigger(event) {
    var node = event.target;
    while (node && node !== document.body) {
      if (node.nodeType === 1 && node.hasAttribute && node.hasAttribute('data-confirm')) {
        return node;
      }
      node = node.parentNode;
    }
    return null;
  }

  function interceptClicks() {
    document.addEventListener('click', function (event) {
      if (bypass) return;
      var trigger = findConfirmTrigger(event);
      if (!trigger) return;

      // For submit buttons inside a form, the click is what triggers the
      // submit. We intercept here, run the confirm, and only then re-fire.
      event.preventDefault();
      event.stopImmediatePropagation();

      ask({
        title: trigger.getAttribute('data-confirm-title') || 'Are you sure?',
        body: trigger.getAttribute('data-confirm') || '',
        confirmLabel: trigger.getAttribute('data-confirm-label') || 'Confirm',
        cancelLabel: trigger.getAttribute('data-confirm-cancel') || 'Cancel',
        danger: trigger.hasAttribute('data-confirm-danger')
      }).then(function (ok) {
        if (!ok) return;
        bypass = true;
        try {
          // Replay the action. For form submit buttons, walk to the form.
          if (trigger.tagName === 'BUTTON' && trigger.type === 'submit') {
            var form = trigger.form || trigger.closest('form');
            if (form) {
              if (typeof form.requestSubmit === 'function') {
                form.requestSubmit(trigger);
              } else {
                form.submit();
              }
            }
          } else if (trigger.tagName === 'A' && trigger.href) {
            window.location.href = trigger.href;
          } else {
            trigger.click();
          }
        } finally {
          window.setTimeout(function () { bypass = false; }, 0);
        }
      });
    }, true);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', interceptClicks);
  } else {
    interceptClicks();
  }

  window.ConfirmModal = { ask: ask };
})();
