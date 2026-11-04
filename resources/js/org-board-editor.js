/**
 * Org board editor.
 *
 * Draws each organization's chart exactly as the kiosk does -- the same
 * OrgChart.kioskMetrics() layout, laid out against the kiosk's own frame width
 * with pins ignored -- and scales it down to fit the panel. Nothing on it can be
 * dragged. Click a card to edit that member (name, position, photo, who they
 * report to, and their order among the people beside them); the "+" on a card
 * adds someone reporting to that person. Dropping an image file on a card sets
 * that member's portrait. Every action posts JSON and re-renders in place --
 * nothing here reloads the page.
 *
 * This replaced a free-placement canvas. The kiosk stopped honouring the
 * canvas's saved positions in 2026-09 (they produced a landscape chart shrunk
 * to ~8px names on the portrait panel) but the canvas kept inviting editors to
 * drag cards, so an arrangement was carefully built here and never appeared on
 * the kiosk. Showing the kiosk's own layout is what makes that impossible: the
 * only inputs left are the ones the kiosk actually reads, parent_id and
 * sort_order.
 */
(function () {
  'use strict';

  var root = document.querySelector('[data-org-board-editor]');
  if (!root || !window.OrgChart) {
    return;
  }

  // The dialogs and the section's action buttons sit outside the editor root —
  // they are siblings of it inside the section — so anything that reaches them
  // is scoped to the section, not to root.
  var section = root.closest('.gears-page') || document;

  var canvas = root.querySelector('[data-ob-canvas]');
  var stage = root.querySelector('[data-ob-stage]');
  var edges = root.querySelector('[data-ob-edges]');
  var cardLayer = root.querySelector('[data-ob-cards]');
  var emptyState = root.querySelector('[data-ob-empty]');
  var organizationSelect = root.querySelector('[data-ob-organization]');

  var memberModal = section.querySelector('[data-ob-member-modal]');
  var memberForm = section.querySelector('[data-ob-member-form]');
  var memberModalTitle = section.querySelector('[data-ob-member-modal-title]');
  var memberSubmit = section.querySelector('[data-ob-member-submit]');
  var memberDelete = section.querySelector('[data-ob-member-delete]');
  var addMemberButton = section.querySelector('[data-ob-member-modal-open]');
  var preview = section.querySelector('[data-ob-member-preview]');
  var photoHint = section.querySelector('[data-ob-member-photo-hint]');
  var orderField = section.querySelector('[data-ob-order]');
  var orderReadout = section.querySelector('[data-ob-order-readout]');
  var orderHint = section.querySelector('[data-ob-order-hint]');
  var orgsModal = section.querySelector('[data-ob-orgs-modal]');

  function bindAll(selector, handler) {
    var elements = section.querySelectorAll(selector);
    Array.prototype.forEach.call(elements, function (element) {
      element.addEventListener('click', function (event) {
        handler(event, element);
      });
    });
  }

  // Wired before the canvas guard below: managing organizations has to work on
  // a board that has none yet, which is exactly when there is no canvas.
  //
  // The cancel/backdrop/focus-return trio that used to be spelled out here is
  // now GearsModal.wire (modal-behavior.js) -- this dialog was the only one on
  // the dashboard that got all three right, so it became the shared version.
  function wireOrganizationsDialog() {
    if (!window.GearsModal.wire(orgsModal)) {
      return;
    }

    bindAll('[data-ob-orgs-modal-open]', function (event, trigger) {
      window.GearsModal.open(orgsModal, trigger);
    });

    bindAll('[data-ob-orgs-modal-close]', function () {
      window.GearsModal.close(orgsModal);
    });
  }

  wireOrganizationsDialog();

  if (!canvas || !stage || !edges || !cardLayer || !organizationSelect) {
    // With no organizations at all the template renders no canvas, so there is
    // nothing for this editor to drive. The managed list still refreshes live —
    // but the canvas markup itself only exists on a render that has at least
    // one organization, so reload once the first one lands.
    document.addEventListener('live:refreshed', function (event) {
      var detail = event.detail || {};
      if (detail.section === 'org-board-organizations') {
        window.location.reload();
      }
    });
    return;
  }

  var urls = {
    data: root.getAttribute('data-ob-data-url') || '/org-board/dashboard/data',
    store: root.getAttribute('data-ob-store-url') || '/org-board/dashboard',
    update: root.getAttribute('data-ob-update-url') || '/org-board/dashboard/update',
    reorder: root.getAttribute('data-ob-reorder-url') || '/org-board/dashboard/reorder',
    photo: root.getAttribute('data-ob-photo-url') || '/org-board/dashboard/photo',
    destroy: root.getAttribute('data-ob-delete-url') || '/org-board/dashboard/delete'
  };

  var tokenMeta = document.querySelector('meta[name="csrf-token"]');
  var token = tokenMeta ? tokenMeta.getAttribute('content') : '';

  // Laid out against the kiosk's frame, not this panel: a comb row hangs only
  // when it would not fit, so laying out to the panel's (wider) width would
  // draw rows here that the kiosk folds into stacks.
  var FRAME_WIDTH = window.OrgChart.KIOSK_FRAME.width;
  var PAD = window.OrgChart.KIOSK_CHART.pad;
  var ADD_OVERHANG = 16;

  var state = {
    organizationId: organizationSelect.value || '',
    roots: [],
    placed: [],
    lookup: {},
    box: null,
    selectedId: null,
    reordering: false
  };

  // ===== helpers =====

  function toast(message, isError) {
    if (!window.UploadMeter || !window.UploadMeter.makeToast) {
      return null;
    }
    var t = window.UploadMeter.makeToast({ filename: message, total: 0, label: 'org board' });
    if (isError) {
      t.error(message);
    } else {
      t.complete(message);
    }
    return t;
  }

  function post(url, fields, files) {
    var formData = new FormData();
    formData.append('__token', token);

    Object.keys(fields || {}).forEach(function (key) {
      var value = fields[key];
      if (value === undefined || value === null) {
        return;
      }
      formData.append(key, String(value));
    });

    Object.keys(files || {}).forEach(function (key) {
      if (files[key]) {
        formData.append(key, files[key]);
      }
    });

    return fetch(url, {
      method: 'POST',
      headers: {
        'X-CSRF-TOKEN': token,
        'X-Requested-With': 'XMLHttpRequest',
        Accept: 'application/json'
      },
      body: formData,
      credentials: 'same-origin'
    }).then(readJson);
  }

  function readJson(response) {
    return response.json().catch(function () {
      return null;
    }).then(function (payload) {
      if (!response.ok || !payload || !payload.ok) {
        var errors = (payload && payload.errors) || ['Something went wrong. Please try again.'];
        throw new Error(Array.isArray(errors) ? errors.join(' ') : String(errors));
      }
      return payload;
    });
  }

  function indexNodes(roots) {
    var lookup = {};
    window.OrgChart.flatten(roots).forEach(function (node) {
      lookup[String(node.id)] = node;
    });
    return lookup;
  }

  function initials(name) {
    return (name || '?').trim().charAt(0).toUpperCase() || '?';
  }

  // ===== rendering =====

  function render() {
    state.lookup = indexNodes(state.roots);

    // Cards are a fixed width but a content height -- a two-line position wraps
    // and grows the card -- so, exactly as on the kiosk, build them hidden,
    // measure, then lay out.
    var built = buildCards();
    var metrics = window.OrgChart.kioskMetrics(FRAME_WIDTH, function (node) {
      return built.sizes[String(node.id)] || null;
    });

    state.placed = window.OrgChart.layout(state.roots, metrics);

    if (emptyState) {
      emptyState.hidden = state.placed.length > 0;
    }

    if (!state.placed.length) {
      state.box = null;
      stage.style.width = '0px';
      stage.style.height = '0px';
      edges.innerHTML = '';
      canvas.style.height = '';
    } else {
      // Translated by bounds() for a tight fit, the same as the kiosk does.
      var box = window.OrgChart.bounds(state.placed, metrics, PAD);
      state.box = box;

      stage.style.width = box.width + 'px';
      stage.style.height = box.height + 'px';

      edges.setAttribute('viewBox', box.minX + ' ' + box.minY + ' ' + box.width + ' ' + box.height);
      edges.setAttribute('width', box.width);
      edges.setAttribute('height', box.height);
      edges.innerHTML = window.OrgChart.connectors(state.placed, metrics).map(function (path) {
        return '<path class="ob-edge" d="' + path.d + '" />';
      }).join('');

      state.placed.forEach(function (item) {
        var card = built.elements[String(item.id)];
        if (!card) {
          return;
        }
        card.style.left = (item.x - box.minX) + 'px';
        card.style.top = (item.y - box.minY) + 'px';
        card.style.visibility = '';
      });

      fitToWidth();
    }

    // If the member being edited is no longer on this chart — deleted, or moved
    // by another editor — the dialog is stale, so close it. Deliberately does
    // NOT re-fill an open dialog: render() runs on every payload, and
    // overwriting the fields would discard whatever the editor was typing.
    if (state.selectedId && !state.lookup[String(state.selectedId)]) {
      closeMemberModal();
    }
  }

  /**
   * Append every card unpositioned and hidden, then read all sizes in one pass
   * so the browser reflows once rather than once per card.
   */
  function buildCards() {
    cardLayer.innerHTML = '';

    var order = window.OrgChart.flatten(state.roots);
    var elements = {};
    var sizes = {};

    order.forEach(function (node) {
      var card = buildCard(node);
      card.style.visibility = 'hidden';
      cardLayer.appendChild(card);
      elements[String(node.id)] = card;
    });

    order.forEach(function (node) {
      var card = elements[String(node.id)];
      var width = card.offsetWidth;
      var height = card.offsetHeight;
      sizes[String(node.id)] = width > 0 && height > 0
        ? { width: width, height: height }
        : null;
    });

    return { elements: elements, sizes: sizes };
  }

  /**
   * One member card, built like org-board.js's buildNode() so it measures the
   * same: an avatar slot that shows initials when there is no photo (the kiosk
   * always reserves it, so dropping it here would make every card a different
   * height from the one a visitor sees), then name and position.
   */
  function buildCard(node) {
    var card = document.createElement('article');
    card.className = 'ob-card-node';
    card.setAttribute('data-ob-node', '');
    card.setAttribute('data-member-id', String(node.id));
    card.setAttribute('tabindex', '0');
    card.setAttribute('role', 'button');
    card.setAttribute('aria-label', 'Edit ' + node.name);

    if (String(node.id) === String(state.selectedId)) {
      card.classList.add('is-selected');
    }

    var avatar = document.createElement('div');
    avatar.className = 'ob-card-node__avatar';
    if (node.photo_path) {
      var img = document.createElement('img');
      img.src = '/storage/' + node.photo_path;
      img.alt = node.name;
      img.loading = 'lazy';
      avatar.appendChild(img);
    } else {
      var span = document.createElement('span');
      span.className = 'ob-card-node__initials';
      span.setAttribute('aria-hidden', 'true');
      span.textContent = initials(node.name);
      avatar.appendChild(span);
    }

    var body = document.createElement('div');
    body.className = 'ob-card-node__body';

    var nameEl = document.createElement('div');
    nameEl.className = 'ob-card-node__name';
    nameEl.textContent = node.name;

    var positionEl = document.createElement('div');
    positionEl.className = 'ob-card-node__position';
    positionEl.textContent = node.position || 'Member';

    body.appendChild(nameEl);
    body.appendChild(positionEl);

    // Absolutely positioned on the card's bottom edge, so it adds nothing to the
    // measured box and the layout stays the kiosk's.
    var add = document.createElement('button');
    add.type = 'button';
    add.className = 'ob-card-node__add';
    add.setAttribute('data-ob-add-report', '');
    add.setAttribute('aria-label', 'Add someone who reports to ' + node.name);
    add.setAttribute('title', 'Add someone who reports to ' + node.name);
    add.textContent = '+';

    card.appendChild(avatar);
    card.appendChild(body);
    card.appendChild(add);
    return card;
  }

  /**
   * Scale the kiosk-sized chart down to the panel's width, never up.
   *
   * Width only: the panel grows to the chart's height rather than shrinking it
   * further, so a 40-person organization reads as a tall chart the editor
   * scrolls past -- the same shape a visitor swipes through on the kiosk.
   */
  function fitToWidth() {
    var box = state.box;
    if (!box) {
      return;
    }
    var available = canvas.clientWidth || box.width;
    var scale = Math.min(1, available / Math.max(box.width, 1));
    var offsetX = Math.max(0, (available - box.width * scale) / 2);

    stage.style.transform = 'translate(' + offsetX + 'px, 0px) scale(' + scale + ')';
    // ADD_OVERHANG: the "+" hangs 14px below each card, which on the bottom row
    // is past bounds()' 8px pad; without the slack the canvas clips it.
    canvas.style.height = Math.ceil(box.height * scale + ADD_OVERHANG) + 'px';
  }

  // ===== loading =====

  function loadOrganization(organizationId) {
    if (!organizationId) {
      state.roots = [];
      render();
      return Promise.resolve();
    }

    root.classList.add('is-loading');

    return fetch(urls.data + '?organization_id=' + encodeURIComponent(organizationId), {
      headers: { 'X-Requested-With': 'XMLHttpRequest', Accept: 'application/json' },
      credentials: 'same-origin'
    })
      .then(readJson)
      .then(function (payload) {
        state.organizationId = String(organizationId);
        applyPayload(payload);
      })
      .catch(function (error) {
        toast(error.message || 'Could not load this organization.', true);
      })
      .finally(function () {
        root.classList.remove('is-loading');
      });
  }

  function applyPayload(payload) {
    state.roots = (payload && payload.members) || [];
    render();
  }

  // ===== photo drops =====

  function hasFiles(event) {
    var types = (event.dataTransfer && event.dataTransfer.types) || [];
    return Array.prototype.indexOf.call(types, 'Files') !== -1;
  }

  function clearDropTargets() {
    Array.prototype.forEach.call(
      cardLayer.querySelectorAll('.is-drop-target'),
      function (node) { node.classList.remove('is-drop-target'); }
    );
  }

  canvas.addEventListener('dragover', function (event) {
    if (!hasFiles(event)) {
      return;
    }

    event.preventDefault();
    event.dataTransfer.dropEffect = 'copy';
    clearDropTargets();

    var card = event.target.closest('[data-ob-node]');
    if (card) {
      card.classList.add('is-drop-target');
    }
  });

  canvas.addEventListener('dragleave', function (event) {
    if (event.target === canvas) {
      clearDropTargets();
    }
  });

  canvas.addEventListener('drop', function (event) {
    if (!hasFiles(event)) {
      return;
    }

    event.preventDefault();
    clearDropTargets();

    var card = event.target.closest('[data-ob-node]');
    if (card) {
      uploadPhoto(card.getAttribute('data-member-id'), event.dataTransfer.files[0]);
    }
  });

  function uploadPhoto(memberId, file) {
    if (!file) {
      return;
    }

    if (!/^image\//.test(file.type || '')) {
      toast('Please drop an image file (JPG, PNG, GIF, or WEBP).', true);
      return;
    }

    var progress = window.UploadMeter && window.UploadMeter.makeToast
      ? window.UploadMeter.makeToast({ filename: file.name, total: file.size, label: 'member photo' })
      : null;

    post(urls.photo, { member_id: memberId }, { photo_path: file })
      .then(function (payload) {
        if (progress) {
          progress.complete('Photo updated.');
        }
        var node = state.lookup[String(memberId)];
        if (node) {
          node.photo_path = payload.photo_path || node.photo_path;
        }
        render();
      })
      .catch(function (error) {
        if (progress) {
          progress.error(error.message || 'Could not save the photo.');
        } else {
          toast(error.message || 'Could not save the photo.', true);
        }
      });
  }

  // ===== opening the member editor =====

  cardLayer.addEventListener('click', function (event) {
    var add = event.target.closest('[data-ob-add-report]');
    var card = event.target.closest('[data-ob-node]');
    if (!card) {
      return;
    }
    if (add) {
      openMemberModal(null, add, { parentId: card.getAttribute('data-member-id') });
      return;
    }
    openMemberModal(card.getAttribute('data-member-id'), card);
  });

  cardLayer.addEventListener('keydown', function (event) {
    if (event.key !== 'Enter' && event.key !== ' ') {
      return;
    }
    // The "+" is a real <button>; its own Enter/Space already becomes a click.
    if (event.target.closest('[data-ob-add-report]')) {
      return;
    }
    var card = event.target.closest('[data-ob-node]');
    if (!card) {
      return;
    }
    event.preventDefault();
    openMemberModal(card.getAttribute('data-member-id'), card);
  });

  function panelField(name) {
    return memberForm ? memberForm.querySelector('[data-ob-field="' + name + '"]') : null;
  }

  // ===== member dialog =====
  //
  // This replaced an inline <aside> that lived in a third grid column. One form
  // serves create and edit: the hidden member_id decides which, and the action
  // is pointed at store or update to match. upload-meter.js owns the submit
  // (it reads `action` at submit time), which is what keeps the portrait's
  // progress meter working, and it fires `upload:success` for both paths.

  function openMemberModal(memberId, trigger, options) {
    if (!window.GearsModal.supported(memberModal)) {
      return;
    }

    var node = memberId ? state.lookup[String(memberId)] : null;
    var editing = !!node;

    state.selectedId = editing ? node.id : null;

    if (memberModalTitle) {
      memberModalTitle.textContent = editing ? 'Edit member' : 'Add member';
    }
    if (memberSubmit) {
      memberSubmit.textContent = editing ? 'Save changes' : 'Save member';
    }
    if (memberDelete) {
      memberDelete.hidden = !editing;
    }
    if (memberForm) {
      memberForm.setAttribute('action', editing ? urls.update : urls.store);
    }

    setValue('member_id', editing ? node.id : '');
    setValue('name', editing ? node.name : '');
    setValue('position', editing ? node.position : '');
    setValue('organization_id', editing ? node.organization_id : organizationSelect.value);

    var photoInput = panelField('photo_path');
    if (photoInput) {
      photoInput.value = '';
    }
    if (window.UploadMeter && window.UploadMeter.wireDropzones) {
      // Clears the dropzone's "filled" state left over from a previous open.
      window.UploadMeter.wireDropzones(memberModal);
    }

    fillSupervisorOptions(node, options && options.parentId);
    fillPreview(node);
    updateOrderControls();

    if (photoHint) {
      photoHint.textContent = editing
        ? 'Uploading a new portrait replaces the current one.'
        : 'Optional — you can add a portrait later.';
    }

    window.GearsModal.open(memberModal, trigger);
    render();

    var nameField = panelField('name');
    if (nameField) {
      nameField.focus();
    }
  }

  function closeMemberModal() {
    state.selectedId = null;
    if (memberModal && memberModal.open) {
      // GearsModal's `close` listener handles focus return; the onClose hook
      // below re-renders.
      window.GearsModal.close(memberModal);
    } else {
      render();
    }
  }

  function fillSupervisorOptions(node, presetParentId) {
    var supervisor = panelField('parent_id');
    if (!supervisor) {
      return;
    }

    // Editing: everything except the member's own subtree, so a card can never
    // be made to report to itself. Creating: anyone on this chart.
    var blocked = node ? window.OrgChart.subtreeIds(state.roots, node.id) : {};
    supervisor.innerHTML = '<option value="">No supervisor (top of the chart)</option>';
    window.OrgChart.flatten(state.roots).forEach(function (candidate) {
      if (blocked[String(candidate.id)]) {
        return;
      }
      var option = document.createElement('option');
      option.value = String(candidate.id);
      option.textContent = candidate.name + (candidate.position ? ' · ' + candidate.position : '');
      supervisor.appendChild(option);
    });

    if (node) {
      supervisor.value = node.parent_id ? String(node.parent_id) : '';
    } else {
      supervisor.value = presetParentId ? String(presetParentId) : '';
    }
  }

  function fillPreview(node) {
    if (!preview) {
      return;
    }

    preview.innerHTML = '';
    if (node && node.photo_path) {
      var img = document.createElement('img');
      img.src = '/storage/' + node.photo_path;
      img.alt = node.name;
      preview.appendChild(img);
    } else {
      var span = document.createElement('span');
      span.className = 'ob-card-node__initials';
      span.textContent = node ? initials(node.name) : '—';
      preview.appendChild(span);
    }
  }

  function setValue(name, value) {
    var field = panelField(name);
    if (field) {
      field.value = value === null || value === undefined ? '' : String(value);
    }
  }

  // ===== order among siblings =====
  //
  // Unlike the rest of the dialog this applies immediately: the chart behind
  // the dialog redraws, which is how the editor sees what "earlier" did. It
  // moves the member within their *saved* supervisor's group, so it is held
  // off while the "Reports to" field says something else -- otherwise "Move
  // earlier" would reorder a group the member is about to leave.

  /** The saved group a member is ordered within, as the tree serialized it. */
  function siblingsOf(node) {
    var parent = node.parent_id ? state.lookup[String(node.parent_id)] : null;
    return parent ? (parent.children || []) : state.roots;
  }

  function updateOrderControls() {
    if (!orderField) {
      return;
    }

    var node = state.selectedId ? state.lookup[String(state.selectedId)] : null;
    orderField.hidden = !node;
    if (!node) {
      return;
    }

    var siblings = siblingsOf(node);
    var index = -1;
    siblings.forEach(function (sibling, position) {
      if (String(sibling.id) === String(node.id)) {
        index = position;
      }
    });

    var supervisor = panelField('parent_id');
    var savedParent = node.parent_id ? String(node.parent_id) : '';
    var pendingParent = supervisor && supervisor.value !== savedParent;

    if (orderReadout) {
      orderReadout.textContent = index === -1
        ? ''
        : (index + 1) + ' of ' + siblings.length;
    }
    if (orderHint) {
      orderHint.textContent = pendingParent
        ? 'Save the new supervisor first, then set the order.'
        : siblings.length < 2
          ? 'Nobody else reports to the same person.'
          : 'Applies right away.';
    }

    Array.prototype.forEach.call(
      orderField.querySelectorAll('[data-ob-order-move]'),
      function (button) {
        var later = button.getAttribute('data-ob-order-move') === 'later';
        var atEdge = later ? index >= siblings.length - 1 : index <= 0;
        button.disabled = state.reordering || pendingParent || index === -1 || atEdge;
      }
    );
  }

  bindAll('[data-ob-order-move]', function (event, button) {
    var node = state.selectedId ? state.lookup[String(state.selectedId)] : null;
    if (!node || state.reordering) {
      return;
    }

    state.reordering = true;
    updateOrderControls();

    post(urls.reorder, {
      member_id: node.id,
      direction: button.getAttribute('data-ob-order-move')
    })
      .then(function (payload) {
        applyPayload(payload);
      })
      .catch(function (error) {
        toast(error.message || 'Could not change the order.', true);
      })
      .finally(function () {
        state.reordering = false;
        updateOrderControls();
      });
  });

  (function wireSupervisorChange() {
    var supervisor = panelField('parent_id');
    if (supervisor) {
      supervisor.addEventListener('change', updateOrderControls);
    }
  })();

  // fallbackFocus matters here specifically: a member card is re-rendered on
  // every change, so the card that opened the dialog is usually detached by the
  // time it closes, and without somewhere to send focus it would land on <body>.
  window.GearsModal.wire(memberModal, {
    fallbackFocus: addMemberButton,
    onClose: function () {
      state.selectedId = null;
      render();
    }
  });

  bindAll('[data-ob-member-modal-close]', closeMemberModal);
  bindAll('[data-ob-member-modal-open]', function (event, trigger) {
    openMemberModal(null, trigger);
  });

  if (memberForm) {
    memberForm.addEventListener('upload:success', function (event) {
      var payload = event.detail || {};
      var wasEditing = !!state.selectedId;

      closeMemberModal();
      toast(wasEditing ? 'Member updated.' : 'Member added.');

      if (payload.organization_id
        && String(payload.organization_id) !== String(state.organizationId)) {
        // The member landed on another chart — follow them there.
        organizationSelect.value = String(payload.organization_id);
        loadOrganization(payload.organization_id);
        return;
      }

      applyPayload(payload);
    });
  }

  bindAll('[data-ob-member-delete]', function () {
    var node = state.lookup[String(state.selectedId)];
    if (!node) {
      return;
    }

    var subordinates = (node.children || []).length;
    var body = subordinates
      ? 'Removing ' + node.name + ' also moves their ' + subordinates +
        (subordinates === 1 ? ' direct report' : ' direct reports') +
        ' up to report to ' + node.name + '’s own supervisor. Nobody is deleted with them.'
      : 'Removing ' + node.name + ' from this organization cannot be undone.';

    var ask = window.ConfirmModal && window.ConfirmModal.ask
      ? window.ConfirmModal.ask({
          title: 'Remove ' + node.name + '?',
          body: body,
          confirmLabel: 'Remove member',
          cancelLabel: 'Keep member',
          danger: true
        })
      : Promise.resolve(window.confirm(body));

    ask.then(function (ok) {
      if (!ok) {
        return;
      }

      post(urls.destroy, { member_id: node.id })
        .then(function (payload) {
          closeMemberModal();
          applyPayload(payload);
          toast('Member removed.');
        })
        .catch(function (error) {
          toast(error.message || 'Could not remove the member.', true);
        });
    });
  });

  // ===== organization switching =====

  organizationSelect.addEventListener('change', function () {
    closeMemberModal();
    loadOrganization(organizationSelect.value);
    syncUrl(organizationSelect.value);
  });

  function syncUrl(organizationId) {
    try {
      var url = new URL(window.location.href);
      url.searchParams.set('page', 'org-board');
      if (organizationId) {
        url.searchParams.set('organization', String(organizationId));
      }
      window.history.replaceState({}, '', url.toString());
    } catch (error) {
      // Ignore browsers that cannot construct the URL helper here.
    }
  }

  // ===== keeping the organization dropdowns current =====
  //
  // Adding or deleting an organization refreshes the managed list through the
  // normal dashboard-live fragment, which re-emits the grouped options as JSON.
  // Rebuilding the three selects from that means an editor can add an
  // organization and immediately assign a member to it, with no page reload.
  // Each select keeps its own current value if that row still exists.
  function syncOrganizationSelects(scope) {
    var source = scope.querySelector('[data-ob-organization-groups]');
    if (!source) return;

    var groups;
    try {
      groups = JSON.parse(source.textContent || '[]');
    } catch (error) {
      return;
    }

    var selects = document.querySelectorAll('[data-ob-organization-select]');
    Array.prototype.forEach.call(selects, function (select) {
      var previous = select.value;
      // Only the add-member select carries a "choose one" placeholder; keep it.
      var placeholder = select.querySelector('option[value=""]');
      select.innerHTML = '';
      if (placeholder) {
        select.appendChild(placeholder);
      }

      groups.forEach(function (group) {
        if (!group.rows || !group.rows.length) return;
        var optgroup = document.createElement('optgroup');
        optgroup.label = group.label + 's';
        group.rows.forEach(function (row) {
          var option = document.createElement('option');
          option.value = String(row.id);
          option.textContent = row.name;
          optgroup.appendChild(option);
        });
        select.appendChild(optgroup);
      });

      if (previous && select.querySelector('option[value="' + previous + '"]')) {
        select.value = previous;
      }
    });

    // Nothing to add a member to until at least one organization exists.
    if (addMemberButton) {
      addMemberButton.disabled = !organizationSelect.querySelector('option[value]:not([value=""])');
    }

    // The chart may have been showing an organization that just got deleted.
    if (state.organizationId && !organizationSelect.querySelector(
      'option[value="' + state.organizationId + '"]'
    )) {
      loadOrganization(organizationSelect.value);
    }
  }

  document.addEventListener('live:refreshed', function (event) {
    var detail = event.detail || {};
    if (detail.section !== 'org-board-organizations') return;
    syncOrganizationSelects(event.target || document);
  });

  var orgBoardTab = document.querySelector('[data-page-link="org-board"]');
  if (orgBoardTab) {
    orgBoardTab.addEventListener('click', function () {
      window.requestAnimationFrame(function () {
        syncUrl(state.organizationId);
        // The panel has no width while its tab is hidden, and cards measure 0
        // there too -- so lay the chart out again now that it can be measured.
        render();
      });
    });
  }

  // ===== boot =====

  var initialOrganization = organizationSelect.value;
  try {
    var requested = new URL(window.location.href).searchParams.get('organization');
    if (requested && organizationSelect.querySelector('option[value="' + requested + '"]')) {
      organizationSelect.value = requested;
      initialOrganization = requested;
    }
  } catch (error) {
    // Fall back to whatever the select already had.
  }

  loadOrganization(initialOrganization);

  window.addEventListener('resize', fitToWidth);
})();
