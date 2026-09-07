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
    panel.querySelectorAll('form').forEach(serializeForm);
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
