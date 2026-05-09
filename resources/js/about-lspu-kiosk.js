// About LSPU kiosk client.
// - Hub-and-spoke: tile click swaps the active pane via the data-view
//   attribute on #about-stage (CSS handles show/hide).
// - Idle timer: 60s with no input outside the hub returns to hub.
//   Reset on pointerdown, touchstart, wheel, keydown.

(function () {
  var stage = document.getElementById('about-stage');
  if (!stage) return;

  var IDLE_MS = 60 * 1000;
  var idleTimer = null;

  function showPane(slug) {
    stage.dataset.view = slug;
    if (slug === 'hub') {
      stopIdle();
    } else {
      restartIdle();
      var pane = stage.querySelector('.about-detail[data-pane="' + slug + '"]');
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
    if (stage.dataset.view !== 'hub') restartIdle();
  }

  stage.querySelectorAll('.about-tile').forEach(function (btn) {
    btn.addEventListener('click', function () {
      var target = btn.getAttribute('data-target');
      if (target) showPane(target);
    });
  });

  stage.querySelectorAll('[data-back]').forEach(function (btn) {
    btn.addEventListener('click', function () { showPane('hub'); });
  });

  ['pointerdown', 'touchstart', 'wheel', 'keydown'].forEach(function (evt) {
    document.addEventListener(evt, onActivity, { passive: true });
  });

  showPane('hub');
})();
