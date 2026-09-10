/*
 * Copyright 2016 Google Inc. All rights reserved.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *   http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */
'use strict';

function loadTourScript(src) {
  return new Promise(function(resolve, reject) {
    var existing = document.querySelector('script[src="' + src + '"]');
    if (existing) {
      if (existing.dataset.loaded === 'true') {
        resolve();
      } else {
        existing.addEventListener('load', resolve);
        existing.addEventListener('error', reject);
      }
      return;
    }

    var script = document.createElement('script');
    script.src = src;
    script.defer = true;
    script.dataset.loaded = 'false';
    script.addEventListener('load', function() {
      script.dataset.loaded = 'true';
      resolve();
    });
    script.addEventListener('error', reject);
    document.head.appendChild(script);
  });
}

function setTourMessage(message) {
  var helper = document.querySelector('.tour-helper');
  if (helper && message) {
    helper.textContent = message;
  }
}

function ensureTourDependencies() {
  var loaders = [];
  if (!window.bowser) {
    loaders.push(loadTourScript('/pano/vendor/bowser.min.js'));
  }
  if (!window.screenfull) {
    loaders.push(loadTourScript('/pano/vendor/screenfull.min.js'));
  }
  if (!window.Marzipano) {
    loaders.push(
      loadTourScript('/pano/vendor/marzipano.js').catch(function() {
        return loadTourScript('https://unpkg.com/marzipano/dist/marzipano.js');
      })
    );
  }
  return Promise.all(loaders);
}

