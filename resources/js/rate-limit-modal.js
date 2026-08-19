/*
 * Rate-limit popup for the login / forgot-password / OTP forms.
 *
 * These forms are plain <form method="POST"> submits. Before this, hitting
 * the `throttle:auth` limit navigated the browser away to the standalone
 * errors/429.html page, losing whatever the visitor had typed. guardForm()
 * submits the form via fetch instead: a 429 response shows this popup in
 * place; anything else (success redirect, validation-error redirect) swaps
 * the document for whatever Masonite already rendered, since session flash
 * messages are read-once and would be silently lost by a second navigation
 * to the same URL. A network failure falls back to a real native submit so
 * a broken fetch never strands the user.
 */
(function () {
  var dialog = null;

  function build() {
    if (dialog) return;
    dialog = document.createElement('dialog');
    dialog.className = 'rate-limit-modal';
    dialog.innerHTML =
      '<div class="rate-limit-modal__panel" role="document">' +
        '<svg class="rate-limit-modal__mark" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" aria-hidden="true">' +
          '<circle cx="12" cy="13" r="8"/>' +
          '<path d="M12 9v4l2.6 2.6" stroke-linecap="round"/>' +
          '<path d="M9.5 2h5" stroke-linecap="round"/>' +
        '</svg>' +
        '<h2 class="rate-limit-modal__title">Okay, we get it, slow down</h2>' +
        '<p class="rate-limit-modal__body">You\'ve hit this a few too many times in the last minute. Take a breath — the limit resets fast, and your next try will go through.</p>' +
        '<div class="rate-limit-modal__footer">' +
          '<button type="button" class="rate-limit-modal__button" data-rate-limit-ok>Got it</button>' +
        '</div>' +
      '</div>';
    document.body.appendChild(dialog);

    var okBtn = dialog.querySelector('[data-rate-limit-ok]');
    okBtn.addEventListener('click', close);
    dialog.addEventListener('cancel', function (event) {
      event.preventDefault();
      close();
    });
    dialog.addEventListener('click', function (event) {
      if (event.target === dialog) close();
    });
  }

  function close() {
    if (!dialog) return;
    try { dialog.close(); } catch (e) { dialog.hidden = true; }
  }

  function show() {
    build();
    if (typeof dialog.showModal === 'function') {
      try { dialog.showModal(); } catch (e) { dialog.hidden = false; }
    } else {
      dialog.hidden = false;
    }
  }

  function guardForm(form) {
    if (!form) return;
    var bypass = false;

    form.addEventListener('submit', function (event) {
      if (bypass) return;
      event.preventDefault();

      var submitButton = form.querySelector('button[type="submit"]');
      if (submitButton) submitButton.disabled = true;

      fetch(form.action, {
        method: 'POST',
        body: new FormData(form),
        credentials: 'same-origin',
        headers: { 'X-Requested-With': 'fetch' }
      }).then(function (response) {
        if (response.status === 429) {
          if (submitButton) submitButton.disabled = false;
          show();
          return;
        }

        return response.text().then(function (html) {
          if (response.url && response.url !== window.location.href) {
            window.history.replaceState(null, '', response.url);
          }
          document.open();
          document.write(html);
          document.close();
        });
      }).catch(function () {
        bypass = true;
        if (submitButton) submitButton.disabled = false;
        form.submit();
      });
    });
  }

  window.RateLimitModal = { guardForm: guardForm, show: show };
})();
