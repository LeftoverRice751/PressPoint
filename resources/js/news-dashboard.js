(function () {
  var dashboardRoot = document.querySelector('[data-dashboard-shell]');

  if (!dashboardRoot) {
    return;
  }

  var newsModal = dashboardRoot.querySelector('[data-news-modal]');
  var openNewsModalOnLoad = dashboardRoot.getAttribute('data-open-news-modal') === 'true';

  function openNewsModal() {
    if (!newsModal) {
      return;
    }

    if (typeof newsModal.showModal === 'function') {
      newsModal.showModal();
      return;
    }

    newsModal.hidden = false;
    newsModal.classList.add('is-open');
  }

  function closeNewsModal() {
    if (!newsModal) {
      return;
    }

    if (typeof newsModal.close === 'function') {
      newsModal.close();
      return;
    }

    newsModal.hidden = true;
    newsModal.classList.remove('is-open');
  }

  dashboardRoot.addEventListener('click', function (event) {
    var newsModalTrigger = event.target.closest('[data-news-modal-open]');
    if (newsModalTrigger && dashboardRoot.contains(newsModalTrigger)) {
      event.preventDefault();
      openNewsModal();
      return;
    }

    var newsModalClose = event.target.closest('[data-news-modal-close]');
    if (newsModalClose && dashboardRoot.contains(newsModalClose)) {
      event.preventDefault();
      closeNewsModal();
    }
  });

  if (newsModal) {
    newsModal.addEventListener('click', function (event) {
      if (event.target === newsModal) {
        closeNewsModal();
      }
    });
  }

  if (openNewsModalOnLoad) {
    openNewsModal();
  }
})();