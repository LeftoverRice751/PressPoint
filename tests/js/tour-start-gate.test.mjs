// Run with: node --test tests/js/
//
// The virtual tour's start gate (resources/js/kiosk-tour.js).
//
// "Nothing renders until Start the tour is pressed" has to mean nothing is
// BUILT until then, not merely nothing is drawn. Marzipano's createScene()
// with pinFirstLevel pins each scene's fallback level, and pinning is a load:
// the TextureStore fetches the tile the moment it is pinned, shown or not.
// With 205 scenes that was every preview.jpg (~20 MB) plus the charter's GLB,
// pulled on every page load — and the shell loads this page whenever the
// carousel slides past the Virtual Tour card.
//
// So the gate has to sit in front of initTour(), and this pins that:
//   * with the gate in the DOM, page load constructs no viewer and no scene;
//   * pressing the button constructs them and marks the body tour-ready;
//   * with the gate absent (an old cached template), the tour starts on
//     load as it always did — a missing gate must never mean a black screen;
//   * the vendor bundles still load at page open, so a load failure can be
//     shown on the gate before the visitor taps a button that would do nothing.

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const SOURCE = readFileSync(join(here, '../../resources/js/kiosk-tour.js'), 'utf8');

function makeEl(attrs = {}) {
  return {
    attrs: { ...attrs },
    listeners: {},
    dataset: {},
    style: {},
    classList: { list: new Set(), add(c) { this.list.add(c); }, remove(c) { this.list.delete(c); }, contains(c) { return this.list.has(c); }, toggle() {} },
    setAttribute(n, v) { this.attrs[n] = String(v); },
    getAttribute(n) { return n in this.attrs ? this.attrs[n] : null; },
    removeAttribute(n) { delete this.attrs[n]; },
    hasAttribute(n) { return n in this.attrs; },
    addEventListener(t, fn) { (this.listeners[t] ||= []).push(fn); },
    removeEventListener() {},
    appendChild() {},
    querySelector() { return null; },
    querySelectorAll() { return []; },
    click() { (this.listeners.click || []).forEach((fn) => fn({})); },
  };
}

function fakeScene() {
  return {
    hotspotContainer: () => ({ createHotspot() {}, domElement: () => makeEl() }),
    switchTo(opts, done) { if (done) done(); },
  };
}

// A stand-in for the Marzipano bundle that records construction instead of
// touching WebGL. Only what initTour() calls on the load path is spelled out.
function fakeMarzipano(counts) {
  function Viewer() {
    counts.viewers++;
    this.createScene = () => { counts.scenes++; return fakeScene(); };
    this.controls = () => ({ registerMethod() {}, addEventListener() {} });
    this.stopMovement = () => {};
    this.startMovement = () => {};
    this.setIdleMovement = () => {};
    this.lookTo = () => {};
    this.stage = () => ({ addEventListener() {} });
    this.scene = () => null;
  }
  function View() { this.setParameters = () => {}; this.yaw = () => 0; }
  View.limit = { traditional: () => ({}) };
  return {
    Viewer,
    CubeGeometry: function () {},
    RectilinearView: View,
    ImageUrlSource: { fromString: () => ({}) },
    ElementPressControlMethod: function () {},
    autorotate: () => () => {},
  };
}

// Boots the script against a fake page. `gate` controls whether the start
// overlay is in the DOM; `sceneCount` is how many APP_DATA scenes exist.
async function boot({ gate = true, sceneCount = 3 } = {}) {
  const counts = { viewers: 0, scenes: 0, vendorLoads: 0 };
  const pano = makeEl();
  const button = makeEl();
  const overlay = makeEl();
  const body = makeEl();
  const head = { appendChild(script) { counts.vendorLoads++; script.dataset.loaded = 'true'; queueMicrotask(() => script.listeners.load.forEach((fn) => fn())); } };

  const document = {
    body,
    head,
    querySelector(sel) {
      if (sel === '#pano') return pano;
      if (sel === '[data-tour-start]') return gate ? overlay : null;
      if (sel === '[data-tour-start-button]') return gate ? button : null;
      return null;
    },
    querySelectorAll() { return []; },
    getElementById() { return null; },
    createElement() { return makeEl(); },
    addEventListener() {},
    dispatchEvent() {},
  };
  const scenes = Array.from({ length: sceneCount }, (_, i) => ({
    id: 's' + i, levels: [], faceSize: 1, initialViewParameters: {}, linkHotspots: [], infoHotspots: [],
  }));
  const window = {
    APP_DATA: { scenes, settings: {} },
    // Not on window yet: the script must fetch the vendor bundles itself.
    addEventListener() {},
    matchMedia: () => ({ matches: false, addListener() {} }),
    setTimeout, clearTimeout,
  };
  const marzipano = fakeMarzipano(counts);
  // The vendor bundle "loading" is what puts Marzipano on window.
  head.appendChild = (script) => {
    counts.vendorLoads++;
    window.Marzipano = window.Marzipano || marzipano;
    window.bowser = {}; window.screenfull = { enabled: false };
    script.dataset.loaded = 'true';
    queueMicrotask(() => (script.listeners.load || []).forEach((fn) => fn()));
  };

  // `matchMedia` is read as a bare global once in initTour, so it is passed
  // as a parameter rather than only hung on the fake window.
  new Function('window', 'document', 'CustomEvent', 'Promise', 'matchMedia', SOURCE)(
    window, document, function CustomEvent(type, init) { this.type = type; this.detail = init && init.detail; }, Promise, window.matchMedia
  );
  // Let ensureTourDependencies() settle.
  await new Promise((r) => setTimeout(r, 0));
  return { counts, button, overlay, body, window };
}

test('with the gate present, page load builds no viewer and no scene', async () => {
  const { counts, body } = await boot();
  assert.ok(counts.vendorLoads > 0, 'vendor bundles still load at page open');
  assert.equal(counts.viewers, 0);
  assert.equal(counts.scenes, 0);
  assert.equal(body.classList.contains('tour-ready'), false);
});

test('pressing Start the tour builds the viewer and every scene, then starts', async () => {
  const { counts, button, overlay, body } = await boot({ sceneCount: 5 });
  button.click();
  await new Promise((r) => setTimeout(r, 0));
  assert.equal(counts.viewers, 1);
  assert.equal(counts.scenes, 5);
  assert.equal(body.classList.contains('tour-ready'), true);
  assert.equal(overlay.hasAttribute('hidden'), true);
});

test('a second press is inert', async () => {
  const { counts, button } = await boot();
  button.click();
  await new Promise((r) => setTimeout(r, 0));
  button.click();
  await new Promise((r) => setTimeout(r, 0));
  assert.equal(counts.viewers, 1);
});

test('without the gate, the tour starts on load as it always did', async () => {
  const { counts, body } = await boot({ gate: false, sceneCount: 2 });
  assert.equal(counts.viewers, 1);
  assert.equal(counts.scenes, 2);
  assert.equal(body.classList.contains('tour-ready'), true);
});
