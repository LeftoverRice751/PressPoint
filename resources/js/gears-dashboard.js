(function () {
  var dashboardRoot = document.querySelector('[data-dashboard-shell]');

  if (!dashboardRoot) {
    return;
  }

  var tokenMeta = document.querySelector('meta[name="csrf-token"]');
  var token = tokenMeta ? tokenMeta.getAttribute('content') : '';
  var videoPushUrl = dashboardRoot.getAttribute('data-video-push-url') || '/trigger-video';
  var pageLinks = Array.prototype.slice.call(dashboardRoot.querySelectorAll('[data-page-link]'));
  var pagePanels = Array.prototype.slice.call(dashboardRoot.querySelectorAll('[data-page-panel]'));
  var emptyContainers = Array.prototype.slice.call(dashboardRoot.querySelectorAll('[data-section-count]'));
  var progressBars = Array.prototype.slice.call(dashboardRoot.querySelectorAll('[data-progress-bar]'));
  var previewPlayer = dashboardRoot.querySelector('[data-video-preview-player]');
  var previewPlaceholder = dashboardRoot.querySelector('[data-video-preview-placeholder]');
  var articleModal = dashboardRoot.querySelector('[data-article-modal]');
  var defaultPage = dashboardRoot.getAttribute('data-default-page') || 'dashboard';
  var openArticleModalOnLoad = dashboardRoot.getAttribute('data-open-article-modal') === 'true';

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

  function syncEmptyStates() {
    emptyContainers.forEach(function (container) {
      var count = parseInt(container.getAttribute('data-section-count') || '0', 10) || 0;
      var emptyState = container.querySelector('[data-empty-state]');
      var content = container.querySelector('[data-section-content]');

      if (emptyState) {
        emptyState.hidden = count > 0;
      }

      if (content) {
        content.hidden = count === 0;
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

  function openArticleModal() {
    if (!articleModal) {
      return;
    }

    if (typeof articleModal.showModal === 'function') {
      articleModal.showModal();
      return;
    }

    articleModal.hidden = false;
    articleModal.classList.add('is-open');
  }

  function closeArticleModal() {
    if (!articleModal) {
      return;
    }

    if (typeof articleModal.close === 'function') {
      articleModal.close();
      return;
    }

    articleModal.hidden = true;
    articleModal.classList.remove('is-open');
  }

  function switchPage(pageName) {
    var targetPage = pageName || defaultPage;

    pagePanels.forEach(function (panel) {
      var isActive = panel.getAttribute('data-page-panel') === targetPage;
      panel.hidden = !isActive;
      panel.classList.toggle('is-visible', isActive);
    });

    pageLinks.forEach(function (link) {
      var isActive = link.getAttribute('data-page-link') === targetPage;
      link.classList.toggle('is-active', isActive);
      if (isActive) {
        link.setAttribute('aria-current', 'page');
      } else {
        link.removeAttribute('aria-current');
      }
    });

    dashboardRoot.setAttribute('data-active-page', targetPage);
  }

  window.switchPage = switchPage;

  dashboardRoot.addEventListener('click', function (event) {
    var navButton = event.target.closest('[data-page-link]');
    if (navButton && dashboardRoot.contains(navButton)) {
      event.preventDefault();
      switchPage(navButton.getAttribute('data-page-link'));
      return;
    }

    var articleModalTrigger = event.target.closest('[data-article-modal-open]');
    if (articleModalTrigger && dashboardRoot.contains(articleModalTrigger)) {
      event.preventDefault();
      openArticleModal();
      return;
    }

    var articleModalClose = event.target.closest('[data-article-modal-close]');
    if (articleModalClose && dashboardRoot.contains(articleModalClose)) {
      event.preventDefault();
      closeArticleModal();
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
        alert('Could not determine the video source.');
        return;
      }

      pushTrigger.disabled = true;
      postPlay(pushSrc, pushTitle)
        .then(function (result) {
          if (result && result.broadcast === false) {
            alert('Saved trigger, but broadcast is off. Check your Pusher settings.');
          }
        })
        .catch(function () {
          alert('Could not reach server.');
        })
        .then(function () {
          pushTrigger.disabled = false;
        });
      return;
    }

    var deleteTrigger = event.target.closest('[data-video-delete-trigger]');
    if (deleteTrigger && dashboardRoot.contains(deleteTrigger)) {
      var videoId = deleteTrigger.getAttribute('data-video-id');
      var videoTitle = deleteTrigger.getAttribute('data-video-title') || 'this video';

      if (!videoId) {
        alert('Could not find the video id.');
        return;
      }

      if (!window.confirm('Delete ' + videoTitle + '? This cannot be undone.')) {
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
          alert('Could not delete the video.');
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
        alert('Could not determine the kiosk action.');
        return;
      }

      if (!kioskUrl) {
        alert('Could not determine the kiosk endpoint.');
        return;
      }

      kioskTrigger.disabled = true;
      postKioskAction(kioskUrl)
        .then(function () {
          alert(kioskAction === 'lock' ? 'Kiosk lock event sent.' : 'Kiosk unlock event sent.');
        })
        .catch(function () {
          alert('Could not reach server.');
        })
        .then(function () {
          kioskTrigger.disabled = false;
        });
    }
  });

  syncProgressBars();
  syncEmptyStates();
  switchPage(defaultPage);

  if (articleModal) {
    articleModal.addEventListener('click', function (event) {
      if (event.target === articleModal) {
        closeArticleModal();
      }
    });
  }

  if (openArticleModalOnLoad) {
    openArticleModal();
  }

  var firstVideoCard = dashboardRoot.querySelector('[data-video-card]');
  if (firstVideoCard && previewPlayer) {
    setPreview(firstVideoCard.getAttribute('data-video-src'));
  } else if (previewPlayer) {
    setPreview('');
  }
})();
