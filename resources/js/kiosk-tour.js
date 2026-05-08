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
  var overlayElement = document.querySelector('#tour-overlay');
  var viewportElement = document.querySelector('.tour-viewport');
  var startButton = document.querySelector('#tour-start');
  var exitButton = document.querySelector('#tour-exit');
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

    var limiter = Marzipano.RectilinearView.limit.traditional(data.faceSize, 100*Math.PI/180, 120*Math.PI/180);
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

  function switchScene(scene) {
    stopAutorotate();
    scene.view.setParameters(scene.data.initialViewParameters);
    scene.scene.switchTo();
    startAutorotate();
    updateSceneName(scene);
    updateSceneList(scene);
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

    // Add click event handler.
    wrapper.addEventListener('click', function() {
      switchScene(findSceneById(hotspot.target));
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

  function hideOverlay() {
    if (overlayElement) {
      overlayElement.classList.add('is-hidden');
      overlayElement.setAttribute('aria-hidden', 'true');
    }
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
    hideOverlay();
    if (scenes.length) {
      switchScene(scenes[0]);
    }
    publishTourBridge();
  }

  function publishTourBridge() {
    window.__tourBridge = {
      scenes: scenes,
      findSceneById: findSceneById,
      switchScene: switchScene,
    };
    document.dispatchEvent(new CustomEvent('tour:ready'));
  }

  if (startButton) {
    startButton.addEventListener('click', startTour);
  }

  if (exitButton) {
    exitButton.addEventListener('click', function() {
      window.location.href = '/kiosk';
    });
  }

  if (!overlayElement) {
    startTour();
  }
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
    kioskStart: null,    // [lat, lng]
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

  function csrfToken() {
    var meta = document.querySelector('meta[name="csrf-token"]');
    if (meta) return meta.getAttribute('content');
    var input = document.querySelector('input[name="__token"]');
    return input ? input.value : '';
  }

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
      if (loc.is_start) {
        state.kioskStart = [Number(loc.latitude), Number(loc.longitude)];
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
        L.imageOverlay('/campus-map.png', bounds).addTo(map);
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

  function drawRouteOnMap(map, destinationLatLng) {
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

    state.activeRoute = L.polyline([state.kioskStart, destinationLatLng], {
      color: '#ff5b13',
      weight: 6,
      opacity: 0.95,
      dashArray: '12, 8',
      lineCap: 'square',
      lineJoin: 'miter',
    }).addTo(map);

    state.destMarker = buildMarker(destinationLatLng, 'tour-pin').addTo(map);

    map.fitBounds([state.kioskStart, destinationLatLng], { padding: [60, 60] });
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
      var dest = [Number(location.latitude), Number(location.longitude)];
      drawRouteOnMap(map, dest);

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
    dom.routeOverlay.classList.add('tour-route--hidden');
    dom.routeOverlay.setAttribute('aria-hidden', 'true');
  }

  dom.routeClose.addEventListener('click', closeRouteOverlay);
  dom.routeDismiss.addEventListener('click', closeRouteOverlay);
})();
