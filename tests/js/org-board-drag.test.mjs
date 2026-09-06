// Run with: node --test tests/js/
//
// The org board canvas is meant to be free — a card goes wherever it is
// dragged. It stopped being free: every completed drag popped "A member cannot
// report to one of its own subordinates", the card snapped back, and nothing
// was saved.
//
// The cause was a use-after-clear. finishDrag() copies state.drag into a local
// and then sets `state.drag = null` BEFORE calling dropTargetAt(), and
// dropTargetAt() read `state.drag` to build the set of cards to ignore —  the
// ones being dragged. By then it was null, so nothing was excluded, and the
// card under the pointer at release (the dragged card itself, which carries no
// `pointer-events: none`) came back as the drop target. A member is always
// inside its own subtree, so the cycle guard then refused every drag.
//
// These tests drive the real org-board-editor.js against a stub DOM. There is
// no jsdom in this project and none should be added: browser IIFEs here are run
// through `new Function` against hand-rolled stubs (see org-chart-layout.test.mjs
// and tour-charter.test.mjs). org-chart-layout.js is loaded for real into the
// same fake window, so OrgChart — and therefore the subtree walk the guard
// depends on — is genuine.

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const LAYOUT_SRC = readFileSync(join(here, '../../resources/js/org-chart-layout.js'), 'utf8');
const EDITOR_SRC = readFileSync(join(here, '../../resources/js/org-board-editor.js'), 'utf8');

const CARD_W = 200;
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

/** The nine-member board that is actually in the database: 23 is the root,
 *  36 reports to 27, everyone else reports to 23. Every card is hand-placed,
 *  which is what keeps seedPositions() from firing an extra request. */
