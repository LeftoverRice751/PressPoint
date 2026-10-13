// Run with: node --test tests/js/
//
// Two defects in the 2.5D layer's hover highlight, both visible on the kiosk as
// "a yellow line around the whole campus that doesn't move when you zoom":
//
//   1. `_pick()` walks `_hit` back-to-front, so buildings win — but when the
//      pointer is over no building it falls through to the "Campus boundary"
//      ground polygon. `_render()` then strokes that polygon's entire
//      perimeter in `roofHighlight` (--accent, i.e. brand gold #f4be27).
//      `_label()` and `_drawOne()`'s dimming both already exempt kind ===
//      'ground'; the highlight was the one place the guard was missed.
//
//   2. `this._hover` is a drawable captured from a previous `_render()`, and a
//      drawable's `roof` holds *container pixel* coordinates. `_render()`
//      rebuilds every drawable each frame but re-strokes the stale one, so
//      during a flyTo (no mousemove fires) the outline stays frozen at the
//      old projection while everything else re-projects underneath it.
//
// On a touchscreen `mouseout` frequently never fires, so a latched hover makes
// both permanent — the same trap kiosk-nav.css documents for CSS :hover.
//
// The layer is a UMD browser plugin, so it runs here against a hand-rolled
// Leaflet stand-in and a canvas recorder.

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const SOURCE = readFileSync(join(here, '../../resources/js/campus-2.5d.layer.js'), 'utf8');

const GOLD = '#f4be27';

// ── Leaflet stand-in ──────────────────────────────────────────────────────

function makeClass(proto) {
  function C() {
    if (this.initialize) this.initialize.apply(this, arguments);
  }
  C.prototype.fire = function () { return this; };
  C.prototype.on = function () { return this; };
  Object.assign(C.prototype, proto);
  return C;
}

function makeL() {
  const L = {};
  L.Layer = { extend: makeClass };
  L.setOptions = (obj, options) => {
    obj.options = Object.assign(Object.create(obj.options || {}), options || {});
    return obj.options;
  };
  L.point = (x, y) => ({ x, y });
  L.latLng = (lat, lng) => ({ lat, lng });
  L.LatLngBounds = class {
    constructor() { this._pts = []; }
    extend(ll) { this._pts.push(ll); return this; }
  };
  L.transforms = [];
  L.DomUtil = {
    create: (tag) => makeCanvas(),
    setTransform: (el, offset, scale) => { L.transforms.push({ offset, scale }); },
    remove: () => {},
  };
  L.Browser = { any3d: false };
  return L;
}

// ── Canvas recorder ───────────────────────────────────────────────────────
//
// Records every stroke() as { style, path }, where path is the point list
// accumulated since the last beginPath(), in the coordinates the layer passed
// (i.e. container pixels). isPointInPath is a real even-odd test with the
// real canvas semantics: path points are transformed by the matrix current
// when they were added, the tested point is NOT — so a pick built under the
// dpr/padding transform misses, as it would in a browser.

function makeCtx() {
  const strokes = [];
  let path = [];
  let device = [];
  let m = { a: 1, d: 1, e: 0, f: 0 }; // scale + translate is all the layer uses
  const stack = [];
  const ctx = {
    strokes,
    clears: 0,
    fillStyle: '', strokeStyle: '', lineWidth: 1, globalAlpha: 1,
    font: '', textAlign: '', textBaseline: '',
    setTransform(a, b, c, d, e, f) { m = { a, d, e, f }; },
    translate(x, y) { m = { ...m, e: m.e + m.a * x, f: m.f + m.d * y }; },
    save() { stack.push(m); },
    restore() { m = stack.pop() || m; },
    clearRect() { ctx.clears += 1; },
    scale() {}, rotate() {},
    fill() {}, fillText() {},
    measureText: () => ({ width: 4 }),
    beginPath() { path = []; device = []; },
    moveTo(x, y) { ctx.lineTo(x, y); },
    lineTo(x, y) {
      path.push({ x, y });
      device.push({ x: m.a * x + m.e, y: m.d * y + m.f });
    },
    closePath() {},
    stroke() { strokes.push({ style: ctx.strokeStyle, path: path.slice() }); },
    isPointInPath(x, y) {
      let inside = false;
      for (let i = 0, j = device.length - 1; i < device.length; j = i++) {
        const a = device[i], b = device[j];
        if ((a.y > y) !== (b.y > y)
          && x < ((b.x - a.x) * (y - a.y)) / (b.y - a.y) + a.x) inside = !inside;
      }
      return inside;
    },
  };
  return ctx;
}

