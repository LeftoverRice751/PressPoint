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
  var emptyContainers = Array.prototype.slice.call(dashboardRoot.querySelectorAll('[data-section-count]'));
  var progressBars = Array.prototype.slice.call(dashboardRoot.querySelectorAll('[data-progress-bar]'));
  var previewPlayer = dashboardRoot.querySelector('[data-video-preview-player]');
  var previewPlaceholder = dashboardRoot.querySelector('[data-video-preview-placeholder]');
  var eventsModal = dashboardRoot.querySelector('[data-events-modal]');
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
    emptyContainers.forEach(function (container) {
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
          window.location.reload();
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

  if (openEventsModalOnLoad) {
    openEventsModal();
  }

  var firstVideoCard = dashboardRoot.querySelector('[data-video-card]');
  if (firstVideoCard && previewPlayer) {
    setPreview(firstVideoCard.getAttribute('data-video-src'));
  } else if (previewPlayer) {
    setPreview('');
  }
})();
