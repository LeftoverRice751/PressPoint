/*
 * GEARS dashboard News panel: the WYSIWYG photo-post editor and its library.
 *
 * The editor IS kiosk/_post_card.html in editor mode, so the card typed into is
 * the card the kiosk shows. This file wires the text regions, source lines,
 * expiry dialog, library rows and saving; the photo and logo live in
 * post-editor-photo.mjs. Every rule that can be pure is in a tested module
 * (post-crop / post-sources / post-editor-fields).
 *
 * Saves are one multipart POST to news.store (NewsController.store), which
 * re-validates everything; nothing here is the security boundary.
 */

import { serialize, defaults } from './post-sources.mjs';
import { expiryLabel, campusInputNow, usableExpiry } from './post-editor-fields.mjs';
import { createPhotoController, createLogoController, storagePhotoUrl } from './post-editor-photo.mjs';
import { wireTextFields } from './post-editor-text.mjs';
import { createSourcesEditor } from './post-editor-sources.mjs';

(function () {
  'use strict';

  var root = document.querySelector('[data-post-workspace]');
  if (!root) return;

  var panel = root.closest('[data-page-panel]') || document;
  var card = root.querySelector('.post-card[data-post-editor]');
  var stage = root.querySelector('[data-post-stage]');
  var library = root.querySelector('[data-live-section="post-library"]');
  var storeUrl = root.getAttribute('data-store-url');
  var siteLogo = root.getAttribute('data-site-logo') || '';
  var emptyCard = parseJson(root.getAttribute('data-empty-card')) || {};

  var tokenMeta = document.querySelector('meta[name="csrf-token"]');
  var token = tokenMeta ? tokenMeta.getAttribute('content') : '';

  var ui = {
    rejected: root.querySelector('[data-post-rejected]'),
    rejectedReason: root.querySelector('[data-post-rejected-reason]'),
    liveNotice: root.querySelector('[data-post-live-notice]'),
    expiryOpen: root.querySelector('[data-post-expiry-open]'),
    expiryLabel: root.querySelector('[data-post-expiry-label]'),
    errors: root.querySelector('[data-post-errors]'),
    saveState: root.querySelector('[data-post-save-state]'),
    saveDraft: root.querySelector('[data-post-save-draft]'),
    submit: root.querySelector('[data-post-submit]'),
    dialog: panel.querySelector('[data-post-expiry-modal]'),
  };

  var STATE_TEXT = {
    new: 'New post',
    draft: 'Draft',
    review: 'Waiting for approval',
    live: 'Live on the kiosk',
    expired: 'Expired',
    rejected: 'Returned for changes',
  };

  // `listed`: the open post has been seen in the library. Only then does its
  // absence after a refresh mean it was deleted -- a just-saved new post can be
  // missing from a refresh that was already in flight.
  var state = { id: '', status: 'new', expires: '', dirty: false, saving: false, listed: false };

  function parseJson(raw) {
    try { return JSON.parse(raw || 'null'); } catch (e) { return null; }
  }

  function notify(message, isError) {
    if (window.GearsDashboard && window.GearsDashboard.notify) {
      window.GearsDashboard.notify(message, { error: Boolean(isError) });
    }
  }

  function markDirty() {
    state.dirty = true;
    ui.saveState.textContent = 'Unsaved changes';
  }

  // ── Errors ──────────────────────────────────────────────────────────
  function showErrors(messages) {
    ui.errors.innerHTML = '';
    (messages || []).forEach(function (message) {
      var li = document.createElement('li');
      li.textContent = message;
      ui.errors.appendChild(li);
    });
    ui.errors.hidden = !(messages && messages.length);
  }

  var photo = createPhotoController({
    stage: stage,
    input: root.querySelector('[data-post-photo-input]'),
    pickButton: root.querySelector('[data-post-photo-pick]'),
    zoomInput: root.querySelector('[data-post-zoom]'),
    hint: root.querySelector('[data-post-photo-hint]'),
    onChange: markDirty,
    onError: function (message) { showErrors([message]); },
  });

  var logo = createLogoController({
    card: card,
    input: root.querySelector('[data-post-logo-input]'),
    pickButton: root.querySelector('[data-post-logo-pick]'),
    resetButton: root.querySelector('[data-post-logo-reset]'),
    siteLogo: siteLogo,
    onChange: markDirty,
    onError: function (message) { showErrors([message]); },
  });

  var text = wireTextFields({ card: card, counters: root, onInput: markDirty });

  var sources = createSourcesEditor({
    panel: panel,
    card: card,
    container: root.querySelector('[data-post-sources]'),
    addButton: root.querySelector('[data-post-source-add]'),
    onChange: markDirty,
  });

  // ── Expiry dialog ───────────────────────────────────────────────────
  var expiryInput = ui.dialog.querySelector('[data-post-expiry-input]');
  var expiryError = ui.dialog.querySelector('[data-post-expiry-error]');

  function renderExpiry() {
    ui.expiryLabel.textContent = expiryLabel(state.expires);
  }

  if (window.GearsModal) window.GearsModal.wire(ui.dialog);

  ui.expiryOpen.addEventListener('click', function () {
    var now = campusInputNow();
    expiryInput.min = now;
    expiryInput.value = state.expires || '';
    expiryError.hidden = true;
    if (window.GearsModal) window.GearsModal.open(ui.dialog, ui.expiryOpen);
  });

  ui.dialog.querySelector('[data-post-expiry-save]').addEventListener('click', function () {
    var value = expiryInput.value;
    // Same refusal as Posts.parse_local_expiry, before the round trip.
    if (value && value <= campusInputNow()) {
      expiryError.textContent = 'Pick an expiry in the future';
      expiryError.hidden = false;
      return;
    }
    state.expires = value;
    renderExpiry();
    markDirty();
    window.GearsModal.close(ui.dialog);
  });

  ui.dialog.querySelector('[data-post-expiry-clear]').addEventListener('click', function () {
    state.expires = '';
    renderExpiry();
    markDirty();
    window.GearsModal.close(ui.dialog);
  });

  ui.dialog.querySelector('[data-post-expiry-cancel]').addEventListener('click', function () {
    window.GearsModal.close(ui.dialog);
  });

  // ── Loading a post into the editor ──────────────────────────────────
  function markActiveRow() {
    library.querySelectorAll('[data-post-library-row]').forEach(function (row) {
      row.classList.toggle('is-active', String(row.getAttribute('data-post-id')) === String(state.id));
    });
  }

  function load(row) {
    state.id = row.id ? String(row.id) : '';
    state.listed = Boolean(state.id);
    state.status = row.state || 'new';
    ['kicker', 'headline', 'body'].forEach(function (name) {
      text.set(name, row[name]);
    });
    photo.load(storagePhotoUrl(row.image_large), row.crop);
    logo.load(row.logo_url, row.custom_logo);
    sources.set(row.source_lines);
    state.expires = usableExpiry(row.expires_input || '', campusInputNow());
    renderExpiry();

    var reason = row.state === 'rejected' ? (row.rejection_reason || '') : '';
    ui.rejectedReason.textContent = reason;
    ui.rejected.hidden = !reason;
    ui.liveNotice.hidden = row.state !== 'live';
    showErrors([]);
    state.dirty = false;
    ui.saveState.textContent = STATE_TEXT[state.status] || 'Draft';
    markActiveRow();
  }

  function loadEmpty() {
    load(Object.assign({}, emptyCard, {
      id: '',
      state: 'new',
      crop: null,
      custom_logo: false,
      expires_input: '',
      rejection_reason: '',
      source_lines: emptyCard.source_lines || defaults(),
    }));
  }

  /** Resolves true when it is fine to replace what is in the editor. */
  function mayDiscard() {
    if (!state.dirty) return Promise.resolve(true);
    var opts = {
      title: 'Discard unsaved changes?',
      body: 'The post in the editor has changes that are not saved.',
      confirmLabel: 'Discard changes',
      cancelLabel: 'Keep editing',
      danger: true,
    };
    if (window.ConfirmModal) return window.ConfirmModal.ask(opts);
    return Promise.resolve(window.confirm(opts.body));
  }

  function rowData(id) {
    var row = library.querySelector('[data-post-library-row][data-post-id="' + id + '"]');
    return row ? parseJson(row.getAttribute('data-post-row')) : null;
  }

  root.querySelector('[data-post-new]').addEventListener('click', function () {
    mayDiscard().then(function (ok) { if (ok) loadEmpty(); });
  });

  library.addEventListener('click', function (event) {
    var loadButton = event.target.closest('[data-post-load]');
    if (loadButton) {
      var data = parseJson(loadButton.closest('[data-post-library-row]').getAttribute('data-post-row'));
      if (data) mayDiscard().then(function (ok) { if (ok) load(data); });
      return;
    }
    var duplicate = event.target.closest('[data-post-duplicate]');
    if (duplicate) duplicatePost(duplicate);
  });

  // After any library refresh (a save, a duplicate, a delete, another tab):
  // keep the open post highlighted, and if it was deleted, stop editing a row
  // that no longer exists -- a save would 404.
  library.addEventListener('live:refreshed', function () {
    if (state.id && rowData(state.id)) {
      state.listed = true;
    } else if (state.id && state.listed) {
      state.dirty = false;
      loadEmpty();
      return;
    }
    markActiveRow();
  });

  // ── Requests ────────────────────────────────────────────────────────
  function post(url, body) {
    return fetch(url, {
      method: 'POST',
      headers: {
        'X-CSRF-TOKEN': token,
        'X-Requested-With': 'XMLHttpRequest',
        Accept: 'application/json',
      },
      body: body,
      credentials: 'same-origin',
    }).then(function (response) {
      return response.json().catch(function () { return null; }).then(function (payload) {
        if (!payload) {
          // nginx answers an over-size body with an HTML 413, not our JSON.
          payload = {
            ok: false,
            errors: [response.status === 413 ? 'Photo is too large (max 8 MB)' : 'Could not reach the server. Please try again.'],
          };
        }
        return payload;
      });
    }, function () {
      return { ok: false, errors: ['Could not reach the server. Please try again.'] };
    });
  }

  function refreshLibrary() {
    return window.DashboardLive ? window.DashboardLive.refresh('post-library') : Promise.resolve(false);
  }

  function setSaving(saving) {
    state.saving = saving;
    ui.saveDraft.disabled = saving;
    ui.submit.disabled = saving;
    if (saving) ui.saveState.textContent = 'Saving…';
  }

  function save(status) {
    if (state.saving) return;
    setSaving(true);
    showErrors([]);

    var form = new FormData();
    form.append('__token', token);
    if (state.id) form.append('id', state.id);
    form.append('kicker', text.read('kicker'));
    form.append('headline', text.read('headline'));
    form.append('body', text.read('body'));
    form.append('image_crop', JSON.stringify(photo.crop()));
    form.append('source_lines', serialize(sources.rows()));
    form.append('expires_at', state.expires || '');
    form.append('status', status);
    if (photo.file()) form.append('image', photo.file());
    if (logo.file()) form.append('logo', logo.file());
    if (logo.removeLogo()) form.append('remove_logo', '1');

    post(storeUrl, form).then(function (payload) {
      setSaving(false);
      if (!payload.ok) {
        showErrors(payload.errors || ['Could not save the post.']);
        ui.saveState.textContent = 'Not saved';
        return;
      }
      var savedCard = payload.card || {};
      state.id = String(payload.id || state.id);
      state.status = payload.status === 'review' ? 'review' : 'draft';
      photo.saved(storagePhotoUrl(savedCard.image_large));
      logo.saved(savedCard.logo_url);
      // The server took a live post off the kiosk (it is draft or review now),
      // and a resubmission cleared the rejection.
      ui.liveNotice.hidden = true;
      if (state.status === 'review') ui.rejected.hidden = true;
      state.dirty = false;
      ui.saveState.textContent = STATE_TEXT[state.status];
      notify(state.status === 'review' ? 'Submitted for review.' : 'Draft saved.');
      refreshLibrary();
    });
  }

  ui.saveDraft.addEventListener('click', function () { save('draft'); });
  ui.submit.addEventListener('click', function () { save('review'); });

  function duplicatePost(button) {
    mayDiscard().then(function (ok) {
      if (!ok) return;
      var form = new FormData();
      form.append('__token', token);
      button.disabled = true;
      post(button.getAttribute('data-post-duplicate'), form).then(function (payload) {
        button.disabled = false;
        if (!payload.ok) {
          notify((payload.errors || ['Could not duplicate the post.']).join(' '), true);
          return;
        }
        notify('Duplicated as a new draft.');
        var id = String(payload.id);
        // Open the copy from its refreshed library row when there is one. state.id is not
        // pointed at the copy first: if the refresh failed, a save would write
        // whatever the editor holds over the copy.
        refreshLibrary().then(function () {
          // refresh() resolves false without fetching while a poll is in flight,
          // so the row may not be there yet; the response's card carries the same
          // editor fields (NewsController.duplicate), and the next poll lists it.
          var data = rowData(id) || Object.assign({}, payload.card || {}, { id: id, state: 'draft' });
          load(data);
        });
      });
    });
  }

  loadEmpty();
})();
