/**
 * Single-scene 360 preview for the Tour Mapping page.
 *
 * The panel asks an editor to pick a building for each of 205 panoramas while
 * showing them nothing but an opaque scene id. The row thumbnails (a CSS crop
 * of the cube strip Marzipano already ships as preview.jpg) cover recognition;
 * this covers the cases where a single face is not enough and the editor needs
 * to look around before committing to a building.
 *
 * Deliberately NOT the kiosk tour: one scene, no hotspots, no autorotate, no
 * scene navigation. Building on kiosk-tour.js would have dragged in the
 * `tour:scene-created` bridge that tour-charter.js hangs the 3D charter off,
 * and a 205-scene copy of data.js the dashboard has no use for.
 *
 * Marzipano is injected from /pano/vendor on the FIRST preview click rather
 * than shipped in the dashboard bundle, so editors who never open a preview
 * never pay its 211 KB. It is already deployed there for the kiosk (nginx
 * serves /pano/ directly; STATICFILES maps storage/public to "/" in dev), so
 * this needs no route and no mix.copy of its own.
 */
(function () {
  'use strict';

  var card = document.querySelector('[data-tour-geometry]');
  var modal = document.querySelector('[data-tour-preview-modal]');
  if (!card || !modal) {
    return;
  }

  var stage = modal.querySelector('[data-tour-preview-stage]');
  var titleNode = modal.querySelector('[data-tour-preview-title]');
  var sceneNode = modal.querySelector('[data-tour-preview-scene]');
  var errorNode = modal.querySelector('[data-tour-preview-error]');

  // Same clamp the kiosk uses (FOV_MIN/FOV_MAX in kiosk-tour.js) so a scene
  // frames here the way it frames on the terminal.
  var FOV_MIN = 60 * Math.PI / 180;
  var FOV_MAX = 120 * Math.PI / 180;
  var VENDOR_URL = '/pano/vendor/marzipano.js';
  var TILE_ROOT = '/pano/tiles';

  var geometry = readJson(card.getAttribute('data-tour-geometry')) || {};
  var vendorPromise = null;
  var viewer = null;
  var currentScene = null;

  function readJson(raw) {
    if (!raw) {
      return null;
    }
    try {
      return JSON.parse(raw);
    } catch (err) {
      return null;
    }
  }

  /**
   * Resolve once Marzipano is on window. The promise is cached, so hammering
   * thumbnails cannot start a second 211 KB download or build two viewers.
   */
  function loadMarzipano() {
    if (vendorPromise) {
      return vendorPromise;
    }

    vendorPromise = new Promise(function (resolve, reject) {
      if (window.Marzipano) {
        resolve(window.Marzipano);
        return;
      }

      var script = document.createElement('script');
      script.src = VENDOR_URL;
      script.async = true;
      script.onload = function () {
        if (window.Marzipano) {
          resolve(window.Marzipano);
        } else {
          reject(new Error('marzipano.js loaded but exported nothing'));
        }
      };
      script.onerror = function () {
        reject(new Error('could not load ' + VENDOR_URL));
      };
      document.head.appendChild(script);
    });

    // A failed load must not poison the cache — the next click should retry
    // rather than reject instantly forever.
    vendorPromise.catch(function () {
      vendorPromise = null;
    });

    return vendorPromise;
  }

  /**
   * Build the scene for `sceneId` and show it.
   *
   * The source/geometry contract is copied from kiosk-tour.js:143-150 on
   * purpose: it is the seam that breaks silently if the tile layout ever
   * changes, and tests/js/tour-preview.test.mjs pins the two together.
   */
  function showScene(Marzipano, sceneId, initialView) {
    if (!viewer) {
      viewer = new Marzipano.Viewer(stage);
    }

    var source = Marzipano.ImageUrlSource.fromString(
      TILE_ROOT + '/' + sceneId + '/{z}/{f}/{y}/{x}.jpg',
      { cubeMapPreviewUrl: TILE_ROOT + '/' + sceneId + '/preview.jpg' }
    );
    var cube = new Marzipano.CubeGeometry(geometry.levels || []);
    var limiter = Marzipano.RectilinearView.limit.traditional(
      geometry.face_size, FOV_MIN, FOV_MAX
    );
    var view = new Marzipano.RectilinearView(initialView || {}, limiter);

    var scene = viewer.createScene({
      source: source,
      geometry: cube,
      view: view,
      pinFirstLevel: true
    });

    // Switch first, THEN drop the outgoing scene: destroying the scene the
    // viewer is still displaying blanks the stage until the next frame.
    // Dropping it at all matters because an editor working through 205 rows
    // would otherwise accumulate a texture set per preview.
    var previous = currentScene;
    currentScene = scene;
    scene.switchTo({ transitionDuration: 0 });
    disposeScene(previous);
  }

  function disposeScene(scene) {
    if (!scene) {
      return;
    }
    try {
      scene.destroy();
    } catch (err) {
      // Marzipano throws if the scene is already gone; nothing to do.
    }
  }

  function disposeCurrentScene() {
    disposeScene(currentScene);
    currentScene = null;
  }

  function openPreview(trigger) {
    var sceneId = trigger.getAttribute('data-scene-id');
    if (!sceneId) {
      return;
    }

    if (titleNode) {
      titleNode.textContent = trigger.getAttribute('data-scene-name') || sceneId;
    }
    if (sceneNode) {
      sceneNode.textContent = sceneId;
    }
    if (errorNode) {
      errorNode.hidden = true;
    }

    // Used to fall back to setAttribute('open'), which renders a non-modal
    // dialog: no backdrop, no focus trap, and a Marzipano canvas sitting loose
    // in the page. GearsModal does not open at all in that case.
    window.GearsModal.open(modal, trigger);

    var initialView = readJson(trigger.getAttribute('data-scene-view'));

    loadMarzipano().then(function (Marzipano) {
      // The editor may have closed the dialog while the vendor was in flight.
      if (!modal.open) {
        return;
      }
      showScene(Marzipano, sceneId, initialView);
    }).catch(function () {
      if (errorNode) {
        errorNode.hidden = false;
      }
    });
  }

  function closePreview() {
    window.GearsModal.close(modal);
  }

  card.addEventListener('click', function (event) {
    var trigger = event.target.closest('[data-tour-preview-open]');
    if (!trigger || !card.contains(trigger)) {
      return;
    }
    // The button lives inside the row's <form>; without this a preview click
    // would submit the mapping the editor has not finished choosing.
    event.preventDefault();
    openPreview(trigger);
  });

  modal.addEventListener('click', function (event) {
    if (event.target.closest('[data-tour-preview-close]')) {
      event.preventDefault();
      closePreview();
    }
  });

  // One teardown hook instead of two: GearsModal turns `cancel` (Esc) into a
  // close(), so every exit -- Esc, backdrop, the close button -- arrives here
  // and the panorama is disposed exactly once.
  window.GearsModal.wire(modal, { onClose: disposeCurrentScene });
})();
