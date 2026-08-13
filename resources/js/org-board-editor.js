/**
 * Org board editor.
 *
 * One canvas per department. Cards are laid out by the shared OrgChart module
 * (resources/js/org-chart-layout.js) so the kiosk renders the identical
 * arrangement. Dropping a card on another card reparents it; dropping it on
 * empty canvas pins it where it landed. Dropping an image file on a card sets
 * that member's portrait. Every action posts JSON and re-renders in place —
 * nothing here reloads the page.
 */
(function () {
  'use strict';

  var root = document.querySelector('[data-org-board-editor]');
  if (!root || !window.OrgChart) {
    return;
  }

  var canvas = root.querySelector('[data-ob-canvas]');
  var stage = root.querySelector('[data-ob-stage]');
  var edges = root.querySelector('[data-ob-edges]');
  var cardLayer = root.querySelector('[data-ob-cards]');
  var emptyState = root.querySelector('[data-ob-empty]');
  var departmentSelect = root.querySelector('[data-ob-department]');
  var panel = root.querySelector('[data-ob-panel]');

  if (!canvas || !stage || !edges || !cardLayer || !departmentSelect) {
    return;
  }

  var urls = {
    data: root.getAttribute('data-ob-data-url') || '/org-board/dashboard/data',
    move: root.getAttribute('data-ob-move-url') || '/org-board/dashboard/move',
    update: root.getAttribute('data-ob-update-url') || '/org-board/dashboard/update',
    photo: root.getAttribute('data-ob-photo-url') || '/org-board/dashboard/photo',
    destroy: root.getAttribute('data-ob-delete-url') || '/org-board/dashboard/delete',
    reset: root.getAttribute('data-ob-reset-url') || '/org-board/dashboard/reset-layout'
  };

  var tokenMeta = document.querySelector('meta[name="csrf-token"]');
  var token = tokenMeta ? tokenMeta.getAttribute('content') : '';

  var METRICS = window.OrgChart.DEFAULTS;

  var state = {
    departmentId: departmentSelect.value || '',
    roots: [],
    placed: [],
    lookup: {},
    selectedId: null,
    scale: 1,
    offsetX: 0,
    offsetY: 0,
    dragId: null,
    dragPointerOffset: { x: 0, y: 0 },
    loading: false
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
    state.placed = window.OrgChart.layout(state.roots, METRICS);

    var box = window.OrgChart.bounds(state.placed, METRICS);
    stage.style.width = box.width + 'px';
    stage.style.height = box.height + 'px';

    renderEdges(box);
    renderCards(box);

    if (emptyState) {
      emptyState.hidden = state.placed.length > 0;
    }

    if (state.selectedId && !state.lookup[String(state.selectedId)]) {
      closePanel();
    } else if (state.selectedId) {
      syncPanel();
    }

    applyTransform();
  }

  function renderEdges(box) {
    var paths = window.OrgChart.connectors(state.placed, METRICS);
    edges.setAttribute('viewBox', box.minX + ' ' + box.minY + ' ' + box.width + ' ' + box.height);
    edges.setAttribute('width', box.width);
    edges.setAttribute('height', box.height);
    edges.innerHTML = paths.map(function (path) {
      return '<path class="ob-edge" d="' + path.d + '" />';
    }).join('');
  }

  function renderCards(box) {
    cardLayer.innerHTML = '';

    state.placed.forEach(function (item) {
      var node = item.node;
      var card = document.createElement('article');
      card.className = 'ob-card-node';
      card.setAttribute('data-ob-node', '');
      card.setAttribute('data-member-id', String(node.id));
      card.setAttribute('draggable', 'true');
      card.setAttribute('tabindex', '0');
      card.style.left = (item.x - box.minX) + 'px';
      card.style.top = (item.y - box.minY) + 'px';
      card.style.width = METRICS.cardWidth + 'px';
      card.style.height = METRICS.cardHeight + 'px';

      if (String(node.id) === String(state.selectedId)) {
        card.classList.add('is-selected');
      }
      if (window.OrgChart.isPinned(node)) {
        card.classList.add('is-pinned');
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
      positionEl.textContent = node.position || 'No position';

      body.appendChild(nameEl);
      body.appendChild(positionEl);
      card.appendChild(avatar);
      card.appendChild(body);
      cardLayer.appendChild(card);
    });
  }

  function applyTransform() {
    stage.style.transform = 'translate(' + state.offsetX + 'px, ' + state.offsetY + 'px) scale(' + state.scale + ')';
  }

  function fitToView() {
    var box = window.OrgChart.bounds(state.placed, METRICS);
    var viewWidth = canvas.clientWidth || 1;
    var viewHeight = canvas.clientHeight || 1;

    var scale = Math.min(viewWidth / box.width, viewHeight / box.height, 1);
    state.scale = Math.max(scale, 0.25);
    state.offsetX = (viewWidth - box.width * state.scale) / 2;
    state.offsetY = (viewHeight - box.height * state.scale) / 2;
    applyTransform();
  }

  /** Pointer position in unscaled stage coordinates (what we persist). */
  function toStagePoint(event) {
    var box = window.OrgChart.bounds(state.placed, METRICS);
    var rect = canvas.getBoundingClientRect();
    return {
      x: (event.clientX - rect.left - state.offsetX) / state.scale + box.minX,
      y: (event.clientY - rect.top - state.offsetY) / state.scale + box.minY
    };
  }

  // ===== loading =====

  function loadDepartment(departmentId, options) {
    if (!departmentId) {
      state.roots = [];
      render();
      return Promise.resolve();
    }

    state.loading = true;
    root.classList.add('is-loading');

    return fetch(urls.data + '?department_id=' + encodeURIComponent(departmentId), {
      headers: { 'X-Requested-With': 'XMLHttpRequest', Accept: 'application/json' },
      credentials: 'same-origin'
    })
      .then(readJson)
      .then(function (payload) {
        state.departmentId = String(departmentId);
        applyPayload(payload, options);
      })
      .catch(function (error) {
        toast(error.message || 'Could not load this department.', true);
      })
      .finally(function () {
        state.loading = false;
        root.classList.remove('is-loading');
      });
  }

  function applyPayload(payload, options) {
    state.roots = (payload && payload.members) || [];
    render();
    if (options && options.fit) {
      fitToView();
    }
  }

  // ===== card dragging =====

  cardLayer.addEventListener('dragstart', function (event) {
    var card = event.target.closest('[data-ob-node]');
    if (!card) {
      return;
    }

    state.dragId = card.getAttribute('data-member-id');
    var rect = card.getBoundingClientRect();
    state.dragPointerOffset = {
      x: (event.clientX - rect.left) / state.scale,
      y: (event.clientY - rect.top) / state.scale
    };

    card.classList.add('is-dragging');
    event.dataTransfer.effectAllowed = 'move';
    try {
      event.dataTransfer.setData('text/plain', state.dragId);
    } catch (error) {
      // Some browsers reject setData outside a user gesture; the drag still works.
    }
  });

  cardLayer.addEventListener('dragend', function (event) {
    var card = event.target.closest('[data-ob-node]');
    if (card) {
      card.classList.remove('is-dragging');
    }
    state.dragId = null;
    clearDropTargets();
  });

  function clearDropTargets() {
    Array.prototype.forEach.call(
      cardLayer.querySelectorAll('.is-drop-target, .is-drop-blocked'),
      function (node) {
        node.classList.remove('is-drop-target');
        node.classList.remove('is-drop-blocked');
      }
    );
    canvas.classList.remove('is-drop-canvas');
  }

  /** A member may not be dropped onto itself or anything beneath it. */
  function isBlockedTarget(memberId, targetId) {
    if (!memberId) {
      return true;
    }
    var blocked = window.OrgChart.subtreeIds(state.roots, memberId);
    return Boolean(blocked[String(targetId)]);
  }

  function hasFiles(event) {
    var types = (event.dataTransfer && event.dataTransfer.types) || [];
    return Array.prototype.indexOf.call(types, 'Files') !== -1;
  }

  canvas.addEventListener('dragover', function (event) {
    var card = event.target.closest('[data-ob-node]');

    if (hasFiles(event)) {
      event.preventDefault();
      event.dataTransfer.dropEffect = 'copy';
      clearDropTargets();
      if (card) {
        card.classList.add('is-drop-target');
      }
      return;
    }

    if (!state.dragId) {
      return;
    }

    event.preventDefault();
    event.dataTransfer.dropEffect = 'move';
    clearDropTargets();

    if (card) {
      var targetId = card.getAttribute('data-member-id');
      card.classList.add(isBlockedTarget(state.dragId, targetId) ? 'is-drop-blocked' : 'is-drop-target');
    } else {
      canvas.classList.add('is-drop-canvas');
    }
  });

  canvas.addEventListener('dragleave', function (event) {
    if (event.target === canvas) {
      clearDropTargets();
    }
  });

  canvas.addEventListener('drop', function (event) {
    var card = event.target.closest('[data-ob-node]');

    if (hasFiles(event)) {
      event.preventDefault();
      clearDropTargets();
      if (card) {
        uploadPhoto(card.getAttribute('data-member-id'), event.dataTransfer.files[0]);
      }
      return;
    }

    if (!state.dragId) {
      return;
    }

    event.preventDefault();
    var memberId = state.dragId;
    state.dragId = null;
    clearDropTargets();

    if (card) {
      var targetId = card.getAttribute('data-member-id');
      if (String(targetId) === String(memberId)) {
        return;
      }
      if (isBlockedTarget(memberId, targetId)) {
        toast('A member cannot report to one of its own subordinates.', true);
        return;
      }
      reparent(memberId, targetId);
      return;
    }

    var point = toStagePoint(event);
    pin(memberId, Math.round(point.x - state.dragPointerOffset.x), Math.round(point.y - state.dragPointerOffset.y));
  });

  function reparent(memberId, parentId) {
    post(urls.move, { member_id: memberId, parent_id: parentId })
      .then(function (payload) {
        applyPayload(payload);
      })
      .catch(function (error) {
        toast(error.message || 'Could not move the member.', true);
      });
  }

  function pin(memberId, x, y) {
    // Paint the new position immediately so the drag feels direct, then confirm.
    var node = state.lookup[String(memberId)];
    if (node) {
      node.pos_x = x;
      node.pos_y = y;
      render();
    }

    post(urls.move, { member_id: memberId, pos_x: x, pos_y: y })
      .then(function (payload) {
        applyPayload(payload);
      })
      .catch(function (error) {
        toast(error.message || 'Could not move the member.', true);
        loadDepartment(state.departmentId);
      });
  }

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

  // ===== canvas pan & zoom =====

  var panning = false;
  var panStart = { x: 0, y: 0, offsetX: 0, offsetY: 0 };

  canvas.addEventListener('mousedown', function (event) {
    if (event.target.closest('[data-ob-node]')) {
      return;
    }

    panning = true;
    panStart = {
      x: event.clientX,
      y: event.clientY,
      offsetX: state.offsetX,
      offsetY: state.offsetY
    };
    canvas.classList.add('is-panning');
  });

  window.addEventListener('mousemove', function (event) {
    if (!panning) {
      return;
    }
    state.offsetX = panStart.offsetX + (event.clientX - panStart.x);
    state.offsetY = panStart.offsetY + (event.clientY - panStart.y);
    applyTransform();
  });

  window.addEventListener('mouseup', function () {
    if (!panning) {
      return;
    }
    panning = false;
    canvas.classList.remove('is-panning');
  });

  canvas.addEventListener('wheel', function (event) {
    if (!event.ctrlKey && !event.metaKey && Math.abs(event.deltaY) < 2) {
      return;
    }
    event.preventDefault();
    zoomBy(event.deltaY < 0 ? 1.1 : 0.9);
  }, { passive: false });

  function zoomBy(factor) {
    var next = Math.min(Math.max(state.scale * factor, 0.3), 2.5);
    state.scale = next;
    applyTransform();
  }

  bindClick('[data-ob-zoom-in]', function () { zoomBy(1.15); });
  bindClick('[data-ob-zoom-out]', function () { zoomBy(0.87); });
  bindClick('[data-ob-fit]', fitToView);

  bindClick('[data-ob-reset-layout]', function () {
    if (!state.departmentId) {
      return;
    }

    var ask = window.ConfirmModal && window.ConfirmModal.ask
      ? window.ConfirmModal.ask({
          title: 'Reset this layout?',
          body: 'Every card you positioned by hand in this department goes back to the automatic arrangement. Names, photos, and reporting lines are not affected.',
          confirmLabel: 'Reset layout',
          cancelLabel: 'Keep my layout'
        })
      : Promise.resolve(window.confirm('Reset this department to the automatic layout?'));

    ask.then(function (ok) {
      if (!ok) {
        return;
      }
      post(urls.reset, { department_id: state.departmentId })
        .then(function (payload) {
          applyPayload(payload, { fit: true });
          toast('Layout reset.');
        })
        .catch(function (error) {
          toast(error.message || 'Could not reset the layout.', true);
        });
    });
  });

  function bindClick(selector, handler) {
    var element = root.querySelector(selector);
    if (element) {
      element.addEventListener('click', handler);
    }
  }

  // ===== edit panel =====

  cardLayer.addEventListener('click', function (event) {
    var card = event.target.closest('[data-ob-node]');
    if (!card) {
      return;
    }
    openPanel(card.getAttribute('data-member-id'));
  });

  cardLayer.addEventListener('keydown', function (event) {
    if (event.key !== 'Enter' && event.key !== ' ') {
      return;
    }
    var card = event.target.closest('[data-ob-node]');
    if (!card) {
      return;
    }
    event.preventDefault();
    openPanel(card.getAttribute('data-member-id'));
  });

  function panelField(name) {
    return panel ? panel.querySelector('[data-ob-field="' + name + '"]') : null;
  }

  function openPanel(memberId) {
    if (!panel) {
      return;
    }
    state.selectedId = memberId;
    panel.hidden = false;
    root.classList.add('has-panel');
    syncPanel();
    render();

    var nameField = panelField('name');
    if (nameField) {
      nameField.focus();
    }
  }

  function closePanel() {
    state.selectedId = null;
    if (panel) {
      panel.hidden = true;
    }
    root.classList.remove('has-panel');
    render();
  }

  function syncPanel() {
    var node = state.lookup[String(state.selectedId)];
    if (!panel || !node) {
      return;
    }

    setValue('name', node.name);
    setValue('position', node.position);
    setValue('department_id', node.department_id);

    var supervisor = panelField('parent_id');
    if (supervisor) {
      var blocked = window.OrgChart.subtreeIds(state.roots, node.id);
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
      supervisor.value = node.parent_id ? String(node.parent_id) : '';
    }

    var preview = panel.querySelector('[data-ob-panel-preview]');
    if (preview) {
      preview.innerHTML = '';
      if (node.photo_path) {
        var img = document.createElement('img');
        img.src = '/storage/' + node.photo_path;
        img.alt = node.name;
        preview.appendChild(img);
      } else {
        var span = document.createElement('span');
        span.className = 'ob-card-node__initials';
        span.textContent = initials(node.name);
        preview.appendChild(span);
      }
    }

    var pinNote = panel.querySelector('[data-ob-pin-note]');
    if (pinNote) {
      pinNote.hidden = !window.OrgChart.isPinned(node);
    }
  }

  function setValue(name, value) {
    var field = panelField(name);
    if (field) {
      field.value = value === null || value === undefined ? '' : String(value);
    }
  }

  bindClick('[data-ob-panel-close]', closePanel);

  var panelForm = panel ? panel.querySelector('[data-ob-panel-form]') : null;
  if (panelForm) {
    panelForm.addEventListener('submit', function (event) {
      event.preventDefault();

      var node = state.lookup[String(state.selectedId)];
      if (!node) {
        return;
      }

      var photoInput = panelField('photo_path');
      var file = photoInput && photoInput.files ? photoInput.files[0] : null;

      post(
        urls.update,
        {
          member_id: node.id,
          name: (panelField('name') || {}).value || '',
          position: (panelField('position') || {}).value || '',
          department_id: (panelField('department_id') || {}).value || '',
          parent_id: (panelField('parent_id') || {}).value || ''
        },
        { photo_path: file }
      )
        .then(function (payload) {
          toast('Member updated.');

          if (payload.moved_department) {
            // The member left this canvas — follow them to their new department.
            departmentSelect.value = String(payload.department_id);
            state.selectedId = null;
            closePanel();
            loadDepartment(payload.department_id, { fit: true });
            return;
          }

          if (photoInput) {
            photoInput.value = '';
          }
          applyPayload(payload);
        })
        .catch(function (error) {
          toast(error.message || 'Could not update the member.', true);
        });
    });
  }

  bindClick('[data-ob-panel-delete]', function () {
    var node = state.lookup[String(state.selectedId)];
    if (!node) {
      return;
    }

    var subordinates = (node.children || []).length;
    var body = subordinates
      ? 'Removing ' + node.name + ' also moves their ' + subordinates +
        (subordinates === 1 ? ' direct report' : ' direct reports') +
        ' up to report to ' + node.name + '’s own supervisor. Nobody is deleted with them.'
      : 'Removing ' + node.name + ' from this department cannot be undone.';

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
          closePanel();
          applyPayload(payload);
          toast('Member removed.');
        })
        .catch(function (error) {
          toast(error.message || 'Could not remove the member.', true);
        });
    });
  });

  // ===== department switching & new members =====

  departmentSelect.addEventListener('change', function () {
    closePanel();
    loadDepartment(departmentSelect.value, { fit: true });
    syncUrl(departmentSelect.value);
  });

  function syncUrl(departmentId) {
    try {
      var url = new URL(window.location.href);
      url.searchParams.set('page', 'org-board');
      if (departmentId) {
        url.searchParams.set('department', String(departmentId));
      }
      window.history.replaceState({}, '', url.toString());
    } catch (error) {
      // Ignore browsers that cannot construct the URL helper here.
    }
  }

  var addForm = root.querySelector('[data-ob-add-form]');
  if (addForm) {
    addForm.addEventListener('upload:success', function (event) {
      var payload = event.detail || {};
      if (String(payload.department_id) === String(state.departmentId)) {
        applyPayload(payload);
      } else if (payload.department_id) {
        departmentSelect.value = String(payload.department_id);
        loadDepartment(payload.department_id, { fit: true });
      }
    });
  }

  var orgBoardTab = document.querySelector('[data-page-link="org-board"]');
  if (orgBoardTab) {
    orgBoardTab.addEventListener('click', function () {
      window.requestAnimationFrame(function () {
        syncUrl(state.departmentId);
        // The panel has no size until its tab is visible, so fit once it is.
        if (state.placed.length) {
          fitToView();
        }
      });
    });
  }

  // ===== boot =====

  var initialDepartment = departmentSelect.value;
  try {
    var requested = new URL(window.location.href).searchParams.get('department');
    if (requested && departmentSelect.querySelector('option[value="' + requested + '"]')) {
      departmentSelect.value = requested;
      initialDepartment = requested;
    }
  } catch (error) {
    // Fall back to whatever the select already had.
  }

  loadDepartment(initialDepartment, { fit: true });

  window.addEventListener('resize', function () {
    if (state.placed.length) {
      fitToView();
    }
  });
})();
