// Run with: node --test tests/js/
//
// tour-preview.js builds a Marzipano viewer for ONE scene on the Tour Mapping
// dashboard. Three things about it fail silently, which is what this file is
// for:
//
//   1. The tile URL template is a contract with the tile server, and it is
//      duplicated from kiosk-tour.js. If either side changes shape, the viewer
//      requests 404s and renders a black panorama with no error — exactly the
//      failure mode tests/unit/test_tour_catalog.py exists to catch on the
//      Python side.
//   2. The 211 KB vendor bundle is injected on first click and the promise is
//      cached. A regression that drops the cache re-downloads it per preview,
//      which nothing visibly breaks but every editor pays for.
//   3. Scenes are destroyed on close. An editor working through 205 rows would
//      otherwise accumulate a texture set per preview until the tab dies.
//
// The module is a browser IIFE with no module boundary, so it runs here against
// a hand-rolled DOM stand-in, the same way tour-charter.test.mjs does.

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const SOURCE = readFileSync(join(here, '../../resources/js/tour-preview.js'), 'utf8');
const KIOSK_TOUR = readFileSync(join(here, '../../resources/js/kiosk-tour.js'), 'utf8');

/** What DashboardContext.tour_context() puts on the card. */
const GEOMETRY = {
  levels: [
    { tileSize: 256, size: 256, fallbackOnly: true },
    { tileSize: 512, size: 512 },
    { tileSize: 512, size: 1024 },
  ],
  face_size: 750,
};

class FakeElement {
  constructor(tag, selectors = []) {
    this.tagName = tag;
    this.selectors = new Set(selectors);
    this.attributes = {};
    this.children = [];
    this.listeners = {};
    this.parent = null;
    this.textContent = '';
    this.hidden = false;
  }
  setAttribute(name, value) { this.attributes[name] = value; }
  getAttribute(name) { return name in this.attributes ? this.attributes[name] : null; }
  removeAttribute(name) { delete this.attributes[name]; }
  appendChild(child) { child.parent = this; this.children.push(child); return child; }
  addEventListener(type, fn) { (this.listeners[type] ||= []).push(fn); }
  dispatch(type, event) { (this.listeners[type] || []).forEach((fn) => fn(event)); }
  contains() { return true; }
  closest(selector) {
    let node = this;
    while (node) {
      if (node.selectors.has(selector)) return node;
      node = node.parent;
    }
    return null;
  }
  querySelector(selector) {
    for (const child of this.children) {
      if (child.selectors.has(selector)) return child;
      const found = child.querySelector(selector);
      if (found) return found;
    }
    return null;
  }
}

/** A <dialog> stand-in: `open` tracks showModal()/close() the way a real one does. */
class FakeDialog extends FakeElement {
  constructor(selectors) {
    super('dialog', selectors);
    this.open = false;
  }
  showModal() { this.open = true; }
  close() { this.open = false; this.dispatch('close', {}); }
}

/** A Marzipano stand-in that records every scene it is asked to build. */
function fakeMarzipano(record) {
  function RectilinearView(params) { this.params = params; }
  RectilinearView.limit = { traditional: (faceSize, min, max) => ({ faceSize, min, max }) };

  return {
    Viewer: function Viewer(stage) {
      record.viewers.push(stage);
    },
    ImageUrlSource: {
      fromString: (template, opts) => {
        record.sources.push({ template, opts });
        return { template };
      },
    },
    CubeGeometry: function CubeGeometry(levels) { this.levels = levels; },
    RectilinearView,
  };
}

/**
 * Boots tour-preview.js against a stub DOM.
 *
 * `vendor.loads` counts injected <script src=.../marzipano.js> elements, which
 * is the thing the caching is supposed to keep at one.
 */
