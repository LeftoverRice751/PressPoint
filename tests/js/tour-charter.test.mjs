// Run with: node --test tests/js/
//
// tour-charter.js is the seam between three things that know nothing about
// each other, and every one of them fails silently when it drifts:
//
//   1. kiosk-tour.js announces each panorama as CustomEvent('tour:scene-created')
//      with { id, scene }. If the id we listen for stops matching the tour's
//      opening scene, no hotspot is created and the charter simply never
//      appears — no error, no console warning.
//   2. kiosk-archive-book.js opens on CustomEvent('archive:open') and picks its
//      reading adapter from the dataset. A charter that arrives with
//      isTabloid === '1', or a `type` containing "newsletter", opens as a
//      zoomable broadsheet or a scroll instead of the two-page spread.
//   3. the GLB. The front cover is identified by its material name,
//      'cover_art'. A re-export that renames it leaves the model inspectable
//      but no longer openable — the one interaction the feature exists for.
//
// The state machine is the other half of what is covered here. tour → inspect
// → reader has to be one-way per gesture and has to come back the way it went;
// a tap that skips inspection, or a reader close that lands in the panorama,
// are both regressions no other test would notice.
//
// The module is a browser IIFE with no module boundary, so it runs here against
// a hand-rolled DOM stand-in.

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const SOURCE = readFileSync(join(here, '../../resources/js/tour-charter.js'), 'utf8');

class FakeEvent {
  constructor(type, init) {
    this.type = type;
    this.detail = (init || {}).detail;
  }
}

class FakeClassList {
  constructor() { this.set = new Set(); }
  add(name) { this.set.add(name); }
  remove(name) { this.set.delete(name); }
  contains(name) { return this.set.has(name); }
}

class FakeElement {
  constructor(tag) {
    this.tagName = tag;
    this.dataset = {};
    this.attributes = {};
    this.children = [];
    this.listeners = {};
    this.className = '';
    this.textContent = '';
    this.classList = new FakeClassList();
    this.hidden = false;
    this.parentNode = null;
    this.rect = { top: 10, left: 20, width: 260, height: 300 };
    // Registered by tests so config.querySelector('[data-charter-stage]') etc.
    // resolve the way the tour template's markup would.
    this.selectorMap = {};
  }
  setAttribute(name, value) { this.attributes[name] = value; }
  getAttribute(name) { return this.attributes[name]; }
  removeAttribute(name) { delete this.attributes[name]; }
  hasAttribute(name) { return name in this.attributes; }
  querySelector(selector) { return this.selectorMap[selector] || null; }
  appendChild(child) {
    if (child.parentNode) child.parentNode.removeChild(child);
    this.children.push(child);
    child.parentNode = this;
    return child;
  }
  removeChild(child) {
    this.children = this.children.filter((c) => c !== child);
    if (child.parentNode === this) child.parentNode = null;
    return child;
  }
  addEventListener(type, fn) { (this.listeners[type] ||= []).push(fn); }
  removeEventListener(type, fn) {
    this.listeners[type] = (this.listeners[type] || []).filter((f) => f !== fn);
  }
  listenerCount(type) { return (this.listeners[type] || []).length; }
  dispatch(type, event) { (this.listeners[type] || []).slice().forEach((fn) => fn(event)); }
  getBoundingClientRect() { return this.rect; }
}

/** A material as model-viewer's scene graph hands one back. */
function fakeMaterial(name) {
  return {
    name,
    pbrMetallicRoughness: {},
    emissive: null,
    setEmissiveFactor(rgb) { this.emissive = rgb; },
  };
}

/** Lets pending microtasks and timers run. */
const settle = (ms = 0) => new Promise((resolve) => setTimeout(resolve, ms));

/** Long enough to outlast COVER_PULSE_MS in tour-charter.js — the cover
 *  acknowledges the tap on the object itself before the reader replaces it,
 *  so 'archive:open' is deliberately not synchronous with the click. */
const afterPulse = () => settle(260);

/** Boots tour-charter.js against a stub DOM and returns handles to poke it.
 *
 *  `modelViewerLoaded` decides whether the lazily-loaded library is treated as
 *  present. With it false the module must degrade to the pre-inspection
 *  behaviour — a tap goes straight to the reader — because there is nothing to
 *  inspect without WebGL. */
