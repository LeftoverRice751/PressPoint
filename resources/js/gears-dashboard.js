(function () {
  var dashboardRoot = document.querySelector('[data-dashboard-shell]');

  if (!dashboardRoot) {
    return;
  }

  var tokenMeta = document.querySelector('meta[name="csrf-token"]');
  var token = tokenMeta ? tokenMeta.getAttribute('content') : '';
  var videoPushUrl = dashboardRoot.getAttribute('data-video-push-url') || '/trigger-video';
  var pageLinks = Array.prototype.slice.call(dashboardRoot.querySelectorAll('[data-page-link][role="tab"]'));
  var pagePanels = Array.prototype.slice.call(dashboardRoot.querySelectorAll('[data-page-panel]'));
  var progressBars = Array.prototype.slice.call(dashboardRoot.querySelectorAll('[data-progress-bar]'));
  var previewPlayer = dashboardRoot.querySelector('[data-video-preview-player]');
  var previewPlaceholder = dashboardRoot.querySelector('[data-video-preview-placeholder]');
  var eventsModal = dashboardRoot.querySelector('[data-events-modal]');
  var eventViewModal = dashboardRoot.querySelector('[data-event-view-modal]');
  var eventViewImage = dashboardRoot.querySelector('[data-event-view-image]');
  var eventViewTitle = dashboardRoot.querySelector('[data-event-view-title]');
  var eventViewWhen = dashboardRoot.querySelector('[data-event-view-when]');
  var eventViewWhere = dashboardRoot.querySelector('[data-event-view-where]');
  var eventViewDescription = dashboardRoot.querySelector('[data-event-view-description]');
  var defaultPage = dashboardRoot.getAttribute('data-default-page') || 'dashboard';
  var openEventsModalOnLoad = dashboardRoot.getAttribute('data-open-events-modal') === 'true';
  var heroEyebrow = dashboardRoot.querySelector('[data-hero-eyebrow]');
  var heroTitle = dashboardRoot.querySelector('[data-hero-title]');
  var heroSubtitle = dashboardRoot.querySelector('[data-hero-subtitle]');
  var heroDefaults = {
    eyebrow: heroEyebrow ? heroEyebrow.textContent : '',
    title: heroTitle ? heroTitle.textContent : '',
    subtitle: heroSubtitle ? heroSubtitle.textContent : ''
  };

  function notify(message, opts) {
    opts = opts || {};
    if (window.UploadMeter && typeof window.UploadMeter.makeToast === 'function') {
      var toast = window.UploadMeter.makeToast({
        filename: message,
        total: 0,
        label: opts.label || 'kiosk'
      });
      toast.element.classList.add('upload-meter__toast--message');
      if (opts.error) {
        toast.error(message);
      } else {
        toast.complete(' ');
      }
      return;
    }
    if (opts.error) {
      console.error('[gears] ' + message);
    } else {
      console.log('[gears] ' + message);
    }
  }

  function confirmAction(opts) {
    if (window.ConfirmModal && typeof window.ConfirmModal.ask === 'function') {
      return window.ConfirmModal.ask(opts);
    }
    return Promise.resolve(window.confirm(opts.body || opts.title || 'Are you sure?'));
  }

  function postKioskAction(action) {
    return fetch(action, {
      method: 'POST',
      headers: { 'X-CSRF-TOKEN': token, 'X-Requested-With': 'XMLHttpRequest' },
      credentials: 'same-origin'
    }).then(function (response) { return response.json(); });
  }

  function postPlay(src, title) {
    var fd = new FormData();
    fd.append('__token', token);
    fd.append('src', src);
    fd.append('title', title || '');

    return fetch(videoPushUrl, {
      method: 'POST',
      headers: { 'X-CSRF-TOKEN': token, 'X-Requested-With': 'XMLHttpRequest' },
      body: fd,
      credentials: 'same-origin'
    }).then(function (response) { return response.json(); });
  }

  function deleteVideo(videoId) {
    return fetch('/videos/dashboard/' + encodeURIComponent(videoId), {
      method: 'DELETE',
      headers: {
        'X-CSRF-TOKEN': token,
        'X-Requested-With': 'XMLHttpRequest',
        'Content-Type': 'application/json'
      },
      credentials: 'same-origin'
    });
  }

  function postVideoIdle(videoId, action) {
    // action: 'set' marks this video as the kiosk attract loop video
    // (singleton — server clears all others); 'clear' un-marks it.
    var suffix = action === 'clear' ? '/idle/clear' : '/idle';
    return fetch('/videos/dashboard/' + encodeURIComponent(videoId) + suffix, {
      method: 'POST',
      headers: {
        'X-CSRF-TOKEN': token,
        'X-Requested-With': 'XMLHttpRequest',
        'Accept': 'application/json'
      },
      credentials: 'same-origin'
    }).then(function (response) {
      return response.json().catch(function () { return null; }).then(function (payload) {
        return { ok: response.ok, payload: payload };
      });
    });
  }

  function deleteArchive(archiveId) {
    return fetch('/archives/dashboard/' + encodeURIComponent(archiveId), {
      method: 'DELETE',
      headers: {
        'X-CSRF-TOKEN': token,
        'X-Requested-With': 'XMLHttpRequest',
        'Content-Type': 'application/json'
      },
      credentials: 'same-origin'
    });
  }

  function syncEmptyStates() {
    // Queried fresh each call: a live refresh can replace these nodes.
    var containers = Array.prototype.slice.call(
      dashboardRoot.querySelectorAll('[data-section-count]')
    );

    containers.forEach(function (container) {
      var count = parseInt(container.getAttribute('data-section-count') || '0', 10) || 0;
      var emptyState = container.querySelector('[data-empty-state]');
      var content = container.querySelector('[data-section-content]');

      if (emptyState) {
        emptyState.hidden = count > 0;
        emptyState.setAttribute('aria-hidden', String(count > 0));
      }

      if (content) {
        content.hidden = count === 0;
        content.setAttribute('aria-hidden', String(count === 0));
      }
    });
  }

  function syncProgressBars() {
    progressBars.forEach(function (bar) {
      var progress = parseInt(bar.getAttribute('data-progress') || '0', 10) || 0;
      bar.style.setProperty('--progress', String(progress));
    });
  }

  function sanitizeVideoSrc(src) {
    if (!src) {
      return '';
    }

    try {
      var parsed = new URL(src, window.location.href);

      if (parsed.origin !== window.location.origin) {
        return '';
      }

      if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
        return '';
      }

      return parsed.href;
    } catch (error) {
      return '';
    }
  }

  function setPreview(videoSrc) {
    if (!previewPlayer) {
      return;
    }

    var safeVideoSrc = sanitizeVideoSrc(videoSrc);

    if (!safeVideoSrc) {
      previewPlayer.removeAttribute('src');
      previewPlayer.load();
      previewPlayer.hidden = true;

      if (previewPlaceholder) {
        previewPlaceholder.hidden = false;
        previewPlaceholder.textContent = 'Select a video to preview it here.';
      }

      return;
    }

    previewPlayer.hidden = false;
    previewPlayer.src = safeVideoSrc;
    previewPlayer.load();

    if (previewPlaceholder) {
      previewPlaceholder.hidden = true;
    }

    previewPlayer.setAttribute('aria-label', 'Video preview player');
  }

  function openEventsModal() {
    if (!eventsModal) {
      return;
    }

    if (typeof eventsModal.showModal === 'function') {
      eventsModal.showModal();
      return;
    }

    eventsModal.hidden = false;
    eventsModal.classList.add('is-open');
  }

  function closeEventsModal() {
    if (!eventsModal) {
      return;
    }

    if (typeof eventsModal.close === 'function') {
      eventsModal.close();
      return;
    }

    eventsModal.hidden = true;
    eventsModal.classList.remove('is-open');
  }

  function openEventViewModal(row) {
    if (!eventViewModal || !row) {
      return;
    }

    if (eventViewTitle) {
      eventViewTitle.textContent = row.getAttribute('data-event-title') || '';
    }
    if (eventViewWhen) {
      eventViewWhen.textContent = row.getAttribute('data-event-when') || 'Not set';
    }
    if (eventViewWhere) {
      eventViewWhere.textContent = row.getAttribute('data-event-where') || 'Unassigned';
    }
    if (eventViewDescription) {
      eventViewDescription.textContent = row.getAttribute('data-event-description') || '';
    }

    var imageSrc = row.getAttribute('data-event-image') || '';
    if (eventViewImage) {
      if (imageSrc) {
        eventViewImage.src = imageSrc;
        eventViewImage.hidden = false;
      } else {
        eventViewImage.removeAttribute('src');
        eventViewImage.hidden = true;
      }
    }

    if (typeof eventViewModal.showModal === 'function') {
      eventViewModal.showModal();
      return;
    }

    eventViewModal.hidden = false;
    eventViewModal.classList.add('is-open');
  }

  function closeEventViewModal() {
    if (!eventViewModal) {
      return;
    }

    if (typeof eventViewModal.close === 'function') {
      eventViewModal.close();
      return;
    }

    eventViewModal.hidden = true;
    eventViewModal.classList.remove('is-open');
  }

  function getHeroValue(panel, attribute, fallback) {
    if (!panel || !panel.hasAttribute(attribute)) {
      return fallback;
    }

    var value = panel.getAttribute(attribute);
    return value === null ? fallback : value;
  }

  function syncHero(panel) {
    if (heroEyebrow) {
      heroEyebrow.textContent = getHeroValue(panel, 'data-hero-eyebrow', heroDefaults.eyebrow);
    }

    if (heroTitle) {
      heroTitle.textContent = getHeroValue(panel, 'data-hero-title', heroDefaults.title);
    }

    if (heroSubtitle) {
      heroSubtitle.textContent = getHeroValue(panel, 'data-hero-subtitle', heroDefaults.subtitle);
    }
  }

  function switchPage(pageName) {
    var targetPage = pageName || defaultPage;
    var activePanel = null;

    pagePanels.forEach(function (panel) {
      var isActive = panel.getAttribute('data-page-panel') === targetPage;
      panel.hidden = !isActive;
      panel.classList.toggle('is-visible', isActive);
      panel.setAttribute('aria-hidden', String(!isActive));
      panel.setAttribute('tabindex', isActive ? '0' : '-1');
      if (isActive) {
        activePanel = panel;
      }
    });

    pageLinks.forEach(function (link) {
      var isActive = link.getAttribute('data-page-link') === targetPage;
      link.classList.toggle('is-active', isActive);
      if (isActive) {
        link.setAttribute('aria-current', 'page');
        link.setAttribute('aria-selected', 'true');
        link.setAttribute('tabindex', '0');
      } else {
        link.removeAttribute('aria-current');
        link.setAttribute('aria-selected', 'false');
        link.setAttribute('tabindex', '-1');
      }
    });

    dashboardRoot.setAttribute('data-active-page', targetPage);
    syncHero(activePanel);
  }

  window.switchPage = switchPage;

  dashboardRoot.addEventListener('click', function (event) {
    var navButton = event.target.closest('[data-page-link]');
    if (navButton && dashboardRoot.contains(navButton)) {
      event.preventDefault();
      switchPage(navButton.getAttribute('data-page-link'));
      return;
    }

    var eventsModalTrigger = event.target.closest('[data-events-modal-open]');
    if (eventsModalTrigger && dashboardRoot.contains(eventsModalTrigger)) {
      event.preventDefault();
      openEventsModal();
      return;
    }

    var eventsModalClose = event.target.closest('[data-events-modal-close]');
    if (eventsModalClose && dashboardRoot.contains(eventsModalClose)) {
      event.preventDefault();
      closeEventsModal();
      return;
    }

    var eventViewModalClose = event.target.closest('[data-event-view-modal-close]');
    if (eventViewModalClose && dashboardRoot.contains(eventViewModalClose)) {
      event.preventDefault();
      closeEventViewModal();
      return;
    }

    var eventViewRow = event.target.closest('[data-event-view-row]');
    if (eventViewRow && dashboardRoot.contains(eventViewRow)) {
      openEventViewModal(eventViewRow);
      return;
    }

    var previewTrigger = event.target.closest('[data-video-preview-trigger]');
    if (previewTrigger && dashboardRoot.contains(previewTrigger)) {
      var previewCard = previewTrigger.closest('[data-video-card]');
      if (previewCard) {
        setPreview(previewCard.getAttribute('data-video-src'));
      }
      return;
    }

    var pushTrigger = event.target.closest('[data-video-push-trigger]');
    if (pushTrigger && dashboardRoot.contains(pushTrigger)) {
      var pushSrc = pushTrigger.getAttribute('data-src');
      var pushTitle = pushTrigger.getAttribute('data-title');

      if (!pushSrc) {
        notify('Could not determine the video source.', { error: true });
        return;
      }

      pushTrigger.disabled = true;
      postPlay(pushSrc, pushTitle)
        .then(function (result) {
          if (result && result.broadcast === false) {
            notify('Saved trigger, but broadcast is off. Check your Pusher settings.', { error: true });
          } else {
            notify('Now playing on the kiosk.');
          }
        })
        .catch(function () {
          notify('Could not reach server.', { error: true });
        })
        .then(function () {
          pushTrigger.disabled = false;
        });
      return;
    }

    var idleTrigger = event.target.closest('[data-video-idle-trigger]');
    if (idleTrigger && dashboardRoot.contains(idleTrigger)) {
      var idleVideoId = idleTrigger.getAttribute('data-video-id');
      var idleActive = idleTrigger.getAttribute('data-idle-active') === 'true';
      var idleAction = idleActive ? 'clear' : 'set';

      if (!idleVideoId) {
        notify('Could not find the video id.', { error: true });
        return;
      }

      idleTrigger.disabled = true;
      postVideoIdle(idleVideoId, idleAction)
        .then(function (result) {
          if (!result.ok || !result.payload || !result.payload.ok) {
            throw new Error('Idle toggle failed');
          }
          // Server enforces singleton; mirror that locally without
          // a full reload so the editor sees instant feedback.
          var allToggles = dashboardRoot.querySelectorAll('[data-video-idle-trigger]');
          Array.prototype.forEach.call(allToggles, function (btn) {
            var isThis = btn === idleTrigger;
            var nowActive = isThis && idleAction === 'set';
            btn.classList.toggle('is-active', nowActive);
            btn.setAttribute('data-idle-active', nowActive ? 'true' : 'false');
            btn.textContent = nowActive ? '★ Showing on idle' : 'Display this on idle';

            // Move the badge on the card body to match.
            var card = btn.closest('[data-video-card]');
            if (!card) return;
            card.classList.toggle('video-card--idle-active', nowActive);
            var existingBadge = card.querySelector('.video-card__badge');
            if (nowActive && !existingBadge) {
              var copyEl = card.querySelector('.video-card__copy');
              if (copyEl) {
                var badge = document.createElement('span');
                badge.className = 'video-card__badge';
                badge.textContent = '★ Idle attract';
                copyEl.appendChild(badge);
              }
            } else if (!nowActive && existingBadge) {
              existingBadge.remove();
            }
          });

          notify(idleAction === 'set'
            ? 'Idle video set. The kiosk will play this when nobody is touching the screen.'
            : 'Idle video cleared.');
        })
        .catch(function () {
          notify('Could not update the idle video.', { error: true });
        })
        .then(function () {
          idleTrigger.disabled = false;
        });
      return;
    }

    var deleteTrigger = event.target.closest('[data-video-delete-trigger]');
    if (deleteTrigger && dashboardRoot.contains(deleteTrigger)) {
      var videoId = deleteTrigger.getAttribute('data-video-id');
      // Confirmation is handled upstream by confirm-modal.js via
      // data-confirm — by the time we run here the user has already
      // approved the action.

      if (!videoId) {
        notify('Could not find the video id.', { error: true });
        return;
      }

      deleteTrigger.disabled = true;
      deleteVideo(videoId)
        .then(function (response) {
          if (!response.ok) {
            throw new Error('Delete failed');
          }
          notify('Video deleted.');
          if (window.DashboardLive) {
            return window.DashboardLive.refresh('videos');
          }
        })
        .catch(function () {
          notify('Could not delete the video.', { error: true });
        })
        .then(function () {
          deleteTrigger.disabled = false;
        });
      return;
    }

    var kioskTrigger = event.target.closest('[data-kiosk-action]');
    if (kioskTrigger && dashboardRoot.contains(kioskTrigger)) {
      var kioskAction = kioskTrigger.getAttribute('data-kiosk-action');
      var kioskUrl = kioskTrigger.getAttribute('data-kiosk-url');

      if (!kioskAction) {
        notify('Could not determine the kiosk action.', { error: true });
        return;
      }

      if (!kioskUrl) {
        notify('Could not determine the kiosk endpoint.', { error: true });
        return;
      }

      kioskTrigger.disabled = true;
      postKioskAction(kioskUrl)
        .then(function () {
          notify(kioskAction === 'lock' ? 'Kiosk lock event sent.' : 'Kiosk unlock event sent.');
        })
        .catch(function () {
          notify('Could not reach server.', { error: true });
        })
        .then(function () {
          kioskTrigger.disabled = false;
        });
    }
  });

  syncProgressBars();
  syncEmptyStates();
  switchPage(defaultPage);

  if (eventsModal) {
    eventsModal.addEventListener('click', function (event) {
      if (event.target === eventsModal) {
        closeEventsModal();
      }
    });
  }

  if (eventViewModal) {
    eventViewModal.addEventListener('click', function (event) {
      if (event.target === eventViewModal) {
        closeEventViewModal();
      }
    });
  }

  dashboardRoot.addEventListener('keydown', function (event) {
    if (event.key !== 'Enter' && event.key !== ' ') {
      return;
    }

    var row = event.target.closest('[data-event-view-row]');
    if (row && dashboardRoot.contains(row)) {
      event.preventDefault();
      openEventViewModal(row);
    }
  });

  // Event image drop zone. Preview and validation only -- the server re-checks
  // the bytes with libmagic (ImageUploads.save_uploaded_image), so nothing here
  // is a security boundary; it exists so an editor is not told about a 5 MB
  // file only after the upload finishes.
  var EVENT_IMAGE_MAX_BYTES = 4 * 1024 * 1024;
  var EVENT_IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/webp'];

  var eventImageInput = dashboardRoot.querySelector('[data-event-image-input]');
  var eventImageDrop = dashboardRoot.querySelector('[data-event-image-drop]');
  var eventImagePreview = dashboardRoot.querySelector('[data-event-image-preview]');
  var eventImageThumb = dashboardRoot.querySelector('[data-event-image-thumb]');
  var eventImageName = dashboardRoot.querySelector('[data-event-image-name]');
  var eventImageSize = dashboardRoot.querySelector('[data-event-image-size]');
  var eventImageError = dashboardRoot.querySelector('[data-event-image-error]');
  var eventImageRemove = dashboardRoot.querySelector('[data-event-image-remove]');

  function formatFileSize(bytes) {
    if (bytes < 1024) {
      return bytes + ' B';
    }
    if (bytes < 1024 * 1024) {
      return (bytes / 1024).toFixed(0) + ' KB';
    }
    return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
  }

  function showEventImageError(message) {
    if (!eventImageError) {
      return;
    }
    eventImageError.textContent = message;
    eventImageError.hidden = !message;
  }

  function clearEventImage() {
    if (eventImageInput) {
      eventImageInput.value = '';
    }
    if (eventImageThumb) {
      // Release the object URL: without this every re-pick leaks a blob for
      // the lifetime of the page.
      if (eventImageThumb.src.indexOf('blob:') === 0) {
        URL.revokeObjectURL(eventImageThumb.src);
      }
      eventImageThumb.removeAttribute('src');
    }
    if (eventImagePreview) {
      eventImagePreview.hidden = true;
    }
    showEventImageError('');
  }

  function applyEventImage(file) {
    showEventImageError('');

    if (!file) {
      clearEventImage();
      return;
    }

    if (EVENT_IMAGE_TYPES.indexOf(file.type) === -1) {
      clearEventImage();
      showEventImageError('Choose a JPEG, PNG, or WEBP image.');
      return;
    }

    if (file.size > EVENT_IMAGE_MAX_BYTES) {
      clearEventImage();
      showEventImageError('Image must be 4 MB or smaller.');
      return;
    }

    if (eventImageThumb) {
      if (eventImageThumb.src.indexOf('blob:') === 0) {
        URL.revokeObjectURL(eventImageThumb.src);
      }
      eventImageThumb.src = URL.createObjectURL(file);
    }
    if (eventImageName) {
      eventImageName.textContent = file.name;
    }
    if (eventImageSize) {
      eventImageSize.textContent = formatFileSize(file.size);
    }
    if (eventImagePreview) {
      eventImagePreview.hidden = false;
    }
  }

  if (eventImageInput) {
    eventImageInput.addEventListener('change', function () {
      applyEventImage(eventImageInput.files && eventImageInput.files[0]);
    });
  }

  if (eventImageRemove) {
    eventImageRemove.addEventListener('click', function (event) {
      // The remove button sits inside the field, not inside the drop label,
      // but stop the click anyway so it can never reopen the file picker.
      event.preventDefault();
      event.stopPropagation();
      clearEventImage();
    });
  }

  if (eventImageDrop) {
    ['dragenter', 'dragover'].forEach(function (name) {
      eventImageDrop.addEventListener(name, function (event) {
        event.preventDefault();
        eventImageDrop.classList.add('image-drop--dragging');
      });
    });

    ['dragleave', 'dragend', 'drop'].forEach(function (name) {
      eventImageDrop.addEventListener(name, function () {
        eventImageDrop.classList.remove('image-drop--dragging');
      });
    });

    eventImageDrop.addEventListener('drop', function (event) {
      event.preventDefault();
      var dropped = event.dataTransfer && event.dataTransfer.files;
      if (!dropped || !dropped.length) {
        return;
      }

      // Assigning the DataTransfer's own FileList is what makes the dropped
      // file part of the form submission; there is no way to set input.files
      // from a bare File.
      if (eventImageInput) {
        eventImageInput.files = dropped;
      }
      applyEventImage(dropped[0]);
    });
  }

  // Events save posts JSON and refreshes the table in place. The form keeps its
  // real action, so it still submits normally if this script never runs.
  var eventsForm = dashboardRoot.querySelector('[data-events-form]');
  if (eventsForm) {
    eventsForm.addEventListener('submit', function (event) {
      event.preventDefault();

      var submitButton = eventsForm.querySelector('button[type="submit"]');
      clearFormError(eventsForm);
      if (submitButton) {
        submitButton.disabled = true;
      }

      var formData = new FormData(eventsForm);
      if (token && !formData.has('__token')) {
        formData.append('__token', token);
      }

      fetch(eventsForm.getAttribute('action'), {
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
            var errors = (payload && payload.errors) || ['Could not save the event.'];
            throw new Error(Array.isArray(errors) ? errors.join(' ') : String(errors));
          }

          eventsForm.reset();
          // reset() empties the file input but leaves the preview we built
          // from it on screen, so the next Add Event opens showing the last
          // event's poster.
          clearEventImage();
          closeEventsModal();
          notify('Event saved.');

          if (window.DashboardLive) {
            window.DashboardLive.refresh('events');
          }
        })
        .catch(function (error) {
          // Keep the modal open and show why, instead of flashing on a reload.
          showFormError(eventsForm, error.message || 'Could not save the event.');
        })
        .then(function () {
          if (submitButton) {
            submitButton.disabled = false;
          }
        });
    });
  }

  function clearFormError(form) {
    var existing = form.querySelector('.upload-form-error');
    if (existing) {
      existing.remove();
    }
  }

  function showFormError(form, message) {
    clearFormError(form);
    var node = document.createElement('div');
    node.className = 'upload-form-error dashboard-alert';
    node.innerHTML = '<ul class="dashboard-alert__list"><li></li></ul>';
    node.querySelector('li').textContent = message;
    form.insertBefore(node, form.firstChild);
  }

  if (openEventsModalOnLoad) {
    openEventsModal();
  }

  var firstVideoCard = dashboardRoot.querySelector('[data-video-card]');
  if (firstVideoCard && previewPlayer) {
    setPreview(firstVideoCard.getAttribute('data-video-src'));
  } else if (previewPlayer) {
    setPreview('');
  }

  // After a live refresh swaps the library, the previewed video may no longer
  // exist — fall back to whatever card is now first, or to the placeholder.
  dashboardRoot.addEventListener('live:refreshed', function (event) {
    if (!previewPlayer || !event.detail || event.detail.section !== 'videos') {
      return;
    }

    var current = previewPlayer.getAttribute('src') || '';
    var stillListed = current && dashboardRoot.querySelector(
      '[data-video-card][data-video-src="' + current.replace(/"/g, '\\"') + '"]'
    );

    if (stillListed) {
      return;
    }

    var nextCard = dashboardRoot.querySelector('[data-video-card]');
    setPreview(nextCard ? nextCard.getAttribute('data-video-src') : '');
  });

  window.GearsDashboard = {
    syncEmptyStates: syncEmptyStates,
    notify: notify,
    setPreview: setPreview
  };
})();

