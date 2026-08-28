/*
 * Super admin dashboard — the edit-admin dialog.
 *
 * One <dialog> serves every row. Each Edit button carries that admin's
 * current values and its own POST target as data-* attributes; this copies
 * them into the shared form before opening. Delete, Reset password and Log
 * out need no code at all — they are plain POST forms whose submit buttons
 * carry data-confirm, which confirm-modal.js intercepts on its own.
 */
(function () {
  var modal = document.querySelector('[data-sa-edit-modal]');
  if (!modal) return;

  var form = modal.querySelector('[data-sa-edit-form]');
  var usernameInput = modal.querySelector('#sa-edit-username');
  var emailInput = modal.querySelector('#sa-edit-email');

  function open(trigger) {
    form.setAttribute('action', trigger.getAttribute('data-sa-action') || '');
    usernameInput.value = trigger.getAttribute('data-sa-username') || '';
    emailInput.value = trigger.getAttribute('data-sa-email') || '';

    if (typeof modal.showModal === 'function') {
      try { modal.showModal(); }
      catch (e) { modal.hidden = false; }
    } else {
      modal.hidden = false;
    }

    window.setTimeout(function () { usernameInput.focus(); }, 30);
  }

  function close() {
    try { modal.close(); } catch (e) { modal.hidden = true; }
  }

  document.addEventListener('click', function (event) {
    var trigger = event.target.closest('[data-sa-edit]');
    if (trigger) {
      event.preventDefault();
      open(trigger);
      return;
    }

    if (event.target.closest('[data-sa-edit-cancel]')) {
      event.preventDefault();
      close();
    }
  });

  // Click on the backdrop — the dialog element itself, not the panel inside it.
  modal.addEventListener('click', function (event) {
    if (event.target === modal) close();
  });
})();