function boot({ charterConfig = {}, modelViewerLoaded = true, bridge = null } = {}) {
  const config = new FakeElement('div');
  Object.assign(config.dataset, charterConfig);

  const overlay = new FakeElement('div');
  const stage = new FakeElement('div');
  const exitButton = new FakeElement('button');
  const scrim = new FakeElement('div');
  overlay.hidden = true;
  config.selectorMap = {
    '[data-charter-inspect]': overlay,
    '[data-charter-stage]': stage,
    '[data-charter-exit]': exitButton,
    '[data-charter-inspect-scrim]': scrim,
  };

  const documentListeners = {};
  const dispatched = [];
  const head = new FakeElement('head');

  const fakeDocument = {
    head,
    querySelector: (selector) =>
      (selector === '[data-tour-charter]' && Object.keys(charterConfig).length ? config : null),
    createElement: (tag) => new FakeElement(tag),
    addEventListener: (type, fn) => { (documentListeners[type] ||= []).push(fn); },
    removeEventListener: (type, fn) => {
      documentListeners[type] = (documentListeners[type] || []).filter((f) => f !== fn);
    },
    dispatchEvent: (event) => {
      dispatched.push(event);
      (documentListeners[event.type] || []).slice().forEach((fn) => fn(event));
      return true;
    },
  };

  const fakeWindow = {
    customElements: { get: () => (modelViewerLoaded ? function ModelViewer() {} : undefined) },
  };
  if (bridge) fakeWindow.__tourBridge = bridge;

  /* requestAnimationFrame here NEVER FIRES, deliberately.
   *
   * An earlier version of this module opened inspection by scheduling an
   * `.is-active` class in a rAF callback, and parked the overlay at
   * `opacity: 0; pointer-events: none` until it landed. rAF callbacks are not
   * guaranteed to run — a throttled or backgrounded kiosk tab, a starved first
   * frame, or any headless browser will simply never call them — and when this
   * one didn't, the model had already been moved into an invisible fullscreen
   * overlay: the tour lost its book and every tap died on a layer nobody could
   * see. A stub that swallows the callback is what keeps that from coming
   * back; if inspection ever depends on an animation frame again, the entry
   * and exit tests below fail. */
  const rafCalls = [];
  const neverFiringRaf = (fn) => { rafCalls.push(fn); return rafCalls.length; };

  new Function(
    'window', 'document', 'CustomEvent', 'Promise', 'requestAnimationFrame',
    'setTimeout', 'clearTimeout', SOURCE,
  )(
    fakeWindow, fakeDocument, FakeEvent, Promise,
    neverFiringRaf, setTimeout, clearTimeout,
  );

  return {
    fakeDocument, fakeWindow, dispatched, head, overlay, stage, exitButton, scrim, rafCalls,
  };
}

/** The attributes the tour template renders for an uploaded charter. */
const CONFIG = {
  charterSceneId: '0-jst-1',
  charterYaw: '0.4',
  charterPitch: '0.4',
  charterModelUrl: '/storage/models/lspu-citizens-charter-2026.glb',
  charterId: '7',
  charterTitle: "LSPU Citizen's Charter 2026",
  charterType: 'charter',
  charterCoverUrl: '/storage/Archives/covers/charter.png',
  charterFileUrl: '/storage/Archives/charter.pdf',
  charterPageCount: '48',
  charterPageUrlBase: '/kiosk/archives/7/pages',
  charterPrewarmedPages: '20',
};

/** Fires 'tour:scene-created' and returns the hotspot element, if any. */
function createScene(fakeDocument, id) {
  let hotspotElement = null;
  const scene = {
    hotspotContainer: () => ({
      createHotspot: (element, coords) => { hotspotElement = { element, coords }; },
    }),
  };
  fakeDocument.dispatchEvent(new FakeEvent('tour:scene-created', { detail: { id, scene } }));
  return hotspotElement;
}

const viewerOf = (wrapper) => wrapper.children.find((c) => c.tagName === 'model-viewer');

/** Mounts the hotspot, waits for the library promise, and enters inspection.
 *  Returns everything a test needs to drive the model. */
