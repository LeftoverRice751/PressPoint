/*
 * About LSPU kiosk client.
 *
 * One URL, six views, switched by data-view on .about-app. The page opens on
 * the mission and the rail down the right edge is the only navigation. Each
 * pane owns a small widget — the milestone pager, the hymn player, the seal's
 * callouts — wired up once here.
 *
 * Idle: 60s with no input anywhere but the home pane returns to it, so the
 * terminal is never left sitting on one person's reading.
 * Except while the hymn is playing: nobody touches the glass to watch it, so
 * playback holds this timer and keeps the shell's attract countdown fed.
 */
(function () {
  var app = document.querySelector('.about-app');
  if (!app) return;

  // The landing view and where idle returns to. There used to be a hub view
  // in this role; the mission is the first thing a visitor should read.
  var HOME = 'mission';
  var IDLE_MS = 60 * 1000;
  var idleTimer = null;

  var railButtons = app.querySelectorAll('.about-rail__btn[data-target]');

  function showPane(slug) {
    app.dataset.view = slug;

    // The rail's highlight is bound to aria-current, so the visible "you are
    // here" and the announced one can never disagree.
    railButtons.forEach(function (btn) {
      if (btn.getAttribute('data-target') === slug) {
        btn.setAttribute('aria-current', 'true');
      } else {
        btn.removeAttribute('aria-current');
      }
    });

    // Leaving the hymn must stop it, or it keeps playing under a screen that
    // shows no player and offers no way to stop it. The selector covers the
    // <video> and the <audio> fallback alike — narrowing it to one element
    // type brings that bug straight back for the other.
    if (slug !== 'hymn') {
      app.querySelectorAll('[data-hymn-media]').forEach(function (m) {
        if (!m.paused) m.pause();
      });
    }

    if (slug === HOME) {
      stopIdle();
    } else {
      restartIdle();
    }
    var body = app.querySelector('.about-detail[data-pane="' + slug + '"] .about-body');
    if (body) body.scrollTop = 0;
    window.scrollTo(0, 0);
  }

  function restartIdle() {
    stopIdle();
    // A visitor watching the hymn is not touching anything, and a four-minute
    // performance outlasts the 60s timeout; returning home mid-song pauses it
    // (showPane above). The hymn's pause/ended handlers re-arm the timer.
    if (hymnPlaying()) return;
    idleTimer = window.setTimeout(function () { showPane(HOME); }, IDLE_MS);
  }

  function hymnPlaying() {
    var playing = false;
    app.querySelectorAll('[data-hymn-media]').forEach(function (m) {
      if (!m.paused && !m.ended) playing = true;
    });
    return playing;
  }

  function stopIdle() {
    if (idleTimer) window.clearTimeout(idleTimer);
    idleTimer = null;
  }

  // Anything carrying data-target navigates — today that is the rail alone,
  // but the contract is deliberately wider than the rail so a pane can link
  // to another (the seal from the quality footer, say) without new wiring.
  app.querySelectorAll('[data-target]').forEach(function (btn) {
    btn.addEventListener('click', function () {
      var target = btn.getAttribute('data-target');
      if (target) showPane(target);
    });
  });

  ['pointerdown', 'touchstart', 'wheel', 'keydown'].forEach(function (evt) {
    document.addEventListener(evt, function () {
      if (app.dataset.view !== HOME) restartIdle();
    }, { passive: true });
  });

  showPane(HOME);

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
    // One element hook for both shapes: the <video> the pane prefers and the
    // <audio> it falls back to. HTMLMediaElement is the same API either way —
    // play/pause, currentTime, duration and timeupdate all behave identically —
    // so nothing below this line needs to know which one it got.
    var media = root.querySelector('[data-hymn-media]');
    if (!media) return;

    var playBtn = root.querySelector('[data-hymn-play]');
    var restartBtn = root.querySelector('[data-hymn-restart]');
    var stage = root.querySelector('[data-hymn-stage]');
    var glyph = root.querySelector('[data-hymn-glyph]');
    var fill = root.querySelector('[data-hymn-fill]');
    var bar = root.querySelector('[data-hymn-bar]');
    var elapsedEl = root.querySelector('[data-hymn-elapsed]');
    var totalEl = root.querySelector('[data-hymn-total]');
    var lines = Array.prototype.slice.call(root.querySelectorAll('[data-hymn-line]'));

    // Per-line timings come from the dashboard's tap-to-sync widget. Without
    // them the fallback divides the track evenly, which is roughly followable.
    // A set recorded against a different number of lines is ignored whole:
    // it was made for other lyrics, and mixing timed lines with arithmetic
    // ones per index reads as random highlighting.
    var timings = [];
    try { timings = JSON.parse(root.getAttribute('data-timings') || '[]') || []; } catch (e) { timings = []; }
    if (!Array.isArray(timings) || timings.length !== lines.length) timings = [];

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

    media.addEventListener('loadedmetadata', function () {
      if (totalEl) totalEl.textContent = fmt(media.duration);
    });

    var shown = null;
    function paintLines() {
      var d = media.duration;
      if (!lines.length || !d) return;

      var active = -1;
      for (var i = 0; i < lines.length; i++) {
        var w = windowFor(i, d);
        if (media.currentTime >= w[0] && media.currentTime < w[1]) { active = i; break; }
      }
      if (active === shown) return;
      shown = active;
      lines.forEach(function (l, i) { l.classList.toggle('is-active', i === active); });
    }

    // The lines follow the clock every frame while playing. timeupdate alone
    // fires only about every 250ms in Chromium, so a line used to light up to
    // a quarter-second after it was sung, on top of any lateness in the
    // recording. timeupdate still drives the progress bar, where that is fine.
    var frame = null;
    function tick() {
      paintLines();
      frame = media.paused || media.ended ? null : window.requestAnimationFrame(tick);
    }
    media.addEventListener('play', function () {
      if (frame === null && window.requestAnimationFrame) frame = window.requestAnimationFrame(tick);
    });
    media.addEventListener('seeked', paintLines);

    // Hold the shell's idle while the hymn plays. Its 30s countdown lives in
    // the parent document (welcome-screen.js) and only sees the activity this
    // page relays up (partials/kiosk-frame.html), so a visitor standing still
    // to watch would get the attract screen dropped over the performance.
    // A heartbeat rather than a hold/release pair: if this page is navigated
    // away or reloaded mid-song the beats simply stop and the shell's normal
    // countdown resumes — a "hold" message whose "release" never arrived
    // would leave the kiosk unable to ever go idle.
    var HEARTBEAT_MS = 10 * 1000;
    var heartbeat = null;
    function beat() {
      if (window.__kioskFrame) window.__kioskFrame.post('activity');
    }
    function stopHeartbeat() {
      if (heartbeat) window.clearInterval(heartbeat);
      heartbeat = null;
    }
    function releaseIdle() {
      stopHeartbeat();
      if (app.dataset.view !== HOME) restartIdle();
    }
    media.addEventListener('play', function () {
      stopIdle();
      beat();
      if (!heartbeat) heartbeat = window.setInterval(beat, HEARTBEAT_MS);
    });
    media.addEventListener('pause', releaseIdle);
    media.addEventListener('ended', releaseIdle);

    media.addEventListener('timeupdate', function () {
      var d = media.duration;
      if (fill && d) fill.style.width = (media.currentTime / d * 100) + '%';
      if (elapsedEl) elapsedEl.textContent = fmt(media.currentTime);
      paintLines();
    });

    media.addEventListener('play', function () {
      if (glyph) glyph.innerHTML = '&#10074;&#10074;';
      if (playBtn) playBtn.setAttribute('aria-label', 'Pause the university hymn');
      // Drives the stage overlay: the big centred glyph is a hint for a stream
      // that is not running, and covering the picture while it plays defeats
      // the point of showing a video at all.
      root.classList.add('is-playing');
    });
    media.addEventListener('pause', function () {
      if (glyph) glyph.innerHTML = '&#9654;';
      if (playBtn) playBtn.setAttribute('aria-label', 'Play the university hymn');
      root.classList.remove('is-playing');
    });
    media.addEventListener('ended', function () {
      lines.forEach(function (l) { l.classList.remove('is-active'); });
      shown = -1;
      if (fill) fill.style.width = '0%';
      root.classList.remove('is-playing');
    });

    function toggle() {
      if (media.paused) media.play(); else media.pause();
    }

    if (playBtn) playBtn.addEventListener('click', toggle);

    // The picture is the biggest tap target on the pane, so it is also a
    // toggle. Keyboard parity because the stage carries role="button": without
    // this, tabbing to it gives a control that announces itself and does
    // nothing.
    if (stage) {
      stage.addEventListener('click', toggle);
      stage.addEventListener('keydown', function (ev) {
        if (ev.key === 'Enter' || ev.key === ' ' || ev.key === 'Spacebar') {
          ev.preventDefault();
          toggle();
        }
      });
    }

    if (restartBtn) restartBtn.addEventListener('click', function () {
      media.currentTime = 0;
      if (media.paused) media.play();
    });

    if (bar) bar.addEventListener('click', function (ev) {
      if (!media.duration) return;
      var rect = bar.getBoundingClientRect();
      media.currentTime = ((ev.clientX - rect.left) / rect.width) * media.duration;
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
