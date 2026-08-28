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

  function serializeForm(form) {
    if (!form) return;

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

  function wireHeading(input) {
    if (input.dataset.headingBound) return;
    input.dataset.headingBound = '1';
    input.addEventListener('input', function () {
      serializeForm(input.closest('form'));
    });
  }

  // Mount every editor inside a panel and prime the hidden inputs, so a save
  // with no edits posts the existing content instead of an empty string.
  function mountPanel(panel) {
    panel.querySelectorAll('.js-body-editor').forEach(makeEditor);
    panel.querySelectorAll('.js-sub-editor').forEach(makeEditor);
    panel.querySelectorAll('.js-sub-heading').forEach(wireHeading);
    panel.querySelectorAll('form').forEach(serializeForm);
  }

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