function initTour() {
  var Marzipano = window.Marzipano;
  var bowser = window.bowser || {};
  var screenfull = window.screenfull;
  var data = window.APP_DATA || { scenes: [], settings: {} };

  if (!Marzipano) {
    setTourMessage('Virtual tour assets failed to load. Please reload or check the pano vendor files.');
    return;
  }

  // Grab elements from DOM.
  var panoElement = document.querySelector('#pano');
  var sceneNameElement = document.querySelector('#titleBar .sceneName');
  var sceneListElement = document.querySelector('#sceneList');
  var sceneElements = sceneListElement ? sceneListElement.querySelectorAll('.scene') : [];
  var sceneListToggleElement = document.querySelector('#sceneListToggle');
  var autorotateToggleElement = document.querySelector('#autorotateToggle');
  var fullscreenToggleElement = document.querySelector('#fullscreenToggle');
  var viewportElement = document.querySelector('.tour-viewport');
  var tourStarted = false;

  // Detect desktop or mobile mode.
  if (window.matchMedia) {
    var setMode = function() {
      if (mql.matches) {
        document.body.classList.remove('desktop');
        document.body.classList.add('mobile');
      } else {
        document.body.classList.remove('mobile');
        document.body.classList.add('desktop');
      }
    };
    var mql = matchMedia("(max-width: 500px), (max-height: 500px)");
    setMode();
    mql.addListener(setMode);
  } else {
    document.body.classList.add('desktop');
  }

  // Detect whether we are on a touch device.
  document.body.classList.add('no-touch');
  window.addEventListener('touchstart', function() {
    document.body.classList.remove('no-touch');
    document.body.classList.add('touch');
  });

  // Use tooltip fallback mode on IE < 11.
  if (bowser.msie && parseFloat(bowser.version) < 11) {
    document.body.classList.add('tooltip-fallback');
  }

  // Viewer options.
  var viewerOpts = {
    controls: {
      mouseViewMode: data.settings.mouseViewMode || 'drag'
    }
  };

  // Initialize viewer.
  var viewer = new Marzipano.Viewer(panoElement, viewerOpts);

  // Rectilinear-view FOV bounds. Shared between the view limiter (below) and
  // the warp's wide entry, so the wide starting FOV can never exceed maxFov
  // and get silently clamped. Raise FOV_MAX here for a more dramatic entry.
  var FOV_MIN = 100 * Math.PI / 180;
  var FOV_MAX = 120 * Math.PI / 180;

  // Create scenes.
  // Track everything needed by the search/route module appended below.
  // We populate `window.__tourBridge` once scenes + switchScene exist so
  // the bridge can wire up the search overlay without reaching into the
  // initTour closure.
  var scenes = data.scenes.map(function(data) {
    var urlPrefix = "/pano/tiles";
    var source = Marzipano.ImageUrlSource.fromString(
      urlPrefix + "/" + data.id + "/{z}/{f}/{y}/{x}.jpg",
      { cubeMapPreviewUrl: urlPrefix + "/" + data.id + "/preview.jpg" });
    var geometry = new Marzipano.CubeGeometry(data.levels);

    var limiter = Marzipano.RectilinearView.limit.traditional(data.faceSize, FOV_MIN, FOV_MAX);
    var view = new Marzipano.RectilinearView(data.initialViewParameters, limiter);

    var scene = viewer.createScene({
      source: source,
      geometry: geometry,
      view: view,
      pinFirstLevel: true
    });

    // Create link hotspots.
    data.linkHotspots.forEach(function(hotspot) {
      var element = createLinkHotspotElement(hotspot);
      scene.hotspotContainer().createHotspot(element, { yaw: hotspot.yaw, pitch: hotspot.pitch });
    });

    // Create info hotspots.
    data.infoHotspots.forEach(function(hotspot) {
      var element = createInfoHotspotElement(hotspot);
      scene.hotspotContainer().createHotspot(element, { yaw: hotspot.yaw, pitch: hotspot.pitch });
    });

    // Announce the scene so other bundles can attach their own hotspots
    // without importing this closure. tour-charter.js uses this to hang the
    // 3D citizen's charter in scene 0-jst-1 — the alternative was putting
    // WebGL/model-viewer code inside this already-large file.
    document.dispatchEvent(new CustomEvent('tour:scene-created', {
      detail: { id: data.id, scene: scene }
    }));

    return {
      data: data,
      scene: scene,
      view: view
    };
  });

  // Set up autorotate, if enabled.
  var autorotate = Marzipano.autorotate({
    yawSpeed: 0.03,
    targetPitch: 0,
    targetFov: Math.PI/2
  });
  var autorotateEnabled = !!data.settings.autorotateEnabled;
  if (autorotateToggleElement) {
    if (autorotateEnabled) {
      autorotateToggleElement.classList.add('enabled');
    }
    // Set handler for autorotate toggle.
    autorotateToggleElement.addEventListener('click', toggleAutorotate);
  }

  // Set up fullscreen mode, if supported.
  if (fullscreenToggleElement && screenfull && screenfull.enabled && data.settings.fullscreenButton) {
    document.body.classList.add('fullscreen-enabled');
    fullscreenToggleElement.addEventListener('click', function() {
      screenfull.toggle();
    });
    screenfull.on('change', function() {
      if (screenfull.isFullscreen) {
        fullscreenToggleElement.classList.add('enabled');
      } else {
        fullscreenToggleElement.classList.remove('enabled');
      }
    });
  } else {
    document.body.classList.add('fullscreen-disabled');
  }

  // Set handler for scene list toggle.
  if (sceneListToggleElement) {
    sceneListToggleElement.addEventListener('click', toggleSceneList);
  }

  // Start with the scene list open on desktop.
  if (sceneListElement && sceneListToggleElement && !document.body.classList.contains('mobile')) {
    showSceneList();
  }

  // Set handler for scene switch.
  scenes.forEach(function(scene) {
    if (!sceneListElement) {
      return;
    }
    var el = sceneListElement.querySelector('.scene[data-id="' + scene.data.id + '"]');
    if (!el) {
      return;
    }
    el.addEventListener('click', function() {
      switchScene(scene);
      // On mobile, hide scene list after selecting a scene.
      if (document.body.classList.contains('mobile')) {
        hideSceneList();
      }
    });
  });

  // DOM elements for view controls.
  var viewUpElement = document.querySelector('#viewUp');
  var viewDownElement = document.querySelector('#viewDown');
  var viewLeftElement = document.querySelector('#viewLeft');
  var viewRightElement = document.querySelector('#viewRight');
  var viewInElement = document.querySelector('#viewIn');
  var viewOutElement = document.querySelector('#viewOut');

  // Dynamic parameters for controls.
  var velocity = 0.7;
  var friction = 3;

  // Associate view controls with elements.
  var controls = viewer.controls();
  if (viewUpElement && viewDownElement && viewLeftElement && viewRightElement && viewInElement && viewOutElement) {
    controls.registerMethod('upElement',    new Marzipano.ElementPressControlMethod(viewUpElement,     'y', -velocity, friction), true);
    controls.registerMethod('downElement',  new Marzipano.ElementPressControlMethod(viewDownElement,   'y',  velocity, friction), true);
    controls.registerMethod('leftElement',  new Marzipano.ElementPressControlMethod(viewLeftElement,   'x', -velocity, friction), true);
    controls.registerMethod('rightElement', new Marzipano.ElementPressControlMethod(viewRightElement,  'x',  velocity, friction), true);
    controls.registerMethod('inElement',    new Marzipano.ElementPressControlMethod(viewInElement,  'zoom', -velocity, friction), true);
    controls.registerMethod('outElement',   new Marzipano.ElementPressControlMethod(viewOutElement, 'zoom',  velocity, friction), true);
  }

  function sanitize(s) {
    return s.replace('&', '&amp;').replace('<', '&lt;').replace('>', '&gt;');
  }

  var MENU_CROSSFADE_MS = 450; // plain crossfade for scene-list jumps (no dolly)

  // ── Turn-then-travel tuning ────────────────────────────────────
  // Street View turns to face the arrow BEFORE moving. This short
  // `lookTo` head-turn runs ahead of the warp; because the camera ends
  // it already facing the travel heading, the warp's own outgoing pan
  // becomes a no-op and reads as a clean straight push-in.
  var TURN = {
    durationMs:   350,  // head-turn to face the arrow before the warp
    skipBelowDeg: 10,   // already facing it (e.g. chevron dead ahead) → skip the turn
    narrowFov:    0     // optional FOV multiplier during the turn; 0 = keep current FOV
  };

  function lerp(a, b, t) { return a + (b - a) * t; }
  function clamp01(t) { return t < 0 ? 0 : (t > 1 ? 1 : t); }
  function lerpAngle(a, b, t) {
    var d = b - a;
    while (d >  Math.PI) d -= 2 * Math.PI;
    while (d < -Math.PI) d += 2 * Math.PI;
    return a + d * t;
  }
  var warping = false;

  // Menu / non-directional jumps: a plain opacity crossfade, no dolly.
  function switchScene(scene) {
    if (warping || !scene) return;
    warping = true;
    stopAutorotate();
    scene.view.setParameters(scene.data.initialViewParameters);
    scene.scene.switchTo({ transitionDuration: MENU_CROSSFADE_MS }, function () {
      warping = false;
      startAutorotate();
    });
    updateSceneName(scene);
    updateSceneList(scene);
  }

  // ── moveToScene: orchestrate the turn-then-travel navigation ───
  // Street View first rotates to face the arrow, then moves. We mirror
  // that: a short `lookTo` head-turn to the travel heading, then the warp
  // (startWarp). If the camera is already facing the arrow, or lookTo is
  // unavailable, we skip straight to the warp. Falls back to switchScene
  // when there is no current scene to depart from.
  function moveToScene(newSceneObj, hotspot) {
    // Ignore clicks while a transition is running so rapid taps can't stack
    // transitions or strand the viewer mid-effect.
    if (warping || !newSceneObj || !hotspot) return;

    var currentScene = currentSceneObj();
    if (!currentScene) { switchScene(newSceneObj); return; }

    // How far we must rotate to face the clicked arrow.
    var startYaw = currentScene.view.yaw();
    var turnRad  = Math.abs(angleDelta(startYaw, hotspot.yaw));
    var skipRad  = TURN.skipBelowDeg * Math.PI / 180;

    // Already facing the arrow (e.g. a chevron dead ahead), or no lookTo
    // to animate with → warp straight away without the pre-turn.
    if (turnRad < skipRad || typeof viewer.lookTo !== 'function') {
      startWarp(currentScene, newSceneObj, hotspot);
      return;
    }

    // Turn-then-travel: hold the guard across the whole beat, rotate to the
    // travel heading, then hand off to the warp.
    warping = true;
    stopAutorotate();
    viewer.controls().disable();

    var didWarp = false;
    var runWarp = function () {
      if (didWarp) return;
      didWarp = true;
      // startWarp re-enables controls and clears `warping` when it lands.
      startWarp(currentScene, newSceneObj, hotspot);
    };

    try {
      var look = { yaw: hotspot.yaw, pitch: hotspot.pitch };
      if (TURN.narrowFov) look.fov = Math.max(0.3, currentScene.view.fov() * TURN.narrowFov);
      viewer.lookTo(look, { transitionDuration: TURN.durationMs, shortest: true }, runWarp);
      // Safety net: if the tween never reports done, warp anyway.
      setTimeout(runWarp, TURN.durationMs + 120);
    } catch (err) {
      runWarp();
    }
  }

  // ── startWarp: Street-View zoom-blend transition ────────────────
  // The "fake it with an overlay" trick, done natively in Marzipano: the
  // destination scene's layer is added to the stage ON TOP of the current
  // one at opacity 0, then the FOV eases down (zoom in) while that opacity
  // eases up to 1. Both scenes are driven by ONE identical camera each
  // frame, which is what makes the cross-fade read as a step forward
  // rather than a dissolve between two different headings.
  //
  // This costs zero extra bytes and zero server CPU: scenes are created
  // with `pinFirstLevel: true`, so every scene's lowest level is already
  // resident and the blend has real imagery on frame 1.
  //
  // Ordering that must not change: the temp layer has to come OFF the
  // stage BEFORE switchTo(), or Marzipano throws 'Stage not in sync with
  // viewer' — and a leaked layer breaks every FUTURE scene switch, not
  // just this one. removeTempLayers() is idempotent and runs on every
  // exit path, including errors.
  function easeInOutCubic(t) {
    return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
  }

  var WARP = {
    blendMs:      700,   // zoom-in while the destination fades 0 -> 1
    settleMs:     400,   // after the instant switch: FOV back out to base
    zoomStrength: 0.38,  // fraction of the live FOV shed at the deepest point
    easing:       easeInOutCubic
  };

  function startWarp(currentScene, newSceneObj, hotspot) {
    var outgoingHotspots = currentScene.scene.hotspotContainer().domElement();
    var incomingHotspots = newSceneObj.scene.hotspotContainer().domElement();
    var stage      = viewer.stage();
    var fromView   = currentScene.view;
    var toView     = newSceneObj.view;
    var destLayers = [];
    var rafId      = null;

    function restoreHotspots() {
      outgoingHotspots.style.opacity = '';
      incomingHotspots.style.opacity = '';
    }

    function cancelTween() {
      if (rafId) { cancelAnimationFrame(rafId); rafId = null; }
    }

    // Idempotent (destLayers is emptied), and the one thing that must
    // never fail — see the ordering note above.
    function removeTempLayers() {
      destLayers.forEach(function (layer) {
        try { if (stage.hasLayer(layer)) stage.removeLayer(layer); } catch (e) {}
        try { layer.mergeEffects({ opacity: 1 }); } catch (e) {}
      });
      destLayers = [];
    }

    function bail() {
      cancelTween();
      removeTempLayers();
      restoreHotspots();
      try { viewer.controls().enable(); } catch (e) {}
      warping = false;
      switchScene(newSceneObj);
    }

    // rAF tween over `duration` ms; step(p) receives eased 0..1 progress.
    // Tracked via the shared rafId so a half-finished tween can be cancelled.
    function tween(duration, step, done) {
      var start = performance.now();
      function frame(now) {
        var t = Math.min(1, (now - start) / duration);
        try {
          step(WARP.easing(t));
        } catch (e) {
          bail();
          return;
        }
        if (t < 1) {
          rafId = requestAnimationFrame(frame);
        } else {
          rafId = null;
          done();
        }
      }
      rafId = requestAnimationFrame(frame);
    }

    try {
      warping = true;
      stopAutorotate();
      viewer.controls().disable();
      // Kill any lookTo movement still running from moveToScene's pre-turn:
      // it rewrites every view param (including fov) each frame and would
      // fight our tween.
      if (typeof viewer.stopMovement === 'function') viewer.stopMovement();

      outgoingHotspots.style.opacity = 0;
      incomingHotspots.style.opacity = 0;

      var startYaw   = fromView.yaw();
      var startPitch = fromView.pitch();
      var startFov   = fromView.fov();
      var troughFov  = startFov * (1 - WARP.zoomStrength);

      var initial      = newSceneObj.data.initialViewParameters || {};
      var baseFov      = typeof initial.fov === 'number' ? initial.fov : startFov;
      var landingYaw   = typeof hotspot.targetYaw === 'number' ? hotspot.targetYaw : hotspot.yaw;
      var landingPitch = typeof initial.pitch === 'number' ? initial.pitch : 0;

      // Destination goes on top of the stage, invisible to start.
      destLayers = newSceneObj.scene.listLayers();
      destLayers.forEach(function (layer) {
        layer.mergeEffects({ opacity: 0 });
        stage.addLayer(layer);
      });

      // ── Phase A: zoom in while the destination fades up over it.
      tween(WARP.blendMs, function (p) {
        var params = {
          yaw:   lerpAngle(startYaw,   hotspot.yaw,   p),
          pitch: lerpAngle(startPitch, hotspot.pitch, p),
          fov:   lerp(startFov, troughFov, p)
        };
        // One camera, both panoramas.
        fromView.setParameters(params);
        toView.setParameters(params);
        destLayers.forEach(function (layer) {
          layer.mergeEffects({ opacity: p });
        });
      }, function () {
        // ── Handoff: temp layers off the stage FIRST, then switch with no
        // transition. The destination is already fully opaque at this exact
        // camera, so the swap is an invisible frame.
        var handoff = { yaw: hotspot.yaw, pitch: hotspot.pitch, fov: troughFov };
        removeTempLayers();
        toView.setParameters(handoff);

        newSceneObj.scene.switchTo({
          transitionDuration: 0,
          // Marzipano's default update would drive opacity from 0 for one
          // frame; pin it at 1 so there is no flicker at the swap.
          transitionUpdate: function (val, newScene) {
            newScene.listLayers().forEach(function (layer) {
              layer.mergeEffects({ opacity: 1 });
            });
          }
        }, function () {
          // Leave the departed scene at rest so it isn't still zoomed in if
          // the visitor returns to it later.
          currentScene.view.setParameters(currentScene.data.initialViewParameters);
          updateSceneName(newSceneObj);
          updateSceneList(newSceneObj);

          // ── Phase B: settle back out to the destination's normal FOV.
          // This is the arrival, and it's what removes the zoom pop.
          tween(WARP.settleMs, function (p) {
            toView.setParameters({
              yaw:   lerpAngle(handoff.yaw,   landingYaw,   p),
              pitch: lerpAngle(handoff.pitch, landingPitch, p),
              fov:   lerp(troughFov, baseFov, p)
            });
          }, function () {
            restoreHotspots();
            viewer.controls().enable();
            warping = false;
            startAutorotate();
          });
        });
      });
    } catch (err) {
      bail();
    }
  }

  function updateSceneName(scene) {
    if (sceneNameElement) {
      sceneNameElement.innerHTML = sanitize(scene.data.name);
    }
  }

  function updateSceneList(scene) {
    for (var i = 0; i < sceneElements.length; i++) {
      var el = sceneElements[i];
      if (el.getAttribute('data-id') === scene.data.id) {
        el.classList.add('current');
      } else {
        el.classList.remove('current');
      }
    }
  }

  function showSceneList() {
    if (!sceneListElement || !sceneListToggleElement) {
      return;
    }
    sceneListElement.classList.add('enabled');
    sceneListToggleElement.classList.add('enabled');
  }

  function hideSceneList() {
    if (!sceneListElement || !sceneListToggleElement) {
      return;
    }
    sceneListElement.classList.remove('enabled');
    sceneListToggleElement.classList.remove('enabled');
  }

  function toggleSceneList() {
    if (!sceneListElement || !sceneListToggleElement) {
      return;
    }
    sceneListElement.classList.toggle('enabled');
    sceneListToggleElement.classList.toggle('enabled');
  }

  function startAutorotate() {
    if (!autorotateEnabled) {
      return;
    }
    viewer.startMovement(autorotate);
    viewer.setIdleMovement(3000, autorotate);
  }

  function stopAutorotate() {
    viewer.stopMovement();
    viewer.setIdleMovement(Infinity);
  }

  /* Freeze/thaw the panorama for an overlay that takes over the screen.
   *
   * Published on window.__tourBridge; see publishTourBridge(). Deliberately
   * built out of the same two primitives a scene warp uses, so a freeze during
   * a warp cannot leave the viewer in a state the warp doesn't recognise.
   *
   * unfreezeView bails while `warping` is set: startWarp() re-enables controls
   * and restarts autorotate itself when it lands (see its `done` handler), so
   * thawing mid-flight would hand back a panorama that is still tweening under
   * the visitor's finger. Skipping is safe precisely because the warp will do
   * it a moment later. */
  function freezeView() {
    stopAutorotate();
    try { viewer.controls().disable(); } catch (e) {}
  }

  function unfreezeView() {
    if (warping) return;
    try { viewer.controls().enable(); } catch (e) {}
    startAutorotate();
  }

  function toggleAutorotate() {
    autorotateEnabled = !autorotateEnabled;
    if (autorotateToggleElement) {
      autorotateToggleElement.classList.toggle('enabled', autorotateEnabled);
    }
    if (autorotateEnabled) {
      startAutorotate();
    } else {
      stopAutorotate();
    }
  }

  function createLinkHotspotElement(hotspot) {

    // Create wrapper element to hold icon and tooltip.
    var wrapper = document.createElement('div');
    wrapper.classList.add('hotspot');
    wrapper.classList.add('link-hotspot');

    // Create image element.
    var icon = document.createElement('img');
    icon.src = '/pano/img/link.png';
    icon.classList.add('link-hotspot-icon');

    // Set rotation transform.
    var transformProperties = [ '-ms-transform', '-webkit-transform', 'transform' ];
    for (var i = 0; i < transformProperties.length; i++) {
      var property = transformProperties[i];
      icon.style[property] = 'rotate(' + hotspot.rotation + 'rad)';
    }

    // Add click event handler — move to the target scene.
    wrapper.addEventListener('click', function() {
      var target = findSceneById(hotspot.target);
      if (target) moveToScene(target, hotspot);
    });

    // Prevent touch and scroll events from reaching the parent element.
    // This prevents the view control logic from interfering with the hotspot.
    stopTouchAndScrollEventPropagation(wrapper);

    // Create tooltip element.
    var tooltip = document.createElement('div');
    tooltip.classList.add('hotspot-tooltip');
    tooltip.classList.add('link-hotspot-tooltip');
    tooltip.innerHTML = findSceneDataById(hotspot.target).name;

    wrapper.appendChild(icon);
    wrapper.appendChild(tooltip);

    return wrapper;
  }

  function createInfoHotspotElement(hotspot) {

    // Create wrapper element to hold icon and tooltip.
    var wrapper = document.createElement('div');
    wrapper.classList.add('hotspot');
    wrapper.classList.add('info-hotspot');

    // Create hotspot/tooltip header.
    var header = document.createElement('div');
    header.classList.add('info-hotspot-header');

    // Create image element.
    var iconWrapper = document.createElement('div');
    iconWrapper.classList.add('info-hotspot-icon-wrapper');
    var icon = document.createElement('img');
    icon.src = '/pano/img/info.png';
    icon.classList.add('info-hotspot-icon');
    iconWrapper.appendChild(icon);

    // Create title element.
    var titleWrapper = document.createElement('div');
    titleWrapper.classList.add('info-hotspot-title-wrapper');
    var title = document.createElement('div');
    title.classList.add('info-hotspot-title');
    title.innerHTML = hotspot.title;
    titleWrapper.appendChild(title);

    // Create close element.
    var closeWrapper = document.createElement('div');
    closeWrapper.classList.add('info-hotspot-close-wrapper');
    var closeIcon = document.createElement('img');
    closeIcon.src = '/pano/img/close.png';
    closeIcon.classList.add('info-hotspot-close-icon');
    closeWrapper.appendChild(closeIcon);

    // Construct header element.
    header.appendChild(iconWrapper);
    header.appendChild(titleWrapper);
    header.appendChild(closeWrapper);

    // Create text element.
    var text = document.createElement('div');
    text.classList.add('info-hotspot-text');
    text.innerHTML = hotspot.text;

    // Place header and text into wrapper element.
    wrapper.appendChild(header);
    wrapper.appendChild(text);

    // Create a modal for the hotspot content to appear on mobile mode.
    var modal = document.createElement('div');
    modal.innerHTML = wrapper.innerHTML;
    modal.classList.add('info-hotspot-modal');
    document.body.appendChild(modal);

    var toggle = function() {
      wrapper.classList.toggle('visible');
      modal.classList.toggle('visible');
    };

    // Show content when hotspot is clicked.
    wrapper.querySelector('.info-hotspot-header').addEventListener('click', toggle);

    // Hide content when close icon is clicked.
    modal.querySelector('.info-hotspot-close-wrapper').addEventListener('click', toggle);

    // Prevent touch and scroll events from reaching the parent element.
    // This prevents the view control logic from interfering with the hotspot.
    stopTouchAndScrollEventPropagation(wrapper);

    return wrapper;
  }

  // Prevent touch and scroll events from reaching the parent element.
  function stopTouchAndScrollEventPropagation(element, eventList) {
    var eventList = [ 'touchstart', 'touchmove', 'touchend', 'touchcancel',
                      'wheel', 'mousewheel' ];
    for (var i = 0; i < eventList.length; i++) {
      element.addEventListener(eventList[i], function(event) {
        event.stopPropagation();
      });
    }
  }

  // ════════════════════════════════════════════════════════════════
  //  Feature 2 — Street-View-style cursor ground indicator
  //
  //  A translucent disc glides along the ground under the cursor and
  //  morphs into a directional chevron when the cursor points along a
  //  navigation path; clicking the chevron warps down that path. It is
  //  a single pointer-events:none overlay reprojected each animation
  //  frame from yaw/pitch, so it never fights Marzipano's drag-to-look
  //  and does no per-frame layout. Mouse/hover only — touchscreens keep
  //  the static arrows (handled by the `hoverCapable` gate below).
  // ════════════════════════════════════════════════════════════════

  var NAV = {
    groundPitchMin: 0.15,  // rad below the horizon before the disc appears
    snapYawDeg:     25,    // cursor within this yaw of a link → chevron
    discBasePx:     120,   // intrinsic element size; scaled per-frame
    discMinScale:   0.34,  // size factor at the horizon (far)
    discMaxScale:   1.0,   // size factor underfoot (near)
    flattenFar:     0.32,  // vertical squash near the horizon (flat ellipse)
    flattenNear:    0.78,  // vertical squash underfoot (rounder)
    dragThreshold:  6,     // px of movement that counts as a drag, not a click
    noPathPulse:    false  // pulse the disc when clicking ground with no path
  };

  var gi = null; // ground-indicator state, populated by initGroundIndicator()

  function currentSceneObj() {
    var s = viewer.scene();
    for (var i = 0; i < scenes.length; i++) {
      if (scenes[i].scene === s) return scenes[i];
    }
    return null;
  }

  // Smallest signed angular difference a→b, in (-π, π].
  function angleDelta(a, b) {
    var d = b - a;
    while (d >  Math.PI) d -= 2 * Math.PI;
    while (d < -Math.PI) d += 2 * Math.PI;
    return d;
  }

  function buildIndicatorElement() {
    var wrap = document.createElement('div');
    wrap.className = 'ground-indicator';
    // Disc: a flattened ring drawn as an SVG ellipse.
    var disc = document.createElement('div');
    disc.className = 'ground-indicator__disc';
    disc.innerHTML =
      '<svg viewBox="0 0 120 120" width="120" height="120" aria-hidden="true">' +
        '<ellipse cx="60" cy="60" rx="54" ry="54" class="gi-ring"></ellipse>' +
        '<ellipse cx="60" cy="60" rx="20" ry="20" class="gi-dot"></ellipse>' +
      '</svg>';
    // Chevron: an arrow that points along the snapped path.
    var chev = document.createElement('div');
    chev.className = 'ground-indicator__chevron';
    chev.innerHTML =
      '<svg viewBox="0 0 120 120" width="120" height="120" aria-hidden="true">' +
        '<path d="M60 24 L96 84 L60 66 L24 84 Z" class="gi-arrow"></path>' +
      '</svg>';
    wrap.appendChild(disc);
    wrap.appendChild(chev);
    return { wrap: wrap, disc: disc, chev: chev };
  }

  function initGroundIndicator() {
    if (gi || !panoElement || !viewer) return;

    // Hover/mouse only. Touchscreens (incl. the kiosk) keep the static
    // arrows and never see the disc — there is no cursor to follow.
    var hoverCapable = !window.matchMedia ||
      window.matchMedia('(hover: hover) and (pointer: fine)').matches;
    if (!hoverCapable) return;

    var el = buildIndicatorElement();
    panoElement.appendChild(el.wrap);
    document.body.classList.add('nav-indicator-on'); // CSS hides static arrows

    gi = {
      el: el,
      cx: 0, cy: 0,        // last cursor pos relative to #pano
      inside: false,
      down: false, downX: 0, downY: 0, dragged: false,
      armed: null,         // linkHotspot the cursor is currently snapped to
      raf: 0,
      pulseUntil: 0
    };

    var rect = function () { return panoElement.getBoundingClientRect(); };

    // Pointer tracking. Passive + never preventDefault/stopPropagation, so
    // Marzipano's own drag controls keep working untouched.
    panoElement.addEventListener('pointermove', function (e) {
      if (e.pointerType === 'touch') return;
      var r = rect();
      gi.cx = e.clientX - r.left;
      gi.cy = e.clientY - r.top;
      gi.inside = true;
      if (gi.down) {
        var dx = e.clientX - gi.downX, dy = e.clientY - gi.downY;
        if (dx * dx + dy * dy > NAV.dragThreshold * NAV.dragThreshold) gi.dragged = true;
      }
    }, { passive: true });

    panoElement.addEventListener('pointerdown', function (e) {
      if (e.pointerType === 'touch') return;
      gi.down = true; gi.dragged = false;
      gi.downX = e.clientX; gi.downY = e.clientY;
    }, { passive: true });

    panoElement.addEventListener('pointerup', function (e) {
      if (e.pointerType === 'touch') return;
      var wasClick = gi.down && !gi.dragged;
      gi.down = false;
      if (!wasClick || warping) return;
      if (gi.armed) {
        var target = findSceneById(gi.armed.target);
        if (target) moveToScene(target, gi.armed);
      } else if (NAV.noPathPulse) {
        gi.pulseUntil = performance.now() + 320;
      }
    }, { passive: true });

    panoElement.addEventListener('pointerleave', function () {
      gi.inside = false;
    }, { passive: true });

    function frame() {
      updateIndicator();
      gi.raf = requestAnimationFrame(frame);
    }
    gi.raf = requestAnimationFrame(frame);
  }

  function hideIndicator() {
    if (gi) {
      gi.el.wrap.classList.remove('is-visible', 'is-snapped', 'is-pulse');
      gi.armed = null;
    }
    if (panoElement) panoElement.style.cursor = '';
  }

  function updateIndicator() {
    if (!gi) return;

    // Never compete with a drag, a warp, or an off-canvas cursor.
    if (!gi.inside || gi.dragged || warping) { hideIndicator(); return; }

    var sceneObj = currentSceneObj();
    var view = sceneObj && sceneObj.view;
    if (!view) { hideIndicator(); return; }

    var ground = view.screenToCoordinates({ x: gi.cx, y: gi.cy });
    if (!ground || ground.pitch < NAV.groundPitchMin) { hideIndicator(); return; }

    // Perspective: flatter + smaller toward the horizon, rounder + larger
    // underfoot. Derive both from how far below the horizon we point.
    var span = (Math.PI / 2) - NAV.groundPitchMin;
    var t = clamp01((ground.pitch - NAV.groundPitchMin) / span);
    var scale   = lerp(NAV.discMinScale, NAV.discMaxScale, t);
    var flatten = lerp(NAV.flattenFar,   NAV.flattenNear,  t);

    var screen = view.coordinatesToScreen({ yaw: ground.yaw, pitch: ground.pitch });
    if (!screen) { hideIndicator(); return; }

    // Snap test: nearest navigation link within the yaw threshold.
    var links = (sceneObj.data.linkHotspots || []);
    var snapRad = NAV.snapYawDeg * Math.PI / 180;
    var best = null, bestAbs = snapRad;
    for (var i = 0; i < links.length; i++) {
      var d = Math.abs(angleDelta(ground.yaw, links[i].yaw));
      if (d < bestAbs) { bestAbs = d; best = links[i]; }
    }
    gi.armed = best;

    var wrap = gi.el.wrap;
    wrap.classList.add('is-visible');
    // Position the wrapper at the ground point (its own transform centers it).
    wrap.style.transform = 'translate(' + screen.x + 'px,' + screen.y + 'px)';

    if (best) {
      // Chevron pointing along the path: project a point a bit further along
      // the link's yaw and aim the arrow at it in screen space.
      wrap.classList.add('is-snapped');
      var ahead = view.coordinatesToScreen({
        yaw: best.yaw,
        pitch: Math.min(ground.pitch + 0.12, Math.PI / 2)
      });
      var ang = 0;
      if (ahead) ang = Math.atan2(ahead.y - screen.y, ahead.x - screen.x) + Math.PI / 2;
      gi.el.chev.style.transform =
        'translate(-50%,-50%) scale(' + scale + ') rotate(' + ang + 'rad)';
      panoElement.style.cursor = 'pointer';
    } else {
      wrap.classList.remove('is-snapped');
      gi.el.disc.style.transform =
        'translate(-50%,-50%) scale(' + scale + ',' + (scale * flatten) + ')';
      panoElement.style.cursor = '';
    }

    wrap.classList.toggle('is-pulse', NAV.noPathPulse && performance.now() < gi.pulseUntil && !best);
  }

  function findSceneById(id) {
    for (var i = 0; i < scenes.length; i++) {
      if (scenes[i].data.id === id) {
        return scenes[i];
      }
    }
    return null;
  }

  function findSceneDataById(id) {
    for (var i = 0; i < data.scenes.length; i++) {
      if (data.scenes[i].id === id) {
        return data.scenes[i];
      }
    }
    return null;
  }

  function startTour() {
    if (tourStarted) {
      return;
    }

    tourStarted = true;
    document.body.classList.add('tour-ready');
    if (viewportElement) {
      viewportElement.setAttribute('aria-hidden', 'false');
    }
    if (panoElement) {
      panoElement.setAttribute('aria-hidden', 'false');
    }
    if (scenes.length) {
      switchScene(scenes[0]);
    }
    initGroundIndicator();
    publishTourBridge();
  }

  function publishTourBridge() {
    window.__tourBridge = {
      scenes: scenes,
      findSceneById: findSceneById,
      switchScene: switchScene,
      // Hold the panorama still while something else owns the screen.
      // tour-charter.js uses this when the 3D charter goes fullscreen for
      // inspection: without it the autorotate keeps turning behind the overlay
      // and a drag that misses the model spins the tour, so the visitor exits
      // inspection somewhere they never chose to be.
      freezeView: freezeView,
      unfreezeView: unfreezeView,
    };
    document.dispatchEvent(new CustomEvent('tour:ready'));
  }

  // The tour opens straight into the panorama — no Start/Exit splash. Tapping
  // "Virtual Tour" on the kiosk menu is already the "start" gesture, and the
  // splash made it two taps to see anything. The way out is the shared kiosk
  // back bar (templates/partials/kiosk-back.html), which is rendered outside
  // this script's reach so a failure in here can never strand a visitor on a
  // dead page with no exit.
  startTour();
}

