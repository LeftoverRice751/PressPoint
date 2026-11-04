// Run with: node --test tests/js/
//
// The org board editor used to be a free-placement canvas: editors dragged
// cards into an arrangement, it was saved as pos_x/pos_y, and the kiosk --
// which stopped honouring those coordinates in 2026-09 so the portrait panel
// stayed readable -- ignored all of it. Editors carefully arranged a chart that
// never appeared on the kiosk.
//
// The editor now draws the kiosk's own layout and nothing on it can be moved.
// These tests drive the real org-board-editor.js against a stub DOM to pin
// that down: the cards land exactly where OrgChart's kiosk layout puts them,
// saved pins are ignored, and a pointer drag writes nothing.
//
// There is no jsdom in this project and none should be added: browser IIFEs
// here are run through `new Function` against hand-rolled stubs (see
// org-chart-layout.test.mjs and tour-charter.test.mjs). org-chart-layout.js is
// loaded for real into the same fake window.

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const LAYOUT_SRC = readFileSync(join(here, '../../resources/js/org-chart-layout.js'), 'utf8');
const EDITOR_SRC = readFileSync(join(here, '../../resources/js/org-board-editor.js'), 'utf8');
// shell.html loads modal-behavior.js before the panel scripts, so the fake
// window gets window.GearsModal the same way a browser does.
const MODAL_BEHAVIOR = readFileSync(join(here, '../../resources/js/modal-behavior.js'), 'utf8');

const CARD_W = 560;
const CARD_H = 96;

// ── Minimal DOM ────────────────────────────────────────────

/** Supports the selector shapes the editor actually uses: [attr], .class, tag,
 *  and tag[attr="value"]. Anything else simply does not match. */
