/*
 * About LSPU kiosk client.
 *
 * One URL, seven views: the hub plus six panes, switched by data-view on
 * .about-app. Each pane owns a small widget — the milestone pager, the hymn
 * player, the seal's callouts — wired up once here.
 *
 * Idle: 60s with no input anywhere but the hub returns to the hub, so the
 * terminal is never left sitting on one person's reading.
 */
(function () {
  var app = document.querySelector('.about-app');
  if (!app) return;

  var IDLE_MS = 60 * 1000;
  var idleTimer = null;

  function showPane(slug) {
    app.dataset.view = slug;

    // Leaving the hymn must stop the audio, or it keeps playing under a
    // screen that shows no player and offers no way to stop it.
    if (slug !== 'hymn') {
      app.querySelectorAll('[data-hymn-audio]').forEach(function (a) {
        if (!a.paused) a.pause();
      });
    }

    if (slug === 'hub') {
      stopIdle();
    } else {
      restartIdle();
      var body = app.querySelector('.about-detail[data-pane="' + slug + '"] .about-body');
      if (body) body.scrollTop = 0;
    }
    window.scrollTo(0, 0);
  }

  function restartIdle() {
    stopIdle();
    idleTimer = window.setTimeout(function () { showPane('hub'); }, IDLE_MS);
  }

  function stopIdle() {
    if (idleTimer) window.clearTimeout(idleTimer);
    idleTimer = null;
  }

  // Hub rows and prev/next buttons both navigate by data-target.
  app.querySelectorAll('[data-target]').forEach(function (btn) {
    btn.addEventListener('click', function () {
      var target = btn.getAttribute('data-target');
      if (target) showPane(target);
    });
  });

  app.querySelectorAll('[data-back]').forEach(function (btn) {
    btn.addEventListener('click', function () { showPane('hub'); });
  });

  ['pointerdown', 'touchstart', 'wheel', 'keydown'].forEach(function (evt) {
    document.addEventListener(evt, function () {
      if (app.dataset.view !== 'hub') restartIdle();
    }, { passive: true });
  });

  showPane('hub');

  // ── History: one milestone at a time ─────────────────────────────
  app.querySelectorAll('[data-history]').forEach(function (pager) {
    var chips = Array.prototype.slice.call(pager.querySelectorAll('[data-history-chip]'));
    var slides = Array.prototype.slice.call(pager.querySelectorAll('[data-history-slide]'));
    if (!slides.length) return;
    var current = 0;

    function render() {
      slides.forEach(function (s, i) { s.classList.toggle('is-active', i === current); });
      chips.forEach(function (c, i) { c.classList.toggle('is-active', i === current); });
      var chip = chips[current];
      if (chip && chip.scrollIntoView) {
        chip.scrollIntoView({ block: 'nearest', inline: 'center', behavior: 'smooth' });
      }
    }

    chips.forEach(function (chip, i) {
      chip.addEventListener('click', function () { current = i; render(); });
    });

    var prev = pager.querySelector('[data-history-prev]');
    var next = pager.querySelector('[data-history-next]');
    if (prev) prev.addEventListener('click', function () {
      current = (current - 1 + slides.length) % slides.length;
      render();
    });
    if (next) next.addEventListener('click', function () {
      current = (current + 1) % slides.length;
      render();
    });
  });

  // ── Hymn: transport + line highlighting ──────────────────────────
  app.querySelectorAll('[data-hymn]').forEach(function (root) {
    var audio = root.querySelector('[data-hymn-audio]');
    if (!audio) return;

    var playBtn = root.querySelector('[data-hymn-play]');
    var glyph = root.querySelector('[data-hymn-glyph]');
    var fill = root.querySelector('[data-hymn-fill]');
    var bar = root.querySelector('[data-hymn-bar]');
    var elapsedEl = root.querySelector('[data-hymn-elapsed]');
    var totalEl = root.querySelector('[data-hymn-total]');
    var lines = Array.prototype.slice.call(root.querySelectorAll('[data-hymn-line]'));

    // Per-line timings are editorial data when present. They rarely are — no
    // editor UI writes them yet — so the fallback divides the track evenly,
    // which tracks a sung hymn closely enough to follow.
    var timings = [];
    try { timings = JSON.parse(root.getAttribute('data-timings') || '[]') || []; } catch (e) { timings = []; }

    function fmt(sec) {
      if (!isFinite(sec) || sec < 0) sec = 0;
      var m = Math.floor(sec / 60);
      var s = Math.floor(sec % 60);
      return m + ':' + (s < 10 ? '0' : '') + s;
    }

    function windowFor(i, duration) {
      var t = timings[i];
      if (t && typeof t.start === 'number') {
        return [t.start, typeof t.end === 'number' ? t.end : duration];
      }
      var span = duration / lines.length;
      return [span * i, span * (i + 1)];
    }

    audio.addEventListener('loadedmetadata', function () {
      if (totalEl) totalEl.textContent = fmt(audio.duration);
    });

    audio.addEventListener('timeupdate', function () {
      var d = audio.duration;
      if (fill && d) fill.style.width = (audio.currentTime / d * 100) + '%';
      if (elapsedEl) elapsedEl.textContent = fmt(audio.currentTime);
      if (!lines.length || !d) return;

      var active = -1;
      for (var i = 0; i < lines.length; i++) {
        var w = windowFor(i, d);
        if (audio.currentTime >= w[0] && audio.currentTime < w[1]) { active = i; break; }
      }
      lines.forEach(function (l, i) { l.classList.toggle('is-active', i === active); });
    });

    audio.addEventListener('play', function () {
      if (glyph) glyph.innerHTML = '&#10074;&#10074;';
      if (playBtn) playBtn.setAttribute('aria-label', 'Pause the university hymn');
    });
    audio.addEventListener('pause', function () {
      if (glyph) glyph.innerHTML = '&#9654;';
      if (playBtn) playBtn.setAttribute('aria-label', 'Play the university hymn');
    });
    audio.addEventListener('ended', function () {
      lines.forEach(function (l) { l.classList.remove('is-active'); });
      if (fill) fill.style.width = '0%';
    });

    if (playBtn) playBtn.addEventListener('click', function () {
      if (audio.paused) audio.play(); else audio.pause();
    });

    if (bar) bar.addEventListener('click', function (ev) {
      if (!audio.duration) return;
      var rect = bar.getBoundingClientRect();
      audio.currentTime = ((ev.clientX - rect.left) / rect.width) * audio.duration;
    });
  });

  // ── Seal: dot and legend card are two handles on the same callout ──
  app.querySelectorAll('.seal').forEach(function (pane) {
    var dots = Array.prototype.slice.call(pane.querySelectorAll('[data-seal-dot]'));
    var cards = Array.prototype.slice.call(pane.querySelectorAll('[data-seal-card]'));

    function highlight(key) {
      dots.forEach(function (d) { d.classList.toggle('is-active', d.getAttribute('data-key') === key); });
      cards.forEach(function (c) { c.classList.toggle('is-active', c.getAttribute('data-key') === key); });
    }

    dots.concat(cards).forEach(function (el) {
      el.addEventListener('click', function () { highlight(el.getAttribute('data-key')); });
    });
  });
})();
