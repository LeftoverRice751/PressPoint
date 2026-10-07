// About LSPU editor client.

// This is for editing sa about lspu section.
//
// Quill is imported here rather than read off `window`. This file used to open
// with `if (typeof Quill === 'undefined') return;`, and nothing on the dashboard
// ever defines window.Quill — dashboard.html links only the snow *stylesheet*,
// and the library itself is an ES import inside the news-dashboard bundle, so it
// stays in that bundle's module scope. The guard therefore killed the whole IIFE
// on every page load, which is why clicking a section tab did nothing at all:
// the [data-about-tab] click handler below is the only one in the codebase, and
// it was never attached. Mission looked "stuck open" only because it is the one
// panel rendered without `hidden`.
import Quill from 'quill';
import { mark, gap, back, shift, tapTime, activeLine, syncStatus, splitLyricLines } from './hymn-sync.mjs';

(function () {
  var TOOLBAR = [
    ['bold', 'italic', 'underline'],
    [{ header: 3 }, { header: 4 }],
    [{ list: 'ordered' }, { list: 'bullet' }],
    ['blockquote', 'link', 'clean']
  ];

  // ── Form serialisation ───────────────────────────────────
  //
  // Serialisation runs on every edit, not on submit. gears-dashboard.js binds
  // its AJAX submit handler first (shell.html loads it before this file, both
  // deferred) and snapshots `new FormData(form)` synchronously, so a submit
  // listener registered here always loses the race — same-element listeners fire
  // in registration order, contrary to the comment in ajaxSubmit(). Keeping the
  // hidden inputs current at all times sidesteps the ordering entirely.

  // Short kiosk strings — the hub hero, index hints, prev/next labels, the
  // quality footer, the seal cue and its callouts — ride in one hidden `meta`
  // input per form. The server whitelists the keys against DEFAULT_META, so a
  // form only ever posts what it renders and a save merges rather than replaces.
  function serializeMeta(form) {
    var hidden = form.querySelector('.js-meta-payload');
    if (!hidden) return;

    var meta = {};
    form.querySelectorAll('[data-meta-key]').forEach(function (field) {
      meta[field.dataset.metaKey] = field.value;
    });

    var rows = form.querySelectorAll('[data-hotspots] [data-hotspot-row]');
    if (form.querySelector('[data-hotspots]')) {
      // Present-but-empty is meaningful here: deleting every callout clears the
      // seal legend, so the key is always sent when the repeater is on the form.
      meta.hotspots = Array.prototype.map.call(rows, function (row) {
        function val(sel) {
          var el = row.querySelector(sel);
          return el ? el.value : '';
        }
        return {
          key: val('.js-hotspot-key'),
          label: val('.js-hotspot-label'),
          note: val('.js-hotspot-note'),
          x: val('.js-hotspot-x'),
          y: val('.js-hotspot-y')
        };
      });
    }

    if (form.querySelector('[data-sources]')) {
      // Same present-but-empty rule as hotspots: removing every citation has to
      // clear the kiosk's attribution block, not fall back to what was stored.
      // Guarded on the repeater existing so the seal's other two forms -- which
      // post to the same endpoint and merge into the same `meta` -- cannot send
      // an empty list and wipe the citations they never rendered.
      meta.sources = Array.prototype.map.call(
        form.querySelectorAll('[data-sources] [data-source-row]'),
        function (row) {
          function val(sel) {
            var el = row.querySelector(sel);
            return el ? el.value : '';
          }
          return { label: val('.js-source-label'), url: val('.js-source-url') };
        }
      );
    }

    // Values repeaters. Same present-but-empty rule as sources, and the same
    // guard: only the Values form renders them, and the server reads a missing
    // key as "leave it" but an empty list as "the editor removed every row".
    if (form.querySelector('[data-group-values]')) {
      meta.group_values = Array.prototype.map.call(
        form.querySelectorAll('[data-group-values] [data-group-row]'),
        function (row) {
          var name = row.querySelector('.js-group-name');
          var qualities = row.querySelector('.js-group-qualities');
          return {
            name: name ? name.value : '',
            // Sent as typed; AboutContent._sanitize_group_values splits on commas.
            qualities: qualities ? qualities.value : ''
          };
        }
      );
    }
    if (form.querySelector('[data-core-values]')) {
      meta.core_values = Array.prototype.map.call(
        form.querySelectorAll('[data-core-values] .js-core-word'),
        function (input) { return input.value; }
      );
      var preview = form.querySelector('[data-core-preview]');
      if (preview) {
        preview.textContent = meta.core_values.map(function (word) {
          return word.trim().charAt(0).toUpperCase();
        }).join('');
      }
    }

    hidden.value = JSON.stringify(meta);
  }

  function serializeForm(form) {
    if (!form) return;

    serializeMeta(form);

    // Mission / values: a list of sub-blocks serialised to JSON.
    var payload = form.querySelector('.js-subsections-payload');
    if (payload) {
      var blocks = [];
      form.querySelectorAll('[data-subblocks] .about-subblock').forEach(function (block) {
        var heading = block.querySelector('.js-sub-heading');
        var editor = block.querySelector('.js-sub-editor');
        blocks.push({
          heading: heading ? heading.value : '',
          body_html: (editor && editor._quill) ? editor._quill.root.innerHTML : ''
        });
      });
      payload.value = JSON.stringify(blocks);
      return;
    }

    // Everything else: one body editor into one hidden input.
    var single = form.querySelector('.js-body-editor');
    var hidden = form.querySelector('.js-body-payload');
    if (single && single._quill && hidden) {
      hidden.value = single._quill.root.innerHTML;
    }
  }

  function makeEditor(el) {
    if (el._quill) return el._quill;
    var initial = el.innerHTML;
    el.innerHTML = '';
    var quill = new Quill(el, { theme: 'snow', modules: { toolbar: TOOLBAR } });
    if (initial.trim()) quill.clipboard.dangerouslyPasteHTML(initial);
    el._quill = quill;
    quill.on('text-change', function () {
      serializeForm(el.closest('form'));
    });
    return quill;
  }

  // Re-serialise on every keystroke, for the same reason the Quill editors do:
  // the dashboard's AJAX submit snapshots FormData before any submit listener
  // here can run, so the hidden inputs have to be correct at all times.
  function wireInput(input) {
    if (!input || input.dataset.aboutBound) return;
    input.dataset.aboutBound = '1';
    input.addEventListener('input', function () {
      serializeForm(input.closest('form'));
    });
  }

  function wireHeading(input) {
    wireInput(input);
  }

  // Mount every editor inside a panel and prime the hidden inputs, so a save
  // with no edits posts the existing content instead of an empty string.
  function mountPanel(panel) {
    panel.querySelectorAll('.js-body-editor').forEach(makeEditor);
    panel.querySelectorAll('.js-sub-editor').forEach(makeEditor);
    panel.querySelectorAll('.js-sub-heading').forEach(wireHeading);
    panel.querySelectorAll('[data-meta-key]').forEach(wireInput);
    panel.querySelectorAll('[data-hotspot-row] input').forEach(wireInput);
    panel.querySelectorAll('[data-hotspot-row]').forEach(wireHotspotRemove);
    panel.querySelectorAll('[data-source-row] input').forEach(wireInput);
    panel.querySelectorAll('[data-source-row]').forEach(wireSourceRemove);
    panel.querySelectorAll('[data-group-row] input, [data-core-row] input').forEach(wireInput);
    panel.querySelectorAll('[data-group-row], [data-core-row]').forEach(wireValuesRemove);
    panel.querySelectorAll('[data-hymn-sync]').forEach(mountHymnSync);
    panel.querySelectorAll('form').forEach(serializeForm);
  }

  // ── Hymn tap-to-sync ─────────────────────────────────────
  //
  // The arithmetic is in hymn-sync.mjs; this is the DOM around it. The line
  // list is read live off the lyrics Quill so the numbering here is the
  // numbering the kiosk will use, and the hidden input is rewritten on every
  // change for the same FormData-snapshot reason as the body above.
  function fmtClock(sec) {
    if (!isFinite(sec) || sec < 0) sec = 0;
    var m = Math.floor(sec / 60);
    var s = Math.floor(sec % 60);
    return m + ':' + (s < 10 ? '0' : '') + s;
  }

  function fmtTiming(t) {
    if (!t) return '';
    return fmtClock(t.start) + ' \u2192 ' + (typeof t.end === 'number' ? fmtClock(t.end) : 'end');
  }

  function mountHymnSync(root) {
    var form = root.closest('form');
    var payload = root.querySelector('.js-timings-payload');
    var media = root.querySelector('[data-hymn-sync-media]');
    var list = root.querySelector('[data-hymn-sync-lines]');
    var status = root.querySelector('[data-hymn-sync-status]');
    var clock = root.querySelector('[data-hymn-sync-clock]');
    var editorEl = form ? form.querySelector('.js-body-editor') : null;
    if (!payload || !media || !list) return; // no media uploaded yet: note only

    var timings = [];
    try { timings = JSON.parse(root.getAttribute('data-timings') || '[]') || []; } catch (e) { timings = []; }
    if (!Array.isArray(timings)) timings = [];

    function lyricLines() {
      var quill = editorEl && editorEl._quill;
      return splitLyricLines(quill ? quill.root.innerHTML : (editorEl ? editorEl.innerHTML : ''));
    }

    function render() {
      var lines = lyricLines();
      payload.value = JSON.stringify(timings);
      if (status) {
        var state = syncStatus(timings, lines.length);
        status.setAttribute('data-state', state);
        status.textContent = {
          empty: 'Nothing recorded yet. The kiosk will split the track evenly across the ' + lines.length + ' lines.',
          partial: timings.length + ' of ' + lines.length + ' lines timed. The kiosk only follows a complete recording, so keep going, then Save Hymn.',
          complete: 'All ' + lines.length + ' lines timed. Save Hymn to send the timings to the kiosk.',
          mismatch: 'The lyrics lost lines since these timings were recorded, so the kiosk will ignore them. Clear all and record again.'
        }[state];
      }
      list.innerHTML = '';
      lines.forEach(function (text, i) {
        var li = document.createElement('li');
        li.className = 'about-hymn-sync__line';
        if (i < timings.length) li.classList.add('is-timed');
        if (i === timings.length) li.classList.add('is-next');
        var span = document.createElement('span');
        span.className = 'about-hymn-sync__text';
        span.textContent = text;
        var time = document.createElement('span');
        time.className = 'about-hymn-sync__time';
        time.textContent = i < timings.length ? fmtTiming(timings[i]) : (i === timings.length ? 'next' : '');
        li.appendChild(span);
        li.appendChild(time);
        list.appendChild(li);
      });
      // The rows were just rebuilt; repaint the preview onto the new ones.
      playing = -1;
      if (typeof paintPlaying === 'function') paintPlaying();
    }

    function set(next) {
      if (next === timings) return;
      timings = next;
      render();
    }

    var playBtn = root.querySelector('[data-hymn-sync-play]');
    if (playBtn) playBtn.addEventListener('click', function () {
      if (media.paused) media.play(); else media.pause();
    });
    media.addEventListener('play', function () { if (playBtn) playBtn.textContent = 'Pause'; });
    media.addEventListener('pause', function () { if (playBtn) playBtn.textContent = 'Play'; });
    media.addEventListener('timeupdate', function () {
      if (clock) clock.textContent = fmtClock(media.currentTime) + ' / ' + fmtClock(media.duration);
    });
    media.addEventListener('loadedmetadata', function () {
      if (clock) clock.textContent = fmtClock(0) + ' / ' + fmtClock(media.duration);
    });

    function doMark() {
      if (timings.length >= lyricLines().length) return; // every line is timed
      set(mark(timings, tapTime(media.currentTime)));
    }
    var markBtn = root.querySelector('[data-hymn-sync-mark]');
    if (markBtn) {
      // Mark on press, not on click: click fires on release, another ~100ms
      // after the tap that was already late. preventDefault keeps focus on the
      // widget so Space still marks. Keyboard activation of the button has no
      // pointerdown, so it arrives as a click with detail 0.
      markBtn.addEventListener('pointerdown', function (ev) {
        if (ev.button !== 0) return;
        ev.preventDefault();
        doMark();
      });
      markBtn.addEventListener('click', function (ev) { if (ev.detail === 0) doMark(); });
    }
    var gapBtn = root.querySelector('[data-hymn-sync-gap]');
    if (gapBtn) gapBtn.addEventListener('click', function () { set(gap(timings, tapTime(media.currentTime))); });
    var earlierBtn = root.querySelector('[data-hymn-sync-earlier]');
    if (earlierBtn) earlierBtn.addEventListener('click', function () { if (timings.length) set(shift(timings, -0.1)); });
    var laterBtn = root.querySelector('[data-hymn-sync-later]');
    if (laterBtn) laterBtn.addEventListener('click', function () { if (timings.length) set(shift(timings, 0.1)); });

    // Live preview: light the line being sung, by the same windows the kiosk
    // uses, so a late or early recording is visible before it is saved. Read
    // every frame rather than on timeupdate, which only fires ~4 times a second.
    var playing = -1;
    var frame = null;
    function paintPlaying() {
      var items = list.children;
      var i = media.duration ? activeLine(timings, items.length, media.currentTime, media.duration) : -1;
      if (i === playing) return;
      playing = i;
      for (var k = 0; k < items.length; k++) items[k].classList.toggle('is-playing', k === i);
    }
    function tick() {
      paintPlaying();
      frame = media.paused ? null : window.requestAnimationFrame(tick);
    }
    media.addEventListener('play', function () { if (frame === null) frame = window.requestAnimationFrame(tick); });
    media.addEventListener('seeked', paintPlaying);
    var backBtn = root.querySelector('[data-hymn-sync-back]');
    if (backBtn) backBtn.addEventListener('click', function () {
      var r = back(timings);
      media.currentTime = r.seekTo;
      set(r.timings);
    });
    var clearBtn = root.querySelector('[data-hymn-sync-clear]');
    if (clearBtn) clearBtn.addEventListener('click', function () {
      media.pause();
      media.currentTime = 0;
      set([]);
    });

    // Space marks a line while the widget has focus — a mouse click on Mark
    // is too slow for a fast chorus. Not while typing in a field, obviously.
    root.setAttribute('tabindex', '0');
    root.addEventListener('keydown', function (ev) {
      if (ev.key !== ' ' && ev.key !== 'Spacebar') return;
      var tag = (ev.target.tagName || '').toLowerCase();
      if (tag === 'input' || tag === 'textarea' || ev.target.isContentEditable) return;
      ev.preventDefault();
      doMark();
    });

    // Lyric edits renumber the list and may make the recording stale.
    if (editorEl && editorEl._quill) editorEl._quill.on('text-change', render);

    render();
  }

  // ── Seal callouts ────────────────────────────────────────
  //
  // The dot numbers are positional: they are what pairs a dot on the artwork
  // with its card in the legend on the kiosk, so they are renumbered after any
  // add or remove rather than carried on the row.
  function renumberHotspots(list) {
    if (!list) return;
    list.querySelectorAll('[data-hotspot-row]').forEach(function (row, i) {
      var num = row.querySelector('.about-hotspot__num');
      if (num) num.textContent = ('0' + (i + 1)).slice(-2);
    });
  }

  function wireHotspotRemove(row) {
    var btn = row.querySelector('[data-remove-hotspot]');
    if (!btn || btn.dataset.aboutBound) return;
    btn.dataset.aboutBound = '1';
    btn.addEventListener('click', function () {
      var form = row.closest('form');
      var list = row.closest('[data-hotspots]');
      row.remove();
      renumberHotspots(list);
      serializeForm(form);
    });
  }

  document.querySelectorAll('[data-add-hotspot]').forEach(function (btn) {
    btn.addEventListener('click', function () {
      var form = btn.closest('form');
      var list = form.querySelector('[data-hotspots]');
      if (!list) return;
      var row = document.createElement('li');
      row.className = 'about-hotspot';
      row.setAttribute('data-hotspot-row', '');
      row.innerHTML =
        '<span class="about-hotspot__num"></span>' +
        '<div class="about-hotspot__fields">' +
          '<label class="field"><span class="field__label">Label</span>' +
            '<input type="text" class="field__input js-hotspot-label" maxlength="80"></label>' +
          '<label class="field"><span class="field__label">Note</span>' +
            '<input type="text" class="field__input js-hotspot-note" maxlength="240"></label>' +
          '<div class="about-hotspot__coords">' +
            '<label class="field"><span class="field__label">X %</span>' +
              '<input type="number" class="field__input js-hotspot-x" value="50" min="0" max="100" step="0.5"></label>' +
            '<label class="field"><span class="field__label">Y %</span>' +
              '<input type="number" class="field__input js-hotspot-y" value="50" min="0" max="100" step="0.5"></label>' +
          '</div>' +
        '</div>' +
        '<input type="hidden" class="js-hotspot-key">' +
        '<button type="button" class="ghost-button about-icon-button" data-remove-hotspot>✕ Remove</button>';
      list.appendChild(row);
      row.querySelectorAll('input').forEach(wireInput);
      wireHotspotRemove(row);
      renumberHotspots(list);
      serializeForm(form);
    });
  });

  // ── Sources ──────────────────────────────────────────────
  //
  // Unlike the seal callouts the number here is decoration: nothing on the
  // kiosk pairs with it, the list simply renders in order. It is renumbered on
  // add/remove anyway so the editor never reads "1, 3, 4" after a delete.
  function renumberSources(list) {
    if (!list) return;
    list.querySelectorAll('[data-source-row]').forEach(function (row, i) {
      var num = row.querySelector('.about-source__num');
      if (num) num.textContent = i + 1;
    });
  }

  function wireSourceRemove(row) {
    var btn = row.querySelector('[data-remove-source]');
    if (!btn || btn.dataset.aboutBound) return;
    btn.dataset.aboutBound = '1';
    btn.addEventListener('click', function () {
      var form = row.closest('form');
      var list = row.closest('[data-sources]');
      row.remove();
      renumberSources(list);
      serializeForm(form);
    });
  }

  document.querySelectorAll('[data-add-source]').forEach(function (btn) {
    btn.addEventListener('click', function () {
      var form = btn.closest('form');
      var list = form.querySelector('[data-sources]');
      if (!list) return;
      var row = document.createElement('div');
      row.className = 'about-source';
      row.setAttribute('data-source-row', '');
      row.innerHTML =
        '<span class="about-source__num"></span>' +
        '<div class="about-source__fields">' +
          '<label class="field"><span class="field__label">Who, what, or where</span>' +
            '<input type="text" class="field__input js-source-label" maxlength="160" ' +
              'placeholder="LSPU Charter, R.A. 9402 (2007)"></label>' +
          '<label class="field">' +
            '<span class="field__label">Link <span class="field__hint">Optional</span></span>' +
            '<input type="url" class="field__input js-source-url" maxlength="500" ' +
              'placeholder="https://lspu.edu.ph/about"></label>' +
        '</div>' +
        '<button type="button" class="ghost-button about-icon-button" data-remove-source>✕ Remove</button>';
      list.appendChild(row);
      row.querySelectorAll('input').forEach(wireInput);
      wireSourceRemove(row);
      renumberSources(list);
      serializeForm(form);
    });
  });

  // ── Values: group values + core values ───────────────────
  //
  // Two repeaters on the Values form, built like Sources above (and styled
  // with its classes). Row numbers are decoration; order is what matters, and
  // for the core values the order *is* the acrostic.
  var VALUES_REPEATERS = {
    group: {
      list: '[data-group-values]',
      row: 'data-group-row',
      html:
        '<span class="about-source__num"></span>' +
        '<div class="about-source__fields">' +
          '<label class="field"><span class="field__label">Value</span>' +
            '<input type="text" class="field__input js-group-name" maxlength="40" ' +
              'placeholder="Integrity"></label>' +
          '<label class="field"><span class="field__label">Qualities</span>' +
            '<input type="text" class="field__input js-group-qualities" maxlength="200" ' +
              'placeholder="Transparency, leadership, discipline"></label>' +
        '</div>' +
        '<button type="button" class="ghost-button about-icon-button" data-remove-group>✕ Remove</button>'
    },
    core: {
      list: '[data-core-values]',
      row: 'data-core-row',
      html:
        '<span class="about-source__num"></span>' +
        '<div class="about-source__fields about-source__fields--single">' +
          '<label class="field"><span class="field__label">Word</span>' +
            '<input type="text" class="field__input js-core-word" maxlength="40" ' +
              'placeholder="Spirited"></label>' +
        '</div>' +
        '<button type="button" class="ghost-button about-icon-button" data-remove-core>✕ Remove</button>'
    }
  };

  function renumberRows(list) {
    if (!list) return;
    Array.prototype.forEach.call(list.children, function (row, i) {
      var num = row.querySelector('.about-source__num');
      if (num) num.textContent = i + 1;
    });
  }

  function wireValuesRemove(row) {
    var btn = row.querySelector('[data-remove-group], [data-remove-core]');
    if (!btn || btn.dataset.aboutBound) return;
    btn.dataset.aboutBound = '1';
    btn.addEventListener('click', function () {
      var form = row.closest('form');
      var list = row.parentElement;
      row.remove();
      renumberRows(list);
      serializeForm(form);
    });
  }

  Object.keys(VALUES_REPEATERS).forEach(function (kind) {
    var spec = VALUES_REPEATERS[kind];
    document.querySelectorAll('[data-add-' + kind + ']').forEach(function (btn) {
      btn.addEventListener('click', function () {
        var form = btn.closest('form');
        var list = form.querySelector(spec.list);
        if (!list) return;
        var row = document.createElement('div');
        row.className = 'about-source';
        row.setAttribute(spec.row, '');
        row.innerHTML = spec.html;
        list.appendChild(row);
        row.querySelectorAll('input').forEach(wireInput);
        wireValuesRemove(row);
        renumberRows(list);
        serializeForm(form);
        var first = row.querySelector('input');
        if (first) first.focus();
      });
    });
  });

  // ── Tab switching with lazy Quill init ───────────────────
  var tabs = Array.prototype.slice.call(document.querySelectorAll('[data-about-tab]'));
  var panels = Array.prototype.slice.call(document.querySelectorAll('[data-about-panel]'));

  function switchAbout(slug) {
    tabs.forEach(function (tab) {
      var active = tab.dataset.aboutTab === slug;
      tab.classList.toggle('is-active', active);
      tab.setAttribute('aria-selected', String(active));
    });
    panels.forEach(function (panel) {
      var active = panel.dataset.aboutPanel === slug;
      panel.hidden = !active;
      // Leaving the hymn tab must stop the sync preview, or it keeps playing
      // under a panel that shows no player — same rule as the kiosk.
      if (!active) panel.querySelectorAll('[data-hymn-sync-media]').forEach(function (m) { m.pause(); });
      if (active && !panel.dataset.quillReady) {
        panel.dataset.quillReady = '1';
        // A single broken editor must never take navigation down with it —
        // that is exactly the failure this file is being fixed for.
        try {
          mountPanel(panel);
        } catch (err) {
          console.error('About LSPU: editor failed to mount for "' + slug + '"', err);
        }
      }
    });
  }

  tabs.forEach(function (tab) {
    tab.addEventListener('click', function () { switchAbout(tab.dataset.aboutTab); });
  });

  if (tabs.length) switchAbout(tabs[0].dataset.aboutTab);

  // ── Add / remove subblock ────────────────────────────────
  function wireRemove(block) {
    var btn = block.querySelector('[data-remove-subblock]');
    if (btn) {
      btn.addEventListener('click', function () {
        var form = block.closest('form');
        block.remove();
        serializeForm(form);
      });
    }
  }

  document.querySelectorAll('.about-subblock').forEach(wireRemove);

  document.querySelectorAll('[data-add-subblock]').forEach(function (btn) {
    btn.addEventListener('click', function () {
      var form = btn.closest('form');
      var container = form.querySelector('[data-subblocks]');
      var block = document.createElement('div');
      block.className = 'about-subblock';
      block.innerHTML =
        '<label class="field">' +
          '<span class="field__label">Heading</span>' +
          '<input type="text" class="field__input js-sub-heading" maxlength="200" placeholder="Sub-section heading">' +
        '</label>' +
        '<label class="field">' +
          '<span class="field__label">Body</span>' +
          '<div class="about-editor-frame js-sub-editor"></div>' +
        '</label>' +
        '<button type="button" class="ghost-button about-icon-button" data-remove-subblock>✕ Remove</button>';
      container.appendChild(block);
      makeEditor(block.querySelector('.js-sub-editor'));
      wireHeading(block.querySelector('.js-sub-heading'));
      wireRemove(block);
      serializeForm(form);
    });
  });

  // Final flush on submit. Redundant given the change-time serialisation above,
  // but harmless and cheap insurance if a future editor forgets to fire an event.
  var formSelector = [
    'form[data-milestone-form]',
    'form[data-section-form]'
  ].join(',');

  document.querySelectorAll(formSelector).forEach(function (form) {
    form.addEventListener('submit', function () { serializeForm(form); });
  });
})();
