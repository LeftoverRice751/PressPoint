(function () {
  var dashboardRoot = document.querySelector('[data-dashboard-shell]');
  if (!dashboardRoot) return;

  var newsModal           = dashboardRoot.querySelector('[data-news-modal]');
  var openNewsModalOnLoad = dashboardRoot.getAttribute('data-open-news-modal') === 'true';
  var composer            = dashboardRoot.querySelector('[data-news-composer]');

  // ── Toast ─────────────────────────────────────────────
  function newsToast(msg, isError) {
    var t = document.createElement('div');
    t.className = 'gears-toast' + (isError ? ' gears-toast--error' : '');
    t.textContent = msg;
    document.body.appendChild(t);
    requestAnimationFrame(function () {
      requestAnimationFrame(function () { t.classList.add('is-visible'); });
    });
    setTimeout(function () {
      t.classList.remove('is-visible');
      setTimeout(function () { t.remove(); }, 300);
    }, 3500);
  }

  // ── Helpers ───────────────────────────────────────────
  function setActiveButton(group, selector, attr, value) {
    if (!group) return;
    Array.prototype.slice.call(group.querySelectorAll(selector)).forEach(function (btn) {
      var active = btn.getAttribute(attr) === value;
      btn.classList.toggle('is-active', active);
      btn.setAttribute('aria-pressed', String(active));
    });
  }

  function getCanvasEls(root) {
    var activeSlot = root.querySelector('[data-canvas-layout]:not([hidden])');
    return {
      canvas:        root.querySelector('[data-news-canvas]'),
      title:         activeSlot ? activeSlot.querySelector('[data-news-canvas-title]')    : null,
      copy:          activeSlot ? activeSlot.querySelector('[data-news-canvas-copy]')     : null,
      source:        activeSlot ? activeSlot.querySelector('[data-news-canvas-source]')   : null,
      location:      activeSlot ? activeSlot.querySelector('[data-news-canvas-location]') : null,
      image:         activeSlot ? activeSlot.querySelector('[data-news-canvas-image]')    : null,
      imageFallback: activeSlot ? activeSlot.querySelector('[data-news-image-fallback]')  : null,
      imageZones:    activeSlot ? Array.prototype.slice.call(activeSlot.querySelectorAll('[data-news-image-zone]')) : [],
      fileInput:     root.querySelector('[data-news-field="image"]')
    };
  }

  function getFormFields(root) {
    var form = root.querySelector('[data-news-form]');
    return {
      form:        form,
      title:       form ? form.querySelector('[data-news-field="title"]')        : null,
      description: form ? form.querySelector('[data-news-field="description"]')  : null,
      source:      form ? form.querySelector('[data-news-field="source"]')       : null,
      location:    form ? form.querySelector('[data-news-field="location"]')     : null,
      priority:    form ? form.querySelector('[data-news-field="priority"]')     : null,
      publishedAt: form ? form.querySelector('[data-news-field="published_at"]') : null,
      articleId:   form ? form.querySelector('[data-news-field="article_id"]')   : null,
      layout:      form ? form.querySelector('[data-news-layout-field]')         : null
    };
  }

  function getPropFields(root) {
    return {
      priority:    root.querySelector('[data-news-prop="priority"]'),
      publishedAt: root.querySelector('[data-news-prop="published_at"]')
    };
  }

  // ── Canvas text helpers ───────────────────────────────
  function getCanvasText(el) {
    return el ? el.textContent.trim() : '';
  }

  function setCanvasText(el, value, placeholder) {
    if (!el) return;
    el.textContent = value || '';
    if (placeholder !== undefined) el.setAttribute('data-placeholder', placeholder);
  }

  // ── Image handling ────────────────────────────────────
  var objectUrl = null;

  function showCanvasImage(els, src) {
    if (objectUrl) {
      try { URL.revokeObjectURL(objectUrl); } catch (_) {}
      objectUrl = null;
    }
    if (!src) {
      if (els.image)         els.image.style.display = 'none';
      if (els.imageFallback) els.imageFallback.hidden = false;
      return;
    }
    if (!els.image) return;
    if (typeof src === 'string') {
      els.image.src = src;
    } else {
      objectUrl = URL.createObjectURL(src);
      els.image.src = objectUrl;
    }
    els.image.style.display = 'block';
    if (els.imageFallback) els.imageFallback.hidden = true;
  }

  // ── Slot switching ────────────────────────────────────
  function switchSlot(root, slotValue, form) {
    Array.prototype.slice.call(root.querySelectorAll('[data-canvas-layout]')).forEach(function (panel) {
      panel.hidden = panel.getAttribute('data-canvas-layout') !== slotValue;
    });
    if (form && form.layout) form.layout.value = slotValue;
    setActiveButton(root, '[data-news-slot-choice]', 'data-news-slot-choice', slotValue);
    return getCanvasEls(root);
  }

  // ── Sync canvas → form ────────────────────────────────
  function canvasToForm(els, form) {
    if (form.title)       form.title.value       = getCanvasText(els.title);
    if (form.description) form.description.value = getCanvasText(els.copy);
    if (form.source)      form.source.value      = getCanvasText(els.source);
    if (form.location)    form.location.value    = getCanvasText(els.location);
  }

  // ── Clear canvas ──────────────────────────────────────
  function clearCanvas(root, form, props) {
    var currentSlot = form && form.layout ? (form.layout.value || 'main') : 'main';
    var els = switchSlot(root, currentSlot, form);

    setCanvasText(els.title,    '', 'Click to write headline…');
    setCanvasText(els.copy,     '', 'Write your story summary here…');
    setCanvasText(els.source,   '', 'Editorial Desk');
    setCanvasText(els.location, '', 'Campus');
    showCanvasImage(els, null);

    // Clear all slots' editable content
    Array.prototype.slice.call(root.querySelectorAll('[data-news-canvas-title], [data-news-canvas-copy], [data-news-canvas-source], [data-news-canvas-location]')).forEach(function (el) {
      el.textContent = '';
    });
    Array.prototype.slice.call(root.querySelectorAll('[data-news-canvas-image]')).forEach(function (img) {
      img.style.display = 'none';
    });
    Array.prototype.slice.call(root.querySelectorAll('[data-news-image-fallback]')).forEach(function (fb) {
      fb.hidden = false;
    });

    if (form.title)       form.title.value       = '';
    if (form.description) form.description.value = '';
    if (form.source)      form.source.value      = '';
    if (form.location)    form.location.value    = '';
    if (form.priority)    form.priority.value    = '0';
    if (form.publishedAt) form.publishedAt.value = '';
    if (form.articleId)   form.articleId.value   = '';
    if (props.priority)   props.priority.value   = '0';
    if (props.publishedAt) props.publishedAt.value = '';

    switchSlot(root, 'main', form);
  }

  // ── Populate canvas from library card ─────────────────
  function populateFromCard(root, card, form, props) {
    if (!card) return;

    var slotValue = card.getAttribute('data-news-library-layout') || 'secondary';
    var els = switchSlot(root, slotValue, form);

    setCanvasText(els.title,    card.getAttribute('data-news-library-title')       || '', 'Click to write headline…');
    setCanvasText(els.copy,     card.getAttribute('data-news-library-description') || '', 'Write your story summary here…');
    setCanvasText(els.source,   card.getAttribute('data-news-library-source')      || '', 'Editorial Desk');
    setCanvasText(els.location, card.getAttribute('data-news-library-location')    || '', 'Campus');

    var imgPath = card.getAttribute('data-news-library-image') || '';
    showCanvasImage(els, imgPath ? '/storage/' + imgPath.replace(/\\/g, '/') : null);

    var priority = card.getAttribute('data-news-library-priority') || '0';
    if (form.priority)    form.priority.value    = priority;
    if (form.articleId)   form.articleId.value   = card.getAttribute('data-news-library-id') || '';
    if (props.priority)   props.priority.value   = priority;

    canvasToForm(els, form);
  }

  // ── Bind everything ───────────────────────────────────
  function bindComposer() {
    if (!composer) return;

    var form  = getFormFields(composer);
    var props = getPropFields(composer);

    // Contenteditable → hidden form on every keystroke (delegate to body for all slots)
    composer.addEventListener('input', function (e) {
      var target = e.target;
      if (target.hasAttribute('data-news-canvas-title') && form.title) {
        form.title.value = target.textContent.trim();
      } else if (target.hasAttribute('data-news-canvas-copy') && form.description) {
        form.description.value = target.textContent.trim();
      } else if (target.hasAttribute('data-news-canvas-source') && form.source) {
        form.source.value = target.textContent.trim();
      } else if (target.hasAttribute('data-news-canvas-location') && form.location) {
        form.location.value = target.textContent.trim();
      }
    });

    // Image zone click → trigger file input
    composer.addEventListener('click', function (e) {
      var zone = e.target.closest('[data-news-image-zone]');
      if (zone && composer.contains(zone)) {
        var fileInput = form.form ? form.form.querySelector('[data-news-field="image"]') : null;
        if (fileInput) fileInput.click();
      }
    });

    // File input change → show preview in active canvas slot
    var fileInput = form.form ? form.form.querySelector('[data-news-field="image"]') : null;
    if (fileInput) {
      fileInput.addEventListener('change', function () {
        var file = fileInput.files && fileInput.files[0];
        showCanvasImage(getCanvasEls(composer), file || null);
      });
    }

    // Slot choice buttons
    Array.prototype.slice.call(composer.querySelectorAll('[data-news-slot-choice]')).forEach(function (btn) {
      btn.addEventListener('click', function () {
        var slot = btn.getAttribute('data-news-slot-choice') || 'main';
        switchSlot(composer, slot, form);
      });
    });

    // Properties panel range → sync to hidden form field
    if (props.priority) {
      props.priority.addEventListener('input', function () {
        if (form.priority) form.priority.value = props.priority.value;
      });
    }
    if (props.publishedAt) {
      props.publishedAt.addEventListener('input', function () {
        if (form.publishedAt) form.publishedAt.value = props.publishedAt.value;
      });
    }

    // Discard button
    var discardBtn = composer.querySelector('[data-news-canvas-discard]');
    if (discardBtn) {
      discardBtn.addEventListener('click', function () {
        clearCanvas(composer, form, props);
      });
    }

    // Save / Publish button → AJAX fetch (form.submit() bypasses event listeners)
    var saveBtn = composer.querySelector('[data-news-canvas-save]');
    if (saveBtn) {
      saveBtn.addEventListener('click', function () {
        var formEl = form.form;
        if (!formEl) return;

        canvasToForm(getCanvasEls(composer), form);

        var tokenMeta = document.querySelector('meta[name="csrf-token"]');
        var csrf = tokenMeta ? tokenMeta.getAttribute('content') : '';

        saveBtn.disabled = true;
        var origLabel = saveBtn.textContent;
        saveBtn.textContent = 'Publishing…';

        fetch(formEl.getAttribute('action'), {
          method: 'POST',
          headers: {
            'X-CSRF-TOKEN': csrf,
            'X-Requested-With': 'XMLHttpRequest'
          },
          body: new FormData(formEl)
        })
        .then(function (r) { return r.json(); })
        .then(function (json) {
          saveBtn.disabled = false;
          saveBtn.textContent = origLabel;
          if (json.ok) {
            newsToast((json.messages && json.messages[0]) || 'Story published.', false);
            clearCanvas(composer, form, props);
            var fi = formEl.querySelector('[data-news-field="image"]');
            try { if (fi) fi.value = ''; } catch (_) {}
          } else {
            newsToast((json.errors && json.errors[0]) || 'Could not publish — check all fields.', true);
          }
        })
        .catch(function () {
          saveBtn.disabled = false;
          saveBtn.textContent = origLabel;
          newsToast('Request failed — please try again.', true);
        });
      });
    }

    // Story library load buttons
    Array.prototype.slice.call(composer.querySelectorAll('[data-news-load-story]')).forEach(function (btn) {
      btn.addEventListener('click', function () {
        var card = btn.closest('[data-news-library-item]');
        populateFromCard(composer, card, form, props);
      });
    });

    // Initial slot sync
    switchSlot(composer, 'main', form);
  }

  // ── Modal helpers ─────────────────────────────────────
  function openNewsModal() {
    if (!newsModal) return;
    if (typeof newsModal.showModal === 'function') { newsModal.showModal(); return; }
    newsModal.hidden = false;
    newsModal.classList.add('is-open');
  }

  function closeNewsModal() {
    if (!newsModal) return;
    if (typeof newsModal.close === 'function') { newsModal.close(); return; }
    newsModal.hidden = true;
    newsModal.classList.remove('is-open');
  }

  // ── Event delegation ──────────────────────────────────
  dashboardRoot.addEventListener('click', function (event) {
    var trigger = event.target.closest('[data-news-modal-open]');
    if (trigger && dashboardRoot.contains(trigger)) { event.preventDefault(); openNewsModal(); return; }

    var closer = event.target.closest('[data-news-modal-close]');
    if (closer && dashboardRoot.contains(closer)) { event.preventDefault(); closeNewsModal(); return; }
  });

  if (newsModal) {
    newsModal.addEventListener('click', function (event) {
      if (event.target === newsModal) closeNewsModal();
    });
  }

  if (openNewsModalOnLoad) openNewsModal();
  bindComposer();
})();
