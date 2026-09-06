/*
 * The LSPU Citizen's Charter as a 3D object inside the virtual tour.
 *
 * A <model-viewer> element is hung in the tour's opening panorama
 * (scene 0-jst-1) as an ordinary Marzipano hotspot — hotspots are plain DOM,
 * so a second WebGL canvas rides along with the panorama and tracks its
 * yaw/pitch for free. The book sits on the floor tiles and autorotates.
 *
 * Tapping it does NOT open the document. It opens INSPECTION MODE: the same
 * element goes fullscreen and becomes something the visitor can turn over in
 * their hands, and only a tap on the printed front cover opens the reader.
 * That extra beat is the point of the feature — a book you pick up and choose
 * to open reads as an object in the room, where a book that fires a PDF the
 * instant you brush it reads as a button wearing a 3D costume.
 *
 *   tour ──tap model──▶ inspect ──tap front cover──▶ reader
 *     ◀───exit button───        ◀──archive:reader-close──
 *
 * ONE ELEMENT, ONE GLB. Entering inspection MOVES the live <model-viewer> node
 * from the hotspot into the overlay stage and moves it back on exit; it is
 * never cloned and never re-created. model-viewer pauses on
 * disconnectedCallback and resumes on connectedCallback, keeping its scene,
 * textures and WebGL context across the move, so repeated enter/exit costs
 * nothing. A second element with the same src would mean a second scene and a
 * second GPU upload of a 1.4 MB model on kiosk hardware.
 *
 * Contracts this file sits between, none of which it owns:
 *
 *   - kiosk-tour.js dispatches CustomEvent('tour:scene-created') per scene
 *     with { id, scene }, and publishes window.__tourBridge on 'tour:ready'.
 *     We listen for the former and fall back to the latter, because scenes
 *     are built inside an async dependency promise and this bundle could in
 *     principle be evaluated after that. The bridge also carries
 *     freezeView/unfreezeView, which hold the panorama still underneath the
 *     inspection overlay.
 *
 *   - kiosk-archive-book.js opens on CustomEvent('archive:open') with
 *     { dataset, originRect } and announces its own close as
 *     CustomEvent('archive:reader-close'). The dataset keys are the ones the
 *     archives card carries (fileUrl, pageCount, pageUrlBase, prewarmedPages,
 *     type, isTabloid); the reader picks its adapter from `type`/`isTabloid`,
 *     and a charter matches neither tabloid nor newsletter, so it lands on the
 *     Book (StPageFlip) adapter with no adapter work here.
 *
 *   - the GLB itself. Its hierarchy is
 *
 *         lspu_citizens_charter_2026
 *         ├─ page_block    → page_block
 *         ├─ spine         → navy_deep, spine_art
 *         ├─ front_cover   → paper_white x5 + cover_art   ← the printed face
 *         └─ back_cover    → paper_white x5 + back_cover_art
 *
 *     COVER_MATERIAL below is that "cover_art", the only material on the one
 *     face we treat as openable. Identifying the cover by material rather than
 *     by mesh index or face normal survives a re-export as long as the
 *     material keeps its name, and never touches screen coordinates.
 *
 * model-viewer is loaded lazily, on first need, so the tour's opening screen
 * is not blocked by ~1 MB of WebGL library the visitor may never look at.
 */
'use strict';