ensureTourDependencies()
  .then(function() {
    initTour();
  })
  .catch(function() {
    setTourMessage('Virtual tour assets failed to load. Please reload or check the pano vendor files.');
  });

/* ──────────────────────────────────────────────────────────────────
 * Find-a-building search + route overlay (Phase 3).
 *
 * Lifecycle:
 *   1. Fetch /api/locations and /api/tour-scenes in parallel.
 *   2. Build a search index — routable locations + their tour scene_id
 *      if one exists. Unmapped buildings stay searchable but are flagged
 *      so the result row marks them as "no panorama".
 *   3. Search input → suggestions list (debounced).
 *   4. Selecting a result:
 *        - If the building has a panorama and the tour bridge is ready,
 *          switchScene to it.
 *        - Open the route overlay; init Leaflet (once) with the campus
 *          map image overlay and draw a polyline from the kiosk start
 *          to the destination. Same look as the campus map.
 * ────────────────────────────────────────────────────────────────── */
(function() {
  var SEARCH_RESULT_LIMIT = 8;
  var SEARCH_DEBOUNCE_MS = 90;

  var dom = {
    search:        document.getElementById('tour-search'),
    input:         document.getElementById('tour-search-input'),
    clear:         document.getElementById('tour-search-clear'),
    suggestions:   document.getElementById('tour-suggestions'),
    suggestionsList: document.getElementById('tour-suggestions-list'),
    keyboard:      document.getElementById('tour-keyboard'),
    keyboardRows:  document.querySelector('.tour-keyboard__rows'),
    routeOverlay:  document.getElementById('tour-route'),
    routeName:     document.getElementById('tour-route-name'),
    routeType:     document.getElementById('tour-route-type'),
    routeMap:      document.getElementById('tour-route-map'),
    routeClose:    document.getElementById('tour-route-close'),
    routeDismiss:  document.getElementById('tour-route-dismiss'),
    routeVisit:    document.getElementById('tour-route-visit'),
    routeHint:     document.getElementById('tour-route-hint'),
  };

  if (!dom.input || !dom.routeOverlay) {
    return;
  }

  var state = {
    locations: [],
    sceneByLocation: {}, // { location_id: scene_id }
    kioskStart: null,    // [map_y, map_x] pixel position on campus-map.png
    map: null,
    mapBounds: null,
    activeRoute: null,
    startMarker: null,
    destMarker: null,
    pendingSceneId: null,
  };

  /* ── helpers ──────────────────────────────────────────────────── */

  function escapeHtml(value) {
    return String(value == null ? '' : value).replace(/[&<>'"]/g, function(ch) {
      return { '&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;' }[ch] || ch;
    });
  }

  /*
   * The token, with a cached-document fallback. Same reasoning as
   * kiosk-map.js: the markup's token is only as fresh as the cache entry once
   * sw-kiosk.js serves kiosk pages from cache, while GET /kiosk/csrf is
   * no-store and bypassed by the worker. See WelcomeController.csrf.
   */
  var latestCsrfToken = (function () {
    var meta = document.querySelector('meta[name="csrf-token"]');
    if (meta) return meta.getAttribute('content') || '';
    var input = document.querySelector('input[name="__token"]');
    return input ? input.value : '';
  })();

  function csrfToken() {
    return latestCsrfToken;
  }

  fetch('/kiosk/csrf', {
    headers: { Accept: 'application/json' },
    cache: 'no-store',
    credentials: 'same-origin',
  })
    .then(function (res) { return res.ok ? res.json() : null; })
    .then(function (body) { if (body && body.token) latestCsrfToken = body.token; })
    .catch(function () { /* offline; the route-session POST needs the network anyway */ });

  function debounce(fn, wait) {
    var timer = null;
    return function() {
      var args = arguments;
      if (timer) clearTimeout(timer);
      timer = setTimeout(function() { fn.apply(null, args); }, wait);
    };
  }

  /* ── data load ────────────────────────────────────────────────── */

  Promise.all([
    fetch('/api/locations').then(function(r) { return r.json(); }).catch(function() { return []; }),
    fetch('/api/tour-scenes').then(function(r) { return r.json(); }).catch(function() { return []; }),
  ]).then(function(results) {
    var locations = Array.isArray(results[0]) ? results[0] : [];
    var tourScenes = Array.isArray(results[1]) ? results[1] : [];

    state.locations = locations;
    locations.forEach(function(loc) {
      // map_x/map_y are null for a location with no usable coordinates, and
      // Number(null) is 0 -- leaving kioskStart at the CRS origin instead of
      // unset. Check before converting.
      if (loc.is_start && loc.map_y != null && loc.map_x != null) {
        // Pixel position, not the WGS84 on latitude/longitude — this map is
        // campus-map.png under CRS.Simple, same as the campus map page.
        state.kioskStart = [Number(loc.map_y), Number(loc.map_x)];
      }
    });

    tourScenes.forEach(function(row) {
      if (row.location_id && row.scene_id) {
        state.sceneByLocation[row.location_id] = row.scene_id;
      }
    });
  });

  /* ── search ───────────────────────────────────────────────────── */

  function filterLocations(query) {
    var q = String(query || '').trim().toLowerCase();
    if (!q) return [];

    var matches = state.locations.filter(function(loc) {
      if (!loc.is_routable) return false;
      var name = String(loc.name || '').toLowerCase();
      var type = String(loc.type || '').toLowerCase();
      return name.indexOf(q) !== -1 || type.indexOf(q) !== -1;
    });

    return matches.slice(0, SEARCH_RESULT_LIMIT);
  }

  function renderSuggestions(matches, query) {
    if (!query) {
      hideSuggestions();
      return;
    }

    if (!matches.length) {
      dom.suggestionsList.innerHTML =
        '<li class="tour-suggestions__empty">No buildings match &ldquo;' + escapeHtml(query) + '&rdquo;</li>';
      showSuggestions();
      return;
    }

    var html = matches.map(function(loc) {
      var hasScene = !!state.sceneByLocation[loc.id];
      var tagClass = hasScene ? 'tour-suggestions__item-tag' : 'tour-suggestions__item-tag tour-suggestions__item-tag--unavailable';
      var tagLabel = hasScene ? 'PANORAMA' : 'MAP ONLY';
      return ''
        + '<li class="tour-suggestions__item" data-location-id="' + loc.id + '">'
        +   '<span class="tour-suggestions__item-name">' + escapeHtml(loc.name) + '</span>'
        +   '<span class="' + tagClass + '">' + tagLabel + '</span>'
        + '</li>';
    }).join('');

    dom.suggestionsList.innerHTML = html;
    showSuggestions();
  }

  function showSuggestions() {
    dom.suggestions.classList.remove('tour-suggestions--hidden');
  }

  function hideSuggestions() {
    dom.suggestions.classList.add('tour-suggestions--hidden');
  }

  function setSearchValue(value) {
    dom.input.value = value;
    if (value) {
      dom.clear.classList.remove('tour-search-bar__clear--hidden');
    } else {
      dom.clear.classList.add('tour-search-bar__clear--hidden');
    }
    renderSuggestions(filterLocations(value), value);
  }

  /* ── on-screen keyboard (drops up from the bottom) ────────────── */

  var KEYBOARD_LAYOUT = [
    ['q','w','e','r','t','y','u','i','o','p'],
    ['a','s','d','f','g','h','j','k','l'],
    ['z','x','c','v','b','n','m'],
  ];

  function buildKeyboard() {
    if (!dom.keyboardRows) return;
    var rows = KEYBOARD_LAYOUT.map(function(keys) {
      var keyButtons = keys.map(function(key) {
        return '<button class="tour-keyboard__key" data-key="' + key + '">' + key + '</button>';
      }).join('');
      return '<div class="tour-keyboard__row">' + keyButtons + '</div>';
    }).join('');

    var actionRow =
      '<div class="tour-keyboard__row">' +
        '<button class="tour-keyboard__key tour-keyboard__key--wide" data-key="backspace">⌫</button>' +
        '<button class="tour-keyboard__key tour-keyboard__key--space" data-key="space">space</button>' +
        '<button class="tour-keyboard__key tour-keyboard__key--wide" data-key="clear">clear</button>' +
        '<button class="tour-keyboard__key tour-keyboard__key--wide tour-keyboard__key--done" data-key="done">done</button>' +
      '</div>';

    dom.keyboardRows.innerHTML = rows + actionRow;
  }

  function showKeyboard() {
    if (!dom.keyboard) return;
    if (!document.body.classList.contains('tour-ready')) return;
    dom.keyboard.classList.remove('tour-keyboard--collapsed');
    dom.keyboard.setAttribute('aria-hidden', 'false');
  }

  function hideKeyboard() {
    if (!dom.keyboard) return;
    dom.keyboard.classList.add('tour-keyboard--collapsed');
    dom.keyboard.setAttribute('aria-hidden', 'true');
  }

  buildKeyboard();

  if (dom.keyboard) {
    dom.keyboard.addEventListener('click', function(event) {
      var button = event.target.closest('.tour-keyboard__key');
      if (!button) return;
      var key = button.dataset.key;
      var current = dom.input.value;

      if (key === 'backspace') {
        setSearchValue(current.slice(0, -1));
      } else if (key === 'space') {
        setSearchValue(current + ' ');
      } else if (key === 'clear') {
        setSearchValue('');
      } else if (key === 'done') {
        hideKeyboard();
      } else {
        setSearchValue(current + key);
      }
    });
  }

  // Tap the (readonly) input to bring up the on-screen keyboard. The
  // OS keyboard never appears because the input has `readonly`.
  dom.input.addEventListener('click', showKeyboard);
  dom.input.addEventListener('focus', showKeyboard);

  dom.clear.addEventListener('click', function() {
    setSearchValue('');
    showKeyboard();
  });

  dom.suggestionsList.addEventListener('click', function(event) {
    var item = event.target.closest('.tour-suggestions__item');
    if (!item) return;
    var id = parseInt(item.dataset.locationId || '', 10);
    if (!id) return;

    var location = state.locations.find(function(loc) { return loc.id === id; });
    if (!location) return;

    selectLocation(location);
  });

  /* ── selection → route overlay ────────────────────────────────── */

  function selectLocation(location) {
    hideSuggestions();
    hideKeyboard();
    dom.input.blur();

    var sceneId = state.sceneByLocation[location.id];
    if (sceneId && window.__tourBridge) {
      var scene = window.__tourBridge.findSceneById(sceneId);
      if (scene) {
        window.__tourBridge.switchScene(scene);
      }
    } else if (sceneId) {
      // Tour not booted yet — remember and switch when it is.
      state.pendingSceneId = sceneId;
    }

    openRouteOverlay(location);
  }

  document.addEventListener('tour:ready', function() {
    if (!state.pendingSceneId || !window.__tourBridge) return;
    var scene = window.__tourBridge.findSceneById(state.pendingSceneId);
    if (scene) {
      window.__tourBridge.switchScene(scene);
    }
    state.pendingSceneId = null;
  });

  /* ── Leaflet map (lazy init, one instance for the whole tour) ── */

  function ensureMap() {
    if (state.map) return Promise.resolve(state.map);
    if (typeof L === 'undefined') {
      // Leaflet is loaded in the template; if it's missing the route
      // overlay will still appear but the polyline won't render.
      return Promise.reject(new Error('Leaflet not available'));
    }

    var map = L.map(dom.routeMap, {
      attributionControl: false,
      zoomControl: true,
      crs: L.CRS.Simple,
      minZoom: -2,
    });
    state.map = map;

    return new Promise(function(resolve, reject) {
      var img = new Image();
      img.onload = function() {
        var bounds = [[0, 0], [img.height, img.width]];
        state.mapBounds = bounds;
        L.campus25d().addTo(map);
        map.fitBounds(bounds);
        map.setMaxBounds(bounds);
        resolve(map);
      };
      img.onerror = function() { reject(new Error('campus-map.png failed to load')); };
      img.src = '/campus-map.png';
    });
  }

  function buildMarker(latlng, className) {
    return L.marker(latlng, {
      icon: L.divIcon({
        className: 'tour-marker-' + className,
        html: '<div class="' + className + '"></div>',
        iconSize: [0, 0],
        iconAnchor: [0, 0],
      }),
    });
  }

  function routePathFor(location, destinationLatLng) {
    if (location && Array.isArray(location.route) && location.route.length >= 2) {
      return location.route.map(function(point) {
        return [Number(point[0]), Number(point[1])];
      });
    }

    if (!state.kioskStart || !destinationLatLng) return null;
    return [state.kioskStart, destinationLatLng];
  }

  function drawRouteOnMap(map, location, destinationLatLng) {
    if (state.activeRoute) {
      map.removeLayer(state.activeRoute);
    }
    if (state.destMarker) {
      map.removeLayer(state.destMarker);
    }
    if (!state.startMarker && state.kioskStart) {
      state.startMarker = buildMarker(state.kioskStart, 'tour-here').addTo(map);
    }

    if (!state.kioskStart) return;

    var path = routePathFor(location, destinationLatLng);
    if (!path || path.length < 2) return;

    state.activeRoute = L.polyline(path, {
      color: '#ff5b13',
      weight: 6,
      opacity: 0.95,
      dashArray: '12, 8',
      lineCap: 'square',
      lineJoin: 'miter',
    }).addTo(map);

    state.destMarker = buildMarker(destinationLatLng, 'tour-pin').addTo(map);

    map.fitBounds(state.activeRoute.getBounds(), { padding: [60, 60] });
  }

  /* ── overlay open/close ───────────────────────────────────────── */

  function openRouteOverlay(location) {
    dom.routeName.textContent = location.name || 'Building';
    dom.routeType.textContent = (location.type || 'Building').toUpperCase();

    var hasScene = !!state.sceneByLocation[location.id];
    dom.routeVisit.hidden = !hasScene;
    dom.routeHint.hidden = hasScene;
    dom.routeVisit.onclick = function() {
      if (!hasScene || !window.__tourBridge) return;
      var scene = window.__tourBridge.findSceneById(state.sceneByLocation[location.id]);
      if (scene) {
        window.__tourBridge.switchScene(scene);
      }
      closeRouteOverlay();
    };

    dom.routeOverlay.classList.remove('tour-route--hidden');
    dom.routeOverlay.setAttribute('aria-hidden', 'false');

    ensureMap().then(function(map) {
      // Leaflet needs a redraw after its container becomes visible.
      setTimeout(function() { map.invalidateSize(); }, 60);
      if (location.map_y == null || location.map_x == null) return;
      var dest = [Number(location.map_y), Number(location.map_x)];
      drawRouteOnMap(map, location, dest);

      // Tell the server to mint a route session — same backend the
      // campus map uses. We don't surface the QR here (the user is
      // standing at the kiosk looking at the panorama), but creating
      // the session keeps analytics consistent and lets us add a QR
      // affordance later without backend changes.
      fetch('/api/route-sessions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-CSRF-TOKEN': csrfToken() },
        body: JSON.stringify({ destination_id: location.id }),
      }).catch(function() { /* analytics-only, swallow errors */ });
    }).catch(function(err) {
      console.warn('[tour] route map init failed:', err);
    });
  }

  function closeRouteOverlay() {
    if (state.activeRoute) {
      state.map.removeLayer(state.activeRoute);
      state.activeRoute = null;
    }
    if (state.destMarker) {
      state.map.removeLayer(state.destMarker);
      state.destMarker = null;
    }
    dom.routeOverlay.classList.add('tour-route--hidden');
    dom.routeOverlay.setAttribute('aria-hidden', 'true');
  }

  dom.routeClose.addEventListener('click', closeRouteOverlay);
  dom.routeDismiss.addEventListener('click', closeRouteOverlay);
})();