async function enterInspection(opts = {}) {
  const env = boot({ charterConfig: CONFIG, ...opts });
  const { element } = createScene(env.fakeDocument, '0-jst-1');
  const viewer = viewerOf(element);
  // model-viewer's raycast. Tests set `hit` to whatever the pointer is over.
  viewer.hit = null;
  viewer.materialFromPoint = () => viewer.hit;
  await settle();
  element.dispatch('click', { stopPropagation() {} });
  await settle();
  return { ...env, wrapper: element, viewer };
}

/* ── mounting ──────────────────────────────────────────────────────────── */

test('does nothing at all when no charter has been uploaded', () => {
  const { fakeDocument, dispatched } = boot({ charterConfig: {} });
  assert.equal(createScene(fakeDocument, '0-jst-1'), null);
  assert.equal(dispatched.filter((e) => e.type === 'archive:open').length, 0);
});

test('mounts the hotspot only on the configured scene', () => {
  const { fakeDocument } = boot({ charterConfig: CONFIG });
  assert.equal(createScene(fakeDocument, '12-some-other-scene'), null);
  assert.notEqual(createScene(fakeDocument, '0-jst-1'), null);
});

test('places the hotspot at the configured yaw and pitch', () => {
  const { fakeDocument } = boot({ charterConfig: CONFIG });
  const { coords } = createScene(fakeDocument, '0-jst-1');
  assert.deepEqual(coords, { yaw: 0.4, pitch: 0.4 });
});

test('mounts once even if the scene is announced twice', () => {
  const { fakeDocument } = boot({ charterConfig: CONFIG });
  assert.notEqual(createScene(fakeDocument, '0-jst-1'), null);
  assert.equal(createScene(fakeDocument, '0-jst-1'), null);
});

test('falls back to the tour bridge when scenes were built before this ran', () => {
  let hotspot = null;
  const scene = {
    hotspotContainer: () => ({ createHotspot: (element) => { hotspot = element; } }),
  };
  const { fakeDocument } = boot({
    charterConfig: CONFIG,
    bridge: { findSceneById: (id) => (id === '0-jst-1' ? { scene } : null) },
  });

  fakeDocument.dispatchEvent(new FakeEvent('tour:ready', {}));
  assert.notEqual(hotspot, null);
});

/* ── resting on the floor ──────────────────────────────────────────────── */

test('the resting model autorotates and is not an interactive camera', () => {
  const { fakeDocument } = boot({ charterConfig: CONFIG });
  const viewer = viewerOf(createScene(fakeDocument, '0-jst-1').element);

  assert.equal(viewer.getAttribute('src'), CONFIG.charterModelUrl);
  assert.ok('auto-rotate' in viewer.attributes);
  // A tap must reach the wrapper's handler, not orbit the camera.
  assert.ok('disable-zoom' in viewer.attributes);
  assert.ok('disable-pan' in viewer.attributes);
  assert.ok('disable-tap' in viewer.attributes);
  assert.ok(!('camera-controls' in viewer.attributes));
  assert.equal(viewer.getAttribute('interaction-prompt'), 'none');
  // Cover doubles as the poster, so a failed GLB or missing WebGL still leaves
  // something tappable rather than an empty box.
  assert.equal(viewer.getAttribute('poster'), CONFIG.charterCoverUrl);
});

test('the resting model is framed as an object on the floor', () => {
  const { fakeDocument } = boot({ charterConfig: CONFIG });
  const viewer = viewerOf(createScene(fakeDocument, '0-jst-1').element);

  // phi below 90deg is a downward look — the visitor standing over a book on
  // the tiles. Pinned min == max so a post-load re-fit cannot restore
  // model-viewer's own default and stand the book back up.
  assert.equal(viewer.getAttribute('camera-orbit'), '0deg 72deg auto');
  assert.equal(viewer.getAttribute('min-camera-orbit'), 'auto 72deg auto');
  assert.equal(viewer.getAttribute('max-camera-orbit'), 'auto 72deg auto');
  // The contact shadow is the only thing anchoring the model to a photograph.
  assert.equal(viewer.getAttribute('shadow-intensity'), '1');
  assert.ok(parseFloat(viewer.getAttribute('shadow-softness')) > 0);
});