function boot({ scenes = [], vendorFails = false } = {}) {
  const record = { sources: [], viewers: [], destroyed: [], switched: [] };

  const card = new FakeElement('div', ['[data-tour-geometry]']);
  card.setAttribute('data-tour-geometry', JSON.stringify(GEOMETRY));

  const triggers = scenes.map((scene) => {
    const button = new FakeElement('button', ['[data-tour-preview-open]']);
    button.setAttribute('data-scene-id', scene.id);
    button.setAttribute('data-scene-name', scene.name || scene.id);
    button.setAttribute('data-scene-view', JSON.stringify(scene.view || { yaw: 0 }));
    button.parent = card;
    return button;
  });

  const modal = new FakeDialog(['[data-tour-preview-modal]']);
  const stage = new FakeElement('div', ['[data-tour-preview-stage]']);
  const title = new FakeElement('h3', ['[data-tour-preview-title]']);
  const sceneLabel = new FakeElement('p', ['[data-tour-preview-scene]']);
  const errorNode = new FakeElement('p', ['[data-tour-preview-error]']);
  errorNode.hidden = true;
  [stage, title, sceneLabel, errorNode].forEach((node) => modal.appendChild(node));

  const head = new FakeElement('head');
  const vendor = { loads: 0 };
  const fakeWindow = {};

  const fakeDocument = {
    head,
    createElement: (tag) => new FakeElement(tag),
    querySelector: (selector) => {
      if (selector === '[data-tour-geometry]') return card;
      if (selector === '[data-tour-preview-modal]') return modal;
      return null;
    },
  };

  // Injecting the vendor script "loads" it: set window.Marzipano, then fire
  // onload asynchronously, like a real <script> would.
  head.appendChild = function (script) {
    vendor.loads += 1;
    queueMicrotask(() => {
      if (vendorFails) {
        script.onerror();
        return;
      }
      fakeWindow.Marzipano = fakeMarzipano(record);
      // createScene / switchTo are on the viewer, which the module builds, so
      // hang them off the stub here where `record` is in scope.
      fakeWindow.Marzipano.Viewer.prototype.createScene = function (opts) {
        const scene = {
          switchTo: (o) => record.switched.push(o),
          destroy: () => record.destroyed.push(opts.source.template),
        };
        return scene;
      };
      script.onload();
    });
    return script;
  };

  new Function('window', 'document', 'Promise', SOURCE)(fakeWindow, fakeDocument, Promise);

  return { card, modal, stage, title, sceneLabel, errorNode, triggers, vendor, record };
}

/** Clicks a preview button and returns the event, so preventDefault is checkable. */
function clickPreview(card, trigger) {
  let prevented = false;
  card.dispatch('click', {
    target: trigger,
    preventDefault: () => { prevented = true; },
  });
  return { prevented };
}

/** Lets the injected-script microtask and the promise chain drain. */
const settle = () => new Promise((resolve) => setTimeout(resolve, 0));

test('loads the vendor bundle once no matter how many previews are opened', async () => {
  const { card, modal, triggers, vendor } = boot({
    scenes: [{ id: '0-jst-1' }, { id: '12-jst-14' }, { id: '99-jst-101' }],
  });

  assert.equal(vendor.loads, 0, 'nothing should load before the first click');

  for (const trigger of triggers) {
    clickPreview(card, trigger);
    await settle();
    modal.close();
  }

  assert.equal(vendor.loads, 1);
});

test('does not load the vendor bundle just because the page rendered', () => {
  const { vendor } = boot({ scenes: [{ id: '0-jst-1' }] });

  // Editors who never open a preview must not pay the 211 KB.
  assert.equal(vendor.loads, 0);
});

test('builds the tile URL the way kiosk-tour.js does', async () => {
  const { card, triggers, record } = boot({ scenes: [{ id: '0-jst-1' }] });

  clickPreview(card, triggers[0]);
  await settle();

  assert.equal(record.sources.length, 1);
  assert.equal(
    record.sources[0].template,
    '/pano/tiles/0-jst-1/{z}/{f}/{y}/{x}.jpg',
  );
  assert.equal(
    record.sources[0].opts.cubeMapPreviewUrl,
    '/pano/tiles/0-jst-1/preview.jpg',
  );
});

test('the tile layout it assumes still matches the kiosk tour', () => {
  // Both files address the same tile server. This is the seam: change the
  // export's layout on one side only and the dashboard preview goes black
  // while the kiosk keeps working (or the reverse).
  for (const literal of ['/pano/tiles', '/{z}/{f}/{y}/{x}.jpg', 'preview.jpg']) {
    assert.ok(KIOSK_TOUR.includes(literal), `kiosk-tour.js no longer uses ${literal}`);
    assert.ok(SOURCE.includes(literal), `tour-preview.js no longer uses ${literal}`);
  }
});