(function () {
  var MODEL_VIEWER_SRC = '/assets/js/model-viewer/model-viewer.min.js';

  /* The material on the charter's printed front face. A contract with the GLB
   * — see the hierarchy in this file's header. If a re-export renames it, the
   * cover stops being tappable (the model still inspects fine), which is why
   * tests/js/tour-charter.test.mjs pins the name. */
  var COVER_MATERIAL = 'cover_art';

  /* Camera framing, as model-viewer orbit strings: "theta phi radius".
   *
   * RESTING phi is 72deg, not the 90deg that faces a model dead-on and not
   * model-viewer's 75deg default. The book is pinned BELOW the horizon in the
   * panorama (CHARTER_PITCH in app/services/CharterArchive.py), so the visitor
   * is looking down at it; framing it level would render a book photographed
   * straight-on and pasted onto a floor, which is exactly the "sticker" look
   * the floor placement is meant to avoid. 72deg is that same downward look,
   * and the contact shadow underneath does the rest.
   *
   * INSPECT opens a little further round and slightly above so the cover reads
   * as presented rather than as the same view, only bigger. */
  var RESTING_ORBIT = '0deg 72deg auto';
  var INSPECT_ORBIT = '15deg 78deg 105%';

  /* Inspection limits. Theta is left as `auto` in both bounds, which is
   * model-viewer's way of spelling "unbounded" — that is the full 360deg of
   * horizontal turn. Phi is clamped short of the poles so the book can be
   * looked at from above and from underneath without the camera rolling over
   * the top and inverting the model, which on a touchscreen is very easy to do
   * by accident and very hard to undo. Radius and field of view are bounded
   * together: either one alone can be defeated by the other, and a visitor who
   * zooms the object off the screen has no way back short of an attendant. */
  var INSPECT_MIN_ORBIT = 'auto 15deg 60%';
  var INSPECT_MAX_ORBIT = 'auto 165deg 160%';
  var INSPECT_MIN_FOV = '18deg';
  var INSPECT_MAX_FOV = '45deg';

  /* Emissive lift for the cover under the pointer, and the brighter pulse on
   * activation. Emissive is added to the shaded result, so a small value reads
   * as the cover catching the light rather than as a recolour — and it leaves
   * the base colour texture untouched, so nothing here can permanently alter
   * how the model looks. Both are reverted to black on exit. */
  var COVER_HOVER_EMISSIVE = [0.06, 0.06, 0.1];
  var COVER_PULSE_EMISSIVE = [0.22, 0.2, 0.12];
  var COVER_EMISSIVE_OFF = [0, 0, 0];
  var COVER_PULSE_MS = 180;

  var config = document.querySelector('[data-tour-charter]');
  if (!config) return; // no charter uploaded — the tour renders as it always did

  var sceneId = config.dataset.charterSceneId || '';
  var yaw = parseFloat(config.dataset.charterYaw || '0') || 0;
  var pitch = parseFloat(config.dataset.charterPitch || '0') || 0;

  var overlay = config.querySelector('[data-charter-inspect]');
  var stage = config.querySelector('[data-charter-stage]');
  var exitButton = config.querySelector('[data-charter-exit]');
  var scrim = config.querySelector('[data-charter-inspect-scrim]');

  var mounted = false;
  var modelViewerPromise = null;
  var modelViewerReady = false;

  var wrapper = null;
  var viewer = null;

  /* 'tour' | 'inspect' | 'reader'. The reader is a state of its own rather
   * than a modal on top of inspection because closing it must come BACK to
   * inspection — the visitor was holding the book, and dumping them into the
   * panorama would lose the object they were looking at. */
  var mode = 'tour';

  var hoveredCoverMaterial = null;
  var pulseTimer = null;
  var coverHotspot = null;

  /* ── model-viewer library ─────────────────────────────────────────────── */

  function loadModelViewer() {
    if (modelViewerPromise) return modelViewerPromise;
    modelViewerPromise = new Promise(function (resolve, reject) {
      if (window.customElements && window.customElements.get('model-viewer')) {
        resolve();
        return;
      }
      var script = document.createElement('script');
      script.type = 'module';
      script.src = MODEL_VIEWER_SRC;
      script.addEventListener('load', function () { resolve(); });
      script.addEventListener('error', reject);
      document.head.appendChild(script);
    });
    modelViewerPromise.then(function () { modelViewerReady = true; }, function () {});
    return modelViewerPromise;
  }

  /* ── the archive reader ───────────────────────────────────────────────── */

  /* The archives card dataset, rebuilt from the config element. Kept in the
   * card's camelCase spelling so the reader cannot tell the difference
   * between being opened from here and from the archives carousel. */
  function charterDataset() {
    var d = config.dataset;
    return {
      archiveId: d.charterId || '',
      title: d.charterTitle || '',
      type: d.charterType || 'charter',
      year: d.charterYear || '',
      coverUrl: d.charterCoverUrl || '',
      fileUrl: d.charterFileUrl || '',
      pageCount: d.charterPageCount || '0',
      isTabloid: '0',
      firstPageUrl: d.charterFirstPageUrl || '',
      pageUrlBase: d.charterPageUrlBase || '',
      // Field by field, so a new attribute on the card is NOT picked up here
      // automatically the way it is for an archive card's own dataset.
      pageStorageBase: d.charterPageStorageBase || '',
      pageExtension: d.charterPageExtension || '.webp',
      directPages: d.charterDirectPages || '0',
      prewarmedPages: d.charterPrewarmedPages || '0',
    };
  }

  function openReader(originElement) {
    var origin = originElement || wrapper;
    // Stand the inspection furniture down for the duration. The overlay stays
    // mounted underneath the reader, so its title and its own "Back to tour"
    // button would ghost through the reader's translucent backdrop — the
    // second one directly beneath the reader's identically placed button.
    if (overlay) overlay.classList.add('is-reading');
    document.dispatchEvent(new CustomEvent('archive:open', {
      detail: {
        dataset: charterDataset(),
        // The reader grows its opening animation out of this rect, so handing
        // it the stage rather than the tour hotspot makes the pages unfold
        // from the object the visitor was actually holding.
        originRect: origin ? origin.getBoundingClientRect() : null,
      },
    }));
  }

  /* ── front cover ──────────────────────────────────────────────────────── */

  /* The material under a screen point, or null. model-viewer raycasts into its
   * own scene for us; there is no second raycaster and no per-frame work here,
   * because this only runs on a real pointer event. */
  function materialAt(clientX, clientY) {
    if (!viewer || typeof viewer.materialFromPoint !== 'function') return null;
    try {
      return viewer.materialFromPoint(clientX, clientY);
    } catch (e) {
      return null;
    }
  }

  function isCover(material) {
    return !!material && material.name === COVER_MATERIAL;
  }

  function setEmissive(material, rgb) {
    if (!material || !material.pbrMetallicRoughness) return;
    try {
      material.setEmissiveFactor(rgb);
    } catch (e) {
      // An older scene-graph API, or a material still streaming in. The
      // touchscreen affordance (the anchored hotspot) carries the message on
      // its own, so this is cosmetic.
    }
  }

  function clearCoverHighlight() {
    if (!hoveredCoverMaterial) return;
    setEmissive(hoveredCoverMaterial, COVER_EMISSIVE_OFF);
    hoveredCoverMaterial = null;
    if (viewer) viewer.classList.remove('is-over-cover');
  }

  function highlightCover(material) {
    if (hoveredCoverMaterial === material) return;
    clearCoverHighlight();
    hoveredCoverMaterial = material;
    setEmissive(material, COVER_HOVER_EMISSIVE);
    if (viewer) viewer.classList.add('is-over-cover');
  }

  /* A model-viewer hotspot pinned to the cover itself, as the touchscreen half
   * of the affordance: a kiosk has no hover, so the mouse highlight above can
   * never be the only signal that the cover does something. model-viewer hides
   * an anchored hotspot when its surface faces away, so the prompt appears
   * exactly while the cover is toward the visitor and vanishes when they turn
   * the book over — which is also, usefully, a hint that the back is not it.
   *
   * The anchor is READ OFF THE MODEL rather than hardcoded: we ray the middle
   * of the stage while the cover is facing us and keep whatever position and
   * normal come back. Done once and cached; a re-export moves the anchor with
   * the geometry and needs no edit here. */
  function ensureCoverHotspot() {
    if (coverHotspot || !viewer || !stage) return;
    if (typeof viewer.positionAndNormalFromPoint !== 'function') return;

    var rect = stage.getBoundingClientRect();
    if (!rect.width || !rect.height) return;

    var hit;
    try {
      hit = viewer.positionAndNormalFromPoint(
        rect.left + rect.width / 2,
        rect.top + rect.height / 2
      );
    } catch (e) {
      return;
    }
    if (!hit) return;

    var probe = materialAt(rect.left + rect.width / 2, rect.top + rect.height / 2);
    if (!isCover(probe)) return; // centre of the stage isn't the cover yet

    coverHotspot = document.createElement('button');
    coverHotspot.type = 'button';
    coverHotspot.className = 'charter-inspect__cover-cue';
    coverHotspot.setAttribute('slot', 'hotspot-cover');
    coverHotspot.setAttribute('data-position', hit.position.toString());
    coverHotspot.setAttribute('data-normal', hit.normal.toString());
    coverHotspot.textContent = 'Tap to read';
    coverHotspot.addEventListener('click', function (event) {
      event.stopPropagation();
      activateCover();
    });
    viewer.appendChild(coverHotspot);
  }

  /* Cover tapped: a brief pulse so the tap is acknowledged by the object
   * rather than by a page that simply replaces it, then the existing reader. */
  function activateCover() {
    if (mode !== 'inspect') return;
    mode = 'reader';

    var material = hoveredCoverMaterial;
    if (!material) {
      var rect = stage ? stage.getBoundingClientRect() : null;
      if (rect) {
        material = materialAt(rect.left + rect.width / 2, rect.top + rect.height / 2);
      }
    }

    if (isCover(material)) {
      setEmissive(material, COVER_PULSE_EMISSIVE);
      if (pulseTimer) clearTimeout(pulseTimer);
      pulseTimer = setTimeout(function () {
        pulseTimer = null;
        setEmissive(material, COVER_EMISSIVE_OFF);
        if (hoveredCoverMaterial === material) hoveredCoverMaterial = null;
        openReader(stage);
      }, COVER_PULSE_MS);
      return;
    }

    openReader(stage);
  }

  /* ── inspection mode ──────────────────────────────────────────────────── */

  function onViewerPointerMove(event) {
    if (mode !== 'inspect' || event.pointerType === 'touch') return;
    var material = materialAt(event.clientX, event.clientY);
    if (isCover(material)) {
      highlightCover(material);
    } else {
      clearCoverHighlight();
    }
  }

  function onViewerClick(event) {
    if (mode !== 'inspect') return;

    // A drag that turns the book ends in a click too. model-viewer does not
    // tell us whether the gesture rotated, so compare against where the
    // pointer went down: anything that travelled is a turn, not a tap.
    if (dragDistanceExceeded(event)) return;

    var material = materialAt(event.clientX, event.clientY);
    if (isCover(material)) {
      activateCover();
      return;
    }

    // Without materialFromPoint we cannot tell the cover from the spine, and
    // refusing to open at all would strand the document behind a gesture that
    // can never succeed. Opening on any model tap is the lesser failure: the
    // visitor still reaches the charter, they just lose the cover as a
    // distinct target.
    if (!material && viewer && typeof viewer.materialFromPoint !== 'function') {
      activateCover();
    }
  }

  var pointerDownAt = null;
  var DRAG_SLOP_PX = 10;

  function onViewerPointerDown(event) {
    pointerDownAt = { x: event.clientX, y: event.clientY };
  }

  function dragDistanceExceeded(event) {
    if (!pointerDownAt) return false;
    var dx = event.clientX - pointerDownAt.x;
    var dy = event.clientY - pointerDownAt.y;
    pointerDownAt = null;
    return Math.sqrt(dx * dx + dy * dy) > DRAG_SLOP_PX;
  }

  function applyRestingAttributes() {
    if (!viewer) return;
    viewer.removeAttribute('camera-controls');
    viewer.setAttribute('camera-orbit', RESTING_ORBIT);
    // Pin the framing so a late re-fit after load cannot re-apply
    // model-viewer's own default orbit and stand the book back up.
    viewer.setAttribute('min-camera-orbit', 'auto 72deg auto');
    viewer.setAttribute('max-camera-orbit', 'auto 72deg auto');
    viewer.removeAttribute('min-field-of-view');
    viewer.removeAttribute('max-field-of-view');
    viewer.setAttribute('auto-rotate-delay', '0');
    viewer.setAttribute('disable-zoom', '');
    viewer.setAttribute('disable-tap', '');
    viewer.setAttribute('disable-pan', '');
    viewer.setAttribute('auto-rotate', '');
  }

  function applyInspectAttributes() {
    if (!viewer) return;
    viewer.setAttribute('camera-controls', '');
    viewer.setAttribute('min-camera-orbit', INSPECT_MIN_ORBIT);
    viewer.setAttribute('max-camera-orbit', INSPECT_MAX_ORBIT);
    viewer.setAttribute('min-field-of-view', INSPECT_MIN_FOV);
    viewer.setAttribute('max-field-of-view', INSPECT_MAX_FOV);
    // Setting camera-orbit while interpolation-decay is at its default TWEENS
    // the camera rather than cutting to it. That is the whole "smooth
    // transition into inspection" — there is no animation code here because
    // model-viewer already owns the render loop that would run it.
    viewer.setAttribute('camera-orbit', INSPECT_ORBIT);
    viewer.removeAttribute('disable-zoom');
    viewer.removeAttribute('disable-tap');
    // Pan stays off. Rotation and zoom are what "inspect an object" means;
    // panning only adds a gesture that can slide the book off the screen, and
    // on a kiosk nobody is coming to put it back.
    viewer.setAttribute('disable-pan', '');
    // Idle back into the turntable if the visitor walks away mid-inspection.
    viewer.setAttribute('auto-rotate-delay', '4000');
    viewer.setAttribute('auto-rotate', '');
  }

  function enterInspect() {
    if (mode !== 'tour' || !overlay || !stage) return;

    // Nothing to inspect if the library never arrived — the poster image is
    // all there is, so keep the old behaviour and go straight to the reader.
    if (!modelViewerReady) {
      openReader(wrapper);
      return;
    }

    mode = 'inspect';

    var bridge = window.__tourBridge;
    if (bridge && typeof bridge.freezeView === 'function') bridge.freezeView();

    // Open is the DEFAULT state of the overlay — visible and interactive the
    // instant it stops being `hidden`, with the fade-in owned by a CSS
    // animation. Nothing here schedules a frame: this used to add an
    // `.is-active` class inside requestAnimationFrame, which put both the
    // visibility and the pointer-events of a fullscreen layer behind a
    // callback that is not guaranteed to run. When it didn't, the model had
    // already been moved into an invisible overlay and the visitor was left
    // with a tour missing its book and every tap landing on nothing.
    overlay.classList.remove('is-closing');
    // Belt and braces: a fresh open always shows its own chrome, even if some
    // path closed the reader without announcing it.
    overlay.classList.remove('is-reading');
    overlay.hidden = false;

    if (wrapper) wrapper.classList.add('is-inspecting');
    stage.appendChild(viewer); // the move: same node, same GLB, same context
    applyInspectAttributes();

    viewer.addEventListener('pointerdown', onViewerPointerDown);
    viewer.addEventListener('pointermove', onViewerPointerMove);
    viewer.addEventListener('click', onViewerClick);
    document.addEventListener('keydown', onInspectKeydown);

    // The cover has to be facing the camera for the anchor probe to hit it,
    // and the orbit above is still tweening. One settle frame is enough.
    setTimeout(ensureCoverHotspot, 420);
  }

  /* Only ever leaves INSPECTION. While the reader is open the exit control and
   * the scrim are underneath its overlay and the key handler below stands
   * down, but the guard is what actually guarantees it: tearing inspection
   * down from under an open reader would reparent the model mid-read and leave
   * 'archive:reader-close' returning to a mode that no longer exists. */
  function exitInspect() {
    if (mode !== 'inspect') return;

    mode = 'tour';

    if (pulseTimer) {
      clearTimeout(pulseTimer);
      pulseTimer = null;
    }
    clearCoverHighlight();

    viewer.removeEventListener('pointerdown', onViewerPointerDown);
    viewer.removeEventListener('pointermove', onViewerPointerMove);
    viewer.removeEventListener('click', onViewerClick);
    document.removeEventListener('keydown', onInspectKeydown);
    pointerDownAt = null;

    if (coverHotspot && coverHotspot.parentNode) {
      coverHotspot.parentNode.removeChild(coverHotspot);
      coverHotspot = null;
    }

    if (wrapper) {
      wrapper.appendChild(viewer); // back into the panorama hotspot
      wrapper.classList.remove('is-inspecting');
    }
    applyRestingAttributes();

    if (overlay) {
      // `.is-closing` fades it out AND makes it inert for the fade, so the
      // dying overlay cannot swallow taps meant for the tour underneath.
      overlay.classList.add('is-closing');
      // Stay in the DOM for the fade, then out of the accessibility tree.
      setTimeout(function () {
        if (mode !== 'tour') return; // re-entered mid-fade; leave it open
        overlay.hidden = true;
        overlay.classList.remove('is-closing');
      }, 280);
    }

    var bridge = window.__tourBridge;
    if (bridge && typeof bridge.unfreezeView === 'function') bridge.unfreezeView();
  }

  /* Escape leaves inspection — but NOT while the reader is open on top of it.
   * kiosk-archive-book.js binds Escape to closing itself, and both handlers
   * are on document, so an unguarded one here would collapse two steps of the
   * journey on a single key: the visitor closes the book and finds themselves
   * back in the panorama. */
  function onInspectKeydown(event) {
    if (mode !== 'inspect') return;
    if (event.key === 'Escape') {
      event.preventDefault();
      exitInspect();
    }
  }

  /* ── the tour hotspot ─────────────────────────────────────────────────── */

  function buildHotspotElement() {
    wrapper = document.createElement('div');
    wrapper.className = 'tour-charter';
    wrapper.setAttribute('role', 'button');
    wrapper.setAttribute('tabindex', '0');
    wrapper.setAttribute(
      'aria-label',
      'Inspect ' + (config.dataset.charterTitle || "the Citizen's Charter")
    );

    viewer = document.createElement('model-viewer');
    viewer.className = 'tour-charter__model';
    viewer.setAttribute('src', config.dataset.charterModelUrl || '');
    viewer.setAttribute('alt', config.dataset.charterTitle || "Citizen's Charter");
    viewer.setAttribute('autoplay', '');
    viewer.setAttribute('rotation-per-second', '18deg');
    viewer.setAttribute('interaction-prompt', 'none');
    viewer.setAttribute('loading', 'eager');
    // What makes the book read as ON the tiles rather than in front of them:
    // model-viewer renders a soft shadow onto its own ground plane, and that
    // contact patch is the only depth cue available. The panorama is a
    // photograph, so there is no real floor for the model to intersect and
    // nothing else can anchor it.
    viewer.setAttribute('shadow-intensity', '1');
    viewer.setAttribute('shadow-softness', '0.75');
    applyRestingAttributes();
    if (config.dataset.charterCoverUrl) {
      // Falls back to the archive's own cover while the GLB streams in, and
      // stays as the visible content if WebGL is unavailable at all.
      viewer.setAttribute('poster', config.dataset.charterCoverUrl);
    }

    var label = document.createElement('span');
    label.className = 'tour-charter__label';
    label.textContent = config.dataset.charterTitle || "Citizen's Charter";

    // Label first: the book now sits on the floor, so a caption below it would
    // be printed on the tiles in front of the object it names. Above, it reads
    // as a sign over the thing. The wrapper's negative margins in
    // tour-charter.css absorb the label's height so the MODEL, not the block,
    // stays centred on the hotspot's yaw/pitch.
    wrapper.appendChild(label);
    wrapper.appendChild(viewer);

    wrapper.addEventListener('click', function (event) {
      // Marzipano's controls treat the hotspot container as part of the
      // panorama drag surface; without this a tap also nudges the view.
      event.stopPropagation();
      enterInspect();
    });
    wrapper.addEventListener('keydown', function (event) {
      if (event.key === 'Enter' || event.key === ' ') {
        event.preventDefault();
        enterInspect();
      }
    });

    return wrapper;
  }

  function mount(scene) {
    if (mounted || !scene) return;
    mounted = true;
    var element = buildHotspotElement();
    scene.hotspotContainer().createHotspot(element, { yaw: yaw, pitch: pitch });
    loadModelViewer().catch(function () {
      // The poster image is already in place; a failed library load leaves a
      // tappable cover rather than an empty box. enterInspect() sees
      // modelViewerReady === false and opens the reader directly, so the
      // document stays reachable with no 3D at all.
    });
  }

  if (exitButton) exitButton.addEventListener('click', exitInspect);
  if (scrim) scrim.addEventListener('click', exitInspect);

  /* Closing the reader comes back to inspection, not to the tour: the visitor
   * was holding the book when they opened it. Guarded on `mode` so the
   * archives carousel's own reader — same event, different page — cannot drag
   * this overlay open. */
  document.addEventListener('archive:reader-close', function () {
    if (mode !== 'reader') return;
    mode = 'inspect';
    if (overlay) overlay.classList.remove('is-reading');
  });

  document.addEventListener('tour:scene-created', function (event) {
    var detail = event.detail || {};
    if (detail.id !== sceneId) return;
    mount(detail.scene);
  });

  // Fallback for the case where this bundle evaluates after kiosk-tour.js has
  // already built its scenes.
  document.addEventListener('tour:ready', function () {
    if (mounted) return;
    var bridge = window.__tourBridge;
    if (!bridge || typeof bridge.findSceneById !== 'function') return;
    var found = bridge.findSceneById(sceneId);
    if (found && found.scene) mount(found.scene);
  });
})();
