/*
 * In-place news editor for the Gears dashboard.
 *
 * The dashboard renders the REAL kiosk front page (templates/kiosk/_news_slots.html).
 * The feature (lead) slot is the live editing surface: a Quill rich-text body,
 * inline-editable title/source/location, and drop-to-attach cover image. Saves
 * post the existing hidden form to news.store (which sanitizes the HTML with
 * bleach) and reload to re-render the real page. The story library is a
 * slide-over drawer (see "Story Library drawer" below); "Place on Front Page"
 * assigns a story to a slot via news.layout — it no longer loads stories into
 * this editing surface.
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
  var layoutDirty = false;
  function setLayoutDirty(isDirty) {
    layoutDirty = !!isDirty;
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
          // Same stale-canvas bug the drawer's assign flow was built to
          // solve: unassigning leaves the removed story sitting visibly in
          // its old slot until this fires (fix round 1, minor).
          refreshCanvasFragment('Removed from the front page');
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
            refreshCanvasFragment('Deleted');
          }
          else { toast((json && json.errors && json.errors[0]) || 'Could not delete.', true); }
        })
        .catch(function () { toast('Request failed — please try again.', true); });
      });
    });
  }

  // ── Library: open drawer / place on front page / add ──
  // Delegated from the dashboard root: the drawer's card grid and the
  // canvas's empty-slot placeholders both sit outside [data-news-composer],
  // and both get their innerHTML replaced (library refresh, canvas refresh)
  // — a direct listener on either would go silently dead after the first swap.
  root.addEventListener('click', function (event) {
    var openBtn = event.target.closest('[data-news-library-open]');
    if (openBtn && root.contains(openBtn)) {
      openLibraryDrawer(openBtn, null);
      return;
    }

    var slotBtn = event.target.closest('[data-news-assign-slot]');
    if (slotBtn && root.contains(slotBtn)) {
      var slotType = slotBtn.getAttribute('data-news-slot-type');
      var slotPosition = parseInt(slotBtn.getAttribute('data-news-slot-position'), 10) || 1;
      openLibraryDrawer(slotBtn, { type: slotType, priority: slotPosition });
      return;
    }

    var placeBtn = event.target.closest('[data-news-place-story]');
    if (placeBtn && libraryDrawer && libraryDrawer.contains(placeBtn)) {
      var card = placeBtn.closest('[data-news-library-item]');
      if (card) handlePlaceStory(placeBtn, card);
      return;
    }
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
  function initSecondarySortable() {
    var grid = editor.querySelector('.secondary-grid');
    if (!grid) return;
    Sortable.create(grid, {
      animation: 150,
      handle: '.secondary-story',
      draggable: '.secondary-story',
      onEnd: function () { persistOrder(grid); toast('Order updated.', false); }
    });
  }
  initSecondarySortable();

  // ── Story Library drawer (Task 4) ─────────────────────
  // Replaces the old below-the-fold grid with an on-demand <dialog> built on
  // the .article-modal pattern (resources/css/gears-dashboard.css). Opens from
  // the toolbar button (data-news-library-open, no target slot) or from an
  // empty-slot placeholder in the canvas (data-news-assign-slot, which carries
  // the exact layout_type + position to assign into). "Place on Front Page"
  // inside the drawer persists via the Task 2 news.layout endpoint instead of
  // loading the story into the feature editing surface.
  var libraryDrawer = root.querySelector('[data-news-library-drawer]');
  var libraryOpenBtn = root.querySelector('[data-news-library-open]');
  var librarySubtitle = libraryDrawer ? libraryDrawer.querySelector('[data-news-library-subtitle]') : null;
  var libraryNoMatch = libraryDrawer ? libraryDrawer.querySelector('[data-news-library-no-match]') : null;
  var libraryFilterBtns = libraryDrawer
    ? Array.prototype.slice.call(libraryDrawer.querySelectorAll('[data-news-library-filter]'))
    : [];
  var currentLibraryFilter = 'all';
  var drawerTarget = null;   // { type: 'secondary'|'widget'|'main', priority: N } or null (generic open)
  var drawerTrigger = null;  // element focus returns to on close

  var DEFAULT_LIBRARY_SUBTITLE = 'Reuse a published story, or place it on the front page.';

  function matchesLibraryFilter(card, filter) {
    if (filter === 'all') return true;
    var status = (card.getAttribute('data-news-library-status') || '').toLowerCase();
    var layout = (card.getAttribute('data-news-library-layout') || '').toLowerCase();
    if (filter === 'draft') return status === 'draft';
    if (filter === 'scheduled') return status === 'scheduled';
    if (filter === 'unassigned') return layout === 'unassigned';
    return true;
  }

  function applyLibraryFilter() {
    if (!libraryDrawer) return;
    var cards = Array.prototype.slice.call(libraryDrawer.querySelectorAll('[data-news-library-item]'));
    var visible = 0;
    cards.forEach(function (card) {
      var show = matchesLibraryFilter(card, currentLibraryFilter);
      card.hidden = !show;
      if (show) visible += 1;
    });
    if (libraryNoMatch) libraryNoMatch.hidden = !(cards.length && visible === 0);
  }

  function setLibraryFilter(filter) {
    currentLibraryFilter = filter || 'all';
    libraryFilterBtns.forEach(function (btn) {
      var active = btn.getAttribute('data-news-library-filter') === currentLibraryFilter;
      btn.classList.toggle('is-active', active);
      btn.setAttribute('aria-pressed', String(active));
    });
    applyLibraryFilter();
  }

  var SLOT_LABELS = { main: 'Lead', secondary: 'Secondary', widget: 'Widget' };
  function updateLibrarySubtitle() {
    if (!librarySubtitle) return;
    if (drawerTarget) {
      librarySubtitle.textContent = 'Choose a story to place in ' +
        (SLOT_LABELS[drawerTarget.type] || drawerTarget.type) + ' slot ' + drawerTarget.priority + '.';
    } else {
      librarySubtitle.textContent = DEFAULT_LIBRARY_SUBTITLE;
    }
  }

  function openLibraryDrawer(trigger, target) {
    // Native <dialog> only — no non-modal fallback. A browser without
    // showModal() gets no focus trap, no backdrop, no Escape handling, so
    // degrading to a plain `open` attribute would ship a broken drawer
    // silently; declining to open is more honest.
    if (!libraryDrawer || typeof libraryDrawer.showModal !== 'function') return;
    drawerTarget = target || null;
    drawerTrigger = trigger || null;
    updateLibrarySubtitle();
    setLibraryFilter('all');
    libraryDrawer.showModal();
    var closeBtn = libraryDrawer.querySelector('[data-news-library-close]');
    if (closeBtn) closeBtn.focus();
  }

  if (libraryDrawer) {
    // Fires on Escape too (native <dialog> cancel → close), so this is the
    // single place trigger-focus-return and target reset happen. The
    // trigger can be a canvas placeholder that a same-tick DOM swap already
    // removed (e.g. handlePlaceStory's removeFilledPlaceholder) — fall back
    // to the always-present toolbar button rather than losing focus to
    // <body>.
    libraryDrawer.addEventListener('close', function () {
      var trigger = drawerTrigger;
      drawerTarget = null;
      drawerTrigger = null;
      if (trigger && trigger.isConnected && trigger.focus) {
        trigger.focus();
      } else if (libraryOpenBtn) {
        libraryOpenBtn.focus();
      }
    });

    var libraryCloseBtn = libraryDrawer.querySelector('[data-news-library-close]');
    if (libraryCloseBtn) {
      libraryCloseBtn.addEventListener('click', function () { libraryDrawer.close(); });
    }

    libraryFilterBtns.forEach(function (btn) {
      btn.addEventListener('click', function () { setLibraryFilter(btn.getAttribute('data-news-library-filter')); });
    });

    // The grid is [data-live-target]: a live refresh replaces its innerHTML,
    // which would silently drop the active filter. Reapply it once the swap
    // (and dashboard-live.js's rewire()) finishes.
    var newsPanel = root.querySelector('[data-live-section="news"]');
    if (newsPanel) {
      newsPanel.addEventListener('live:refreshed', function (event) {
        if (event.detail && event.detail.section === 'news') applyLibraryFilter();
      });
    }
  }

  // ── Bucket occupancy: read straight off the canvas, with an in-memory
  // overlay for placements the canvas hasn't caught up to yet ────
  // The canvas is the exact output of DashboardContext.group_news_slots()
  // (kiosk/_news_slots.html rendered in editor mode) — it excludes whichever
  // story that grouping promoted to main_news from the secondary list, caps
  // at 4/2, and reflects priority order via DOM order. Deriving occupancy
  // from library-card `data-news-library-layout` attributes instead (fix
  // round 1's I1) disagreed with this in ordinary states, not just under
  // concurrency: with no explicit `layout_type="main"` row, the server's
  // fallback main is still a "secondary"-typed row by attribute, so the
  // library-card count read it as an extra secondary slot and read main as
  // empty even though the canvas plainly showed a lead story.
  //
  // Reading the canvas DOM is only truthful when the canvas is actually
  // current. refreshCanvasFragment() intentionally skips the DOM swap while
  // layoutDirty (round 1, I2's first half) — which means a SECOND placement
  // made before that gate clears was computing occupancy from a frozen,
  // already-stale canvas (round 2, I2): it would reuse an already-filled
  // ordinal and silently overfill the bucket once the batch reached the
  // server's `[:4]`/`[:2]` slice. `virtualSlots`, once created, becomes the
  // source of truth for occupancy instead of the DOM, and is kept in sync
  // by every successful placement; it's discarded (falling back to reading
  // the canvas again) the moment the canvas actually refreshes, since the
  // DOM is trustworthy again at that point.
  var BUCKET_CAPACITY = { secondary: 4, widget: 2 };
  var virtualSlots = null; // { main: id|null, secondary: [ids], widget: [ids] }

  function canvasBucketIds(type) {
    if (type === 'secondary') {
      var grid = editor.querySelector('.secondary-grid');
      if (!grid) return [];
      return Array.prototype.map.call(
        grid.querySelectorAll('.secondary-story[data-news-id]'),
        function (el) { return el.getAttribute('data-news-id'); }
      ).filter(Boolean);
    }
    if (type === 'widget') {
      return Array.prototype.map.call(
        editor.querySelectorAll('.paper-slot--widget .info-card[data-news-id]'),
        function (el) { return el.getAttribute('data-news-id'); }
      ).filter(Boolean);
    }
    return [];
  }

  function canvasMainId() {
    if (!featureSlot) return '';
    var art = featureSlot.querySelector('.feature-story[data-news-id]');
    return (art && art.getAttribute('data-news-id')) || '';
  }

  // Lazily snapshots the canvas into the overlay on first use, so a run of
  // placements made without an intervening real refresh all read/write the
  // same evolving picture instead of each one re-reading the stale DOM.
  function ensureVirtualSlots() {
    if (!virtualSlots) {
      virtualSlots = {
        main: canvasMainId() || null,
        secondary: canvasBucketIds('secondary'),
        widget: canvasBucketIds('widget')
      };
    }
    return virtualSlots;
  }

  function bucketMembers(type) {
    if (virtualSlots) return (virtualSlots[type] || []).slice();
    return canvasBucketIds(type);
  }

  function mainOccupant() {
    if (virtualSlots) return virtualSlots.main;
    return canvasMainId() || null;
  }

  function slotCounts() {
    return {
      main: mainOccupant() ? 1 : 0,
      secondary: bucketMembers('secondary').length,
      widget: bucketMembers('widget').length
    };
  }

  // Records a successful placement in the overlay so the NEXT occupancy read
  // (before the canvas has actually refreshed) already accounts for it.
  // Approximate for the main-displacement case: the story main just bumped
  // is not re-inserted into the secondary overlay here (replicating
  // group_news_slots()'s full re-grouping client-side isn't worth the
  // complexity for what's already a confirm-gated edge case) — it reappears
  // correctly once a real canvas refresh happens, same as today.
  function applyPlacementToVirtualSlots(target, id) {
    var slots = ensureVirtualSlots();
    var idStr = String(id);
    slots.secondary = slots.secondary.filter(function (x) { return x !== idStr; });
    slots.widget = slots.widget.filter(function (x) { return x !== idStr; });
    if (slots.main === idStr) slots.main = null;

    if (target.type === 'main') {
      slots.main = idStr;
      return;
    }
    var arr = slots[target.type] || [];
    var insertAt = target.priority
      ? Math.min(Math.max(target.priority - 1, 0), arr.length)
      : arr.length;
    arr.splice(insertAt, 0, idStr);
    var cap = BUCKET_CAPACITY[target.type];
    slots[target.type] = cap ? arr.slice(0, cap) : arr;
  }

  // Generic toolbar-open decision (no target slot): fill the first free
  // position — lead if empty, else the next open secondary slot, else the
  // next open widget slot. Reading occupancy off the canvas/overlay (not the
  // library cards) means "main" only ever reads empty when there's truly no
  // lead story tracked, so this can no longer target an occupied main slot
  // on its own — handlePlaceStory's confirm guard below is therefore a
  // belt-and-braces check, not the primary defense.
  function firstFreeTarget() {
    var counts = slotCounts();
    if (counts.main < 1) return { type: 'main', priority: 0 };
    if (counts.secondary < 4) return { type: 'secondary', priority: counts.secondary + 1 };
    if (counts.widget < 2) return { type: 'widget', priority: counts.widget + 1 };
    return null;
  }

  // Highest priority currently held by ANY story (read from the library
  // cards' data-news-library-priority — unrelated to which bucket a card is
  // in). A new bucket assignment always gets a priority strictly above this,
  // so it can never become the new global minimum. That matters because
  // group_news_slots() falls back to the globally-lowest-priority story as
  // main_news whenever no row is explicitly layout_type="main" — which is
  // true of the live dataset today. Reusing a low ordinal (e.g. the
  // placeholder's on-screen position number) as the literal priority risked
  // silently outranking that fallback and hijacking the lead (fix round 1,
  // C1).
  function globalMaxPriority() {
    var max = 0;
    if (!libraryDrawer) return max;
    Array.prototype.forEach.call(libraryDrawer.querySelectorAll('[data-news-library-item]'), function (card) {
      var p = parseInt(card.getAttribute('data-news-library-priority'), 10);
      if (!isNaN(p) && p > max) max = p;
    });
    return max;
  }

  // Builds one fully-renumbered batch for a secondary/widget bucket: current
  // membership comes from bucketMembers() (canvas, or the overlay once one
  // exists — round 2, I2), the new story is inserted at the requested
  // ordinal (or appended, for a generic open) and the whole bucket is capped
  // and renumbered from globalMaxPriority()+1 up. One POST to news.layout,
  // one DB transaction, no reused priority values — so no collisions with
  // existing rows and no unrelated story's bucket membership or order
  // changes as a side effect (fix round 1, C1). Returns null if the bucket
  // is already full by the time this runs, so the caller can refuse rather
  // than silently dropping the insertion off the end.
  function buildBucketBatch(type, newId, requestedPosition) {
    var idStr = String(newId);
    var existing = bucketMembers(type).filter(function (id) { return id !== idStr; });
    var cap = BUCKET_CAPACITY[type] || (existing.length + 1);
    var insertAt = requestedPosition
      ? Math.min(Math.max(requestedPosition - 1, 0), existing.length)
      : existing.length;
    var finalOrder = existing.slice();
    finalOrder.splice(insertAt, 0, idStr);
    finalOrder = finalOrder.slice(0, cap);
    if (finalOrder.indexOf(idStr) === -1) return null;

    var base = globalMaxPriority() + 1;
    return finalOrder.map(function (id, index) {
      return { id: parseInt(id, 10), layout_type: type, priority: base + index };
    });
  }

  function postLayout(items) {
    return fetch('/news/dashboard/layout', {
      method: 'POST',
      headers: {
        'X-CSRF-TOKEN': csrf,
        'X-Requested-With': 'XMLHttpRequest',
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ items: items })
    }).then(function (r) { return r.json().catch(function () { return { ok: false }; }); });
  }

  // The canvas placeholder for the slot just filled holds no user data, so
  // it's safe to reconcile immediately and unconditionally — unlike the full
  // canvas fragment swap below, this doesn't need to wait on the dirty-edit
  // gate (fix round 1, I2).
  function removeFilledPlaceholder(target) {
    if (!target || target.type === 'main' || !editor) return;
    var selector = '[data-news-assign-slot][data-news-slot-type="' + target.type +
      '"][data-news-slot-position="' + target.priority + '"]';
    var placeholder = editor.querySelector(selector);
    if (placeholder) placeholder.remove();
  }

  function handlePlaceStory(placeBtn, card) {
    var id = card.getAttribute('data-news-library-id');
    var target = drawerTarget || firstFreeTarget();
    if (!target) {
      toast('Every front-page slot is full — remove a story first.', true);
      return;
    }

    function proceed() {
      var items = target.type === 'main'
        ? [{ id: parseInt(id, 10), layout_type: 'main', priority: 0 }]
        : buildBucketBatch(target.type, id, target.priority);

      if (!items) {
        toast('That slot filled up before this could be placed — try again.', true);
        return;
      }

      // Defense in depth (round 2, I2): buildBucketBatch already caps and
      // refuses via the null return above, but that guard is only as good
      // as its occupancy source. Assert the hard cap here too, independent
      // of where `items` came from, so a bucket can never be POSTed over
      // 1/4/2 — the server itself enforces no capacity at all.
      var cap = target.type === 'main' ? 1 : BUCKET_CAPACITY[target.type];
      if (cap && items.length > cap) {
        toast('That would overfill the slot — try again.', true);
        return;
      }

      placeBtn.disabled = true;
      postLayout(items)
        .then(function (json) {
          placeBtn.disabled = false;
          if (json && json.ok && json.updated && json.updated.length) {
            toast((json.messages && json.messages[0]) || 'Story placed on the front page.', false);
            applyPlacementToVirtualSlots(target, id);
            removeFilledPlaceholder(target);
            if (libraryDrawer.close) libraryDrawer.close();
            if (window.DashboardLive) window.DashboardLive.refresh('news');
            refreshCanvasFragment('Placed');
          } else {
            toast((json && json.errors && json.errors[0]) || 'Could not place that story.', true);
          }
        })
        .catch(function () {
          placeBtn.disabled = false;
          toast('Request failed — please try again.', true);
        });
    }

    // Targeting "main" while a lead story is already tracked (canvas or
    // overlay) would displace it. firstFreeTarget() only resolves to main
    // when none is tracked, so this only fires from a stale drawerTarget or
    // a race — but it's cheap insurance, and Task 6 may add an explicit
    // main placeholder that would hit this path routinely (fix round 1, I1).
    if (target.type === 'main' && mainOccupant()) {
      confirmAction({
        title: 'Replace the front-page lead?',
        body: 'This story will replace the current lead story on the front page.',
        confirmLabel: 'Replace lead',
        cancelLabel: 'Cancel'
      }).then(function (ok) { if (ok) proceed(); });
    } else {
      proceed();
    }
  }

  // ── Stale-canvas fix ───────────────────────────────────
  // DashboardLive.refresh('news') only swaps the library grid; the canvas
  // (the empty-slot placeholders and the story cards themselves) lives
  // outside that live target and goes stale after an assignment. Re-fetch
  // it from the same fragment mechanism dashboard-live.js uses elsewhere
  // (DashboardController.fragment('news-canvas') → DashboardContext.
  // news_canvas_context(), re-rendering kiosk/_news_slots.html in editor
  // mode) rather than hand-building the new DOM from the assign response.
  //
  // Skipped while the composer shows "Unpublished changes": that state means
  // there are unsaved inline edits (title/body/image/etc.) sitting only in
  // this tab's DOM, and overwriting the canvas would silently drop them. The
  // assignment itself has already persisted by this point either way — only
  // the *view* of the canvas is deferred, with a toast explaining why
  // (reloading is explicitly NOT offered as the fix here — that would lose
  // the very edits this gate exists to protect). `virtualSlots` (see above)
  // is what keeps occupancy/capacity correct for any further placements made
  // while the view is behind.
  //
  // `actionLabel` (round 2, new minor) lets unassign/delete route through
  // this same fix without the toast claiming a story was "Placed" when it
  // was actually removed or deleted.
  function refreshCanvasFragment(actionLabel) {
    var label = actionLabel || 'Placed';
    if (layoutDirty) {
      toast(label + '. The canvas view is behind because of unpublished edits — publish them to bring it up to date.', false);
      return;
    }
    fetch('/gears/dashboard/fragment/news-canvas', {
      headers: { 'X-Requested-With': 'XMLHttpRequest', Accept: 'application/json' },
      credentials: 'same-origin'
    })
      .then(function (r) { return r.json(); })
      .then(function (json) {
        if (!json || !json.ok || !editor) {
          toast(label + ', but the canvas could not be refreshed — reload to see it there.', true);
          return;
        }
        editor.innerHTML = json.html;
        reinitCanvas();
        // The canvas DOM is trustworthy again — drop the overlay so the
        // next occupancy read goes back to reflecting it directly.
        virtualSlots = null;
        // The innerHTML swap just destroyed whatever had focus if it was a
        // canvas element (e.g. the placeholder that received focus back
        // when the drawer closed) — recover to a stable, always-present
        // target instead of leaving it on <body> (fix round 1, minor).
        if (document.activeElement === document.body && libraryOpenBtn) {
          libraryOpenBtn.focus();
        }
      })
      .catch(function () {
        toast(label + ', but the canvas could not be refreshed — reload to see it there.', true);
      });
  }

  // Seeds the hidden form + active-story label from the feature slot's
  // current DOM. Used on first load AND after reinitCanvas() replaces that
  // DOM — the two must seed identically, or a canvas refresh that changes
  // which story is lead leaves `f.articleId` pointing at the OLD story while
  // the visible surface (and syncFormFromSurface's reads) reflect the NEW
  // one, so Publish overwrites the wrong row (fix round 1, C2).
  function seedFormFromFeature(art) {
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
  }

  function reinitCanvas() {
    featureSlot = editor.querySelector('[data-news-slot="main"]');
    quill = null;
    var art = ensureFeature();
    if (art) {
      wireInline(art);
      wireImage(art);
      mountQuill(art);
      seedFormFromFeature(art);
    }
    initSecondarySortable();
  }

  // ── Init: edit the real rendered feature story ────────
  (function init() {
    var art = ensureFeature();
    if (!art) return;
    wireInline(art);
    wireImage(art);
    mountQuill(art);
    seedFormFromFeature(art);
  })();
})();