test('the label sits above the model, not on the floor in front of it', () => {
  const { fakeDocument } = boot({ charterConfig: CONFIG });
  const { element } = createScene(fakeDocument, '0-jst-1');

  // Order is load-bearing: tour-charter.css's negative margin-top hardcodes
  // the label's height to keep the MODEL centred on the yaw/pitch anchor.
  assert.equal(element.children[0].className, 'tour-charter__label');
  assert.equal(element.children[1].tagName, 'model-viewer');
  assert.equal(element.children[0].textContent, CONFIG.charterTitle);
});

/* ── entering inspection ───────────────────────────────────────────────── */

test('tapping the model enters inspection and does NOT open the reader', async () => {
  const { dispatched, overlay, stage, viewer, wrapper } = await enterInspection();

  // The whole point of the feature: the document is one deliberate step away,
  // not the first thing a brush against the model produces.
  assert.equal(dispatched.filter((e) => e.type === 'archive:open').length, 0);
  assert.equal(overlay.hidden, false);
  // Same element, moved — never a second viewer and never a second GLB load.
  assert.equal(viewer.parentNode, stage);
  assert.ok(!wrapper.children.includes(viewer));
});

test('the tap does not also nudge the panorama behind it', async () => {
  const env = boot({ charterConfig: CONFIG });
  const { element } = createScene(env.fakeDocument, '0-jst-1');
  await settle();

  let propagationStopped = false;
  element.dispatch('click', { stopPropagation: () => { propagationStopped = true; } });
  assert.ok(propagationStopped);
});

test('inspection freezes the panorama and exiting thaws it', async () => {
  const calls = [];
  const bridge = {
    findSceneById: () => null,
    freezeView: () => calls.push('freeze'),
    unfreezeView: () => calls.push('unfreeze'),
  };
  const { exitButton } = await enterInspection({ bridge });
  assert.deepEqual(calls, ['freeze']);

  exitButton.dispatch('click', {});
  assert.deepEqual(calls, ['freeze', 'unfreeze']);
});

test('inspection turns the camera loose within bounds', async () => {
  const { viewer } = await enterInspection();

  assert.ok('camera-controls' in viewer.attributes);
  assert.ok(!('disable-zoom' in viewer.attributes));
  assert.ok(!('disable-tap' in viewer.attributes));
  // Pan stays off: it is the one gesture that can slide the book off a kiosk
  // screen with nobody around to put it back.
  assert.ok('disable-pan' in viewer.attributes);

  // theta unbounded on both sides is model-viewer's spelling of a full 360.
  assert.ok(viewer.getAttribute('min-camera-orbit').startsWith('auto '));
  assert.ok(viewer.getAttribute('max-camera-orbit').startsWith('auto '));

  // Vertical rotation stops short of the poles so the model cannot invert.
  const phiMin = parseFloat(viewer.getAttribute('min-camera-orbit').split(' ')[1]);
  const phiMax = parseFloat(viewer.getAttribute('max-camera-orbit').split(' ')[1]);
  assert.ok(phiMin > 0 && phiMin < 90);
  assert.ok(phiMax > 90 && phiMax < 180);

  // Zoom is bounded at both ends and on both axes; either bound alone can be
  // defeated by the other, and a model zoomed off-screen is unrecoverable.
  assert.ok(parseFloat(viewer.getAttribute('min-camera-orbit').split(' ')[2]) > 0);
  assert.ok(parseFloat(viewer.getAttribute('max-camera-orbit').split(' ')[2]) > 100);
  assert.ok(parseFloat(viewer.getAttribute('min-field-of-view')) > 0);
  assert.ok(parseFloat(viewer.getAttribute('max-field-of-view')) > 0);
});

/* ── the front cover ───────────────────────────────────────────────────── */

test('tapping the front cover opens the reader on the Book adapter', async () => {
  const { viewer, dispatched, stage } = await enterInspection();

  viewer.hit = fakeMaterial('cover_art');
  viewer.dispatch('click', { clientX: 100, clientY: 100 });
  await afterPulse();

  const opened = dispatched.filter((e) => e.type === 'archive:open');
  assert.equal(opened.length, 1);

  const { dataset, originRect } = opened[0].detail;
  // pickAdapter() in kiosk-archive-book.js: neither of these may match, or the
  // charter opens as a DeepZoom broadsheet / a scroll instead of a spread.
  assert.equal(dataset.isTabloid, '0');
  assert.ok(!dataset.type.toLowerCase().includes('newsletter'));

  assert.equal(dataset.fileUrl, CONFIG.charterFileUrl);
  assert.equal(dataset.pageCount, '48');
  assert.equal(dataset.pageUrlBase, CONFIG.charterPageUrlBase);
  assert.equal(dataset.prewarmedPages, '20');
  // The pages unfold from the object the visitor was holding, not from the
  // hotspot they left behind in the panorama.
  assert.equal(originRect, stage.rect);
});

