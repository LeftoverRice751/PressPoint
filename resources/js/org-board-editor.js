/**
 * Org board editor.
 *
 * One canvas per organization. Cards are laid out by the shared OrgChart module
 * (resources/js/org-chart-layout.js) so the kiosk renders the identical
 * arrangement.
 *
 * The canvas is free: a card goes wherever it is dragged, snapped to the same
 * grid the background draws, and carries its reports with it unless Alt is
 * held. Releasing over another card reparents instead of positioning. The
 * first time an organization is opened its auto-layout coordinates are saved,
 * so a board that has never been arranged by hand looks unchanged but every
 * card on it is already free to move.
 *
 * Dropping an image file on a card sets that member's portrait. Every action
 * posts JSON and re-renders in place — nothing here reloads the page.
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
  var frame = root.querySelector('[data-ob-frame]');
  var fitReadout = root.querySelector('[data-ob-fit-readout]');
  var organizationSelect = root.querySelector('[data-ob-organization]');

  var memberModal = section.querySelector('[data-ob-member-modal]');
  var memberForm = section.querySelector('[data-ob-member-form]');
  var memberModalTitle = section.querySelector('[data-ob-member-modal-title]');
  var memberSubmit = section.querySelector('[data-ob-member-submit]');
  var memberDelete = section.querySelector('[data-ob-member-delete]');
  var addMemberButton = section.querySelector('[data-ob-member-modal-open]');
  var preview = section.querySelector('[data-ob-member-preview]');
  var photoHint = section.querySelector('[data-ob-member-photo-hint]');
  var orgsModal = section.querySelector('[data-ob-orgs-modal]');
  var memberModalTrigger = null;
  var orgsModalTrigger = null;

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
  function wireOrganizationsDialog() {
    if (!orgsModal || typeof orgsModal.showModal !== 'function') {
      return;
    }

    bindAll('[data-ob-orgs-modal-open]', function (event, trigger) {
      orgsModalTrigger = trigger || null;
      orgsModal.showModal();
    });

    bindAll('[data-ob-orgs-modal-close]', function () {
      if (orgsModal.open) {
        orgsModal.close();
      }
    });

    orgsModal.addEventListener('cancel', function (event) {
      event.preventDefault();
      orgsModal.close();
    });

    orgsModal.addEventListener('click', function (event) {
      if (event.target === orgsModal) {
        orgsModal.close();
      }
    });

    orgsModal.addEventListener('close', function () {
      if (orgsModalTrigger && orgsModalTrigger.isConnected) {
        orgsModalTrigger.focus();
      }
      orgsModalTrigger = null;
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
    organizationId: organizationSelect.value || '',
    roots: [],
    placed: [],
    lookup: {},
    selectedId: null,
    scale: 1,
    offsetX: 0,
    offsetY: 0,
    loading: false,
    // Last render's card elements and measured metrics, kept so a live drag can
    // move DOM directly instead of going through render(), which rebuilds every
    // card from scratch and would tear the dragged node out from under the
    // pointer on every frame.
    elements: {},
    metrics: null,
    drag: null,
    seededOrganizationId: null
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

    // Cards are content-sized — a long name or a long position widens the card
    // (and wraps it) instead of being cut to an ellipsis — so their geometry
    // does not exist until they are in the DOM. Build first, measure, then lay
    // out; the layout module falls back to the fixed 200x96 box for anything
    // that measured 0 (e.g. the panel was still hidden).
    var built = buildCards();
    var metrics = layoutMetrics(built.sizes);

    state.placed = window.OrgChart.layout(state.roots, metrics);
    state.elements = built.elements;
    state.metrics = metrics;

    // Sized from the fixed origin, never from the content's bounding box: a
    // stage that re-anchors itself on its leftmost card shifts every other
    // card the moment a drag creates a new leftmost one, so a dropped card
    // would not stay under the cursor that released it.
    var size = window.OrgChart.stageSize(state.placed, metrics);
    stage.style.width = size.width + 'px';
    stage.style.height = size.height + 'px';

    renderEdges(size, metrics);
    positionCards(built.elements);
    renderFrame();
    updateFitReadout();

    if (emptyState) {
      emptyState.hidden = state.placed.length > 0;
    }

    // If the member being edited is no longer on this chart — deleted, or moved
    // by another editor — the dialog is stale, so close it. Deliberately does
    // NOT re-fill an open dialog: render() runs on every payload, and
    // overwriting the fields would discard whatever the editor was typing.
    if (state.selectedId && !state.lookup[String(state.selectedId)]) {
      closeMemberModal();
      return;
    }

    applyTransform();
  }

  /** METRICS plus a measure() closure over this render's card sizes. */
  function layoutMetrics(sizes) {
    var metrics = {};
    Object.keys(METRICS).forEach(function (key) {
      metrics[key] = METRICS[key];
    });
    metrics.measure = function (node) {
      return sizes[String(node.id)] || null;
    };
    return metrics;
  }

  function renderEdges(size, metrics) {
    var paths = window.OrgChart.connectors(state.placed, metrics || METRICS);
    edges.setAttribute('viewBox', '0 0 ' + size.width + ' ' + size.height);
    edges.setAttribute('width', size.width);
    edges.setAttribute('height', size.height);
    edges.innerHTML = paths.map(function (path) {
      return '<path class="ob-edge" d="' + path.d + '" />';
    }).join('');
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

  function buildCard(node) {
    var card = document.createElement('article');
    card.className = 'ob-card-node';
    card.setAttribute('data-ob-node', '');
    card.setAttribute('data-member-id', String(node.id));
    // Moving is a pointer gesture now (see "card dragging"), so the native
    // HTML5 drag would only fight it — and it is what dropped the card at the
    // release point instead of following the cursor. Photo drops still arrive
    // through HTML5 drag-and-drop, which does not need a draggable source here.
    card.setAttribute('draggable', 'false');
    card.setAttribute('tabindex', '0');

    if (String(node.id) === String(state.selectedId)) {
      card.classList.add('is-selected');
    }

    // No uploaded photo means no avatar slot at all: the empty bordered
    // circle with initials read as a broken image on the canvas, so a
    // member without a photo is just a name and a position.
    var avatar = null;
    if (node.photo_path) {
      avatar = document.createElement('div');
      avatar.className = 'ob-card-node__avatar';
      var img = document.createElement('img');
      img.src = '/storage/' + node.photo_path;
      img.alt = node.name;
      img.loading = 'lazy';
      avatar.appendChild(img);
    } else {
      card.classList.add('ob-card-node--no-photo');
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
    if (avatar) {
      card.appendChild(avatar);
    }
    card.appendChild(body);
    return card;
  }

  function positionCards(elements) {
    state.placed.forEach(function (item) {
      var card = elements[String(item.id)];
      if (!card) {
        return;
      }
      card.style.left = item.x + 'px';
      card.style.top = item.y + 'px';
      card.style.visibility = '';
    });
  }

  /* ---- the kiosk frame -------------------------------------------------
   *
   * This canvas is a wide desktop strip; the kiosk is a 768x1024 portrait panel
   * that scales a chart to fit with no scrolling and no zoom. An arrangement
   * that felt roomy here therefore came out ~2.8:1 landscape and had to be
   * shrunk to ~0.46 on the kiosk -- names at 6px. Drawing the kiosk's own shape
   * behind the cards is what lets an editor see that before a visitor does.
   */

  function renderFrame() {
    if (!frame) return;
    frame.style.width = window.OrgChart.KIOSK_FRAME.width + 'px';
    frame.style.height = window.OrgChart.KIOSK_FRAME.height + 'px';
  }

  /** The scale the kiosk will render this arrangement at. */
  function kioskScale(box) {
    return Math.min(
      window.OrgChart.KIOSK_FRAME.width / Math.max(box.width, 1),
      window.OrgChart.KIOSK_FRAME.height / Math.max(box.height, 1),
      1
    );
  }

  /**
   * Report the kiosk fit, and mark the cards that are costing it.
   *
   * A count alone would say the board is too wide without saying which card to
   * move, so the offenders are outlined as well.
   */
  function updateFitReadout() {
    if (!fitReadout) return;

    if (!state.placed.length) {
      fitReadout.textContent = '';
      return;
    }

    var frameBox = window.OrgChart.KIOSK_FRAME;
    var outside = 0;

    state.placed.forEach(function (item) {
      var card = state.elements && state.elements[String(item.id)];
      var escapes = item.x < 0 || item.y < 0
        || item.x + (item.w || METRICS.cardWidth) > frameBox.width
        || item.y + (item.h || METRICS.cardHeight) > frameBox.height;
      if (escapes) outside += 1;
      if (card) card.classList.toggle('is-outside-frame', escapes);
    });

    var scale = kioskScale(window.OrgChart.bounds(state.placed, state.metrics || METRICS, 0));
    var percent = Math.round(scale * 100);

    fitReadout.classList.toggle('is-tight', outside > 0);
    fitReadout.textContent = outside
      ? 'Kiosk size ' + percent + '% \u2014 ' + outside + (outside === 1 ? ' card' : ' cards') + ' outside the screen'
      : 'Kiosk size ' + percent + '% \u2713';
  }

  function applyTransform() {
    stage.style.transform = 'translate(' + state.offsetX + 'px, ' + state.offsetY + 'px) scale(' + state.scale + ')';
  }

  function fitToView() {
    // bounds() is still the right box to *frame* — it hugs the cards rather
    // than the origin, so an arrangement pushed to the right of the canvas is
    // not centred around a corner of empty grid. It is only the pan offset
    // that leans on it; card coordinates stay absolute.
    var box = window.OrgChart.bounds(state.placed, state.metrics || METRICS);

    // Frame the kiosk rectangle as well as the cards, so "Fit" always shows the
    // target an editor is arranging against -- including on an empty board,
    // where the cards alone would zoom the canvas into a corner of blank grid.
    box = {
      minX: Math.min(box.minX, 0),
      minY: Math.min(box.minY, 0),
      maxX: Math.max(box.maxX, window.OrgChart.KIOSK_FRAME.width),
      maxY: Math.max(box.maxY, window.OrgChart.KIOSK_FRAME.height)
    };
    box.width = box.maxX - box.minX;
    box.height = box.maxY - box.minY;

    var viewWidth = canvas.clientWidth || 1;
    var viewHeight = canvas.clientHeight || 1;

    var scale = Math.min(viewWidth / box.width, viewHeight / box.height, 1);
    state.scale = Math.max(scale, 0.25);
    state.offsetX = (viewWidth - box.width * state.scale) / 2 - box.minX * state.scale;
    state.offsetY = (viewHeight - box.height * state.scale) / 2 - box.minY * state.scale;
    applyTransform();
  }

  /** Pointer position in unscaled stage coordinates (what we persist). */
  function toStagePoint(event) {
    var rect = canvas.getBoundingClientRect();
    return {
      x: (event.clientX - rect.left - state.offsetX) / state.scale,
      y: (event.clientY - rect.top - state.offsetY) / state.scale
    };
  }

  // ===== loading =====

  function loadOrganization(organizationId, options) {
    if (!organizationId) {
      state.roots = [];
      render();
      return Promise.resolve();
    }

    state.loading = true;
    root.classList.add('is-loading');

    return fetch(urls.data + '?organization_id=' + encodeURIComponent(organizationId), {
      headers: { 'X-Requested-With': 'XMLHttpRequest', Accept: 'application/json' },
      credentials: 'same-origin'
    })
      .then(readJson)
      .then(function (payload) {
        state.organizationId = String(organizationId);
        applyPayload(payload, options);
      })
      .catch(function (error) {
        toast(error.message || 'Could not load this organization.', true);
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
    seedPositions();
  }

  // ===== card dragging =====

  // Cards move under a Pointer Events drag rather than HTML5 drag-and-drop.
  // HTML5 DnD only reports a position when the pointer is released, so a card
  // teleported on drop instead of following the cursor, and it never fires at
  // all for touch — on a board editors reach for on a tablet that ruled out
  // half the input methods.
  var DRAG_THRESHOLD = 3; // px of travel before a press becomes a drag, not a click
  var suppressClick = false;

  cardLayer.addEventListener('pointerdown', function (event) {
    if (event.button !== 0) {
      return;
    }

    var card = event.target.closest('[data-ob-node]');
    if (!card) {
      return;
    }

    var memberId = card.getAttribute('data-member-id');
    var item = findPlaced(memberId);
    if (!item) {
      return;
    }

    var origin = toStagePoint(event);

    // Alt detaches a single card from its reports; a plain drag carries the
    // whole subtree so reorganising a branch does not mean re-placing it card
    // by card. Descendants keep their offsets relative to the card being moved.
    var moving = event.altKey
      ? [item]
      : subtreeItems(memberId);

    var items = moving.map(function (moved) {
      return { id: moved.id, startX: moved.x, startY: moved.y };
    });

    state.drag = {
      memberId: memberId,
      pointerId: event.pointerId,
      card: card,
      originX: origin.x,
      originY: origin.y,
      started: false,
      items: items,
      // How far the group may travel before its leading edge would cross the
      // origin. The whole subtree moves as one piece, so the *delta* is what
      // gets clamped — clamping each card on its own would squash the branch
      // against the left edge instead of stopping it.
      minStartX: Math.min.apply(null, items.map(function (moved) { return moved.startX; })),
      minStartY: Math.min.apply(null, items.map(function (moved) { return moved.startY; }))
    };

    // Keep receiving moves even when the pointer outruns the card. Capture on
    // the *card*, not cardLayer: while capture is active at pointerup the
    // browser dispatches the following `click` to the capturing element, so
    // capturing on the layer sent every click to the layer and the editor's
    // `closest('[data-ob-node]')` found nothing — no card could be opened.
    // Moves still bubble from the card to cardLayer's listeners.
    if (card.setPointerCapture) {
      try {
        card.setPointerCapture(event.pointerId);
      } catch (error) {
        // Capture is a convenience; the window-level listeners still fire.
      }
    }
  });

  cardLayer.addEventListener('pointermove', function (event) {
    var drag = state.drag;
    if (!drag || drag.pointerId !== event.pointerId) {
      return;
    }

    var point = toStagePoint(event);
    var dx = point.x - drag.originX;
    var dy = point.y - drag.originY;

    if (!drag.started) {
      if (Math.abs(dx) < DRAG_THRESHOLD && Math.abs(dy) < DRAG_THRESHOLD) {
        return;
      }
      drag.started = true;
      var card = state.elements[String(drag.memberId)];
      if (card) {
        card.classList.add('is-dragging');
      }
    }

    event.preventDefault();
    moveDragged(dx, dy);
    highlightDropTarget(event);
  });

  cardLayer.addEventListener('pointerup', finishDrag);
  cardLayer.addEventListener('pointercancel', function (event) {
    var drag = state.drag;
    if (drag && drag.pointerId === event.pointerId) {
      state.drag = null;
      clearDragChrome();
      render();
    }
  });

  /** Live-position the dragged cards and redraw their edges, no re-render. */
  function moveDragged(dx, dy) {
    var drag = state.drag;
    if (!drag) {
      return;
    }

    var boundedX = Math.max(dx, -drag.minStartX);
    var boundedY = Math.max(dy, -drag.minStartY);

    drag.items.forEach(function (moved) {
      var item = findPlaced(moved.id);
      var card = state.elements[String(moved.id)];
      if (!item) {
        return;
      }
      item.x = moved.startX + boundedX;
      item.y = moved.startY + boundedY;
      if (card) {
        card.style.left = item.x + 'px';
        card.style.top = item.y + 'px';
      }
    });

    var size = window.OrgChart.stageSize(state.placed, state.metrics || METRICS);
    stage.style.width = size.width + 'px';
    stage.style.height = size.height + 'px';
    renderEdges(size, state.metrics || METRICS);
    updateFitReadout();
  }

  function finishDrag(event) {
    var drag = state.drag;
    if (!drag || drag.pointerId !== event.pointerId) {
      return;
    }

    state.drag = null;

    if (drag.card && drag.card.releasePointerCapture) {
      try {
        drag.card.releasePointerCapture(event.pointerId);
      } catch (error) {
        // Already released.
      }
    }

    // A press that never travelled is a click: leave it to the click handler
    // that opens the member editor.
    if (!drag.started) {
      clearDragChrome();
      return;
    }

    suppressClick = true;

    // The local `drag`, not state.drag — that was cleared above.
    var target = dropTargetAt(event, drag);
    clearDragChrome();

    if (target && isBlockedTarget(drag.memberId, target)) {
      toast('A member cannot report to one of its own subordinates.', true);
      render();
      return;
    }

    // Snap only on release: snapping every frame makes the card stutter away
    // from the pointer instead of tracking it.
    var positions = drag.items.map(function (moved) {
      var item = findPlaced(moved.id);
      return {
        member_id: moved.id,
        pos_x: window.OrgChart.snap(item ? item.x : moved.startX),
        pos_y: window.OrgChart.snap(item ? item.y : moved.startY)
      };
    });

    // Landing on another card changes the reporting line, but the cards still
    // belong where they were released — save the positions first, then the new
    // parent, or the drop would snap everything back to where it started.
    if (target) {
      var memberId = drag.memberId;
      pin(positions).then(function (saved) {
        if (saved) {
          reparent(memberId, target);
        }
      });
      return;
    }

    pin(positions);
  }

  function findPlaced(memberId) {
    for (var index = 0; index < state.placed.length; index += 1) {
      if (String(state.placed[index].id) === String(memberId)) {
        return state.placed[index];
      }
    }
    return null;
  }

  /** The dragged card plus everything reporting beneath it, as placed items. */
  function subtreeItems(memberId) {
    var ids = window.OrgChart.subtreeIds(state.roots, memberId);
    return state.placed.filter(function (item) {
      return Boolean(ids[String(item.id)]);
    });
  }

  /**
   * The card under the pointer, ignoring the ones being dragged.
   *
   * The drag is a PARAMETER, deliberately: this used to read `state.drag`, and
   * finishDrag clears that before it gets here. The exclusion set was therefore
   * empty at drop time, so the card under the pointer — the one being dragged,
   * which has no `pointer-events: none` — came back as the drop target. A
   * member is always inside its own subtree, so isBlockedTarget then refused
   * every single drag with "cannot report to one of its own subordinates" and
   * the position was never saved. Never reach for state.drag in here.
   */
  function dropTargetAt(event, drag) {
    var moving = {};
    (drag ? drag.items : []).forEach(function (moved) {
      moving[String(moved.id)] = true;
    });

    var elements = document.elementsFromPoint
      ? document.elementsFromPoint(event.clientX, event.clientY)
      : [];

    for (var index = 0; index < elements.length; index += 1) {
      var card = elements[index].closest && elements[index].closest('[data-ob-node]');
      if (card && !moving[String(card.getAttribute('data-member-id'))]) {
        return card.getAttribute('data-member-id');
      }
    }
    return null;
  }

  function highlightDropTarget(event) {
    clearDropTargets();
    var targetId = dropTargetAt(event, state.drag);
    if (!targetId) {
      canvas.classList.add('is-drop-canvas');
      return;
    }
    var card = state.elements[String(targetId)];
    if (card) {
      card.classList.add(
        isBlockedTarget(state.drag.memberId, targetId) ? 'is-drop-blocked' : 'is-drop-target'
      );
    }
  }

  function clearDragChrome() {
    clearDropTargets();
    Array.prototype.forEach.call(
      cardLayer.querySelectorAll('.is-dragging'),
      function (node) { node.classList.remove('is-dragging'); }
    );
  }

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

  // HTML5 drag-and-drop now only carries photo drops from the desktop — cards
  // themselves move under Pointer Events above.
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

  function reparent(memberId, parentId) {
    post(urls.move, { member_id: memberId, parent_id: parentId })
      .then(function (payload) {
        applyPayload(payload);
      })
      .catch(function (error) {
        toast(error.message || 'Could not move the member.', true);
      });
  }

  /**
   * Persist a batch of hand-placed positions.
   *
   * A drag moves a whole subtree, so this posts every affected card in one
   * request rather than one request per descendant — which would also have the
   * server re-serialise the organization once per card.
   */
  function pin(positions) {
    if (!positions || !positions.length) {
      return Promise.resolve(false);
    }

    // Paint the snapped positions immediately so the drag feels direct, then
    // confirm against the server.
    positions.forEach(function (entry) {
      var node = state.lookup[String(entry.member_id)];
      if (node) {
        node.pos_x = entry.pos_x;
        node.pos_y = entry.pos_y;
      }
    });
    render();

    // Resolves to whether the save landed, so a caller that has follow-up work
    // (a reparent after the drop) does not run it on top of a failed save.
    return post(urls.move, { positions: JSON.stringify(positions) })
      .then(function (payload) {
        applyPayload(payload);
        return true;
      })
      .catch(function (error) {
        toast(error.message || 'Could not move the member.', true);
        loadOrganization(state.organizationId);
        return false;
      });
  }

  /**
   * Persist the auto-layout result the first time an organization is opened.
   *
   * Free placement needs every card to own its coordinates, but writing a
   * migration to seed them is not possible: cards are content-sized, so their
   * real geometry only exists once they have been measured in a browser. The
   * first editor to open a board therefore saves what a layout pass just
   * produced, and from then on every card is free to move.
   *
   * That pass is bounded to the kiosk frame rather than the unbounded tidy tree
   * the canvas itself renders. Eight siblings laid out unbounded are ~1800px
   * wide — outside the kiosk's screen from birth, which is exactly how the live
   * board came to need a 0.46 scale. Bounded, wide rows hang as indented stacks
   * instead, so a new organization starts already the right shape and the
   * editor's own view of it is the one the kiosk will show.
   */
  function seedPositions() {
    if (!state.organizationId || state.drag) {
      return;
    }
    if (String(state.seededOrganizationId) === String(state.organizationId)) {
      return;
    }

    var unpinned = state.placed.filter(function (item) {
      return !window.OrgChart.isPinned(item.node);
    });

    // Mark the org seeded either way, so a board that is already fully placed
    // is not re-checked on every payload.
    state.seededOrganizationId = state.organizationId;

    if (!unpinned.length) {
      return;
    }

    var metrics = state.metrics || METRICS;
    var seeded = window.OrgChart.layout(state.roots, {
      cardWidth: metrics.cardWidth,
      cardHeight: metrics.cardHeight,
      hGap: metrics.hGap,
      vGap: metrics.vGap,
      measure: metrics.measure,
      ignorePins: true,
      maxWidth: window.OrgChart.KIOSK_FRAME.width
    });

    pin(seeded.map(function (item) {
      return {
        member_id: item.id,
        pos_x: window.OrgChart.snap(item.x),
        pos_y: window.OrgChart.snap(item.y)
      };
    }));
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

  bindAll('[data-ob-zoom-in]', function () { zoomBy(1.15); });
  bindAll('[data-ob-zoom-out]', function () { zoomBy(0.87); });
  bindAll('[data-ob-fit]', fitToView);

  bindAll('[data-ob-reset-layout]', function () {
    if (!state.organizationId) {
      return;
    }

    var ask = window.ConfirmModal && window.ConfirmModal.ask
      ? window.ConfirmModal.ask({
          title: 'Reset this layout?',
          body: 'Every card you positioned by hand in this organization goes back to the automatic arrangement. Names, photos, and reporting lines are not affected.',
          confirmLabel: 'Reset layout',
          cancelLabel: 'Keep my layout'
        })
      : Promise.resolve(window.confirm('Reset this organization to the automatic layout?'));

    ask.then(function (ok) {
      if (!ok) {
        return;
      }
      post(urls.reset, { organization_id: state.organizationId })
        .then(function (payload) {
          // Re-seed: the reset drops every coordinate, and a free canvas wants
          // the tidy arrangement it just produced saved back as the new
          // starting positions rather than left on auto-layout.
          state.seededOrganizationId = null;
          applyPayload(payload, { fit: true });
          toast('Layout reset.');
        })
        .catch(function (error) {
          toast(error.message || 'Could not reset the layout.', true);
        });
    });
  });

  // ===== opening the member editor =====

  cardLayer.addEventListener('click', function (event) {
    // A drag ends with a click on the card that was moved. Opening the editor
    // every time someone repositions a card would make the canvas unusable.
    if (suppressClick) {
      suppressClick = false;
      return;
    }

    var card = event.target.closest('[data-ob-node]');
    if (!card) {
      return;
    }
    openMemberModal(card.getAttribute('data-member-id'), card);
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

  function openMemberModal(memberId, trigger) {
    if (!memberModal || typeof memberModal.showModal !== 'function') {
      return;
    }

    var node = memberId ? state.lookup[String(memberId)] : null;
    var editing = !!node;

    state.selectedId = editing ? node.id : null;
    memberModalTrigger = trigger || null;

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

    fillSupervisorOptions(node);
    fillPreview(node);

    if (photoHint) {
      photoHint.textContent = editing
        ? 'Uploading a new portrait replaces the current one.'
        : 'Optional — you can add a portrait later.';
    }

    memberModal.showModal();
    render();

    var nameField = panelField('name');
    if (nameField) {
      nameField.focus();
    }
  }

  function closeMemberModal() {
    state.selectedId = null;
    if (memberModal && memberModal.open) {
      // The `close` listener below handles focus return and the re-render.
      memberModal.close();
    } else {
      render();
    }
  }

  function fillSupervisorOptions(node) {
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
    supervisor.value = node && node.parent_id ? String(node.parent_id) : '';
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

  if (memberModal) {
    // ESC: intercept so focus returns to the trigger the same way an explicit
    // close does. Same shape as news-dashboard.js's body modal.
    memberModal.addEventListener('cancel', function (event) {
      event.preventDefault();
      closeMemberModal();
    });

    memberModal.addEventListener('click', function (event) {
      if (event.target === memberModal) {
        closeMemberModal();
      }
    });

    memberModal.addEventListener('close', function () {
      state.selectedId = null;
      if (memberModalTrigger && memberModalTrigger.isConnected) {
        memberModalTrigger.focus();
      } else if (addMemberButton) {
        addMemberButton.focus();
      }
      memberModalTrigger = null;
      render();
    });
  }

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
        loadOrganization(payload.organization_id, { fit: true });
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
    loadOrganization(organizationSelect.value, { fit: true });
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

    // The canvas may have been showing an organization that just got deleted.
    if (state.organizationId && !organizationSelect.querySelector(
      'option[value="' + state.organizationId + '"]'
    )) {
      loadOrganization(organizationSelect.value, { fit: true });
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
        // The panel has no size until its tab is visible, so fit once it is.
        if (state.placed.length) {
          fitToView();
        }
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

  loadOrganization(initialOrganization, { fit: true });

  window.addEventListener('resize', function () {
    if (state.placed.length) {
      fitToView();
    }
  });
})();
