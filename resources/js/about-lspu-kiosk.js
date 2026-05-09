// About LSPU kiosk client.
// - Hub-and-spoke on the welcome-style shell. Tile click swaps the
//   active pane via the data-view attribute on .about-app.
// - Idle timer: 60s with no input outside the hub returns to hub.

(function () {
  var app = document.querySelector('.about-app');
  if (!app) return;

  var IDLE_MS = 60 * 1000;
  var idleTimer = null;

  function showPane(slug) {
    app.dataset.view = slug;
    if (slug === 'hub') {
      stopIdle();
    } else {
      restartIdle();
      var pane = app.querySelector('.about-detail[data-pane="' + slug + '"] .about-detail__scroll');
      if (pane) pane.scrollTop = 0;
      window.scrollTo(0, 0);
    }
  }

  function restartIdle() {
    stopIdle();
    idleTimer = window.setTimeout(function () { showPane('hub'); }, IDLE_MS);
  }

  function stopIdle() {
    if (idleTimer) window.clearTimeout(idleTimer);
    idleTimer = null;
  }

  function onActivity() {
    if (app.dataset.view !== 'hub') restartIdle();
  }

  app.querySelectorAll('.feature-card').forEach(function (btn) {
    btn.addEventListener('click', function () {
      var target = btn.getAttribute('data-target');
      if (target) showPane(target);
    });
  });

  app.querySelectorAll('[data-back]').forEach(function (btn) {
    btn.addEventListener('click', function () { showPane('hub'); });
  });

  ['pointerdown', 'touchstart', 'wheel', 'keydown'].forEach(function (evt) {
    document.addEventListener(evt, onActivity, { passive: true });
  });

  showPane('hub');
})();
