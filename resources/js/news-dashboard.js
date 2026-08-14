/*
 * In-place news editor for the Gears dashboard.
 *
 * The dashboard renders the REAL kiosk front page (templates/kiosk/_news_slots.html).
 * Every slot (lead, secondary, widget) is a selectable editing surface: inline
 * title/dek/excerpt/source/location/caption/credit text and drop-to-attach cover
 * image. Full-article body writing happens in a focused modal (Task 5) — the
 * canvas never mounts Quill. Saves post the existing hidden form to news.store
 * (which sanitizes the HTML with bleach) and reload to re-render the real page,
 * except the body modal, which saves independently through news.body. The story
 * library is a slide-over drawer (see "Story Library drawer" below); "Place on
 * Front Page" assigns a story to a slot via news.layout — it no longer loads
 * stories into this editing surface.
 */

import Quill from 'quill';
import Sortable from 'sortablejs';

(function () {
  var root = document.querySelector('[data-dashboard-shell]');
  if (!root) return;
  var composer = root.querySelector('[data-news-composer]');
  if (!composer) return;

  var editor      = composer.querySelector('[data-news-editor]');
  // Points at the main-headline <section>, used only to read/derive slot
  // occupancy (canvasMainId/canvasBucketIds below). NOT the editing target —
  // that used to be hardcoded here (`featureSlot`), which is exactly why
  // editing any story forced it into the lead surface. See selectStory().
  var mainSlotSection = editor ? editor.querySelector('[data-news-slot="main"]') : null;
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

  // ── Page-state badge (hero) — shown ONLY when there are unsaved edits ──
  // There is deliberately no "all clear" state: a badge that is always lit
  // says nothing and just adds noise. The clean state is silence, so the
  // badge appearing at all means "you have work that isn't published yet".
  var layoutDirty = false;
  function setLayoutDirty(isDirty) {
    layoutDirty = !!isDirty;
    if (!stateBadge) return;
    stateBadge.textContent = isDirty ? 'Unpublished changes' : '';
    stateBadge.hidden = !isDirty;
    stateBadge.classList.toggle('gears-hero__chip--dirty', !!isDirty);
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
    excerpt:     field('excerpt'),
    caption:     field('caption'),
    credit:      field('credit'),
    priority:    field('priority'),
    publishedAt: field('published_at'),
    articleId:   field('article_id'),
    image:       field('image'),
    removeImage: field('remove_image'),
    status:      field('status'),
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

  // Reads a JSON envelope defensively: on session expiry the auth middleware
  // 302-redirects to the login page, so fetch() resolves with an HTML body,
  // not JSON. Parsing that as JSON throws inside a .then(r => r.json()),
  // which previously surfaced as a generic "Request failed". Checking the
  // content-type first lets us give a truthful, actionable message instead.
  function readJsonEnvelope(r) {
    var ct = (r.headers && r.headers.get && r.headers.get('content-type')) || '';
    if (ct.indexOf('json') === -1) {
      return Promise.resolve({ ok: false, __sessionExpired: true });
    }
    return r.json().catch(function () { return { ok: false }; });
  }

  // ── Active story state ─────────────────────────────────
  // Generalizes what used to be "the lead slot only": whichever story is
  // selected — from main, secondary, or widget — becomes the active editing
  // target. `activeArt` is that story's own DOM node (wherever it lives in
  // the canvas); `activeSlotType` is which bucket it currently occupies.
  var activeId = '';
  var activeSlotType = 'main';
  var activeArt = null;

  function region(art, key) { return art ? art.querySelector('[data-news-edit="' + key + '"]') : null; }
  function setText(art, key, val) { var el = region(art, key); if (el) el.textContent = val || ''; }
  function getText(art, key) { var el = region(art, key); return el ? el.textContent.trim() : ''; }

  // ── Focused article body editor (modal) ───────────────
  // Quill lives here now, not on the canvas — the canvas body region
  // (.feature-story__copy etc.) is plain display markup, matching what the
  // public kiosk renders. Mounted lazily, once, on first open.
  var bodyModal        = root.querySelector('[data-news-body-modal]');
  var bodyEditorHost    = bodyModal ? bodyModal.querySelector('[data-news-body-editor]') : null;
  var bodyModalTitleEl  = bodyModal ? bodyModal.querySelector('[data-news-body-modal-title]') : null;
  var bodyModalSaveBtn  = bodyModal ? bodyModal.querySelector('[data-news-body-save]') : null;
  var bodyModalCancelBtn = bodyModal ? bodyModal.querySelector('[data-news-body-cancel]') : null;
  var bodyModalCloseBtn = bodyModal ? bodyModal.querySelector('[data-news-body-close]') : null;
  var bodyModalTrigger  = null;
  var quill = null;
  var bodyModalDirty = false; // local to the modal session, drives the close-confirm guard only
  // Snapshot of f.description.value taken when the modal opens. The
  // text-change handler below writes every keystroke straight into
  // f.description (so Publish always has the latest body without a
  // separate save step) — but that means a "Discard changes" confirmation
  // did nothing to the actually-staged value: the text vanished from view
  // while the discarded body stayed in the hidden form and got written by
  // the next Publish (fix round 1, I1). Restoring this snapshot on a
  // confirmed discard makes the warning true.
  var bodyModalSnapshot = '';

  function ensureQuill() {
    if (quill || !bodyEditorHost) return quill;
    // Construct first, THEN bind the change handler on the next statement —
    // Quill fires `text-change` synchronously inside its own constructor
    // while processing the (empty) host it was given. Binding before
    // construction finishes would mark the modal dirty before the user has
    // typed anything.
    quill = new Quill(bodyEditorHost, {
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
      bodyModalDirty = true;
      if (f.description) f.description.value = quill.root.innerHTML;
      markDirty();
    });
    return quill;
  }

  function openBodyModal(trigger) {
    if (!bodyModal || typeof bodyModal.showModal !== 'function') return;
    if (!activeArt && !activeId) { toast('Select or start a story first.', true); return; }
    ensureQuill();
    if (quill) {
      // Direct DOM assignment, not the Quill API — verified not to trip the
      // text-change handler above (Parchment's MutationObserver path is
      // suppressed by its own zero-length-diff guard), so this can safely
      // run after the handler is already bound.
      quill.root.innerHTML = (f.description && f.description.value) || '';
    }
    bodyModalSnapshot = (f.description && f.description.value) || '';
    bodyModalDirty = false;
    if (bodyModalTitleEl) {
      var label = activeArt ? getText(activeArt, 'title') : '';
      bodyModalTitleEl.textContent = 'Edit Full Article Body' + (label ? ' — ' + label : '');
    }
    bodyModalTrigger = trigger || document.activeElement;
    bodyModal.showModal();
    if (quill) quill.focus();
  }

  function closeBodyModalWithGuard() {
    if (!bodyModal) return;
    if (bodyModalDirty) {
      confirmAction({
        title: 'Discard unsaved changes?',
        body: 'The article body has unsaved edits that will be lost.',
        confirmLabel: 'Discard changes',
        cancelLabel: 'Keep editing',
        danger: true
      }).then(function (ok) {
        if (!ok) return;
        // Restore what was actually staged before the modal opened — the
        // keystroke-by-keystroke sync into f.description otherwise leaves
        // the discarded text there for the next Publish to write (I1).
        if (f.description) f.description.value = bodyModalSnapshot;
        if (activeArt) {
          var bodyRegion = region(activeArt, 'body');
          if (bodyRegion) bodyRegion.innerHTML = bodyModalSnapshot;
        }
        bodyModalDirty = false;
        bodyModal.close();
      });
      return;
    }
    bodyModal.close();
  }

  if (bodyModal) {
    if (bodyModalCloseBtn) bodyModalCloseBtn.addEventListener('click', closeBodyModalWithGuard);
    if (bodyModalCancelBtn) bodyModalCancelBtn.addEventListener('click', closeBodyModalWithGuard);

    // Escape fires `cancel` (cancelable) before `close` on a native
    // <dialog>. Routing it through the same guarded path keeps the
    // unsaved-changes warning in effect for Escape too.
    bodyModal.addEventListener('cancel', function (event) {
      event.preventDefault();
      closeBodyModalWithGuard();
    });

    bodyModal.addEventListener('close', function () {
      var trigger = bodyModalTrigger;
      bodyModalTrigger = null;
      bodyModalDirty = false;
      // The trigger can be a canvas element a refresh already detached
      // (editor.innerHTML swap) between open and close — fall back to the
      // always-present toolbar button rather than losing focus to <body>,
      // same pattern the library drawer already uses (fix round 1, minor).
      if (trigger && trigger.isConnected && trigger.focus) {
        trigger.focus();
      } else if (libraryOpenBtn) {
        libraryOpenBtn.focus();
      }
    });

    if (bodyModalSaveBtn) {
      bodyModalSaveBtn.addEventListener('click', function () {
        var html = quill ? quill.root.innerHTML : '';
        // A brand-new story (no id yet — "+ Add a story", not yet
        // Published) has no news.body endpoint to hit: the row doesn't
        // exist in the DB. The text-change handler above already kept
        // f.description in sync on every keystroke, so there's nothing
        // left to persist here except closing the modal — the body goes
        // live the same way the rest of the new story's fields do, via
        // "Publish Page Layout".
        if (!activeId) {
          bodyModalDirty = false;
          toast('Body kept — it will be saved when you Publish this new story.', false);
          bodyModal.close();
          return;
        }
        bodyModalSaveBtn.disabled = true;
        var fd = new FormData();
        fd.append('description', html);
        fetch('/news/dashboard/' + encodeURIComponent(activeId) + '/body', {
          method: 'POST',
          headers: { 'X-CSRF-TOKEN': csrf, 'X-Requested-With': 'XMLHttpRequest' },
          body: fd
        })
          .then(readJsonEnvelope)
          .then(function (json) {
            bodyModalSaveBtn.disabled = false;
            if (json && json.__sessionExpired) {
              toast('Your session has expired — reload the page and sign in again.', true);
              return;
            }
            if (json && json.ok) {
              if (f.description) f.description.value = json.description || html;
              if (activeArt) {
                var bodyRegion = region(activeArt, 'body');
                if (bodyRegion) bodyRegion.innerHTML = json.description || html;
              }
              bodyModalDirty = false;
              toast('Article body saved.', false);
              // Deliberately NOT clearing layoutDirty/the "Unpublished
              // changes" badge here (same reasoning as unassign/delete
              // below, F1): the body is now persisted, but any pending
              // canvas metadata edits (title/dek/excerpt/image) are not —
              // clearing the badge would claim they were too.
              if (window.DashboardLive) window.DashboardLive.refresh('news');
              bodyModal.close();
            } else {
              toast((json && json.errors && json.errors[0]) || 'Could not save the body.', true);
            }
          })
          .catch(function () {
            bodyModalSaveBtn.disabled = false;
            toast('Request failed — please try again.', true);
          });
      });
    }
  }

  // ── Inline title/source/location/dek/excerpt/caption/credit ──
  var INLINE_PLACEHOLDERS = {
    title: 'Headline…',
    source: 'Byline…',
    location: 'Location…',
    dek: 'Add a dek — one or two lines under the headline…',
    excerpt: 'Front-page excerpt (optional) — falls back to a truncated body when blank…',
    caption: 'Photo caption…',
    credit: 'Photo credit…'
  };
  var INLINE_KEYS = ['title', 'source', 'location', 'dek', 'excerpt', 'caption', 'credit'];

  // `excerpt` persists to a `varchar(255)` column and MySQL's `sql_mode`
  // here includes STRICT_TRANS_TABLES, so an over-length value doesn't get
  // silently truncated server-side — it raises "Data too long" and the
  // whole Publish fails. Truncate client-side so that can't happen
  // (fix round 1, minor).
  var EXCERPT_MAX = 255;

  // Wires whatever of the inline-editable regions actually exist inside
  // `art` — main, secondary, and widget markup each expose a different
  // subset (secondary/widget don't have source/location/caption/credit
  // regions at all), so this only touches what's really there.
  function wireInline(art) {
    INLINE_KEYS.forEach(function (key) {
      var el = region(art, key);
      if (!el || el.getAttribute('data-wired')) return;
      el.setAttribute('contenteditable', 'true');
      el.setAttribute('data-placeholder', INLINE_PLACEHOLDERS[key] || '');
      el.setAttribute('data-wired', '1');
      el.addEventListener('input', function () {
        var text = el.textContent;
        if (key === 'excerpt' && text.length > EXCERPT_MAX) {
          text = text.slice(0, EXCERPT_MAX);
          el.textContent = text;
          // Keep typing sane: put the caret back at the end after a
          // programmatic truncation instead of leaving it wherever the
          // browser's default post-mutation placement lands.
          var sel = window.getSelection && window.getSelection();
          if (sel) {
            var range = document.createRange();
            range.selectNodeContents(el);
            range.collapse(false);
            sel.removeAllRanges();
            sel.addRange(range);
          }
        }
        if (f[key]) f[key].value = text.trim();
        markDirty();
      });
    });
  }

  // ── Cover image (click or drop) ───────────────────────
  var objectUrl = null;
  function previewImage(src) {
    var zone = activeArt ? region(activeArt, 'image') : null;
    if (!zone) return;
    if (objectUrl) { try { URL.revokeObjectURL(objectUrl); } catch (_) {} objectUrl = null; }
    var url = typeof src === 'string' ? src : (objectUrl = URL.createObjectURL(src));
    if (zone.tagName === 'IMG') {
      zone.src = url;
      // Fixed alongside the C2/I2 pass (fix round 1, minor): this branch
      // never stripped the fallback class, so a real photo could render
      // with the "no photo" placeholder styling still applied on top of it.
      zone.classList.remove('feature-story__image--fallback', 'secondary-story__thumb--fallback');
    } else {
      zone.style.backgroundImage = 'url("' + url + '")';
      zone.style.backgroundSize = 'cover';
      zone.style.backgroundPosition = 'center';
      zone.classList.remove('feature-story__image--fallback', 'secondary-story__thumb--fallback');
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
    // Picking a new photo cancels a staged removal — otherwise the server
    // would clear the column and ignore the upload sitting next to it.
    if (f.removeImage) f.removeImage.value = '';
    setFeaturedPreview(file);
  }

  // ── Featured Image box ────────────────────────────────
  // The canvas already accepts click-and-drop on the photo itself, but that
  // affordance is invisible until you try it. This box is the discoverable
  // twin — it drives the SAME hidden file input rather than adding a second
  // upload path, so there's only ever one source of truth for the pending
  // file.
  var featuredPreview = props ? props.querySelector('[data-news-featured-preview]') : null;
  var featuredEmpty   = props ? props.querySelector('[data-news-featured-empty]') : null;
  var featuredSetBtn  = props ? props.querySelector('[data-news-featured-set]') : null;
  var featuredRmBtn   = props ? props.querySelector('[data-news-featured-remove]') : null;
  var featuredObjectUrl = null;

  function setFeaturedPreview(src) {
    if (!featuredPreview || !featuredEmpty) return;
    if (featuredObjectUrl) {
      try { URL.revokeObjectURL(featuredObjectUrl); } catch (_) {}
      featuredObjectUrl = null;
    }
    var url = '';
    if (src && typeof src !== 'string') url = (featuredObjectUrl = URL.createObjectURL(src));
    else if (src) url = src;

    if (url) {
      featuredPreview.src = url;
      featuredPreview.hidden = false;
      featuredEmpty.hidden = true;
    } else {
      featuredPreview.removeAttribute('src');
      featuredPreview.hidden = true;
      featuredEmpty.hidden = false;
    }
    if (featuredRmBtn) featuredRmBtn.hidden = !url;
    if (featuredSetBtn) featuredSetBtn.textContent = url ? 'Replace image' : 'Set featured image';
  }

  // A story can carry an image path whose file is missing (older rows, a
  // failed upload). Showing a broken-image icon in the inspector is worse
  // than showing the empty state, so fall back to it.
  if (featuredPreview) {
    featuredPreview.addEventListener('error', function () {
      featuredPreview.hidden = true;
      if (featuredEmpty) featuredEmpty.hidden = false;
      if (featuredRmBtn) featuredRmBtn.hidden = false;
    });
  }

  if (featuredSetBtn) {
    featuredSetBtn.addEventListener('click', function () {
      if (f.image) f.image.click();
    });
  }

  if (featuredRmBtn) {
    featuredRmBtn.addEventListener('click', function () {
      // Clear any pending upload AND ask the server to drop the stored one.
      try { if (f.image) f.image.value = ''; } catch (_) {}
      if (f.removeImage) f.removeImage.value = '1';
      setFeaturedPreview('');
      // Mirror it on the canvas so the surface stays an honest preview.
      var zone = activeArt ? region(activeArt, 'image') : null;
      if (zone) {
        zone.style.backgroundImage = '';
        zone.classList.add('feature-story__image--fallback', 'secondary-story__thumb--fallback');
        if (zone.tagName === 'IMG') zone.removeAttribute('src');
      }
      markDirty();
    });
  }

  function wireImage(art) {
    var zone = region(art, 'image');
    if (!zone || zone.getAttribute('data-wired')) return;
    zone.setAttribute('data-wired', '1');
    zone.classList.add('is-editable');
    // Binding happens once per node and stays forever (guarded by
    // data-wired above), but which story is ACTIVE changes over time — and
    // previewImage()/f.image always act on `activeArt`, not on `art`.
    // Without this guard, clicking or dropping onto a previously-selected
    // (now inactive) story's image zone silently attached the file to
    // whatever story happens to be active right now (fix round 1, minor).
    zone.addEventListener('click', function () { if (art === activeArt && f.image) f.image.click(); });
    ['dragover', 'dragenter'].forEach(function (ev) {
      zone.addEventListener(ev, function (e) { if (art !== activeArt) return; e.preventDefault(); zone.classList.add('is-drop'); });
    });
    ['dragleave', 'dragend', 'drop'].forEach(function (ev) {
      zone.addEventListener(ev, function () { zone.classList.remove('is-drop'); });
    });
    zone.addEventListener('drop', function (e) {
      if (art !== activeArt) return;
      e.preventDefault();
      var file = e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files[0];
      if (file) { setImageFile(file); markDirty(); }
    });
  }
  if (f.image) {
    f.image.addEventListener('change', function () {
      var file = f.image.files && f.image.files[0];
      // Covers the Featured Image box's "Set/Replace" button too — it opens
      // this same input, so the preview and the cancelled-removal flag are
      // handled in one place.
      if (file) {
        previewImage(file);
        if (f.removeImage) f.removeImage.value = '';
        setFeaturedPreview(file);
        markDirty();
      }
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

  function cardData(card) {
    return {
      id:          card.getAttribute('data-news-library-id') || '',
      title:       card.getAttribute('data-news-library-title') || '',
      description: card.getAttribute('data-news-library-description') || '',
      source:      card.getAttribute('data-news-library-source') || '',
      location:    card.getAttribute('data-news-library-location') || '',
      dek:         card.getAttribute('data-news-library-dek') || '',
      excerpt:     card.getAttribute('data-news-library-excerpt') || '',
      caption:     card.getAttribute('data-news-library-caption') || '',
      credit:      card.getAttribute('data-news-library-credit') || '',
      layout:      card.getAttribute('data-news-library-layout') || 'secondary',
      priority:    card.getAttribute('data-news-library-priority') || '0',
      status:      card.getAttribute('data-news-library-status') || 'published',
      image:       card.getAttribute('data-news-library-image') || ''
    };
  }

  // Scoped to `root`, not `composer`: the library cards render inside the
  // drawer <dialog> (data-news-library-drawer), which is a SIBLING of
  // [data-news-composer] in the DOM (dashboard.html), not a descendant of
  // it. Scoping this to `composer` meant the lookup could never find a
  // card — every selectStory() call for a real id would fail (fix round 1,
  // C1). Filtered-out cards stay findable too: Task 4's library filters
  // hide cards via `card.hidden`, they don't remove them.
  function libraryCardById(id) {
    return root.querySelector('[data-news-library-item][data-news-library-id="' + id + '"]');
  }

  // ── Select any slot's story into the editing surface ──
  // This replaces the old lead-only `loadStory`: it works for main,
  // secondary, or widget alike. Full story data (including the body, for
  // the modal) comes from that story's own library card — already rendered
  // on the page in the drawer's grid — rather than a new network round trip.
  // Returns true/false so callers (the per-slot Edit-body button, the canvas
  // refresh reseed) can tell whether the selection actually took and avoid
  // acting against a stale/wrong story (fix round 1, I2/I3).
  function selectStory(id, slotType, artEl) {
    var data;
    if (!id) {
      data = { id: '', title: '', description: '', source: '', location: '', dek: '', excerpt: '', caption: '', credit: '', layout: slotType || 'secondary', priority: '0', image: '' };
    } else {
      var card = libraryCardById(id);
      if (!card) { toast('Could not load that story’s details.', true); return false; }
      data = cardData(card);
    }

    activeArt = artEl || null;
    activeId = data.id || '';
    activeSlotType = slotType || data.layout || 'main';

    if (activeArt) {
      wireInline(activeArt);
      wireImage(activeArt);
      setText(activeArt, 'title', data.title || '');
      setText(activeArt, 'source', data.source || 'Editorial Desk');
      setText(activeArt, 'location', data.location || 'Campus');
      setText(activeArt, 'dek', data.dek || '');
      setText(activeArt, 'excerpt', data.excerpt || '');
      setText(activeArt, 'caption', data.caption || '');
      setText(activeArt, 'credit', data.credit || '');
      var bodyRegion = region(activeArt, 'body');
      if (bodyRegion) bodyRegion.innerHTML = data.description || '';
      var zone = region(activeArt, 'image');
      if (zone) {
        zone.style.backgroundImage = '';
        // Stale-class cleanup on both shapes an image region can take: an
        // <img> thumb (real photo) reverting to a blank story needs the
        // fallback class put back too, not just background-image zones
        // (previewImage() only ever REMOVES this class, on the non-IMG
        // branch — fix round 1, minor).
        zone.classList.add('feature-story__image--fallback', 'secondary-story__thumb--fallback');
        if (zone.tagName === 'IMG') zone.removeAttribute('src');
      }
      if (data.image) previewImage('/storage/' + String(data.image).replace(/\\/g, '/'));
    }

    if (f.title)       f.title.value = data.title || '';
    if (f.description) f.description.value = data.description || '';
    if (f.source)      f.source.value = data.source || '';
    if (f.location)    f.location.value = data.location || '';
    if (f.dek)         f.dek.value = data.dek || '';
    if (f.excerpt)     f.excerpt.value = data.excerpt || '';
    if (f.caption)     f.caption.value = data.caption || '';
    if (f.credit)      f.credit.value = data.credit || '';
    if (f.articleId)   f.articleId.value = data.id || '';
    if (f.priority)    f.priority.value = data.priority || '0';
    if (propPriority)  propPriority.value = data.priority || '0';
    try { if (f.image) f.image.value = ''; } catch (_) {}

    setSlot(activeSlotType);
    // Selecting a different story drops any image removal staged against the
    // previous one — otherwise Remove on story A would wipe story B's photo.
    if (f.removeImage) f.removeImage.value = '';
    setStatus(data.status || 'published');
    setFeaturedPreview(data.image ? '/storage/' + String(data.image).replace(/\\/g, '/') : '');
    if (activeLabel) activeLabel.textContent = data.id ? ('Editing: ' + (data.title || 'Untitled')) : 'New story';
    return true;
  }

  // ── Save (Publish) ────────────────────────────────────
  // Pulls the latest text straight off whichever DOM node is active, in
  // case a contenteditable `input` handler hasn't fired yet for some reason
  // (defensive; the input handlers already keep f.* in sync as you type).
  //
  // Only overwrites a field when its region actually exists on `activeArt`.
  // Secondary/widget markup doesn't carry source/location/dek/caption/
  // credit regions at all (only main does) — getText() on a missing region
  // returns '', and unconditionally writing that into f.* blanked those
  // real columns for any non-main selection the moment Publish ran
  // (fix round 1, C2). An absent region means "leave the staged value
  // (already set by selectStory() from the library card) alone", never
  // "clear it".
  function syncFormFromSurface() {
    if (!activeArt) return;
    if (f.title   && region(activeArt, 'title'))    f.title.value = getText(activeArt, 'title');
    if (f.source  && region(activeArt, 'source'))    f.source.value = getText(activeArt, 'source');
    if (f.location && region(activeArt, 'location')) f.location.value = getText(activeArt, 'location');
    if (f.dek     && region(activeArt, 'dek'))       f.dek.value = getText(activeArt, 'dek');
    if (f.excerpt && region(activeArt, 'excerpt'))   f.excerpt.value = getText(activeArt, 'excerpt');
    if (f.caption && region(activeArt, 'caption'))   f.caption.value = getText(activeArt, 'caption');
    if (f.credit  && region(activeArt, 'credit'))    f.credit.value = getText(activeArt, 'credit');
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
    .then(readJsonEnvelope)
    .then(function (json) {
      if (json && json.__sessionExpired) {
        toast('Your session has expired — reload the page and sign in again.', true);
        return;
      }
      if (json && json.ok) { onOk(json); }
      else { toast((json && json.errors && json.errors[0]) || 'Could not save — check the fields.', true); }
    })
    .catch(function () { toast('Request failed — please try again.', true); });
  }

  // ── Publish box (WordPress-style status + two exits) ──
  // The status field used to be hardcoded to "published" in the template,
  // which is why the library's Drafts/Scheduled filters could never match.
  // NewsController already understands the whole status vocabulary and keeps
  // non-public statuses off the kiosk, so this is purely the missing UI.
  var statusLabel = props ? props.querySelector('[data-news-status-label]') : null;
  var STATUS_LABELS = {
    draft: 'Draft',
    review: 'Pending review',
    approved: 'Published',
    scheduled: 'Scheduled',
    published: 'Published',
    archived: 'Archived'
  };

  function setStatus(value) {
    var status = value || 'published';
    if (f.status) f.status.value = status;
    if (statusLabel) statusLabel.textContent = STATUS_LABELS[status] || status;
  }

  function submitWithStatus(button, status, busyLabel, okMessage) {
    if (!button) return;
    syncFormFromSurface();
    setStatus(status);
    button.disabled = true;
    var label = button.textContent;
    button.textContent = busyLabel;
    postForm(function (json) {
      toast((json.messages && json.messages[0]) || okMessage, false);
      setLayoutDirty(false);
      // A saved story no longer has a pending image removal staged.
      if (f.removeImage) f.removeImage.value = '';
      if (window.DashboardLive) { window.DashboardLive.refresh('news'); }
      refreshCanvasFragment(okMessage);
    });
    setTimeout(function () { button.disabled = false; button.textContent = label; }, 4000);
  }

  var saveBtn = composer.querySelector('[data-news-canvas-save]');
  if (saveBtn) {
    saveBtn.addEventListener('click', function () {
      submitWithStatus(saveBtn, 'published', 'Publishing…', 'Story published.');
    });
  }

  var draftBtn = composer.querySelector('[data-news-save-draft]');
  if (draftBtn) {
    draftBtn.addEventListener('click', function () {
      submitWithStatus(draftBtn, 'draft', 'Saving…', 'Draft saved.');
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
      .then(readJsonEnvelope)
      .then(function (json) {
        if (json && json.__sessionExpired) {
          toast('Your session has expired — reload the page and sign in again.', true);
          return;
        }
        if (json && json.ok) {
          toast((json.messages && json.messages[0]) || 'Removed from the front page.', false);
          if (f.layout) f.layout.value = 'unassigned';
          setSlot('unassigned');
          // Unassign only writes layout_type — any unrelated field edits
          // still sitting in the hidden form are NOT persisted by this
          // call, so the dirty badge must not be cleared here (F1).
          if (window.DashboardLive) { window.DashboardLive.refresh('news'); }
          // H4: unassign changes canvas membership without going through
          // the drag/move path that keeps virtualSlots in sync — drop the
          // overlay so the next occupancy read falls back to the DOM
          // (accurate again once refreshCanvasFragment below completes, or
          // immediately if it's skipped by the dirty gate).
          virtualSlots = null;
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
        .then(readJsonEnvelope)
        .then(function (json) {
          if (json && json.__sessionExpired) {
            toast('Your session has expired — reload the page and sign in again.', true);
            return;
          }
          if (json && json.ok) {
            toast('Story deleted.', false);
            // Delete removes the row entirely — it doesn't persist any
            // pending field edits either, so the dirty badge stays as-is
            // (F1, same reasoning as unassign above).
            if (window.DashboardLive) { window.DashboardLive.refresh('news'); }
            virtualSlots = null; // H4, same reasoning as unassign above
            refreshCanvasFragment('Deleted');
          }
          else { toast((json && json.errors && json.errors[0]) || 'Could not delete.', true); }
        })
        .catch(function () { toast('Request failed — please try again.', true); });
      });
    });
  }

  // ── Right-click menu on a canvas slot ─────────────────
  // Opening the menu SELECTS the story first, so the properties panel and
  // the hidden form both point at it. That means the destructive actions can
  // delegate straight to the existing inspector buttons instead of repeating
  // their fetch/confirm/refresh logic — one implementation, one behaviour.
  var contextMenu = composer.querySelector('[data-news-context-menu-el]');
  var contextTitle = contextMenu ? contextMenu.querySelector('[data-news-context-title]') : null;
  var contextTargetArt = null;
  var contextOpenedAt = 0;

  var SLOT_NAMES = { main: 'Lead', secondary: 'Side', widget: 'Widget' };

  function closeContextMenu() {
    if (!contextMenu || contextMenu.hidden) return;
    contextMenu.hidden = true;
    if (contextTargetArt) contextTargetArt.classList.remove('is-context-target');
    contextTargetArt = null;
  }

  function openContextMenu(art, x, y) {
    if (!contextMenu) return;
    contextTargetArt = art;
    art.classList.add('is-context-target');

    var slotType = art.getAttribute('data-news-context-menu') || 'secondary';
    var titleRegion = region(art, 'title');
    var storyTitle = titleRegion ? (titleRegion.textContent || '').trim() : '';
    if (contextTitle) {
      contextTitle.textContent = (SLOT_NAMES[slotType] || 'Story') + (storyTitle ? ' · ' + storyTitle : '');
    }

    // Show first so the box has measurable dimensions, then clamp it inside
    // the viewport (a right-click near the bottom edge would otherwise open
    // a menu you can't reach).
    contextMenu.hidden = false;
    contextOpenedAt = Date.now();
    var rect = contextMenu.getBoundingClientRect();
    var left = Math.min(x, window.innerWidth - rect.width - 8);
    var top = Math.min(y, window.innerHeight - rect.height - 8);
    contextMenu.style.left = Math.max(8, left) + 'px';
    contextMenu.style.top = Math.max(8, top) + 'px';

    var firstItem = contextMenu.querySelector('[data-news-context-action]');
    // preventScroll matters: the menu is already positioned at the pointer,
    // and letting focus() scroll an ancestor fires the scroll listener below
    // — which would close the menu in the same tick it opened.
    if (firstItem) firstItem.focus({ preventScroll: true });
  }

  if (editor && contextMenu) {
    editor.addEventListener('contextmenu', function (event) {
      var art = event.target.closest('[data-news-context-menu]');
      if (!art || !editor.contains(art)) return;
      var id = art.getAttribute('data-news-id');
      if (!id) return;

      event.preventDefault();
      var slotType = art.getAttribute('data-news-context-menu') || 'secondary';
      if (!selectStory(id, slotType, art)) return;

      // The context-menu KEY fires this event too, with no useful pointer
      // coordinates — fall back to the slot's own corner so keyboard users
      // get the menu somewhere sensible.
      var x = event.clientX;
      var y = event.clientY;
      if (!x && !y) {
        var artRect = art.getBoundingClientRect();
        x = artRect.left + 12;
        y = artRect.top + 12;
      }
      openContextMenu(art, x, y);
    });

    contextMenu.addEventListener('click', function (event) {
      var item = event.target.closest('[data-news-context-action]');
      if (!item) return;
      var action = item.getAttribute('data-news-context-action');
      var art = contextTargetArt;
      closeContextMenu();

      if (action === 'edit') {
        // Already selected when the menu opened — put the caret in the
        // headline so "Edit" actually starts an edit.
        var titleRegion = art ? region(art, 'title') : null;
        if (titleRegion) {
          titleRegion.focus();
          if (typeof titleRegion.scrollIntoView === 'function') {
            titleRegion.scrollIntoView({ block: 'center' });
          }
        }
        return;
      }
      if (action === 'unassign' && unassignBtn) { unassignBtn.click(); return; }
      if (action === 'delete' && deleteBtn) { deleteBtn.click(); }
    });

    // Dismiss on mousedown, not click: a right-click never produces a click
    // event (it goes mousedown → contextmenu → mouseup → auxclick), and
    // mousedown lands BEFORE contextmenu, so right-clicking a second slot
    // cleanly closes the first menu before the new one opens.
    document.addEventListener('mousedown', function (event) {
      if (contextMenu.hidden) return;
      if (!contextMenu.contains(event.target)) closeContextMenu();
    });
    document.addEventListener('keydown', function (event) {
      if (event.key === 'Escape') closeContextMenu();
    });
    // A menu pinned with position:fixed would otherwise float away from the
    // slot it belongs to. Ignore any scroll in the same frame as the open —
    // focusing the first item can itself nudge a scroll container.
    window.addEventListener('resize', closeContextMenu);
    window.addEventListener('scroll', function () {
      if (Date.now() - contextOpenedAt < 150) return;
      closeContextMenu();
    }, true);
  }

  // ── Library: open drawer / place on front page / add / select / edit body ─
  // Delegated from the dashboard root: the drawer's card grid and the
  // canvas's slot content both sit outside [data-news-composer] or get their
  // innerHTML replaced (library refresh, canvas refresh) — a direct listener
  // on either would go silently dead after the first swap.
  root.addEventListener('click', function (event) {
    // Move Up/Down (Task 6): the keyboard/touch-accessible equivalent of
    // dragging. Checked first and returns early so it never falls through
    // to the "select this story into the editor" branch further down,
    // which would otherwise also match (the button lives inside the same
    // `[data-news-id]` card).
    var moveBtn = event.target.closest('[data-news-move]');
    if (moveBtn && editor && editor.contains(moveBtn)) {
      if (moveBtn.disabled) return;
      var cardNode = moveBtn.closest('[data-news-id]');
      var direction = moveBtn.getAttribute('data-news-move');
      if (cardNode && cardNode.getAttribute('data-news-id') && (direction === 'up' || direction === 'down')) {
        moveCard(cardNode, direction);
      }
      return;
    }

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

    // All Posts table "Trash" row action. Selects the row's story so the
    // shared delete handler (which reads the hidden form's article_id, and
    // owns the confirm + refresh) acts on the right one.
    var trashBtn = event.target.closest('[data-news-library-trash]');
    if (trashBtn && libraryDrawer && libraryDrawer.contains(trashBtn)) {
      var trashRow = trashBtn.closest('[data-news-library-item]');
      var trashId = trashRow ? trashRow.getAttribute('data-news-library-id') : '';
      if (trashId && deleteBtn) {
        // Not tied to a canvas slot — an unassigned story has no article
        // element — so select by id alone and let the inspector do the rest.
        if (selectStory(trashId, trashRow.getAttribute('data-news-library-layout') || 'secondary', null)) {
          deleteBtn.click();
        }
      }
      return;
    }

    // "Edit Full Article Body" — appears in the inspector (no ancestor
    // story; targets whatever is already active) and on each slot's own
    // card (editor-only markup in kiosk/_news_slots.html). Selects that
    // story first if it wasn't already active, then opens the modal.
    var editBodyBtn = event.target.closest('[data-news-edit-body]');
    if (editBodyBtn && editor && (editor.contains(editBodyBtn) || composer.contains(editBodyBtn))) {
      var artNode = editBodyBtn.closest('[data-news-id]');
      if (artNode) {
        var id = artNode.getAttribute('data-news-id');
        var slotSection = artNode.closest('[data-news-slot]');
        var slotTypeForBtn = slotSection ? slotSection.getAttribute('data-news-slot') : activeSlotType;
        if (id && id !== activeId) {
          // If this selection fails (e.g. the card lookup can't find it),
          // do NOT fall through to opening the modal — it would open
          // seeded with whatever was PREVIOUSLY active and Save would POST
          // the new text to that other story's id, a wrong-row write
          // (fix round 1, I2).
          if (!selectStory(id, slotTypeForBtn, artNode)) return;
        }
      }
      openBodyModal(editBodyBtn);
      return;
    }

    // Selecting any slot's story loads it into the editing surface in
    // place — main, secondary, and widget alike (Task 5's deliverable 3;
    // previously only the lead slot was ever editable). Clicking inside the
    // ALREADY-active story's own fields is a no-op here (id matches), so
    // mid-edit typing/clicks never get clobbered by a reload of the same
    // data. Only stories with a real (published) id are click-selectable —
    // an unsaved new story stays on the surface until it's saved.
    var selectableArt = event.target.closest('.feature-story[data-news-id], .secondary-story[data-news-id], .info-card[data-news-id]');
    if (selectableArt && editor.contains(selectableArt)) {
      var storyId = selectableArt.getAttribute('data-news-id');
      if (storyId && storyId !== activeId) {
        var section = selectableArt.closest('[data-news-slot]');
        var storySlotType = section ? section.getAttribute('data-news-slot') : 'secondary';
        selectStory(storyId, storySlotType, selectableArt);
      }
    }
  });

  // A brand-new, not-yet-published story has no slot of its own to be
  // edited "in place" in yet, so it needs a scratch card to hold its inline
  // fields until it's saved. "+ Add a story" deliberately appends to the
  // secondary grid (never the lead) so it can no longer clobber whatever
  // the front page's actual lead story currently shows — that DOM-overwrite
  // was the confusing behavior Task 5 exists to remove. Mirrors the real
  // secondary-story markup in kiosk/_news_slots.html exactly (title +
  // excerpt + image), minus the server-rendered id.
  var SCRATCH_SECONDARY_HTML =
    '<article class="secondary-story is-scratch" data-news-id="">' +
      '<div class="secondary-story__thumb secondary-story__thumb--fallback" data-news-edit="image" aria-hidden="true"></div>' +
      '<div class="secondary-story__body">' +
        '<h3 class="secondary-story__title" data-news-edit="title"></h3>' +
        '<p class="secondary-story__copy secondary-story__copy--excerpt" data-news-edit="excerpt"></p>' +
      '</div>' +
    '</article>';

  // "+ Add main headline"'s scratch. Main owns MORE editable regions than
  // secondary (image caption/credit, dek, source, location, body) — mirrors
  // the real `article.feature-story` markup in kiosk/_news_slots.html lines
  // 39-95 so every one of those regions exists on the scratch too.
  // syncFormFromSurface() only writes a field into the hidden form when its
  // region is present on the active `<article>` (see its own comment,
  // "fix-round-1, C2") — a scratch missing caption/credit would silently
  // drop those columns the moment Publish ran, because the field would
  // never be read off the surface at all. No news-card-controls/position
  // badge/"Continue reading": those belong to cards that already have a
  // real id and a place in the persisted canvas order; a scratch has
  // neither yet.
  var SCRATCH_MAIN_HTML =
    '<article class="feature-story is-scratch" data-news-id="">' +
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
        '<p class="feature-story__excerpt" data-news-edit="excerpt"></p>' +
        '<div class="feature-story__meta">By <span data-news-edit="source"></span> &middot; <span data-news-edit="location"></span></div>' +
        '<div class="feature-story__copy drop-cap" data-news-edit="body"></div>' +
        '<button type="button" class="feature-story__edit-body-btn ghost-button" data-news-edit-body>Edit Full Article Body</button>' +
      '</div>' +
    '</article>';

  var SCRATCH_SHAPE = {
    main:      { list: function () { return editor.querySelector('[data-news-slot-list="main"]'); }, selector: '.feature-story[data-news-id=""]', html: SCRATCH_MAIN_HTML },
    secondary: { list: function () { return editor.querySelector('.secondary-grid'); }, selector: '.secondary-story[data-news-id=""]', html: SCRATCH_SECONDARY_HTML }
  };

  // Slot-aware: targets the lead's own list for 'main', the secondary grid
  // otherwise. Keeps the existing "is there already a scratch card?" guard
  // per list, so re-clicking either add button re-uses/re-selects the same
  // in-progress scratch rather than stacking a second one.
  function ensureNewStoryScratch(slotType) {
    var shape = SCRATCH_SHAPE[slotType] || SCRATCH_SHAPE.secondary;
    var grid = shape.list();
    if (!grid) return null;
    var existing = grid.querySelector(shape.selector);
    if (existing) return existing;
    grid.insertAdjacentHTML('afterbegin', shape.html);
    return grid.querySelector(shape.selector);
  }

  var addMainBtn = composer.querySelector('[data-news-add-main]');
  if (addMainBtn) {
    addMainBtn.addEventListener('click', function () {
      // Belt-and-braces alongside the `disabled` attribute syncPlaceholders()
      // maintains: a stale click event already queued before the last
      // disable takes effect must not still insert a second scratch.
      if (addMainBtn.disabled) return;
      var art = ensureNewStoryScratch('main');
      selectStory('', 'main', art);
      // Re-derive placeholders/the add-button's disabled state immediately —
      // this is the exact scenario the mainSlotOccupied() helper exists for:
      // without it, the just-inserted scratch wouldn't count as occupancy,
      // so the "+ Assign story to Main Headline" button would reappear
      // under the blank lead card and this button would stay clickable.
      syncPlaceholders();
      markDirty();
      if (art && art.scrollIntoView) art.scrollIntoView({ behavior: 'smooth', block: 'start' });
    });
  }

  var addBtn = composer.querySelector('[data-news-add-secondary]');
  if (addBtn) {
    addBtn.addEventListener('click', function () {
      var art = ensureNewStoryScratch('secondary');
      selectStory('', 'secondary', art);
      markDirty();
      if (art && art.scrollIntoView) art.scrollIntoView({ behavior: 'smooth', block: 'start' });
    });
  }

  props && Array.prototype.slice.call(props.querySelectorAll('[data-news-slot-choice]')).forEach(function (btn) {
    btn.addEventListener('click', function () { setSlot(btn.getAttribute('data-news-slot-choice')); markDirty(); });
  });
  if (propDate) propDate.addEventListener('input', function () { if (f.publishedAt) f.publishedAt.value = propDate.value; markDirty(); });

  // ── Canvas drag-and-drop + Move Up/Down + position badges (Task 6) ────
  // The canvas is modeled as several capacity-bounded Sortable "lists" that
  // share one drag group: the main list (cap 1), the secondary grid (cap 4,
  // reused as-is from before), and one list PER widget position (cap 1
  // each, so the 2-widget cap falls out of there being exactly two such
  // lists — see `_news_slots.html`'s `data-news-slot-list="widget"`
  // wrappers).
  //
  // Fix round 1, C1: membership/counting is now ALWAYS by the generic
  // `[data-news-id]` presence check, never by a bucket-specific class
  // (`.feature-story`/`.secondary-story`/`.info-card`). A card physically
  // moved into a different bucket container (by Sortable, or by our own
  // swap/relocate below) keeps its ORIGINAL class — it does not get
  // reclassed — so a `.secondary-story` selector run against the main
  // container would silently miss a card that just moved there. Counting
  // by `data-news-id` alone is correct regardless of which class the node
  // still carries. The bucket-specific selectors below (`CANVAS_LIST_
  // SELECTOR`) are kept ONLY for Sortable's own `draggable` option at
  // (re)init time, when the DOM is guaranteed freshly server-rendered and
  // therefore correctly classed.
  //
  // The VISUAL problem C1 also named — a moved card's inner markup
  // (figure/kicker/copy vs thumb+body vs title+copy) doesn't match its new
  // bucket's shape — is NOT something a class fix can solve: the fix is
  // the server re-render every successful mutation now triggers (see
  // `afterCanvasMutation`), which redraws the whole canvas with correct
  // per-bucket markup. The immediate optimistic badge/placeholder updates
  // below are a best-effort visual bridge until that refresh lands (or, if
  // a genuinely-dirty unrelated edit defers the refresh, the best
  // available approximation) — they are not the authoritative fix.
  //
  // Every persistence path below (drag end, Move Up/Down) reads the FINAL
  // post-move DOM and resends the whole canvas' membership/order through
  // one `news.layout` POST, numbered 1..N (fix round 1, C2 — see
  // `currentCanvasBatch`). That reconciles H6 (persistOrder used to start
  // numbering at 0, colliding with the 1-7 range live rows already
  // occupy): there is now exactly one numbering scheme for every write
  // path that owns the whole canvas.
  var CANVAS_LIST_SELECTOR = {
    // :not(.is-scratch) — same reason the secondary entry already excludes
    // it below: an unsaved "+ Add main headline" scratch (Task 2) has no
    // real id, so letting it register as a Sortable list item here would
    // let a dragged-in real card land ALONGSIDE it instead of being swapped
    // for it (`filter` below only blocks the scratch from STARTING a drag,
    // not from being counted as an existing item other drags land next to).
    main: '.feature-story:not(.is-scratch)',
    secondary: '.secondary-story:not(.is-scratch)',
    widget: '.info-card'
  };
  var canvasSortables = [];

  // Generic, class-independent membership check (fix round 1, C1): a real
  // card is any element with a non-empty `data-news-id`, regardless of
  // which bucket's class it still carries. Placeholders/empty-state divs
  // never have this attribute at all, so they're excluded automatically.
  function realCardNodes(container) {
    if (!container) return [];
    return Array.prototype.filter.call(
      container.querySelectorAll('[data-news-id]'),
      function (el) { return !!el.getAttribute('data-news-id'); }
    );
  }

  // The lead's occupancy, for placeholder rendering and the "+ Add main
  // headline" button ONLY — deliberately not folded into realCardNodes()
  // itself, whose "real card" meaning (empty data-news-id excluded) other
  // call sites (drag capacity via containerHasRoom/fixOverflow, position
  // badges via flatCanvasCards) still depend on. Without this separate
  // helper, `realCardNodes(lists.main).length === 0` stays true right after
  // "+ Add main headline" inserts its scratch (data-news-id=""), so
  // syncPlaceholders() would re-add the "+ Assign story to Main Headline"
  // button underneath the blank lead card, and the add button would stay
  // enabled for a second scratch.
  function mainSlotOccupied(container) {
    if (!container) return false;
    if (realCardNodes(container).length > 0) return true;
    return !!container.querySelector('.feature-story[data-news-id=""]');
  }

  function slotListContainers() {
    return {
      main: editor.querySelector('[data-news-slot-list="main"]'),
      secondary: editor.querySelector('[data-news-slot-list="secondary"]'),
      widget: Array.prototype.slice.call(editor.querySelectorAll('[data-news-slot-list="widget"]'))
    };
  }

  function allContainersInOrder() {
    var lists = slotListContainers();
    var out = [];
    if (lists.main) out.push(lists.main);
    if (lists.secondary) out.push(lists.secondary);
    lists.widget.forEach(function (w) { out.push(w); });
    return out;
  }

  function bucketTypeOfContainer(container) {
    return container ? container.getAttribute('data-news-slot-list') : null;
  }

  // Every widget CONTAINER is individually capacity 1 — the 2-widget total
  // is two such containers, not one container capped at 2 (H1: this keeps
  // a promoted-main's displacement, or any overflow, a same-shape swap
  // regardless of which bucket it lands in, so there's no separate
  // "re-insert into secondary" special case to get wrong).
  function containerCapacity(container) {
    var type = bucketTypeOfContainer(container);
    if (type === 'secondary') return 4;
    return 1; // main and each widget position
  }

  function containerHasRoom(container) {
    return realCardNodes(container).length < containerCapacity(container);
  }

  function bucketRank(container) {
    var containers = allContainersInOrder();
    var idx = containers.indexOf(container);
    return idx === -1 ? 999 : idx;
  }

  function flatCanvasCards() {
    var out = [];
    allContainersInOrder().forEach(function (c) {
      out = out.concat(realCardNodes(c));
    });
    return out;
  }

  // The main slot's empty-state markup is cloned from a `<template>` the
  // page itself renders (see `_news_slots.html`), instead of being
  // hardcoded here (fix round 1, minor 11) — so it can't drift from what
  // the server actually renders for an empty front page.
  var mainEmptyTemplate = root.querySelector('[data-news-main-empty-template]');

  // Fix round 1, I7: a polite live region announces the RESULT of a
  // Move Up/Down press — right now a non-sighted user gets no confirmation
  // a move happened beyond whatever their screen reader says about focus
  // moving, which doesn't convey the new position.
  var moveAnnouncer = root.querySelector('[data-news-move-announcer]');
  function announceCardPosition(cardNode) {
    if (!moveAnnouncer || !cardNode) return;
    var titleEl = cardNode.querySelector('[data-news-edit="title"]');
    var title = (titleEl && titleEl.textContent.trim()) || 'Story';
    var badge = cardNode.querySelector('[data-news-position-badge]');
    var posText = (badge && badge.textContent) || 'a new position';
    moveAnnouncer.textContent = title + ' moved to ' + posText + '.';
  }

  // Rebuilds every bucket's "+ Assign story…" placeholders (and the main
  // slot's plain empty-state div) from scratch after a mutation, rather
  // than incrementally patching them — the position numbering only has to
  // be right in one place this way. Markup matches _news_slots.html's
  // server-rendered placeholders exactly so `data-news-assign-slot` clicks
  // keep opening the drawer pre-scoped to the right slot. This is a
  // best-effort OPTIMISTIC bridge — the follow-up server refresh in
  // `afterCanvasMutation` is what's authoritative.
  function syncPlaceholders() {
    var lists = slotListContainers();
    if (lists.main) {
      var mainOccupiedNow = mainSlotOccupied(lists.main);
      var mainEmpty = lists.main.querySelector('.paper-empty');
      if (!mainOccupiedNow && !mainEmpty && mainEmptyTemplate && mainEmptyTemplate.content) {
        lists.main.appendChild(mainEmptyTemplate.content.cloneNode(true));
      } else if (mainOccupiedNow && mainEmpty) {
        mainEmpty.remove();
      }
      // "+ Add main headline" only ever makes sense while the lead is
      // genuinely open — a saved story OR an unsaved scratch both count
      // (mainSlotOccupied), otherwise a second click would insert a second
      // scratch card into a capacity-1 slot.
      if (addMainBtn) addMainBtn.disabled = mainOccupiedNow;
    }
    if (lists.secondary) {
      Array.prototype.slice.call(lists.secondary.querySelectorAll('.paper-empty')).forEach(function (el) { el.remove(); });
      var secReal = realCardNodes(lists.secondary);
      for (var p = secReal.length + 1; p <= 4; p++) {
        lists.secondary.insertAdjacentHTML(
          'beforeend',
          '<button type="button" class="paper-empty paper-empty--compact paper-empty--action" ' +
            'data-news-assign-slot data-news-slot-type="secondary" data-news-slot-position="' + p + '">' +
            '+ Assign story to Secondary slot ' + p + '</button>'
        );
      }
    }
    lists.widget.forEach(function (w) {
      var real = realCardNodes(w);
      var existingBtn = w.querySelector('.paper-empty--action');
      if (real.length === 0 && !existingBtn) {
        var pos = w.getAttribute('data-news-slot-position') || '1';
        w.insertAdjacentHTML(
          'beforeend',
          '<button type="button" class="paper-empty paper-empty--compact paper-empty--action" ' +
            'data-news-assign-slot data-news-slot-type="widget" data-news-slot-position="' + pos + '">' +
            '+ Assign story to Widget slot ' + pos + '</button>'
        );
      } else if (real.length > 0 && existingBtn) {
        existingBtn.remove();
      }
    });
  }

  function renumberPositionBadges() {
    var cards = flatCanvasCards();
    cards.forEach(function (card, i) {
      var badge = card.querySelector('[data-news-position-badge]');
      if (badge) badge.textContent = 'Position #' + (i + 1);
    });
    updateMoveButtonStates(cards);
  }

  function updateMoveButtonStates(cards) {
    var containers = allContainersInOrder();
    cards.forEach(function (card, i) {
      var upBtn = card.querySelector('[data-news-move="up"]');
      var downBtn = card.querySelector('[data-news-move="down"]');
      var srcRank = bucketRank(card.parentNode);
      if (upBtn) {
        var canUp = i > 0 || containers.some(function (c) { return bucketRank(c) < srcRank && containerHasRoom(c); });
        upBtn.disabled = !canUp;
      }
      if (downBtn) {
        var canDown = i < cards.length - 1 || containers.some(function (c) { return bucketRank(c) > srcRank && containerHasRoom(c); });
        downBtn.disabled = !canDown;
      }
    });
  }

  // Generic node swap via a stable marker anchor (fix round 1, I4). The
  // straightforward "capture nextSibling, insertBefore twice" approach the
  // two deleted fast-paths AND the plain two-step fallback both used is
  // provably a no-op when the two nodes are truly DOM-adjacent with no
  // intervening node (which server-rendered markup normally avoids via
  // whitespace text nodes between `<article>`s, but `fixOverflow`/
  // `relocate*` produce via `appendChild`, which inserts no such
  // whitespace) — `insertBefore(x, y)` is a no-op when x is already
  // immediately before y, and the second insertBefore's captured
  // `nextSibling` reference has gone stale by the time it runs. A marker
  // node sidesteps this entirely: it stays put as a fixed anchor while a
  // and b are individually relocated to each other's original slot, so
  // the swap is correct whether the two nodes are adjacent (with or
  // without an intervening whitespace node) or far apart, same parent or
  // different parents.
  function swapNodes(a, b) {
    if (!a || !b || a === b) return;
    var aParent = a.parentNode, bParent = b.parentNode;
    if (!aParent || !bParent) return;
    var marker = document.createComment('news-swap-marker');
    aParent.insertBefore(marker, a);
    bParent.insertBefore(a, b);
    marker.parentNode.insertBefore(b, marker);
    marker.parentNode.removeChild(marker);
  }

  // Relocating into open room (no swap partner) is always safe by
  // construction: it only fires when `containerHasRoom()` is already true,
  // so the destination bucket can never exceed its cap.
  function relocateToNextEmptySlot(cardNode) {
    var containers = allContainersInOrder();
    var srcRank = bucketRank(cardNode.parentNode);
    for (var i = 0; i < containers.length; i++) {
      if (bucketRank(containers[i]) > srcRank && containerHasRoom(containers[i])) {
        containers[i].appendChild(cardNode);
        return true;
      }
    }
    return false;
  }
  function relocateToPrevEmptySlot(cardNode) {
    var containers = allContainersInOrder();
    var srcRank = bucketRank(cardNode.parentNode);
    for (var i = containers.length - 1; i >= 0; i--) {
      if (bucketRank(containers[i]) < srcRank && containerHasRoom(containers[i])) {
        containers[i].appendChild(cardNode);
        return true;
      }
    }
    return false;
  }

  // Reads the FINAL (post-move, post-capacity-fixup) canvas DOM and builds
  // one news.layout batch covering every real card currently on the
  // canvas — main, secondary, and both widget positions — numbered 1..N in
  // render order (fix round 1, C2). `globalMaxPriority()+1` was right for
  // Task 4's single-story INSERT (it only had to stay above the existing
  // lowest-priority fallback main), but this path rewrites the WHOLE
  // canvas and always sends an explicit `layout_type` for every row it
  // touches — so Task 4's fallback-main concern doesn't apply here, and
  // numbering from 1 is what's required to outrank every off-canvas
  // assignable row (otherwise an off-canvas row sorts ahead of an
  // on-canvas one the next time the bucket is truncated, per C2's proof).
  function currentCanvasBatch() {
    var lists = slotListContainers();
    var items = [];
    var idx = 0;
    function push(type, els) {
      els.forEach(function (el) {
        var id = parseInt(el.getAttribute('data-news-id'), 10);
        if (!id) return;
        idx += 1;
        items.push({ id: id, layout_type: type, priority: idx });
      });
    }
    if (lists.main) push('main', realCardNodes(lists.main));
    if (lists.secondary) push('secondary', realCardNodes(lists.secondary));
    lists.widget.forEach(function (w) { push('widget', realCardNodes(w)); });
    return items;
  }

  // Fix round 1, minor 9: an in-flight guard against overlapping requests.
  // Two quick drags/moves can fire two POSTs whose responses land out of
  // order; only the response to the MOST RECENTLY issued request is
  // allowed to drive the follow-up refresh/toast — a stale one is silently
  // dropped (its write already happened or failed server-side either way;
  // this only guards which response gets to act on the UI).
  var canvasPersistSeq = 0;

  // `onSettled` (fix round 1, minor 8) fires once this operation's outcome
  // is fully resolved — after a successful refresh's reinitCanvas(), after
  // a dirty-gated skip, after a refresh failure, or immediately for a
  // failed/superseded POST — so a caller like Move Up/Down can restore
  // focus against whatever DOM is ACTUALLY current at that point, rather
  // than a node a same-tick refresh may already have replaced.
  function persistCanvasOrder(onSettled) {
    var items = currentCanvasBatch();
    if (!items.length) { if (onSettled) onSettled(); return; }
    canvasPersistSeq += 1;
    var mySeq = canvasPersistSeq;
    postLayout(items).then(function (json) {
      if (mySeq !== canvasPersistSeq) return; // superseded by a newer drag/move
      if (json && json.__sessionExpired) {
        toast('Your session has expired — reload the page and sign in again.', true);
        if (onSettled) onSettled();
        return;
      }
      if (json && json.ok) {
        // Fix round 1, C3: the drag/move already persisted — it is not an
        // unpublished edit, so this must NOT set the dirty badge (that was
        // the bug: a stale hidden-form layout_type/priority for the active
        // story would then get RE-WRITTEN, reverting the move, the next
        // time Publish ran). Re-syncing the library grid THEN the canvas —
        // same order handlePlaceStory already uses — lets
        // refreshCanvasFragment's own reinitCanvas()/seedActiveStory() do
        // the resync (it already re-reads the active story's slot/priority
        // from its, now-fresh, library card), rather than duplicating that
        // logic here. If an unrelated pending text edit is currently
        // marking the layout dirty, refreshCanvasFragment defers exactly
        // like it already does for unassign/delete — the write is safe
        // either way, only the visual catch-up waits.
        if (window.DashboardLive) window.DashboardLive.refresh('news');
        refreshCanvasFragment('Order updated', onSettled);
      } else {
        // The server rejected the batch — the client-side DOM the user is
        // looking at now shows an order that never actually saved. With
        // markDirty() no longer called on this path (fix round 1, C3), the
        // dirty gate isn't stuck, so re-rendering from the server snaps the
        // canvas back to what's actually true instead of leaving a
        // silently-wrong order on screen (fix round 1, "not required, your
        // call" — taken, since the fix that unstuck the gate makes this
        // essentially free).
        toast((json && json.errors && json.errors[0]) || 'Could not save the new order — reverting to the last saved layout.', true);
        if (window.DashboardLive) window.DashboardLive.refresh('news');
        refreshCanvasFragment('Reverted', onSettled);
      }
    }).catch(function () {
      if (mySeq !== canvasPersistSeq) { if (onSettled) onSettled(); return; }
      toast('Request failed — reverting to the last saved layout.', true);
      if (window.DashboardLive) window.DashboardLive.refresh('news');
      refreshCanvasFragment('Reverted', onSettled);
    });
  }

  // Runs after every canvas mutation (drag end or Move Up/Down): rebuild
  // placeholders and badges as an optimistic bridge, drop the stale
  // occupancy overlay (H4/H5 — the DOM is authoritative again immediately
  // after this), and persist — which on success triggers the library +
  // canvas server refresh that is the authoritative fix for both the
  // visual shape problem (C1) and the stale-form problem (C3). Deliberately
  // does NOT call markDirty() (fix round 1, C3/root fix): a drag/move
  // writes through news.layout immediately, so it is never an "unpublished
  // change" in the sense that badge represents.
  function afterCanvasMutation(onSettled) {
    syncPlaceholders();
    virtualSlots = null;
    renumberPositionBadges();
    persistCanvasOrder(onSettled);
  }

  // Sortable already performed the raw DOM move by the time onEnd fires,
  // which can leave the destination list one over capacity (e.g. dropping
  // onto an already-occupied main, or a full secondary/widget list).
  // Capacity is entirely the client's responsibility (the server writes
  // whatever it's sent) — this is that responsibility, for every drag.
  // - A capacity-1 destination (main, or a single widget position) always
  //   evicts the PRE-EXISTING occupant, not the just-dropped card: dropping
  //   a story onto an occupied slot means "replace it", not "bounce off
  //   it" — the evicted occupant swaps back into wherever the dropped card
  //   came from.
  // - A capacity-N destination (secondary) evicts whichever card now sits
  //   beyond the Nth position — ordinarily a previous occupant pushed out
  //   by the insertion, but if the dropped card itself lands past the cap
  //   (e.g. appended to an already-full list), it is the one evicted,
  //   which reads as a clean reject/bounce-back.
  // Fix round 1, C1: membership is read generically (realCardNodes no
  // longer takes a bucket-specific selector), so a card that already moved
  // into `toContainer` under its OLD class is still correctly counted.
  function fixOverflow(toContainer, fromContainer, draggedNode) {
    if (!toContainer) return;
    var cap = containerCapacity(toContainer);
    var members = realCardNodes(toContainer);
    if (members.length <= cap) return;
    var evicted;
    if (cap === 1) {
      evicted = members.filter(function (m) { return m !== draggedNode; })[0] || draggedNode;
    } else {
      evicted = members[cap] || draggedNode;
    }
    if (evicted && fromContainer && fromContainer !== toContainer) {
      fromContainer.appendChild(evicted);
    }
  }

  function handleCanvasSortEnd(evt) {
    // Same-position drop (no actual move) — nothing to fix up or persist.
    if (evt.from === evt.to && evt.oldIndex === evt.newIndex) return;
    fixOverflow(evt.to, evt.from, evt.item);
    afterCanvasMutation();
  }

  function destroyCanvasSortables() {
    canvasSortables.forEach(function (s) { try { s.destroy(); } catch (_) {} });
    canvasSortables = [];
  }

  function initCanvasSortable() {
    destroyCanvasSortables();
    allContainersInOrder().forEach(function (container) {
      var type = bucketTypeOfContainer(container);
      canvasSortables.push(Sortable.create(container, {
        group: 'news-canvas',
        animation: 150,
        // Valid at (re)init time only — the DOM here is always freshly
        // server-rendered (initial page load, or right after
        // reinitCanvas()'s refresh), so every card still carries its
        // correct bucket class. This selector is never used again to judge
        // membership after a move; see the realCardNodes() comment above.
        draggable: CANVAS_LIST_SELECTOR[type],
        // Scratch cards (unsaved "+ Add a story") and the Move Up/Down
        // buttons themselves must never start a drag — `preventOnFilter:
        // false` keeps their own click handlers (button clicks; scratch
        // card's own inline editing) working normally.
        filter: '.is-scratch, [data-news-move]',
        preventOnFilter: false,
        onEnd: handleCanvasSortEnd
      }));
    });
    renumberPositionBadges();
  }

  // Fix round 1, minor 8: refocus after a move. The node the click
  // originated on may be gone by the time this runs (a server refresh just
  // replaced editor.innerHTML), so this always re-finds the card by id in
  // whatever the CURRENT canvas DOM is, not the stale node reference.
  // Prefers the button for the SAME direction that was just pressed if
  // it's still enabled, falls back to the opposite direction (e.g. a card
  // that just moved to the very top loses its "up" button but keeps
  // "down"), and falls back further to a stable, always-present toolbar
  // target rather than losing focus to <body>.
  function restoreMoveFocus(id, direction) {
    var card = id ? editor.querySelector('[data-news-id="' + id + '"]') : null;
    var primary = card ? card.querySelector('[data-news-move="' + direction + '"]') : null;
    var otherDir = direction === 'up' ? 'down' : 'up';
    var other = card ? card.querySelector('[data-news-move="' + otherDir + '"]') : null;
    if (primary && !primary.disabled) { primary.focus(); return; }
    if (other && !other.disabled) { other.focus(); return; }
    if (libraryOpenBtn) libraryOpenBtn.focus();
  }

  // Move Up/Down: an adjacent swap in the flat render-order sequence
  // (main, then secondary in DOM order, then each widget position). A
  // swap can never change any bucket's cardinality, so it can never
  // violate capacity — this is deliberately NOT built on the same
  // insert-then-evict path drag-and-drop uses; it doesn't need to be,
  // and the simpler, provably-safe swap is what a keyboard user should
  // expect a single "move" press to do. Falls back to relocating into
  // open room at either canvas boundary (e.g. promoting the first
  // secondary story into an empty main, or moving the last card down into
  // an open widget slot) when there's no adjacent card to swap with.
  function moveCard(cardNode, direction) {
    var cards = flatCanvasCards();
    var idx = cards.indexOf(cardNode);
    if (idx === -1) return;
    var moved = false;
    if (direction === 'up') {
      if (idx === 0) { moved = relocateToPrevEmptySlot(cardNode); }
      else { swapNodes(cardNode, cards[idx - 1]); moved = true; }
    } else {
      if (idx === cards.length - 1) { moved = relocateToNextEmptySlot(cardNode); }
      else { swapNodes(cardNode, cards[idx + 1]); moved = true; }
    }
    if (!moved) return;
    var movedId = cardNode.getAttribute('data-news-id');
    // Immediate feedback against the current (pre-refresh) DOM, PLUS the
    // same restoration again once the async persist/refresh actually
    // settles (fix round 1, minor 8) — the refresh may replace this exact
    // node in the meantime, and the second call re-finds it by id in
    // whatever DOM is current at that point.
    restoreMoveFocus(movedId, direction);
    announceCardPosition(cardNode);
    afterCanvasMutation(function () { restoreMoveFocus(movedId, direction); });
  }

  initCanvasSortable();

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
    if (!mainSlotSection) return '';
    var art = mainSlotSection.querySelector('.feature-story[data-news-id]');
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
    // priority: 1, not 0 — the lead's own assign button now carries
    // data-news-slot-position="1" (Task 1), and removeFilledPlaceholder()
    // no longer bails on main, so this has to match that button's position
    // for the generic toolbar-open path to clean it up immediately too.
    if (counts.main < 1) return { type: 'main', priority: 1 };
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
    }).then(readJsonEnvelope);
  }

  // The canvas placeholder for the slot just filled holds no user data, so
  // it's safe to reconcile immediately and unconditionally — unlike the full
  // canvas fragment swap below, this doesn't need to wait on the dirty-edit
  // gate (fix round 1, I2).
  //
  // Used to bail on target.type === 'main' because main had no placeholder
  // to remove at all — the lead's empty state was a plain, buttonless div.
  // Now that it's "+ Assign story to Main Headline" (same shape as
  // secondary/widget), that early return would leave the button lingering
  // on screen under the story that just landed until the next full canvas
  // refresh, so it's gone.
  function removeFilledPlaceholder(target) {
    if (!target || !editor) return;
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
          if (json && json.__sessionExpired) {
            toast('Your session has expired — reload the page and sign in again.', true);
            return;
          }
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
  // `onDone` (fix round 1, minor 8) fires after the refresh actually
  // settles — success, the dirty-gate skip, or a fetch failure alike — so a
  // caller that needs to act on the FINAL post-refresh DOM (e.g. Move
  // Up/Down restoring focus) doesn't have to guess whether an innerHTML
  // swap happened first.
  function refreshCanvasFragment(actionLabel, onDone) {
    var label = actionLabel || 'Placed';
    if (layoutDirty) {
      toast(label + '. The canvas view is behind because of unpublished edits — publish them to bring it up to date.', false);
      if (onDone) onDone();
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
          if (onDone) onDone();
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
        if (onDone) onDone();
      })
      .catch(function () {
        toast(label + ', but the canvas could not be refreshed — reload to see it there.', true);
        if (onDone) onDone();
      });
  }

  // Picks what to load as the active story after the canvas DOM is
  // (re)built: keep editing the same story if it's still visible somewhere
  // in the refreshed canvas (it may have moved slot), otherwise fall back to
  // the lead story, otherwise a blank "New story" state. Called from both
  // init() and reinitCanvas() so the two seed identically — a canvas swap
  // that skips seeding leaves `f.articleId` pointing at a stale story while
  // the visible surface reflects a new one, so Publish would overwrite the
  // wrong row (this was a Critical defect in Task 4's fix round 1, C2).
  // Resets to an explicit, consistent "nothing active" state. Used whenever
  // there's genuinely no story to seed (empty front page) AND as the
  // fallback when a selectStory() call in seedActiveStory() fails — without
  // this, a failed selection left `activeArt` pointing at a node that
  // `editor.innerHTML = ...` had just detached from the document, while the
  // *visible* (new) canvas was never wired at all: syncFromSurface() would
  // read a DOM the user can't see, and the visible surface wouldn't be
  // editable (fix round 1, I3).
  function clearActiveStory() {
    activeArt = null;
    activeId = '';
    activeSlotType = 'main';
    if (f.articleId) f.articleId.value = '';
    if (f.title) f.title.value = '';
    if (f.description) f.description.value = '';
    if (f.source) f.source.value = '';
    if (f.location) f.location.value = '';
    if (f.dek) f.dek.value = '';
    if (f.excerpt) f.excerpt.value = '';
    if (f.caption) f.caption.value = '';
    if (f.credit) f.credit.value = '';
    setSlot('main');
    if (activeLabel) activeLabel.textContent = 'New story';
  }

  function seedActiveStory() {
    var stillThere = activeId ? editor.querySelector('[data-news-id="' + activeId + '"]') : null;
    if (stillThere) {
      var section = stillThere.closest('[data-news-slot]');
      if (selectStory(activeId, section ? section.getAttribute('data-news-slot') : activeSlotType, stillThere)) return;
      clearActiveStory();
      return;
    }
    var leadArt = mainSlotSection ? mainSlotSection.querySelector('.feature-story[data-news-id]') : null;
    if (leadArt) {
      if (selectStory(leadArt.getAttribute('data-news-id'), 'main', leadArt)) return;
      clearActiveStory();
      return;
    }
    clearActiveStory();
  }

  function reinitCanvas() {
    mainSlotSection = editor.querySelector('[data-news-slot="main"]');
    initCanvasSortable();
    seedActiveStory();
    // "+ Add main headline" lives in `.news-editor__add`, a sibling of
    // `editor` — a server refresh's `editor.innerHTML = json.html` swap
    // never touches it, so its `disabled` state would otherwise go stale
    // the moment a drag, Move Up/Down, or unassign changes whether the
    // lead is occupied. syncPlaceholders() is the one place that derives
    // that occupancy (mainSlotOccupied), so re-run it here too.
    syncPlaceholders();
  }

  // ── Init: edit the real rendered front page ────────────
  (function init() {
    mainSlotSection = editor.querySelector('[data-news-slot="main"]');
    seedActiveStory();
    // Sets the initial disabled state of "+ Add main headline" to match
    // whatever the server actually rendered for the lead — see the same
    // call in reinitCanvas() above for why this can't be left to the
    // server-rendered markup alone.
    syncPlaceholders();
  })();
})();