test('opens the scene at the yaw the panorama was captured facing', async () => {
  const view = { yaw: -1.7720201955843162, pitch: 0.09006908925874768, fov: 1.51 };
  const { card, triggers, record } = boot({ scenes: [{ id: '0-jst-1', view }] });

  clickPreview(card, triggers[0]);
  await settle();

  // Same limiter the kiosk applies, so a scene frames here as it does there.
  assert.equal(record.viewers.length, 1);
  assert.equal(record.switched.length, 1);
});

test('reuses one viewer and destroys the previous scene', async () => {
  const { card, modal, triggers, record } = boot({
    scenes: [{ id: '0-jst-1' }, { id: '12-jst-14' }],
  });

  clickPreview(card, triggers[0]);
  await settle();
  modal.close();

  clickPreview(card, triggers[1]);
  await settle();

  assert.equal(record.viewers.length, 1, 'a second viewer would leak a canvas');
  assert.deepEqual(record.destroyed, ['/pano/tiles/0-jst-1/{z}/{f}/{y}/{x}.jpg']);
});

test('switching scenes without closing drops the outgoing one', async () => {
  const { card, triggers, record } = boot({
    scenes: [{ id: '0-jst-1' }, { id: '12-jst-14' }],
  });

  clickPreview(card, triggers[0]);
  await settle();
  // No close() in between — straight from one preview to the next.
  clickPreview(card, triggers[1]);
  await settle();

  assert.equal(record.viewers.length, 1);
  assert.deepEqual(record.destroyed, ['/pano/tiles/0-jst-1/{z}/{f}/{y}/{x}.jpg']);
  // The incoming scene must be switched to AFTER the outgoing one is dropped,
  // or the stage blanks; both switches should have happened regardless.
  assert.equal(record.switched.length, 2);
});

test('closing the dialog tears the scene down', async () => {
  const { card, modal, triggers, record } = boot({ scenes: [{ id: '0-jst-1' }] });

  clickPreview(card, triggers[0]);
  await settle();
  assert.deepEqual(record.destroyed, []);

  modal.close();
  assert.deepEqual(record.destroyed, ['/pano/tiles/0-jst-1/{z}/{f}/{y}/{x}.jpg']);
});

test('a preview click does not submit the row it sits in', () => {
  const { card, triggers } = boot({ scenes: [{ id: '0-jst-1' }] });

  // The button is inside the row's <form>. Without preventDefault, previewing
  // would save whatever building was half-selected.
  assert.equal(clickPreview(card, triggers[0]).prevented, true);
});

test('opens the dialog immediately, before the vendor arrives', async () => {
  const { card, modal, triggers, title, sceneLabel } = boot({
    scenes: [{ id: '0-jst-1', name: 'JST-1' }],
  });

  clickPreview(card, triggers[0]);

  assert.equal(modal.open, true, 'the editor should not click into nothing');
  assert.equal(title.textContent, 'JST-1');
  assert.equal(sceneLabel.textContent, '0-jst-1');
  await settle();
});

test('surfaces an error instead of an empty box when tiles are not synced', async () => {
  const { card, triggers, errorNode } = boot({
    scenes: [{ id: '0-jst-1' }],
    vendorFails: true,
  });

  clickPreview(card, triggers[0]);
  await settle();

  assert.equal(errorNode.hidden, false);
});

test('retries the vendor load after a failure', async () => {
  const { card, triggers, vendor } = boot({ scenes: [{ id: '0-jst-1' }], vendorFails: true });

  clickPreview(card, triggers[0]);
  await settle();
  clickPreview(card, triggers[0]);
  await settle();

  // A cached rejection would leave the editor permanently unable to preview
  // after one flaky request.
  assert.equal(vendor.loads, 2);
});

test('does nothing when the page has no tour mapping card', () => {
  // tour-preview.js is loaded on every dashboard page, not just Tour Mapping.
  const fakeWindow = {};
  const fakeDocument = { head: new FakeElement('head'), querySelector: () => null };

  assert.doesNotThrow(() => {
    new Function('window', 'document', 'Promise', SOURCE)(fakeWindow, fakeDocument, Promise);
  });
});