function makeCanvas() {
  const ctx = makeCtx();
  return {
    width: 0, height: 0, style: {}, classList: { add() {}, remove() {} },
    getContext: () => ctx,
    _ctx: ctx,
  };
}

// ── Map stand-in ──────────────────────────────────────────────────────────
//
// CRS.Simple-ish: x = lng * scale, y = -lat * scale. `scale` is mutable so a
// test can simulate the projection changing mid-flyTo.

function makeMap() {
  const handlers = {};
  const map = {
    scale: 1,
    _animatingZoom: false,
    options: { zoomAnimation: false },
    getSize: () => ({ x: 800, y: 600 }),
    getZoom: () => 0,
    getCenter: () => ({ lat: 0, lng: 0 }),
    latLngToContainerPoint: (ll) => ({ x: ll.lng * map.scale, y: -ll.lat * map.scale }),
    containerPointToLayerPoint: (p) => ({ x: p[0] || 0, y: p[1] || 0 }),
    containerPointToLatLng: (p) => ({ lat: -p[1] / map.scale, lng: p[0] / map.scale }),
    getZoomScale: () => 2,
    // Zooming by 2x about the origin: the new layer point of a latlng.
    _latLngToNewLayerPoint: (ll) => ({ x: ll.lng * map.scale * 2, y: -ll.lat * map.scale * 2 }),
    fire(evt) { (handlers[evt] || []).forEach((fn) => fn({})); return map; },
    getPane: () => ({ appendChild() {} }),
    getContainer: () => ({ style: {} }),
    on(evts, fn, ctx) {
      String(evts).split(' ').forEach((e) => (handlers[e] ||= []).push(fn.bind(ctx)));
      return map;
    },
    off() { return map; },
  };
  return map;
}

// One ground polygon covering 0..400 x 0..400, one building inside it.
const FIXTURE = {
  type: 'FeatureCollection',
  features: [
    {
      type: 'Feature',
      properties: { id: 'site', name: 'Campus boundary', color: '#e9dac4', height: 0, kind: 'ground' },
      geometry: {
        type: 'Polygon',
        coordinates: [[[0, 0], [400, 0], [400, -400], [0, -400], [0, 0]]],
      },
    },
    {
      type: 'Feature',
      properties: { id: '17', name: 'SSB', color: '#5B9BD5', height: 0, kind: 'building' },
      geometry: {
        type: 'Polygon',
        coordinates: [[[100, -100], [180, -100], [180, -180], [100, -180], [100, -100]]],
      },
    },
  ],
};

function boot(dpr = 1) {
  const L = makeL();
  const factory = new Function(
    'module', 'require', 'define', 'getComputedStyle', 'document', 'window',
    SOURCE,
  );
  const mod = { exports: {} };
  const getComputedStyle = () => ({
    getPropertyValue: (name) => (name === '--accent' ? GOLD : ''),
  });
  factory(
    mod, () => L, undefined, getComputedStyle,
    { documentElement: {} }, { devicePixelRatio: dpr },
  );

  const layer = L.twoPointFiveD(FIXTURE, {});
  const map = makeMap();
  layer.onAdd(map);
  return { layer, map, L, canvas: layer._canvas, ctx: layer._canvas._ctx };
}

const goldStrokes = (ctx) => ctx.strokes.filter((s) => s.style === GOLD);
const bbox = (path) => ({
  minX: Math.min(...path.map((p) => p.x)),
  maxX: Math.max(...path.map((p) => p.x)),
});

test('hovering empty campus does not outline the ground polygon', () => {
  const { layer, ctx } = boot();

  // A point inside the campus boundary but outside every building.
  layer._onMove({ containerPoint: { x: 300, y: 300 } });

  assert.equal(
    goldStrokes(ctx).length, 0,
    'the "Campus boundary" ground polygon must never take the gold hover '
    + 'outline — it draws a yellow line around the entire map',
  );
});

