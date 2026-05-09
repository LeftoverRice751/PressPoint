// About LSPU editor client.
// - Initialise a Quill editor on every .js-body-editor and .js-sub-editor.
// - On submit, serialise editor HTML into the matching hidden input.
// - For mission/values forms, package subblocks into a single
//   'subsections' JSON payload.

(function () {
  if (typeof Quill === 'undefined') return;

  var TOOLBAR = [
    ['bold', 'italic', 'underline'],
    [{ 'header': 3 }, { 'header': 4 }],
    [{ 'list': 'ordered' }, { 'list': 'bullet' }],
    ['blockquote', 'link', 'clean']
  ];

  function makeEditor(el) {
    var initial = el.innerHTML;
    el.innerHTML = '';
    var quill = new Quill(el, { theme: 'snow', modules: { toolbar: TOOLBAR } });
    if (initial) quill.clipboard.dangerouslyPasteHTML(initial);
    el._quill = quill;
    return quill;
  }

  document.querySelectorAll('.js-body-editor').forEach(makeEditor);
  document.querySelectorAll('.js-sub-editor').forEach(makeEditor);

  // Forms with a single body editor.
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

  // Mission/values forms bundle subblocks into JSON.
  document.querySelectorAll('form[data-section-form="mission"], form[data-section-form="values"]').forEach(function (form) {
    form.addEventListener('submit', function () {
      var blocks = [];
      form.querySelectorAll('[data-subblocks] .subblock').forEach(function (block) {
        var heading = block.querySelector('.js-sub-heading');
        var editor = block.querySelector('.js-sub-editor');
        blocks.push({
          heading: heading ? heading.value : '',
          body_html: (editor && editor._quill) ? editor._quill.root.innerHTML : ''
        });
      });
      var hidden = form.querySelector('.js-subsections-payload');
      if (hidden) hidden.value = JSON.stringify(blocks);
    });
  });
})();
