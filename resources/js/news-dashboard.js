/*
 * In-place news editor for the Gears dashboard.
 *
 * The dashboard renders the REAL kiosk front page (templates/kiosk/_news_slots.html).
 * The feature (lead) slot is the live editing surface: a Quill rich-text body,
 * inline-editable title/source/location, and drop-to-attach cover image. The
 * story library loads any story into that surface; the slot selector controls
 * where it publishes. Saves post the existing hidden form to news.store (which
 * sanitizes the HTML with bleach) and reload to re-render the real page.
 */

import Quill from 'quill';
import Sortable from 'sortablejs';

(function () {
  var root = document.querySelector('[data-dashboard-shell]');
  if (!root) return;
  var composer = root.querySelector('[data-news-composer]');
  if (!composer) return;

  var editor      = composer.querySelector('[data-news-editor]');
  var featureSlot = editor ? editor.querySelector('[data-news-slot="main"]') : null;
  var form        = composer.querySelector('[data-news-form]');
  var props       = composer.querySelector('[data-news-properties]');
  var activeLabel = composer.querySelector('[data-news-active-label]');
  var stateBadge  = root.querySelector('[data-news-state-badge]');
  if (!editor || !form) return;

  var csrfMeta = document.querySelector('meta[name="csrf-token"]');
  var csrf = csrfMeta ? csrfMeta.getAttribute('content') : '';

  // ── Confirm (reuse the styled modal, not window.confirm) ──
  function confirmAction(opts) {
    if (window.ConfirmModal && typeof window.ConfirmModal.ask === 'function') {
      return window.ConfirmModal.ask(opts);
    }
    return Promise.resolve(window.confirm((opts && (opts.body || opts.title)) || 'Are you sure?'));
  }

  // ── Page-state badge (hero) — "Live layout" vs "Unpublished changes" ──
  // Reflects whether the composer holds edits that haven't been persisted
  // yet. Publishing, unassigning, or deleting all write through immediately
  // and clear it back to "Live layout"; any in-progress edit sets it dirty.
  function setLayoutDirty(isDirty) {
    if (!stateBadge) return;
    stateBadge.textContent = isDirty ? 'Unpublished changes' : 'Live layout';
    stateBadge.classList.toggle('gears-hero__chip--dirty', !!isDirty);
    stateBadge.classList.toggle('gears-hero__chip--live', !isDirty);
  }
  function markDirty() { setLayoutDirty(true); }
  setLayoutDirty(false);

  function field(name) { return form.querySelector('[data-news-field="' + name + '"]'); }
  var f = {
    title:       field('title'),
    description: field('description'),
    source:      field('source'),
    location:    field('location'),
    dek:         field('dek'),
    caption:     field('caption'),
    credit:      field('credit'),
    priority:    field('priority'),
    publishedAt: field('published_at'),
    articleId:   field('article_id'),
    image:       field('image'),
    layout:      form.querySelector('[data-news-layout-field]')
  };
  var propPriority = props ? props.querySelector('[data-news-prop="priority"]') : null;
  var propDate     = props ? props.querySelector('[data-news-prop="published_at"]') : null;

  // ── Toast ─────────────────────────────────────────────
  function toast(msg, isError) {
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

  // ── Feature editing surface ───────────────────────────
  // Must stay in sync with the lead-story markup in
  // templates/kiosk/_news_slots.html, minus the kiosk-only pieces
  // (dateline, "Continue reading") that the `news_editor` flag gates out.
  var FEATURE_HTML =
    '<article class="feature-story" data-news-id="">' +
      '<figure class="feature-story__figure">' +
        '<div class="feature-story__image feature-story__image--fallback" data-news-edit="image" aria-hidden="true"></div>' +
        '<figcaption class="feature-story__cutline">' +
          '<span class="feature-story__caption" data-news-edit="caption"></span>' +
          '<span class="feature-story__credit"><span class="feature-story__credit-label" aria-hidden="true">Photo:</span> <span data-news-edit="credit"></span></span>' +
        '</figcaption>' +
      '</figure>' +
      '<div class="feature-story__content">' +
        '<span class="feature-story__kicker">Campus</span>' +
        '<h2 class="feature-story__title" data-news-edit="title"></h2>' +
        '<p class="feature-story__dek" data-news-edit="dek"></p>' +
        '<div class="feature-story__meta">By <span data-news-edit="source">Editorial Desk</span> &middot; <span data-news-edit="location">Campus</span></div>' +
        '<div class="feature-story__copy drop-cap" data-news-edit="body"></div>' +
      '</div>' +
    '</article>';

  function ensureFeature() {
    if (!featureSlot) return null;
    var art = featureSlot.querySelector('.feature-story');
    if (!art) {
      var empty = featureSlot.querySelector('.paper-empty');
      if (empty) empty.remove();
      featureSlot.insertAdjacentHTML('beforeend', FEATURE_HTML);
      art = featureSlot.querySelector('.feature-story');
    }
    return art;
  }

  function region(art, key) { return art ? art.querySelector('[data-news-edit="' + key + '"]') : null; }
  function setText(art, key, val) { var el = region(art, key); if (el) el.textContent = val || ''; }
  function getText(art, key) { var el = region(art, key); return el ? el.textContent.trim() : ''; }

  // ── Quill (rich body) ─────────────────────────────────
  var quill = null;
  function mountQuill(art) {
    var body = region(art, 'body');
    if (!body || quill) return;
    quill = new Quill(body, {
      theme: 'snow',
      placeholder: 'Write the story…',
      modules: {
        toolbar: [
          [{ header: [2, 3, false] }],
          ['bold', 'italic', 'underline'],
          [{ list: 'ordered' }, { list: 'bullet' }],
          ['blockquote', 'link'],
          ['clean']
        ]
      }
    });
    quill.on('text-change', function () {
      if (f.description) f.description.value = quill.root.innerHTML;
      markDirty();
    });
  }

  // ── Inline title/source/location ──────────────────────
  var INLINE_PLACEHOLDERS = {
    title: 'Headline…',
    source: 'Byline…',
    location: 'Location…',
    dek: 'Add a dek — one or two lines under the headline…',
    caption: 'Photo caption…',
    credit: 'Photo credit…'
  };

  function wireInline(art) {
    ['title', 'source', 'location', 'dek', 'caption', 'credit'].forEach(function (key) {
      var el = region(art, key);
      if (!el || el.getAttribute('data-wired')) return;
      el.setAttribute('contenteditable', 'true');
      el.setAttribute('data-placeholder', INLINE_PLACEHOLDERS[key] || '');
      el.setAttribute('data-wired', '1');
      el.addEventListener('input', function () {
        if (f[key]) f[key].value = el.textContent.trim();
        markDirty();
      });
    });
  }

  // ── Cover image (click or drop) ───────────────────────
  var objectUrl = null;
  function previewImage(src) {
    var art = featureSlot && featureSlot.querySelector('.feature-story');
    var zone = art ? region(art, 'image') : null;
    if (!zone) return;
    if (objectUrl) { try { URL.revokeObjectURL(objectUrl); } catch (_) {} objectUrl = null; }
    var url = typeof src === 'string' ? src : (objectUrl = URL.createObjectURL(src));
    if (zone.tagName === 'IMG') {
      zone.src = url;
    } else {
      zone.style.backgroundImage = 'url("' + url + '")';
      zone.style.backgroundSize = 'cover';
      zone.style.backgroundPosition = 'center';
      zone.classList.remove('feature-story__image--fallback');
    }
  }

  function setImageFile(file) {
    if (!f.image || !file || !/^image\//.test(file.type)) return;
    try {
      var dt = new DataTransfer();
      dt.items.add(file);
      f.image.files = dt.files;
    } catch (_) { /* older browsers: file will just not attach */ }
    previewImage(file);
  }

  function wireImage(art) {
    var zone = region(art, 'image');
    if (!zone || zone.getAttribute('data-wired')) return;
    zone.setAttribute('data-wired', '1');
    zone.classList.add('is-editable');
    zone.addEventListener('click', function () { if (f.image) f.image.click(); });
    ['dragover', 'dragenter'].forEach(function (ev) {
      zone.addEventListener(ev, function (e) { e.preventDefault(); zone.classList.add('is-drop'); });
    });
    ['dragleave', 'dragend', 'drop'].forEach(function (ev) {
      zone.addEventListener(ev, function () { zone.classList.remove('is-drop'); });
    });
    zone.addEventListener('drop', function (e) {
      e.preventDefault();
      var file = e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files[0];
      if (file) { setImageFile(file); markDirty(); }
    });
  }
  if (f.image) {
    f.image.addEventListener('change', function () {
      var file = f.image.files && f.image.files[0];
      if (file) { previewImage(file); markDirty(); }
    });
  }

  // ── Slot selector ─────────────────────────────────────
  function setSlot(slot) {
    if (f.layout) f.layout.value = slot || 'main';
    if (!props) return;
    Array.prototype.slice.call(props.querySelectorAll('[data-news-slot-choice]')).forEach(function (btn) {
      var active = btn.getAttribute('data-news-slot-choice') === slot;
      btn.classList.toggle('is-active', active);
      btn.setAttribute('aria-pressed', String(active));
    });
  }

  // ── Load a story into the feature surface ─────────────
  function loadStory(data) {
    var art = ensureFeature();
    if (!art) return;
    wireInline(art);
    wireImage(art);
    mountQuill(art);

    art.setAttribute('data-news-id', data.id || '');
    setText(art, 'title', data.title || '');
    setText(art, 'source', data.source || 'Editorial Desk');
    setText(art, 'location', data.location || 'Campus');
    setText(art, 'dek', data.dek || '');
    setText(art, 'caption', data.caption || '');
    setText(art, 'credit', data.credit || '');
    if (quill) quill.root.innerHTML = data.description || '';

    if (f.title)       f.title.value = data.title || '';
    if (f.description) f.description.value = data.description || '';
    if (f.source)      f.source.value = data.source || '';
    if (f.location)    f.location.value = data.location || '';
    if (f.dek)         f.dek.value = data.dek || '';
    if (f.caption)     f.caption.value = data.caption || '';
    if (f.credit)      f.credit.value = data.credit || '';
    if (f.articleId)   f.articleId.value = data.id || '';
    if (f.priority)    f.priority.value = data.priority || '0';
    if (propPriority)  propPriority.value = data.priority || '0';
    setSlot(data.layout || 'main');

    var zone = region(art, 'image');
    if (zone) { zone.style.backgroundImage = ''; zone.classList.add('feature-story__image--fallback'); }
    if (data.image) previewImage('/storage/' + String(data.image).replace(/\\/g, '/'));
    try { if (f.image) f.image.value = ''; } catch (_) {}

    if (activeLabel) activeLabel.textContent = data.id ? ('Editing: ' + (data.title || 'Untitled')) : 'New story';
    if (editor.scrollIntoView) editor.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  function cardData(card) {
    return {
      id:          card.getAttribute('data-news-library-id') || '',
      title:       card.getAttribute('data-news-library-title') || '',
      description: card.getAttribute('data-news-library-description') || '',
      source:      card.getAttribute('data-news-library-source') || '',
      location:    card.getAttribute('data-news-library-location') || '',
      dek:         card.getAttribute('data-news-library-dek') || '',
      caption:     card.getAttribute('data-news-library-caption') || '',
      credit:      card.getAttribute('data-news-library-credit') || '',
      layout:      card.getAttribute('data-news-library-layout') || 'secondary',
      priority:    card.getAttribute('data-news-library-priority') || '0',
      image:       card.getAttribute('data-news-library-image') || ''
    };
  }

  // ── Save (Publish) ────────────────────────────────────
  function syncFormFromSurface() {
    var art = featureSlot && featureSlot.querySelector('.feature-story');
    if (!art) return;
    if (f.title)    f.title.value = getText(art, 'title');
    if (f.source)   f.source.value = getText(art, 'source');
    if (f.location) f.location.value = getText(art, 'location');
    if (f.dek)      f.dek.value = getText(art, 'dek');
    if (f.caption)  f.caption.value = getText(art, 'caption');
    if (f.credit)   f.credit.value = getText(art, 'credit');
    if (f.description && quill) f.description.value = quill.root.innerHTML;
    if (f.priority && propPriority) f.priority.value = propPriority.value;
    if (f.publishedAt && propDate) f.publishedAt.value = propDate.value;
  }

  function postForm(onOk) {
    var fd = new FormData(form);
    fetch(form.getAttribute('action'), {
      method: 'POST',
      headers: { 'X-CSRF-TOKEN': csrf, 'X-Requested-With': 'XMLHttpRequest' },
      body: fd
    })
    .then(function (r) { return r.json(); })
    .then(function (json) {
      if (json && json.ok) { onOk(json); }
      else { toast((json && json.errors && json.errors[0]) || 'Could not save — check the fields.', true); }
    })
    .catch(function () { toast('Request failed — please try again.', true); });
  }

  var saveBtn = composer.querySelector('[data-news-canvas-save]');
  if (saveBtn) {
    saveBtn.addEventListener('click', function () {
      syncFormFromSurface();
      saveBtn.disabled = true;
      var label = saveBtn.textContent;
      saveBtn.textContent = 'Publishing…';
      postForm(function (json) {
        toast((json.messages && json.messages[0]) || 'Story published.', false);
        setLayoutDirty(false);
        if (window.DashboardLive) { window.DashboardLive.refresh('news'); }
      });
      setTimeout(function () { saveBtn.disabled = false; saveBtn.textContent = label; }, 4000);
    });
  }

  // ── Tertiary: Remove from Front Page (unassign, not a delete) ─
  // Sets layout_type="unassigned" via news.unassign — the story stays in
  // the library, it just leaves whichever slot it currently occupies.
  var unassignBtn = composer.querySelector('[data-news-unassign]');
  if (unassignBtn) {
    unassignBtn.addEventListener('click', function () {
      var id = f.articleId ? f.articleId.value : '';
      if (!id) { toast('Nothing to remove — this is a new story.', true); return; }
      fetch('/news/dashboard/' + encodeURIComponent(id) + '/unassign', {
        method: 'POST',
        headers: { 'X-CSRF-TOKEN': csrf, 'X-Requested-With': 'XMLHttpRequest' }
      })
      .then(function (r) { return r.json().catch(function () { return { ok: r.ok }; }); })
      .then(function (json) {
        if (json && json.ok) {
          toast((json.messages && json.messages[0]) || 'Removed from the front page.', false);
          if (f.layout) f.layout.value = 'unassigned';
          setSlot('unassigned');
          // Unassign only writes layout_type — any unrelated field edits
          // still sitting in the hidden form are NOT persisted by this
          // call, so the dirty badge must not be cleared here (F1).
          if (window.DashboardLive) { window.DashboardLive.refresh('news'); }
        }
        else { toast((json && json.errors && json.errors[0]) || 'Could not remove from the front page.', true); }
      })
      .catch(function () { toast('Request failed — please try again.', true); });
    });
  }

  // ── Destructive: Delete Story (permanent, isolated behind ConfirmModal) ─
  var deleteBtn = composer.querySelector('[data-news-delete-active]');
  if (deleteBtn) {
    deleteBtn.addEventListener('click', function () {
      var id = f.articleId ? f.articleId.value : '';
      if (!id) { toast('Nothing to delete — this is a new story.', true); return; }
      var title = f.title && f.title.value ? '"' + f.title.value + '"' : 'This story';
      confirmAction({
        title: 'Delete this story permanently?',
        body: title + ' and its image will be permanently deleted. This cannot be undone.',
        confirmLabel: 'Delete Story',
        cancelLabel: 'Cancel',
        danger: true
      }).then(function (ok) {
        if (!ok) return;
        var fd = new FormData();
        fd.append('__method', 'DELETE');
        fetch('/news/dashboard/' + encodeURIComponent(id), {
          method: 'POST',
          headers: { 'X-CSRF-TOKEN': csrf, 'X-Requested-With': 'XMLHttpRequest' },
          body: fd
        })
        .then(function (r) { return r.json().catch(function () { return { ok: r.ok }; }); })
        .then(function (json) {
          if (json && json.ok) {
            toast('Story deleted.', false);
            // Delete removes the row entirely — it doesn't persist any
            // pending field edits either, so the dirty badge stays as-is
            // (F1, same reasoning as unassign above).
            if (window.DashboardLive) { window.DashboardLive.refresh('news'); }
          }
          else { toast((json && json.errors && json.errors[0]) || 'Could not delete.', true); }
        })
        .catch(function () { toast('Request failed — please try again.', true); });
      });
    });
  }

  // ── Library: load / add ───────────────────────────────
  // Delegated from the dashboard root, for two reasons: the story library sits
  // outside [data-news-composer] in the markup, and a live refresh replaces the
  // library grid, so freshly injected cards must stay clickable.
  root.addEventListener('click', function (event) {
    var btn = event.target.closest('[data-news-load-story]');
    if (!btn || !root.contains(btn)) return;
    var card = btn.closest('[data-news-library-item]');
    if (card) loadStory(cardData(card));
  });

  var addBtn = composer.querySelector('[data-news-add-secondary]');
  if (addBtn) {
    addBtn.addEventListener('click', function () {
      loadStory({ id: '', layout: 'secondary', priority: '0' });
      setSlot('secondary');
      if (activeLabel) activeLabel.textContent = 'New story';
      markDirty();
    });
  }

  props && Array.prototype.slice.call(props.querySelectorAll('[data-news-slot-choice]')).forEach(function (btn) {
    btn.addEventListener('click', function () { setSlot(btn.getAttribute('data-news-slot-choice')); markDirty(); });
  });
  if (propDate) propDate.addEventListener('input', function () { if (f.publishedAt) f.publishedAt.value = propDate.value; markDirty(); });

  // ── Drag-to-reorder secondary stories ─────────────────
  // Persists by resending each moved story's FULL data (from its library card,
  // so the description isn't clobbered) with a new priority.
  function libraryCardById(id) {
    return composer.querySelector('[data-news-library-item][data-news-library-id="' + id + '"]');
  }
  function persistOrder(grid) {
    Array.prototype.slice.call(grid.querySelectorAll('[data-news-id]')).forEach(function (el, index) {
      var id = el.getAttribute('data-news-id');
      if (!id) return;
      var card = libraryCardById(id);
      if (!card) return; // not in the library page slice; skip (order still visual)
      var d = cardData(card);
      var fd = new FormData();
      fd.append('article_id', id);
      fd.append('title', d.title);
      fd.append('description', d.description);
      fd.append('source', d.source);
      fd.append('location', d.location);
      // Re-send the editorial extras too — store() persists `input or None`,
      // so omitting them here would wipe them on every reorder.
      fd.append('dek', d.dek);
      fd.append('image_caption', d.caption);
      fd.append('image_credit', d.credit);
      fd.append('layout_type', 'secondary');
      fd.append('priority', String(index));
      fd.append('status', d.status || 'published');
      fetch(form.getAttribute('action'), {
        method: 'POST',
        headers: { 'X-CSRF-TOKEN': csrf, 'X-Requested-With': 'XMLHttpRequest' },
        body: fd
      }).catch(function () {});
    });
  }
  var secondaryGrid = editor.querySelector('.secondary-grid');
  if (secondaryGrid) {
    Sortable.create(secondaryGrid, {
      animation: 150,
      handle: '.secondary-story',
      draggable: '.secondary-story',
      onEnd: function () { persistOrder(secondaryGrid); toast('Order updated.', false); }
    });
  }

  // ── Init: edit the real rendered feature story ────────
  (function init() {
    var art = ensureFeature();
    if (!art) return;
    wireInline(art);
    wireImage(art);
    mountQuill(art);
    // Seed the hidden form from what's already on the page.
    if (f.title)       f.title.value = getText(art, 'title');
    if (f.source)      f.source.value = getText(art, 'source');
    if (f.location)    f.location.value = getText(art, 'location');
    if (f.dek)         f.dek.value = getText(art, 'dek');
    if (f.caption)     f.caption.value = getText(art, 'caption');
    if (f.credit)      f.credit.value = getText(art, 'credit');
    if (f.description && quill) f.description.value = quill.root.innerHTML;
    if (f.articleId)   f.articleId.value = art.getAttribute('data-news-id') || '';
    setSlot('main');
    if (activeLabel) {
      var t = getText(art, 'title');
      activeLabel.textContent = (art.getAttribute('data-news-id')) ? ('Editing: ' + (t || 'Untitled')) : 'New story';
    }
  })();
})();