test('tapping anywhere but the cover only turns the book', async () => {
  const { viewer, dispatched } = await enterInspection();

  for (const name of ['back_cover_art', 'paper_white', 'navy_deep', 'spine_art', 'page_block']) {
    viewer.hit = fakeMaterial(name);
    viewer.dispatch('click', { clientX: 100, clientY: 100 });
  }
  await afterPulse();

  assert.equal(dispatched.filter((e) => e.type === 'archive:open').length, 0);
});

test('a drag that turns the book is not a tap on the cover', async () => {
  const { viewer, dispatched } = await enterInspection();

  viewer.hit = fakeMaterial('cover_art');
  viewer.dispatch('pointerdown', { clientX: 100, clientY: 100 });
  viewer.dispatch('click', { clientX: 190, clientY: 140 });
  await afterPulse();
  assert.equal(dispatched.filter((e) => e.type === 'archive:open').length, 0);

  // ...but a steady tap still counts, slop and all.
  viewer.dispatch('pointerdown', { clientX: 100, clientY: 100 });
  viewer.dispatch('click', { clientX: 102, clientY: 101 });
  await afterPulse();
  assert.equal(dispatched.filter((e) => e.type === 'archive:open').length, 1);
});

test('hovering the cover lights it and moving off puts it back', async () => {
  const { viewer } = await enterInspection();
  const cover = fakeMaterial('cover_art');
  const spine = fakeMaterial('navy_deep');

  viewer.hit = cover;
  viewer.dispatch('pointermove', { clientX: 10, clientY: 10, pointerType: 'mouse' });
  assert.notDeepEqual(cover.emissive, [0, 0, 0]);
  assert.ok(viewer.classList.contains('is-over-cover'));

  viewer.hit = spine;
  viewer.dispatch('pointermove', { clientX: 10, clientY: 10, pointerType: 'mouse' });
  // Restored, not left lit: the GLB must look identical after inspection.
  assert.deepEqual(cover.emissive, [0, 0, 0]);
  assert.equal(spine.emissive, null);
  assert.ok(!viewer.classList.contains('is-over-cover'));
});

test('a touch never drives the hover highlight', async () => {
  const { viewer } = await enterInspection();
  const cover = fakeMaterial('cover_art');

  viewer.hit = cover;
  viewer.dispatch('pointermove', { clientX: 10, clientY: 10, pointerType: 'touch' });
  // A kiosk finger is always "over" whatever it is about to tap; treating that
  // as hover would leave the cover permanently lit.
  assert.equal(cover.emissive, null);
});

/* ── returning ─────────────────────────────────────────────────────────── */

test('closing the reader returns to inspection, not to the panorama', async () => {
  const { viewer, stage, fakeDocument, overlay, dispatched } = await enterInspection();

  viewer.hit = fakeMaterial('cover_art');
  viewer.dispatch('click', { clientX: 100, clientY: 100 });
  await afterPulse();
  assert.equal(dispatched.filter((e) => e.type === 'archive:open').length, 1);

  fakeDocument.dispatchEvent(new FakeEvent('archive:reader-close', {}));

  // Still holding the book: the model never left the stage and the overlay is
  // still up, so the visitor is not dropped back into the tour.
  assert.equal(viewer.parentNode, stage);
  assert.equal(overlay.hidden, false);

  // And inspection is live again rather than stuck in the reader state — the
  // cover opens the document a second time.
  viewer.dispatch('click', { clientX: 100, clientY: 100 });
  await afterPulse();
  assert.equal(dispatched.filter((e) => e.type === 'archive:open').length, 2);
});