function matches(el, selector) {
  const parts = selector.split(',').map((s) => s.trim()).filter(Boolean);
  if (parts.length > 1) return parts.some((part) => matches(el, part));

  const sel = parts[0];
  let rest = sel;
  let tag = null;

  const tagMatch = /^[a-zA-Z][\w-]*/.exec(rest);
  if (tagMatch) {
    tag = tagMatch[0];
    rest = rest.slice(tag.length);
  }
  if (tag && el.tagName.toLowerCase() !== tag.toLowerCase()) return false;

  while (rest.length) {
    const attr = /^\[([\w-]+)(?:=("|')(.*?)\2)?\]/.exec(rest);
    if (attr) {
      if (!el.attributes.hasOwnProperty(attr[1])) return false;
      if (attr[3] !== undefined && String(el.attributes[attr[1]]) !== attr[3]) return false;
      rest = rest.slice(attr[0].length);
      continue;
    }
    const cls = /^\.([\w-]+)/.exec(rest);
    if (cls) {
      if (!el.classList.contains(cls[1])) return false;
      rest = rest.slice(cls[0].length);
      continue;
    }
    return false; // unsupported shape
  }
  return true;
}

class FakeElement {
  constructor(tagName) {
    this.tagName = tagName;
    this.attributes = {};
    this.childNodes = [];
    this.parentNode = null;
    this.listeners = {};
    this.style = {};
    this.textContent = '';
    this.hidden = false;
    this.isConnected = true;
    this._classes = new Set();
    this.offsetWidth = CARD_W;
    this.offsetHeight = CARD_H;

    const classes = this._classes;
    this.classList = {
      add: (...names) => names.forEach((n) => classes.add(n)),
      remove: (...names) => names.forEach((n) => classes.delete(n)),
      contains: (n) => classes.has(n),
      toggle: (n, on) => (on === undefined ? (classes.has(n) ? classes.delete(n) : classes.add(n)) : (on ? classes.add(n) : classes.delete(n))),
    };
  }

  get className() { return Array.from(this._classes).join(' '); }
  set className(value) {
    this._classes.clear();
    String(value).split(/\s+/).filter(Boolean).forEach((n) => this._classes.add(n));
  }

  setAttribute(name, value) { this.attributes[name] = String(value); }
  getAttribute(name) { return this.attributes.hasOwnProperty(name) ? this.attributes[name] : null; }
  hasAttribute(name) { return this.attributes.hasOwnProperty(name); }
  removeAttribute(name) { delete this.attributes[name]; }

  appendChild(child) {
    child.parentNode = this;
    this.childNodes.push(child);
    return child;
  }
  removeChild(child) {
    this.childNodes = this.childNodes.filter((c) => c !== child);
    child.parentNode = null;
    return child;
  }

  set innerHTML(value) { if (!value) this.childNodes = []; }
  get innerHTML() { return ''; }

  get children() { return this.childNodes; }

  descendants() {
    const out = [];
    this.childNodes.forEach((child) => {
      out.push(child);
      out.push(...child.descendants());
    });
    return out;
  }

  querySelector(selector) {
    return this.descendants().find((el) => matches(el, selector)) || null;
  }
  querySelectorAll(selector) {
    return this.descendants().filter((el) => matches(el, selector));
  }
  closest(selector) {
    let node = this;
    while (node) {
      if (matches(node, selector)) return node;
      node = node.parentNode;
    }
    return null;
  }

  matches(selector) { return matches(this, selector); }
  focus() {}
  getBoundingClientRect() {
    return { top: 0, left: 0, width: 1200, height: 800, right: 1200, bottom: 800 };
  }

  addEventListener(type, fn) { (this.listeners[type] ||= []).push(fn); }
  removeEventListener(type, fn) {
    this.listeners[type] = (this.listeners[type] || []).filter((f) => f !== fn);
  }
  dispatch(type, event) {
    (this.listeners[type] || []).forEach((fn) => fn(event));
  }
  setPointerCapture() {}
  releasePointerCapture() {}
}

/** A chair with three reports, one of whom has a report of her own. Every
 *  card carries a pin far outside the kiosk frame, the way the live board's
 *  rows still do from the canvas era. */
function boardPayload() {
  const node = (id, name, parent_id, pos_x, pos_y) => ({
    id, name, position: 'Officer', parent_id, pos_x, pos_y, sort_order: 0,
    organization_id: 22, photo_path: null, children: [],
  });

  const root = node(23, 'Mario R. Briones', null, 580, 0);
  const p27 = node(27, 'Beltran P. Pedrigal', 23, 20, 80);
  p27.children = [node(36, 'Maria Lirio C. Ragel', 27, 580, 380)];
  root.children = [
    node(26, 'Rushid Jay S. Sancon', 23, 1120, 80),
    p27,
    node(29, 'Robert C. Agatep', 23, 700, 140),
  ];
  return { ok: true, members: [root] };
}

function boot({ canvasWidth = 900 } = {}) {
  const win = {};
  new Function('window', LAYOUT_SRC)(win);

  const root = new FakeElement('div');
  root.setAttribute('data-org-board-editor', '');
  root.setAttribute('data-ob-data-url', '/org-board/dashboard/data');
  root.setAttribute('data-ob-photo-url', '/org-board/dashboard/photo');

  const canvas = new FakeElement('div');
  canvas.setAttribute('data-ob-canvas', '');
  canvas.clientWidth = canvasWidth;
  const stage = new FakeElement('div');
  stage.setAttribute('data-ob-stage', '');
  const edges = new FakeElement('svg');
  edges.setAttribute('data-ob-edges', '');
  const cardLayer = new FakeElement('div');
  cardLayer.setAttribute('data-ob-cards', '');
  const select = new FakeElement('select');
  select.setAttribute('data-ob-organization', '');
  select.value = '22';

  stage.appendChild(edges);
  stage.appendChild(cardLayer);
  canvas.appendChild(stage);
  root.appendChild(canvas);
  root.appendChild(select);

  const posts = [];
  const toasts = [];

  const doc = new FakeElement('document-root');
  doc.appendChild(root);
  const document = {
    querySelector: (s) => (matches(root, s) ? root : root.querySelector(s)),
    querySelectorAll: (s) => root.querySelectorAll(s),
    createElement: (tag) => new FakeElement(tag),
    addEventListener: () => {},
    body: doc,
  };

  Object.assign(win, {
    OrgChart: win.OrgChart,
    location: { href: 'http://localhost/gears/dashboard?page=org-board' },
    addEventListener: () => {},
    UploadMeter: {
      makeToast: ({ filename }) => ({
        error: (m) => toasts.push({ message: m || filename, error: true }),
        complete: (m) => toasts.push({ message: m || filename, error: false }),
      }),
    },
  });

  class StubFormData {
    constructor() { this.entries = {}; }
    append(k, v) { this.entries[k] = v; }
  }

  function fetchStub(url, options) {
    // The initial load of the organization's members passes an options object
    // too (headers, credentials) — a body is what makes it a write.
    if (options && options.body) {
      posts.push({ url, fields: options.body.entries });
    }
    return Promise.resolve({ ok: true, json: () => Promise.resolve(boardPayload()) });
  }

  new Function('window', MODAL_BEHAVIOR)(win);
  new Function('window', 'document', 'fetch', 'FormData', 'URL', EDITOR_SRC)(
    win, document, fetchStub, StubFormData, URL,
  );

  return {
    win,
    canvas,
    stage,
    cardLayer,
    posts,
    toasts,
    cardFor: (id) => cardLayer.querySelectorAll('[data-ob-node]')
      .find((el) => el.getAttribute('data-member-id') === String(id)),
    // The editor loads its board through a promise chain; let it settle.
    settle: () => new Promise((resolve) => setTimeout(resolve, 0)),
  };
}

/** Where the kiosk would put each card: the same module, the same metrics. */
function kioskPositions(OrgChart) {
  const metrics = OrgChart.kioskMetrics(OrgChart.KIOSK_FRAME.width, () => ({
    width: CARD_W, height: CARD_H,
  }));
  const placed = OrgChart.layout(boardPayload().members, metrics);
  const box = OrgChart.bounds(placed, metrics, OrgChart.KIOSK_CHART.pad);
  const out = {};
  placed.forEach((item) => {
    out[item.id] = { left: `${item.x - box.minX}px`, top: `${item.y - box.minY}px` };
  });
  return out;
}

// ── Tests ──────────────────────────────────────────────────

test('every card lands where the kiosk layout puts it', async () => {
  const harness = boot();
  await harness.settle();

  const expected = kioskPositions(harness.win.OrgChart);
  for (const id of [23, 26, 27, 29, 36]) {
    const card = harness.cardFor(id);
    assert.ok(card, `no card rendered for member ${id}`);
    assert.deepEqual(
      { left: card.style.left, top: card.style.top },
      expected[id],
      `member ${id} is not where the kiosk draws it`,
    );
  }
});

test('saved canvas positions are ignored', async () => {
  // 26 was pinned at x=1120 on the old canvas, past the kiosk's 740px frame.
  // If the pin were honoured it would land there, minus the chart's minX.
  const harness = boot();
  await harness.settle();

  const left = parseFloat(harness.cardFor(26).style.left);
  assert.ok(left + CARD_W <= harness.win.OrgChart.KIOSK_FRAME.width,
    `member 26 sits at ${left}px, outside the kiosk frame`);
});

test('the chart is scaled down to fit a narrow panel, never up on a wide one', async () => {
  const narrow = boot({ canvasWidth: 370 });
  await narrow.settle();
  assert.match(narrow.stage.style.transform, /scale\(0\.\d+\)/);

  const wide = boot({ canvasWidth: 2000 });
  await wide.settle();
  assert.match(wide.stage.style.transform, /scale\(1\)/);
});

test('a pointer drag across the chart writes nothing', async () => {
  const harness = boot();
  await harness.settle();

  const card = harness.cardFor(29);
  ['pointerdown', 'pointermove', 'pointerup'].forEach((type) => {
    harness.cardLayer.dispatch(type, {
      button: 0, pointerId: 1, target: card, clientX: 120, clientY: 40,
      preventDefault() {},
    });
  });
  await harness.settle();

  assert.deepEqual(harness.posts, []);
  assert.equal(harness.cardFor(29).style.left, kioskPositions(harness.win.OrgChart)[29].left);
});

test('dropping an image file on a card uploads it as that member\'s photo', async () => {
  const harness = boot();
  await harness.settle();

  const file = { name: 'portrait.png', type: 'image/png', size: 10 };
  harness.canvas.dispatch('drop', {
    target: harness.cardFor(27),
    dataTransfer: { types: ['Files'], files: [file] },
    preventDefault() {},
  });
  await harness.settle();

  assert.equal(harness.posts.length, 1);
  assert.equal(harness.posts[0].url, '/org-board/dashboard/photo');
  assert.equal(harness.posts[0].fields.member_id, '27');
  assert.equal(harness.posts[0].fields.photo_path, file);
});

test('a dropped non-image is refused before it is uploaded', async () => {
  const harness = boot();
  await harness.settle();

  harness.canvas.dispatch('drop', {
    target: harness.cardFor(27),
    dataTransfer: { types: ['Files'], files: [{ name: 'notes.pdf', type: 'application/pdf' }] },
    preventDefault() {},
  });
  await harness.settle();

  assert.deepEqual(harness.posts, []);
  assert.ok(harness.toasts.some((t) => t.error));
});

test('every card carries an add-a-report button', async () => {
  const harness = boot();
  await harness.settle();

  const add = harness.cardFor(27).querySelector('[data-ob-add-report]');
  assert.ok(add, 'no + button on the card');
  assert.match(add.getAttribute('aria-label'), /reports to Beltran P\. Pedrigal/);
});