function boardPayload() {
  const node = (id, name, parent_id, pos_x, pos_y) => ({
    id, name, position: 'Officer', parent_id, pos_x, pos_y,
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

function boot() {
  const win = {};
  new Function('window', LAYOUT_SRC)(win);

  const root = new FakeElement('div');
  root.setAttribute('data-org-board-editor', '');
  root.setAttribute('data-ob-move-url', '/org-board/dashboard/move');
  root.setAttribute('data-ob-data-url', '/org-board/dashboard/data');

  const canvas = new FakeElement('div');
  canvas.setAttribute('data-ob-canvas', '');
  const stage = new FakeElement('div');
  stage.setAttribute('data-ob-stage', '');
  const edges = new FakeElement('svg');
  edges.setAttribute('data-ob-edges', '');
  const cardLayer = new FakeElement('div');
  cardLayer.setAttribute('data-ob-cards', '');
  const frame = new FakeElement('div');
  frame.setAttribute('data-ob-frame', '');
  const fitReadout = new FakeElement('span');
  fitReadout.setAttribute('data-ob-fit-readout', '');
  const select = new FakeElement('select');
  select.setAttribute('data-ob-organization', '');
  select.value = '22';

  stage.appendChild(frame);
  stage.appendChild(edges);
  stage.appendChild(cardLayer);
  canvas.appendChild(stage);
  root.appendChild(canvas);
  root.appendChild(fitReadout);
  root.appendChild(select);

  const posts = [];
  const toasts = [];
  let hitTest = [];

  const doc = new FakeElement('document-root');
  doc.appendChild(root);
  const document = {
    querySelector: (s) => (matches(root, s) ? root : root.querySelector(s)),
    querySelectorAll: (s) => root.querySelectorAll(s),
    createElement: (tag) => new FakeElement(tag),
    addEventListener: () => {},
    elementsFromPoint: () => hitTest,
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
    if (!options || !options.body) {
      return Promise.resolve({ ok: true, json: () => Promise.resolve(boardPayload()) });
    }
    posts.push({ url, fields: options.body.entries });
    return Promise.resolve({ ok: true, json: () => Promise.resolve(boardPayload()) });
  }

  new Function('window', 'document', 'fetch', 'FormData', 'URL', EDITOR_SRC)(
    win, document, fetchStub, StubFormData, URL,
  );

  return {
    cardLayer,
    frame,
    fitReadout,
    posts,
    toasts,
    cardFor: (id) => cardLayer.querySelectorAll('[data-ob-node]')
      .find((el) => el.getAttribute('data-member-id') === String(id)),
    setHitTest: (elements) => { hitTest = elements; },
    // The editor loads its board through a promise chain; let it settle.
    settle: () => new Promise((resolve) => setTimeout(resolve, 0)),
  };
}

/** One complete drag: press, travel past the threshold, release. `over` is what
 *  the browser would report under the pointer at release. */
function drag(harness, memberId, { over, altKey = false, dx = 120, dy = 40 } = {}) {
  const card = harness.cardFor(memberId);
  assert.ok(card, `no card rendered for member ${memberId}`);

  harness.setHitTest([]);
  harness.cardLayer.dispatch('pointerdown', {
    button: 0, pointerId: 1, target: card, altKey, clientX: 0, clientY: 0,
    preventDefault() {},
  });
  harness.cardLayer.dispatch('pointermove', {
    pointerId: 1, clientX: dx, clientY: dy, preventDefault() {},
  });

  harness.setHitTest(over === undefined ? [card] : over);
  harness.cardLayer.dispatch('pointerup', {
    pointerId: 1, clientX: dx, clientY: dy, preventDefault() {},
  });
}

const BLOCK_MESSAGE = 'A member cannot report to one of its own subordinates.';

const blocked = (harness) => harness.toasts.some((t) => t.message === BLOCK_MESSAGE);
const movePosts = (harness) => harness.posts.filter((p) => p.fields.positions !== undefined);
const parentPosts = (harness) => harness.posts.filter((p) => p.fields.parent_id !== undefined);

// ── Tests ──────────────────────────────────────────────────

test('a plain drag released over the dragged card itself saves the position', async () => {
  // This is EVERY real drag: the card you are holding is under the pointer when
  // you let go, and it is hit-testable. Before the fix this was read as
  // "dropped onto itself" and refused.
  const h = boot();
  await h.settle();

  drag(h, 27); // released over its own card, the default

  assert.equal(blocked(h), false, 'a plain drag must not be refused as a cycle');
  assert.equal(movePosts(h).length, 1, 'the new position must be saved');
  assert.equal(parentPosts(h).length, 0, 'dropping on itself must not reparent');
});

test('dragging the root card is not refused either', async () => {
  // The root is the worst case: every other member is one of its subordinates,
  // so a stale exclusion set makes it permanently unmovable.
  const h = boot();
  await h.settle();

  drag(h, 23);

  assert.equal(blocked(h), false);
  assert.equal(movePosts(h).length, 1);
});

test('the whole subtree travels with a plain drag', async () => {
  const h = boot();
  await h.settle();

  drag(h, 27); // 27 carries 36

  const saved = JSON.parse(movePosts(h)[0].fields.positions);
  const ids = saved.map((entry) => String(entry.member_id)).sort();
  assert.deepEqual(ids, ['27', '36']);
});

test('the cycle guard still refuses an alt-drag onto a subordinate', async () => {
  // Alt detaches a single card and leaves its reports behind, so this drop is a
  // genuine cycle and must stay refused. The fix must not weaken it.
  const h = boot();
  await h.settle();

  drag(h, 27, { altKey: true, over: [h.cardFor(36)] });

  assert.equal(blocked(h), true, 'dropping a member onto its own report must be refused');
  assert.equal(h.posts.length, 0, 'a refused drop must not write anything');
});

test('dropping onto a non-subordinate still reparents, positions first', async () => {
  const h = boot();
  await h.settle();

  drag(h, 36, { over: [h.cardFor(26)] });
  await h.settle();

  assert.equal(blocked(h), false);
  // Ordering matters: the cards belong where they were released, so the
  // positions are saved before the reparent re-renders the board.
  assert.equal(h.posts.length, 2);
  assert.ok(h.posts[0].fields.positions !== undefined, 'positions must be saved first');
  assert.equal(h.posts[1].fields.member_id, '36');
  assert.equal(h.posts[1].fields.parent_id, '26');
});

test('dropTargetAt takes the drag explicitly and never reads state.drag', () => {
  // The regression class, guarded structurally: the bug was that this function
  // reached for mutable global state that finishDrag had already cleared. Its
  // exclusion set must come from its caller.
  const body = /function dropTargetAt\(([^)]*)\)\s*\{([\s\S]*?)\n  \}/.exec(EDITOR_SRC);
  assert.ok(body, 'dropTargetAt not found — did it get renamed?');

  const params = body[1].split(',').map((s) => s.trim()).filter(Boolean);
  assert.ok(params.includes('drag'), `dropTargetAt must accept the drag; got (${params.join(', ')})`);

  // Strip comments — the function's own comment may mention what it must not do.
  const code = body[2].replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
  assert.ok(!/state\s*\.\s*drag/.test(code), 'dropTargetAt must not read state.drag');
});

/* ---- the kiosk frame -------------------------------------------------
 *
 * The canvas is a wide desktop strip; the kiosk is a 768x1024 portrait panel
 * that scales a chart to fit with no scrolling and no zoom. An arrangement that
 * felt roomy here used to arrive there at ~0.46 with names at 6px, and nothing
 * on this screen said so. The frame and the readout are what make that visible
 * to the person who can fix it.
 */

test('the canvas draws the kiosk screen to scale', async () => {
    const harness = boot();
    await harness.settle();

    assert.equal(harness.frame.style.width, '740px');
    assert.equal(harness.frame.style.height, '820px');
});

test('the readout names the cards that are costing the kiosk its scale', async () => {
    const harness = boot();
    await harness.settle();

    // 26 is pinned at x=1120, well past the 740px frame.
    assert.match(harness.fitReadout.textContent, /outside the screen/);
    assert.ok(harness.cardFor(26).classList.contains('is-outside-frame'),
        'the card past the frame edge is the one marked');
    assert.ok(!harness.cardFor(27).classList.contains('is-outside-frame'),
        'a card inside the frame is left alone');
});

test('a card outside the frame is still drawn where it was dropped', async () => {
    // The editor must show the board as it really is. Clamping here would hide
    // the stray card from the only person who can move it back -- the kiosk is
    // where the coordinate gets dropped, not this canvas.
    const harness = boot();
    await harness.settle();

    assert.equal(harness.cardFor(26).style.left, '1120px');
});
