/*
 * Gears dashboard — Upload Meter + Dropzone wiring.
 *
 * Responsibilities:
 *   1. Make every <label class="dropzone"> behave: drag-over highlight,
 *      filled-state preview (filename + size), and a clear (×) button.
 *   2. Intercept submits for every <form data-upload-form> and run the
 *      upload through XHR so we can show a bottom-right progress toast
 *      that updates as the file streams up.
 *   3. After a successful upload, dispatch `upload:success` on the form
 *      (with the JSON payload) and either re-fetch the section partial
 *      (when the form opts in) or simply reload the page.
 */
(function () {
  var META = document.querySelector('meta[name="csrf-token"]');
  var CSRF = META ? META.getAttribute('content') : '';

  var COMPLETE_DISMISS_MS = 2200;
  var DEFAULT_RELOAD_DELAY = 1100;

  // ===== Dropzones =====

  function humanSize(bytes) {
    if (!isFinite(bytes) || bytes <= 0) return '0 B';
    var units = ['B', 'KB', 'MB', 'GB'];
    var unit = 0;
    while (bytes >= 1024 && unit < units.length - 1) {
      bytes /= 1024;
      unit++;
    }
    return (Math.round(bytes * 10) / 10) + ' ' + units[unit];
  }

  function syncDropzone(zone) {
    var input = zone.querySelector('.dropzone__input');
    if (!input) return;

    var nameEl = zone.querySelector('[data-dropzone-name]');
    var sizeEl = zone.querySelector('[data-dropzone-size]');
    var file = input.files && input.files[0];

    if (file) {
      zone.classList.add('is-filled');
      zone.classList.remove('is-invalid');
      if (nameEl) nameEl.textContent = file.name;
      if (sizeEl) sizeEl.textContent = humanSize(file.size);
    } else {
      zone.classList.remove('is-filled');
      if (nameEl) nameEl.textContent = '';
      if (sizeEl) sizeEl.textContent = '';
    }
  }

  function wireDropzone(zone) {
    if (zone.__dropzoneWired) return;
    zone.__dropzoneWired = true;

    var input = zone.querySelector('.dropzone__input');
    if (!input) return;

    input.addEventListener('change', function () {
      syncDropzone(zone);
    });

    zone.addEventListener('dragenter', function (event) {
      event.preventDefault();
      zone.classList.add('is-dragover');
    });

    zone.addEventListener('dragover', function (event) {
      event.preventDefault();
      event.dataTransfer.dropEffect = 'copy';
      zone.classList.add('is-dragover');
    });

    zone.addEventListener('dragleave', function (event) {
      if (zone.contains(event.relatedTarget)) return;
      zone.classList.remove('is-dragover');
    });

    zone.addEventListener('drop', function (event) {
      event.preventDefault();
      zone.classList.remove('is-dragover');
      var files = event.dataTransfer && event.dataTransfer.files;
      if (!files || !files.length) return;

      try {
        var dt = new DataTransfer();
        dt.items.add(files[0]);
        input.files = dt.files;
      } catch (e) {
        // Some browsers reject DataTransfer assignment — fall back to
        // dispatching change and letting the form pick up via standard input.
      }
      syncDropzone(zone);
      input.dispatchEvent(new Event('change', { bubbles: true }));
    });

    var clearBtn = zone.querySelector('[data-dropzone-clear]');
    if (clearBtn) {
      clearBtn.addEventListener('click', function (event) {
        event.preventDefault();
        event.stopPropagation();
        input.value = '';
        syncDropzone(zone);
      });
    }

    syncDropzone(zone);
  }

  function wireAllDropzones(scope) {
    var root = scope || document;
    var zones = root.querySelectorAll('[data-dropzone]');
    Array.prototype.forEach.call(zones, wireDropzone);
  }

  // ===== Toast meter =====

  function ensureStack() {
    var stack = document.querySelector('[data-upload-meter]');
    if (stack) return stack;
    stack = document.createElement('div');
    stack.className = 'upload-meter';
    stack.setAttribute('data-upload-meter', '');
    stack.setAttribute('aria-live', 'polite');
    document.body.appendChild(stack);
    return stack;
  }

  function makeToast(opts) {
    var stack = ensureStack();
    var card = document.createElement('div');
    card.className = 'upload-meter__toast';
    card.setAttribute('role', 'status');
    card.innerHTML =
      '<div class="upload-meter__header">' +
        '<p class="upload-meter__eyebrow"></p>' +
        '<button type="button" class="upload-meter__close" aria-label="Dismiss">&times;</button>' +
      '</div>' +
      '<p class="upload-meter__filename"></p>' +
      '<p class="upload-meter__detail"></p>' +
      '<div class="upload-meter__track" aria-hidden="true">' +
        '<span class="upload-meter__fill" style="--progress:0"></span>' +
      '</div>';

    var eyebrow = card.querySelector('.upload-meter__eyebrow');
    var nameEl = card.querySelector('.upload-meter__filename');
    var detail = card.querySelector('.upload-meter__detail');
    var fill = card.querySelector('.upload-meter__fill');
    var close = card.querySelector('.upload-meter__close');

    eyebrow.textContent = 'Uploading · ' + (opts.label || 'file');
    nameEl.textContent = opts.filename || 'Upload';
    detail.textContent = humanSize(0) + ' of ' + humanSize(opts.total || 0) + ' · 0%';

    stack.appendChild(card);
    requestAnimationFrame(function () {
      card.classList.add('is-visible');
    });

    function dismiss() {
      card.classList.add('is-leaving');
      window.setTimeout(function () {
        if (card.parentNode) card.parentNode.removeChild(card);
      }, 350);
    }

    close.addEventListener('click', dismiss);

    return {
      element: card,
      progress: function (loaded, total) {
        var t = total || opts.total || 0;
        var pct = t ? Math.min(100, Math.round((loaded / t) * 100)) : 0;
        fill.style.setProperty('--progress', String(pct));
        detail.textContent = humanSize(loaded) + ' of ' + humanSize(t) + ' · ' + pct + '%';
      },
      complete: function (message) {
        card.classList.add('is-complete');
        fill.style.setProperty('--progress', '100');
        eyebrow.textContent = 'Complete · ' + (opts.label || 'file');
        if (message) detail.textContent = message;
        window.setTimeout(dismiss, COMPLETE_DISMISS_MS);
      },
      error: function (message) {
        card.classList.add('is-error');
        eyebrow.textContent = 'Failed · ' + (opts.label || 'file');
        detail.textContent = message || 'Upload could not finish.';
      },
      dismiss: dismiss
    };
  }

  // ===== Form submission =====

  function pickFilenameAndTotal(form) {
    var name = '';
    var total = 0;
    var fileInputs = form.querySelectorAll('input[type="file"]');
    Array.prototype.forEach.call(fileInputs, function (input) {
      if (input.files && input.files[0]) {
        if (!name) name = input.files[0].name;
        total += input.files[0].size || 0;
      }
    });

    if (!name) {
      var titleInput = form.querySelector('input[name="title"], input[name="name"]');
      if (titleInput) name = titleInput.value;
    }

    return { filename: name || 'Upload', total: total };
  }

  function resetForm(form) {
    try { form.reset(); } catch (e) { /* ignore */ }
    var zones = form.querySelectorAll('[data-dropzone]');
    Array.prototype.forEach.call(zones, syncDropzone);
  }

  function flashError(form, message) {
    // Surface the error inline above the form actions when possible.
    var existing = form.querySelector('.upload-form-error');
    if (existing) existing.remove();
    var node = document.createElement('div');
    node.className = 'upload-form-error dashboard-alert';
    node.innerHTML = '<ul class="dashboard-alert__list"><li></li></ul>';
    node.querySelector('li').textContent = message;
    form.insertBefore(node, form.firstChild);
    window.setTimeout(function () {
      if (node.parentNode) node.parentNode.removeChild(node);
    }, 6000);
  }

  /**
   * Disable every submit control in the form while its upload is running, and
   * put them back exactly as they were afterwards. A NAS upload can sit at 90%
   * for a while and an impatient second click posts the whole file again --
   * gears-dashboard.js used to disable the button for these forms, and it no
   * longer binds them (see the AJAX_SELECTORS note there), so the guard lives
   * with the code that actually owns the submit.
   */
  function lockSubmits(form) {
    var controls = form.querySelectorAll('button[type="submit"], button:not([type]), input[type="submit"]');
    var wasDisabled = Array.prototype.map.call(controls, function (control) {
      var previous = control.disabled;
      control.disabled = true;
      return previous;
    });

    return function unlock() {
      Array.prototype.forEach.call(controls, function (control, index) {
        control.disabled = wasDisabled[index];
      });
    };
  }

  function submitForm(form) {
    // Belt to lockSubmits' braces: a disabled button still leaves Enter-in-a
    // -text-field and a programmatic UploadMeter.submit() as ways back in.
    if (form.__uploadInFlight) return false;

    var fileInputs = form.querySelectorAll('input[type="file"]');
    var hasFile = false;
    Array.prototype.forEach.call(fileInputs, function (input) {
      if (input.files && input.files[0]) hasFile = true;
    });

    // Forms with required file but nothing chosen — let the browser handle
    // its own validation message instead of submitting an empty upload.
    var requiredEmpty = false;
    Array.prototype.forEach.call(fileInputs, function (input) {
      if (input.required && !(input.files && input.files[0])) requiredEmpty = true;
    });
    if (requiredEmpty) return false;

    var meta = pickFilenameAndTotal(form);
    var label = form.getAttribute('data-upload-label') || 'file';
    var toast = makeToast({ filename: meta.filename, total: meta.total, label: label });

    var xhr = new XMLHttpRequest();
    var formData = new FormData(form);
    if (CSRF && !formData.has('__token')) {
      formData.append('__token', CSRF);
    }

    form.__uploadInFlight = true;
    var unlock = lockSubmits(form);
    var reloading = false;

    // loadend, not load: it fires for an aborted or errored request too, so a
    // failed upload cannot leave the form permanently unsubmittable. The one
    // case that stays locked is a success that schedules a reload -- the form
    // keeps its file selected across that second, and re-enabling the button
    // would hand back the same double-post this guard exists to stop.
    xhr.addEventListener('loadend', function () {
      if (reloading) return;
      form.__uploadInFlight = false;
      unlock();
    });

    xhr.upload.addEventListener('progress', function (event) {
      if (event.lengthComputable) {
        toast.progress(event.loaded, event.total);
      }
    });

    xhr.addEventListener('load', function () {
      var payload = null;
      try { payload = JSON.parse(xhr.responseText || 'null'); } catch (e) { /* */ }

      if (xhr.status >= 200 && xhr.status < 300 && payload && payload.ok) {
        toast.complete('Saved successfully.');
        form.dispatchEvent(new CustomEvent('upload:success', {
          detail: payload,
          bubbles: true
        }));
        var reload = form.getAttribute('data-upload-reload');
        if (reload !== 'false') {
          reloading = true;
          window.setTimeout(function () { window.location.reload(); }, DEFAULT_RELOAD_DELAY);
        } else {
          resetForm(form);
        }
        return;
      }

      var message = 'Upload could not finish.';
      if (payload && payload.errors) {
        // payload.errors may be {field:[msg,...]} or a flat list
        if (Array.isArray(payload.errors)) {
          message = payload.errors.join(' ');
        } else if (typeof payload.errors === 'object') {
          message = Object.keys(payload.errors).map(function (k) {
            var v = payload.errors[k];
            return Array.isArray(v) ? v.join(' ') : String(v);
          }).join(' ');
        }
      } else if (payload && payload.message) {
        message = payload.message;
      } else if (!payload && xhr.status >= 200 && xhr.status < 300) {
        // Server returned a 2xx but the body wasn't JSON — most likely
        // the AJAX branch wasn't hit and we followed a redirect to HTML.
        message = 'Upload may have succeeded — refresh to confirm.';
      } else if (xhr.status === 0) {
        message = 'Network error — please check your connection.';
      } else if (xhr.status === 413) {
        message = 'File is too large for the server.';
      } else if (xhr.status >= 500) {
        message = 'Server error (' + xhr.status + '). Please try again.';
      }
      toast.error(message);
      flashError(form, message);
    });

    xhr.addEventListener('error', function () {
      toast.error('Network error — upload aborted.');
    });

    xhr.open('POST', form.getAttribute('action'), true);
    xhr.setRequestHeader('X-Requested-With', 'XMLHttpRequest');
    if (CSRF) xhr.setRequestHeader('X-CSRF-TOKEN', CSRF);
    xhr.setRequestHeader('Accept', 'application/json');
    xhr.send(formData);
    return true;
  }

  function wireForm(form) {
    if (form.__uploadWired) return;
    form.__uploadWired = true;
    form.addEventListener('submit', function (event) {
      // Allow the caller to opt out (e.g. when a confirm modal cancels it)
      if (form.hasAttribute('data-upload-skip')) {
        form.removeAttribute('data-upload-skip');
        return;
      }
      event.preventDefault();
      submitForm(form);
    });
  }

  function wireAllForms(scope) {
    var root = scope || document;
    var forms = root.querySelectorAll('form[data-upload-form]');
    Array.prototype.forEach.call(forms, wireForm);
  }

  function init() {
    wireAllDropzones();
    wireAllForms();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

  window.UploadMeter = {
    submit: submitForm,
    wireDropzones: wireAllDropzones,
    wireForms: wireAllForms,
    makeToast: makeToast
  };
})();