test('hovering a building does outline that building', () => {
  const { layer, ctx } = boot();

  layer._onMove({ containerPoint: { x: 140, y: 140 } });

  assert.equal(goldStrokes(ctx).length, 1, 'a real building should still highlight');
});

test('the hover outline re-projects when the map zooms under it', () => {
  const { layer, map, ctx } = boot();

  layer._onMove({ containerPoint: { x: 140, y: 140 } });
  const before = bbox(goldStrokes(ctx).at(-1).path);

  // Simulate a flyTo frame: the projection changes, but no mousemove fires,
  // so nothing refreshes `_hover`.
  map.scale = 2;
  layer._render();

  const after = bbox(goldStrokes(ctx).at(-1).path);
  assert.equal(
    after.minX, before.minX * 2,
    'the highlight traces a stale drawable, so it stays frozen at the old '
    + 'projection while every other feature re-projects underneath it',
  );
});

// ── Zoom animation ────────────────────────────────────────────────────────
//
// Leaflet zooms in two phases: `zoomanim` CSS-scales every
// .leaflet-zoom-animated element for 250ms while map._zoom still holds the
// OLD zoom, then the transition end fires move/zoomend at the new one. The
// layer used to break that contract three ways, which on the kiosk read as
// "the map doesn't adapt to the zoom": buildings snapping back mid-zoom,
// blank edges on zoom-out, and stutter during pinch.

test('a render during a CSS zoom animation does not undo it', () => {
  const { layer, map, L, ctx } = boot();
  const transformsBefore = L.transforms.length;
  const clearsBefore = ctx.clears;

  map._animatingZoom = true;
  layer._render();
  layer._onMove({ containerPoint: { x: 140, y: 140 } });

  assert.equal(
    L.transforms.length, transformsBefore,
    'resetting the canvas transform mid-zoom drops the CSS scale, so the '
    + 'buildings snap back to the old view while the pins keep zooming',
  );
  assert.equal(ctx.clears, clearsBefore, 'nothing should be redrawn at the stale zoom');
});

test('the canvas is padded past the viewport so a zoom-out never shows blank edges', () => {
  const { canvas, L } = boot();
  // viewport is 800x600, default padding 0.5 per side
  assert.equal(canvas.width, 1600);
  assert.equal(canvas.height, 1200);
  assert.deepEqual(L.transforms.at(-1).offset, { x: -400, y: -300 });
  assert.equal(L.transforms.at(-1).scale, 1);
});

test('zoomanim scales the canvas about its padded top-left corner', () => {
  const { layer, L } = boot();
  layer._animateZoom({ zoom: 1, center: { lat: 0, lng: 0 } });
  const t = L.transforms.at(-1);
  assert.equal(t.scale, 2);
  assert.deepEqual(t.offset, { x: -800, y: -600 });
});

test('one map move renders once, and a bare zoom event does not render', () => {
  const { map, ctx } = boot();

  let before = ctx.clears;
  map.fire('zoom');
  map.fire('move'); // Leaflet's _move always fires zoom then move
  assert.equal(ctx.clears - before, 1, 'every pinch frame used to re-project twice');

  before = ctx.clears;
  map.fire('moveend');
  assert.equal(ctx.clears - before, 0, 'moveend always follows a move that already rendered');
});

test('setCamera updates both camera options with a single render', () => {
  const { layer, ctx } = boot();
  const before = ctx.clears;
  layer.setCamera({ cameraDistance: 2.4, heightScale: 1.5 });
  assert.equal(ctx.clears - before, 1);
  assert.equal(layer.options.cameraDistance, 2.4);
  assert.equal(layer.options.heightScale, 1.5);
});

for (const dpr of [1, 2]) {
  test(`tapping a building still picks it with padding at devicePixelRatio ${dpr}`, () => {
    const { layer } = boot(dpr);
    const hit = layer._pick({ containerPoint: { x: 140, y: 140 } });
    assert.ok(hit, 'the hit path must be built in container space, like the tap point');
    assert.equal(hit.f.props.id, '17');
    assert.equal(layer._pick({ containerPoint: { x: 300, y: 300 } }), null);
  });
}