test('the inspection chrome stands down while the charter is being read', async () => {
  const { viewer, dispatched, fakeDocument, overlay } = await enterInspection();

  viewer.hit = fakeMaterial('cover_art');
  viewer.dispatch('click', { clientX: 100, clientY: 100 });
  await afterPulse();
  assert.equal(dispatched.filter((e) => e.type === 'archive:open').length, 1);

  // The overlay is still mounted under the reader, so its title and its own
  // "Back to tour" button would ghost through the reader's backdrop — the
  // button directly beneath the reader's identically placed one.
  assert.ok(overlay.classList.contains('is-reading'));

  fakeDocument.dispatchEvent(new FakeEvent('archive:reader-close', {}));
  assert.ok(!overlay.classList.contains('is-reading'));
});

test('exiting inspection restores the resting model and drops the overlay', async () => {
  const { viewer, wrapper, exitButton, overlay } = await enterInspection();

  exitButton.dispatch('click', {});
  await settle();

  assert.equal(viewer.parentNode, wrapper);
  assert.equal(viewer.getAttribute('camera-orbit'), '0deg 72deg auto');
  assert.ok(!('camera-controls' in viewer.attributes));
  assert.ok('disable-zoom' in viewer.attributes);
  assert.ok('disable-tap' in viewer.attributes);
  assert.ok(overlay.classList.contains('is-closing'));
});

test('inspection opens without ever waiting on an animation frame', async () => {
  const { overlay, viewer, stage, wrapper, exitButton, rafCalls } = await enterInspection();

  // The overlay must be open, on screen and interactive with the model already
  // inside it, having asked for no animation frames at all. See the stub's
  // note in boot(): this is the guard on a bug that left a kiosk showing a
  // tour with the book missing and a transparent layer eating every tap.
  assert.equal(rafCalls.length, 0);
  assert.equal(overlay.hidden, false);
  assert.ok(!overlay.classList.contains('is-closing'));
  assert.equal(viewer.parentNode, stage);

  // And it still closes cleanly with no frames either.
  exitButton.dispatch('click', {});
  await settle(320);
  assert.equal(rafCalls.length, 0);
  assert.equal(overlay.hidden, true);
  assert.ok(!overlay.classList.contains('is-closing'));
  assert.equal(viewer.parentNode, wrapper);
});

test('tapping the scrim exits inspection', async () => {
  const { scrim, viewer, wrapper } = await enterInspection();
  scrim.dispatch('click', {});
  assert.equal(viewer.parentNode, wrapper);
});

test('repeated inspection adds no listeners and no second viewer', async () => {
  const { viewer, wrapper, exitButton } = await enterInspection();

  for (let i = 0; i < 3; i += 1) {
    exitButton.dispatch('click', {});
    await settle();
    wrapper.dispatch('click', { stopPropagation() {} });
    await settle();
  }

  // A listener added per entry and never removed is the classic kiosk leak:
  // invisible for a day, then every tap fires five raycasts.
  assert.equal(viewer.listenerCount('click'), 1);
  assert.equal(viewer.listenerCount('pointermove'), 1);
  assert.equal(viewer.listenerCount('pointerdown'), 1);
  assert.equal(wrapper.children.filter((c) => c.tagName === 'model-viewer').length, 0);
});

/* ── degrading ─────────────────────────────────────────────────────────── */

test('without the 3D library a tap goes straight to the reader', async () => {
  const env = boot({ charterConfig: CONFIG, modelViewerLoaded: false });
  const { element } = createScene(env.fakeDocument, '0-jst-1');
  await settle();

  // The <script> never loads in this harness, so modelViewerReady stays false.
  // There is nothing to inspect — only the poster image — and the charter must
  // still be readable rather than hidden behind a gesture that cannot work.
  element.dispatch('click', { stopPropagation() {} });
  await settle();

  assert.equal(env.dispatched.filter((e) => e.type === 'archive:open').length, 1);
  assert.equal(env.overlay.hidden, true);
});

test('keyboard activation enters inspection too', async () => {
  const env = boot({ charterConfig: CONFIG });
  const { element } = createScene(env.fakeDocument, '0-jst-1');
  await settle();

  element.dispatch('keydown', { key: 'Tab', preventDefault() {} });
  assert.equal(env.overlay.hidden, true);

  element.dispatch('keydown', { key: 'Enter', preventDefault() {} });
  assert.equal(env.overlay.hidden, false);
});