// ── Dashboard AJAX: toast + form interceptor ─────────────────────────────────
(function () {
  var tokenMeta = document.querySelector('meta[name="csrf-token"]');
  var csrfToken = tokenMeta ? tokenMeta.getAttribute('content') : '';

  // ── Toast ─────────────────────────────────────────────────
  function showToast(msg, isError) {
    var t = document.createElement('div');
    t.className = 'gears-toast' + (isError ? ' gears-toast--error' : '');
    t.textContent = msg;
    document.body.appendChild(t);
    requestAnimationFrame(function () {
      requestAnimationFrame(function () { t.classList.add('is-visible'); });
    });
    setTimeout(function () {
      t.classList.remove('is-visible');
      setTimeout(function () { t.remove(); }, 300);
    }, 3500);
  }

  // ── Post-success DOM updates ───────────────────────────────
  function handleAjaxSuccess(form, json) {
    var action = form.getAttribute('action') || '';

    // Milestone delete: fade and remove the list item
    if (json.id && action.indexOf('/milestones/') !== -1 && action.indexOf('/delete') !== -1) {
      var li = form.closest('li');
      if (li) {
        li.style.transition = 'opacity 0.25s';
        li.style.opacity = '0';
        setTimeout(function () { li.remove(); }, 260);
      }
      return;
    }

    // Milestone reorder: nothing to update in the DOM — server state changed
    if (action.indexOf('/milestones/') !== -1 && action.indexOf('/reorder') !== -1) {
      return;
    }

    // Milestone create: append placeholder row + reset form
    if (json.milestone) {
      var list = document.querySelector('[data-about-panel="history"] .about-milestones');
      if (list) {
        var li2 = document.createElement('li');
        li2.className = 'about-milestone';
        li2.style.opacity = '0.6';
        li2.innerHTML =
          '<div class="about-milestone__form form-stack" style="padding:0.75rem 0">' +
            '<strong style="color:var(--ink-oxblood)">' +
              escapeHtml(json.milestone.year) + ' — ' + escapeHtml(json.milestone.heading) +
            '</strong>' +
            ' <span style="color:var(--ink-muted);font-size:0.82rem">(reload to edit)</span>' +
          '</div>';
        list.appendChild(li2);
      }
      form.reset();
      var qe = form.querySelector('.js-body-editor');
      if (qe && qe._quill) qe._quill.setContents([]);
      return;
    }

    // Archive upload: prepend new card to the grid
    if (json.archive) {
      var grid = document.querySelector(
        '[data-page-panel="archives"] .archive-grid, ' +
        '[data-page-panel="archives"] [data-archive-list]'
      );
      if (grid) {
        var card = document.createElement('article');
        card.className = 'archive-card';
        card.innerHTML =
          '<div class="archive-card__cover archive-card__cover--fallback" aria-hidden="true">' +
            '<span class="archive-card__cover-text">Processing…</span>' +
          '</div>' +
          '<div class="archive-card__body">' +
            '<div class="archive-card__title">' + escapeHtml(json.archive.name || '') + '</div>' +
            '<div class="archive-card__meta">' +
              '<span>' + escapeHtml(json.archive.type || '') + '</span>' +
              '<span>Year ' + escapeHtml(String(json.archive.year || 'Not set')) + '</span>' +
            '</div>' +
            '<div class="archive-card__year">' + escapeHtml(String(json.archive.year || 'Undated')) + '</div>' +
            '<div class="archive-card__path">' + escapeHtml(json.archive.file_path || '') + '</div>' +
          '</div>';
        grid.prepend(card);
      }
      form.reset();
      return;
    }

    // News save: reset form and update library card status badge if editing existing
    if (json.article) {
      form.reset();
      var idField = form.querySelector('[data-news-field="article_id"]');
      if (idField) idField.value = '';
      form.querySelectorAll('.js-body-editor').forEach(function (el) {
        if (el._quill) el._quill.setContents([]);
      });
      if (!json.article.is_new && json.article.id) {
        var libCard = document.querySelector('[data-news-library-id="' + json.article.id + '"]');
        if (libCard) {
          var badge = libCard.querySelector('.news-story-card__status');
          if (badge) {
            var s = json.article.status || 'published';
            badge.className = 'news-story-card__status news-story-card__status--' + s;
            badge.textContent = s.charAt(0).toUpperCase() + s.slice(1);
          }
        }
      }
      return;
    }

    // Seal upload: update preview image if present
    if (json.seal_url) {
      var preview = document.querySelector('.about-seal-preview');
      if (preview) {
        preview.src = json.seal_url;
      }
      return;
    }

    // All other saves (section text, hymn audio): nothing extra needed.
  }

  function escapeHtml(str) {
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  // ── Generic AJAX form handler ──────────────────────────────
  function ajaxSubmit(form) {
    if (form.dataset.ajaxBound) return;
    form.dataset.ajaxBound = '1';

    form.addEventListener('submit', function (e) {
      e.preventDefault();

      // Let about-lspu-editor.js fire its submit listeners first
      // (they populate the hidden body_html / subsections inputs).
      var btn = form.querySelector('[type="submit"]');
      if (btn) {
        btn.disabled = true;
        btn.dataset.origText = btn.textContent;
        btn.textContent = 'Saving…';
      }

      var fd = new FormData(form);

      fetch(form.getAttribute('action'), {
        method: (form.getAttribute('method') || 'POST').toUpperCase(),
        headers: {
          'X-CSRF-TOKEN': csrfToken,
          'X-Requested-With': 'XMLHttpRequest'
        },
        body: fd,
        credentials: 'same-origin'
      })
      .then(function (r) {
        if (!r.ok && r.status !== 422 && r.status !== 400) {
          throw new Error('HTTP ' + r.status);
        }
        return r.json();
      })
      .then(function (json) {
        if (btn) {
          btn.disabled = false;
          btn.textContent = btn.dataset.origText || 'Save';
        }
        if (json.ok) {
          showToast((json.messages && json.messages[0]) || 'Saved.', false);
          handleAjaxSuccess(form, json);
        } else {
          showToast((json.errors && json.errors[0]) || 'Something went wrong.', true);
        }
      })
      .catch(function () {
        if (btn) {
          btn.disabled = false;
          btn.textContent = btn.dataset.origText || 'Save';
        }
        showToast('Request failed — please try again.', true);
      });
    });
  }

  // NOT in this list: form[data-upload-form]. upload-meter.js has owned that
  // selector since it was written -- it intercepts the submit, streams the file
  // with progress, and dispatches upload:success for dashboard-live.js and
  // org-board-editor.js to refresh on. Binding it here too attached a second
  // submit listener: each file guards its own binding (form.__uploadWired here
  // vs form.dataset.ajaxBound there) but neither guard can see the other, so
  // both called preventDefault() and both POSTed. One click on "Upload archive"
  // or "Add member" wrote two rows. It looked like a double click; it was one
  // click with two handlers.
  var AJAX_SELECTORS = [
    'form[data-section-form]',
    'form[data-milestone-form]',
    'form.about-milestone__action-form'
  ].join(', ');

  document.querySelectorAll(AJAX_SELECTORS).forEach(ajaxSubmit);
})();

// ── Account chrome: notification bell + profile menu ─────────────────────────
//
// Both live in the hero header (top right). The hero's text is rewritten on
// every page switch, but only the three data-hero-* nodes are touched, so these
// siblings survive — they are set up once here rather than re-bound per panel.
//
// The logout form moved into the profile dropdown from the sidebar footer. It
// is still a real POST form with the data-confirm-* attributes confirm-modal.js
// hooks, so the "Log out?" dialog behaves exactly as it did before.
(function () {
  var root = document.querySelector('[data-dashboard-shell]');
  if (!root) return;

  var tokenMeta = document.querySelector('meta[name="csrf-token"]');
  var csrf = tokenMeta ? tokenMeta.getAttribute('content') : '';

  function toast(msg, isError) {
    if (window.GearsDashboard && window.GearsDashboard.notify) {
      window.GearsDashboard.notify(msg, { error: !!isError });
    }
  }

  function postJson(url, body) {
    return fetch(url, {
      method: 'POST',
      headers: {
        'X-CSRF-TOKEN': csrf,
        'X-Requested-With': 'XMLHttpRequest',
        'Content-Type': 'application/json'
      },
      credentials: 'same-origin',
      body: JSON.stringify(body || {})
    }).then(function (r) { return r.json().catch(function () { return { ok: false }; }); });
  }

  // ── Dropdown plumbing shared by the bell and the profile menu ──────────
  // Only one may be open at a time, both close on outside-click and Escape,
  // and aria-expanded tracks the panel so the state is announced.
  var openPanel = null;

  function closeOpenPanel() {
    if (!openPanel) return;
    openPanel.panel.hidden = true;
    openPanel.toggle.setAttribute('aria-expanded', 'false');
    openPanel = null;
  }

  function bindDropdown(toggle, panel, onOpen) {
    if (!toggle || !panel) return;

    toggle.addEventListener('click', function (event) {
      event.preventDefault();
      event.stopPropagation();
      var isOpen = openPanel && openPanel.panel === panel;
      closeOpenPanel();
      if (isOpen) return;
      panel.hidden = false;
      toggle.setAttribute('aria-expanded', 'true');
      openPanel = { panel: panel, toggle: toggle };
      if (onOpen) onOpen();
    });

    // Clicks inside the panel must not bubble out to the document handler
    // below, or opening the panel would immediately close it. The one
    // exception is a [data-page-link] — the dropdown's "Profile" entry — whose
    // handler is the shell's delegate on [data-dashboard-shell], an *ancestor*
    // of this panel. Swallowing it here left that button dead: the dropdown
    // opened, the entry highlighted, and nothing happened. Let it through and
    // the document handler closes the dropdown on the way past.
    panel.addEventListener('click', function (event) {
      if (event.target.closest('[data-page-link]')) return;
      event.stopPropagation();
    });
  }

  document.addEventListener('click', closeOpenPanel);
  document.addEventListener('keydown', function (event) {
    if (event.key === 'Escape') closeOpenPanel();
  });

  // ── Bell ────────────────────────────────────────────────────────────────
  var bell = root.querySelector('[data-bell]');
  if (bell) {
    var bellToggle = bell.querySelector('[data-bell-toggle]');
    var bellPanel = bell.querySelector('[data-bell-panel]');
    var bellList = bell.querySelector('[data-bell-list]');
    var bellCount = bell.querySelector('[data-bell-count]');
    var bellReadAll = bell.querySelector('[data-bell-read-all]');

    // Exposed so dashboard-live.js can push the count from the poll it already
    // runs, instead of this file starting a second timer for one integer.
    window.GearsBell = {
      setCount: function (count) {
        if (!bellCount) return;
        var n = parseInt(count, 10) || 0;
        bellCount.textContent = n > 99 ? '99+' : String(n);
        bellCount.hidden = n === 0;
      }
    };

    function renderNotifications(items) {
      if (!bellList) return;
      bellList.innerHTML = '';

      if (!items || !items.length) {
        var empty = document.createElement('li');
        empty.className = 'gears-bell__empty';
        empty.textContent = 'Nothing new.';
        bellList.appendChild(empty);
        return;
      }

      items.forEach(function (item) {
        var li = document.createElement('li');
        li.className = 'gears-bell__item' + (item.read ? '' : ' is-unread');

        var title = document.createElement('p');
        title.className = 'gears-bell__item-title';
        // textContent, not innerHTML: the message carries an admin's free-text
        // rejection reason straight from the database.
        title.textContent = item.title || '';
        li.appendChild(title);

        if (item.message) {
          var msg = document.createElement('p');
          msg.className = 'gears-bell__item-message';
          msg.textContent = item.message;
          li.appendChild(msg);
        }

        if (item.date) {
          var when = document.createElement('p');
          when.className = 'gears-bell__item-date';
          when.textContent = item.date;
          li.appendChild(when);
        }

        // Reading one marks it read and takes you to the story it is about.
        li.addEventListener('click', function () {
          if (!item.read && item.id) {
            postJson('/gears/notifications/' + item.id + '/read').then(function (json) {
              if (json && json.ok && window.GearsBell) window.GearsBell.setCount(json.unread);
            });
            li.classList.remove('is-unread');
            item.read = true;
          }
          if (item.link && window.switchPage && item.link.indexOf('page=') !== -1) {
            closeOpenPanel();
            window.switchPage(item.link.split('page=')[1]);
          }
        });

        bellList.appendChild(li);
      });
    }

    // Fetched when opened, not on page load: most sessions never open the bell,
    // and the badge count already comes free with the stamps poll.
    bindDropdown(bellToggle, bellPanel, function () {
      if (bellList) bellList.innerHTML = '<li class="gears-bell__empty">Loading…</li>';
      fetch('/gears/notifications', {
        headers: { 'X-Requested-With': 'XMLHttpRequest', Accept: 'application/json' },
        credentials: 'same-origin'
      })
        .then(function (r) { return r.json(); })
        .then(function (json) {
          if (!json || !json.ok) {
            if (bellList) bellList.innerHTML = '<li class="gears-bell__empty">Could not load notifications.</li>';
            return;
          }
          renderNotifications(json.notifications);
          if (window.GearsBell) window.GearsBell.setCount(json.unread);
        })
        .catch(function () {
          if (bellList) bellList.innerHTML = '<li class="gears-bell__empty">Could not load notifications.</li>';
        });
    });

    if (bellReadAll) {
      bellReadAll.addEventListener('click', function () {
        postJson('/gears/notifications/read-all').then(function (json) {
          if (json && json.ok) {
            if (window.GearsBell) window.GearsBell.setCount(0);
            bell.querySelectorAll('.gears-bell__item').forEach(function (el) {
              el.classList.remove('is-unread');
            });
          }
        });
      });
    }
  }

  // ── Profile menu ────────────────────────────────────────────────────────
  var profile = root.querySelector('[data-profile-menu]');
  if (profile) {
    bindDropdown(
      profile.querySelector('[data-profile-toggle]'),
      profile.querySelector('[data-profile-panel]')
    );
    // The "Profile" entry carries data-page-link, so the shell's existing nav
    // handler switches panels for it and the document click handler closes the
    // dropdown — nothing extra to bind here.
  }

  // ── Profile panel: name and avatar ──────────────────────────────────────
  var profileForm = root.querySelector('[data-profile-form]');
  if (profileForm) {
    var nameInput = profileForm.querySelector('[data-profile-name]');
    var saveBtn = profileForm.querySelector('[data-profile-save]');
    var avatarInput = profileForm.querySelector('[data-profile-avatar-input]');
    var avatarRemove = profileForm.querySelector('[data-profile-avatar-remove]');
    var avatarPreview = profileForm.querySelector('[data-profile-avatar-preview]');
    var initialsEl = profileForm.querySelector('[data-profile-initials]');

    // Keeps the profile panel and the hero border showing the same thing after
    // a save, without a page reload.
    function applyProfile(data) {
      if (!data) return;
      var heroName = root.querySelector('.gears-profile__name');
      var heroIdentity = root.querySelector('.gears-profile__identity-name');
      if (heroName) heroName.textContent = data.display_name || '';
      if (heroIdentity) heroIdentity.textContent = data.display_name || '';

      var hasAvatar = !!data.avatar_url;
      if (avatarPreview) {
        // Cache-bust: replacing a picture keeps the same <img> element, and
        // the browser would otherwise reuse the old bytes for the new URL.
        avatarPreview.src = hasAvatar ? data.avatar_url + '?v=' + Date.now() : '';
        avatarPreview.hidden = !hasAvatar;
      }
      if (initialsEl) {
        initialsEl.textContent = data.initials || '?';
        initialsEl.hidden = hasAvatar;
      }
      if (avatarRemove) avatarRemove.hidden = !hasAvatar;

      // The hero border shows either an <img> or an initials <span>; which one
      // exists depends on what the server rendered, so update whichever is there.
      var heroAvatar = root.querySelector('.gears-profile__avatar');
      if (heroAvatar) {
        if (hasAvatar && heroAvatar.tagName === 'IMG') {
          heroAvatar.src = data.avatar_url + '?v=' + Date.now();
        } else if (!hasAvatar && heroAvatar.tagName !== 'IMG') {
          heroAvatar.textContent = data.initials || '?';
        } else {
          // The element type has to change (initials <-> photo). A reload is
          // the honest way to do that rather than swapping nodes and risking
          // the two surfaces disagreeing.
          window.location.reload();
        }
      }
    }

    if (saveBtn) {
      saveBtn.addEventListener('click', function () {
        var value = nameInput ? nameInput.value.trim() : '';
        if (!value) { toast('Please enter your name.', true); return; }

        saveBtn.disabled = true;
        postJson('/gears/profile', { full_name: value })
          .then(function (json) {
            saveBtn.disabled = false;
            if (json && json.ok) {
              applyProfile(json);
              toast((json.messages && json.messages[0]) || 'Profile updated.', false);
            } else {
              toast((json && json.errors && json.errors[0]) || 'Could not save your profile.', true);
            }
          })
          .catch(function () {
            saveBtn.disabled = false;
            toast('Request failed — please try again.', true);
          });
      });
    }

    if (avatarInput) {
      avatarInput.addEventListener('change', function () {
        var file = avatarInput.files && avatarInput.files[0];
        if (!file) return;

        // multipart, not JSON: the server reads this through
        // ImageUploads.save_uploaded_image, which validates the actual bytes.
        var data = new FormData();
        data.append('avatar', file);

        fetch('/gears/profile/avatar', {
          method: 'POST',
          headers: { 'X-CSRF-TOKEN': csrf, 'X-Requested-With': 'XMLHttpRequest' },
          credentials: 'same-origin',
          body: data
        })
          .then(function (r) { return r.json().catch(function () { return { ok: false }; }); })
          .then(function (json) {
            if (json && json.ok) {
              applyProfile(json);
              toast((json.messages && json.messages[0]) || 'Picture updated.', false);
            } else {
              toast((json && json.errors && json.errors[0]) || 'Could not upload that picture.', true);
            }
            // Let the same file be chosen again after a failure.
            avatarInput.value = '';
          })
          .catch(function () {
            toast('Upload failed — please try again.', true);
            avatarInput.value = '';
          });
      });
    }

    if (avatarRemove) {
      avatarRemove.addEventListener('click', function () {
        postJson('/gears/profile/avatar/remove').then(function (json) {
          if (json && json.ok) {
            applyProfile(json);
            toast('Picture removed.', false);
          } else {
            toast('Could not remove your picture.', true);
          }
        });
      });
    }

    // ── Change password ──────────────────────────────────────────────────
    // Mirrors app/services/PasswordChange.py's thresholds (Masonite's
    // `strong` defaults). The server is the authority; this only tells an
    // honest user which rule they miss BEFORE submit, since the server's
    // refusal is deliberately one generic sentence.
    var pwForm = root.querySelector('[data-profile-password-form]');
    if (pwForm) {
      var pwNew = pwForm.querySelector('[data-profile-password-new]');
      var pwConfirm = pwForm.querySelector('[data-profile-password-confirm]');
      var pwBar = pwForm.querySelector('[data-profile-password-bar]');
      var pwLabel = pwForm.querySelector('[data-profile-password-label]');
      var pwSave = pwForm.querySelector('[data-profile-password-save]');
      var pwHint = pwLabel ? pwLabel.textContent : '';

      function count(str, test) {
        var n = 0;
        for (var i = 0; i < str.length; i++) if (test(str[i])) n++;
        return n;
      }

      function missingRules(pw) {
        var missing = [];
        if (pw.length < 8) missing.push('8+ characters');
        if (count(pw, function (c) { return c !== c.toLowerCase() && c === c.toUpperCase(); }) < 2) missing.push('2 uppercase');
        if (count(pw, function (c) { return c !== c.toUpperCase() && c === c.toLowerCase(); }) < 2) missing.push('2 lowercase');
        if (count(pw, function (c) { return /\d/.test(c); }) < 2) missing.push('2 numbers');
        if (count(pw, function (c) { return /[^A-Za-z0-9]/.test(c); }) < 2) missing.push('2 symbols');
        return missing;
      }

      function updateMeter() {
        var pw = pwNew ? pwNew.value : '';
        var missing = missingRules(pw);
        var met = 5 - missing.length;
        if (pwBar) {
          pwBar.style.width = (pw ? (met / 5) * 100 : 0) + '%';
          pwBar.style.backgroundColor = met < 3 ? 'var(--danger)' : met < 5 ? 'var(--warn)' : 'var(--ok)';
        }
        if (pwLabel) {
          if (!pw) { pwLabel.textContent = pwHint; pwLabel.style.color = ''; }
          else if (!missing.length) { pwLabel.textContent = 'Strong password.'; pwLabel.style.color = 'var(--ok)'; }
          else { pwLabel.textContent = 'Needs: ' + missing.join(', '); pwLabel.style.color = ''; }
        }
      }

      if (pwNew) { pwNew.addEventListener('input', updateMeter); updateMeter(); }
      if (pwConfirm && pwNew) {
        pwConfirm.addEventListener('input', function () {
          pwConfirm.setCustomValidity(
            pwNew.value && pwConfirm.value && pwNew.value !== pwConfirm.value ? 'Passwords do not match.' : ''
          );
        });
      }

      // aria-pressed is the single source of truth, same as auth-password-toggle.js.
      Array.prototype.forEach.call(pwForm.querySelectorAll('[data-password-toggle]'), function (toggle) {
        var input = document.getElementById(toggle.getAttribute('data-password-toggle'));
        if (!input) return;
        toggle.addEventListener('click', function () {
          var showing = toggle.getAttribute('aria-pressed') === 'true';
          input.type = showing ? 'password' : 'text';
          toggle.setAttribute('aria-pressed', String(!showing));
          toggle.setAttribute('aria-label', showing ? 'Show password' : 'Hide password');
        });
      });

      pwForm.addEventListener('submit', function (event) {
        event.preventDefault();
        if (!pwForm.reportValidity()) return;
        if (pwSave) pwSave.disabled = true;
        postJson(pwForm.getAttribute('action'), {
          current_password: pwForm.elements.current_password.value,
          password: pwForm.elements.password.value,
          password_confirmation: pwForm.elements.password_confirmation.value
        })
          .then(function (json) {
            if (pwSave) pwSave.disabled = false;
            if (json && json.ok) {
              pwForm.reset();
              updateMeter();
              toast((json.messages && json.messages[0]) || 'Password changed.', false);
            } else {
              toast((json && json.errors && json.errors[0]) || 'Could not change your password.', true);
            }
          })
          .catch(function () {
            if (pwSave) pwSave.disabled = false;
            toast('Request failed — please try again.', true);
          });
      });
    }
  }

  /* ── Off-canvas rail ──────────────────────────────────────────────────────
   *
   * The sidebar collapses fully off-screen. Loaded by gears/shell.html, so this
   * runs on all three staff consoles -- the editors' dashboard, the admin
   * console at /users, and the super admin console -- without any of them
   * knowing about it.
   *
   * State lives on <html> as `data-sidebar`, and is stamped there by an inline
   * script in the shell's head BEFORE first paint. This file is deferred: if it
   * owned the initial read, the rail would paint at its full 280px and snap
   * shut on every page load. Everything here is about transitions after that
   * first paint.
   */
  (function railToggle() {
    var toggle = document.querySelector('[data-sidebar-toggle]');
    var rail = document.getElementById('gears-sidebar');
    if (!toggle || !rail) return;

    var scrim = document.querySelector('[data-sidebar-scrim]');
    var label = toggle.querySelector('[data-sidebar-toggle-label]');
    var root = document.documentElement;
    // Matches the breakpoint in gears-dashboard.css. Below it the rail overlays
    // the page instead of displacing it, which changes what "closed" has to do.
    var overlay = window.matchMedia('(max-width: 1180px)');

    function isOpen() {
      // Two different defaults on purpose. Wide: open unless the editor chose
      // otherwise. Narrow: always closed on arrival, whichever way the stored
      // preference points -- a drawer that opens itself over the content of a
      // small screen is never what someone wants when they land.
      return overlay.matches
        ? root.getAttribute('data-sidebar') === 'open'
        : root.getAttribute('data-sidebar') !== 'closed';
    }

    function paint() {
      var open = isOpen();
      toggle.setAttribute('aria-expanded', open ? 'true' : 'false');
      if (label) label.textContent = open ? 'Hide navigation' : 'Show navigation';
      if (scrim) scrim.hidden = !(open && overlay.matches);
      // Only in overlay mode: the drawer covers the page, so scrolling it
      // behind the rail is disorienting. Displacing the grid does not.
      document.body.style.overflow = (open && overlay.matches) ? 'hidden' : '';
    }

    function setOpen(open) {
      root.setAttribute('data-sidebar', open ? 'open' : 'closed');
      // Only the wide-screen choice is worth keeping. Remembering a narrow
      // drawer as "open" would reopen it over the content on the next load,
      // which is the one state nobody asked for.
      if (!overlay.matches) {
        try {
          localStorage.setItem('gears:sidebar', open ? 'open' : 'closed');
        } catch (e) { /* private window or blocked site data; the toggle still works */ }
      }
      paint();
    }

    toggle.addEventListener('click', function () {
      var opening = !isOpen();
      setOpen(opening);
      // Overlay only. Moving focus into a rail that merely displaced the page
      // would yank the editor out of whatever they were doing for no reason.
      if (opening && overlay.matches) {
        var first = rail.querySelector('a, button');
        if (first && first.focus) first.focus();
      }
    });

    if (scrim) {
      scrim.addEventListener('click', function () {
        setOpen(false);
        if (toggle.focus) toggle.focus();
      });
    }

    document.addEventListener('keydown', function (event) {
      if ((event.key || '').toLowerCase() !== 'escape') return;
      // Esc has other owners on these pages (the context menu, the modals), so
      // only claim it when the drawer is actually covering something.
      if (!overlay.matches || !isOpen()) return;
      setOpen(false);
      if (toggle.focus) toggle.focus();
    });

    // Crossing the breakpoint changes what the same attribute means. A drawer
    // left open at phone width would otherwise come back as a pinned overlay
    // when the window is widened, with the scrim still over the page.
    function onBreakpoint() {
      if (overlay.matches) {
        root.setAttribute('data-sidebar', 'closed');
      } else {
        var stored = null;
        try { stored = localStorage.getItem('gears:sidebar'); } catch (e) { /* no storage */ }
        root.setAttribute('data-sidebar', stored === 'closed' ? 'closed' : 'open');
      }
      paint();
    }

    if (overlay.addEventListener) overlay.addEventListener('change', onBreakpoint);
    else if (overlay.addListener) overlay.addListener(onBreakpoint);

    onBreakpoint();
  })();

})();
