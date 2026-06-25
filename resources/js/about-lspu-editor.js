// About LSPU editor client.

// This is for editing sa about lspu section. 

(function () {
  if (typeof Quill === 'undefined') return;

  var TOOLBAR = [
    ['bold', 'italic', 'underline'],
    [{ header: 3 }, { header: 4 }],
    [{ list: 'ordered' }, { list: 'bullet' }],
    ['blockquote', 'link', 'clean']
  ];

  function makeEditor(el) {
    if (el._quill) return el._quill;
    var initial = el.innerHTML;
    el.innerHTML = '';
    var quill = new Quill(el, { theme: 'snow', modules: { toolbar: TOOLBAR } });
    if (initial.trim()) quill.clipboard.dangerouslyPasteHTML(initial);
    el._quill = quill;
    return quill;
  }

  // ── Tab switching with lazy Quill init ───────────────────
  var tabs   = Array.prototype.slice.call(document.querySelectorAll('[data-about-tab]'));
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
        panel.querySelectorAll('.js-body-editor').forEach(makeEditor);
        panel.querySelectorAll('.js-sub-editor').forEach(makeEditor);
        panel.dataset.quillReady = '1';
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
    if (btn) btn.addEventListener('click', function () { block.remove(); });
  }

  document.querySelectorAll('.about-subblock').forEach(wireRemove);

  document.querySelectorAll('[data-add-subblock]').forEach(function (btn) {
    btn.addEventListener('click', function () {
      var container = btn.closest('form').querySelector('[data-subblocks]');
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
      wireRemove(block);
    });
  });

  // ── Form serialisation ───────────────────────────────────

  // Single body editor → hidden input.
  var bodySelector = [
    'form[data-milestone-form]',
    'form[data-section-form="history"]',
    'form[data-section-form="quality"]',
    'form[data-section-form="hymn"]',
    'form[data-section-form="seal"]'
  ].join(',');

  document.querySelectorAll(bodySelector).forEach(function (form) {
    form.addEventListener('submit', function () {
      var editor = form.querySelector('.js-body-editor');
      var hidden = form.querySelector('.js-body-payload');
      if (editor && editor._quill && hidden) {
        hidden.value = editor._quill.root.innerHTML;
      }
    });
  });

  // Mission / values: serialise subblocks to JSON.
  // Fixed: was querying ".subblock" but HTML class is ".about-subblock".
  document.querySelectorAll(
    'form[data-section-form="mission"], form[data-section-form="values"]'
  ).forEach(function (form) {
    form.addEventListener('submit', function () {
      var blocks = [];
      form.querySelectorAll('[data-subblocks] .about-subblock').forEach(function (block) {
        var heading = block.querySelector('.js-sub-heading');
        var editor  = block.querySelector('.js-sub-editor');
        blocks.push({
          heading:   heading ? heading.value : '',
          body_html: (editor && editor._quill) ? editor._quill.root.innerHTML : ''
        });
      });
      var hidden = form.querySelector('.js-subsections-payload');
      if (hidden) hidden.value = JSON.stringify(blocks);
    });
  });
})();
