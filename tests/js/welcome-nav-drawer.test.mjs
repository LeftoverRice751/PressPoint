// Run with: node --test tests/js/
//
// The kiosk menu drawer (resources/js/welcome-screen.js).
//
// The carousel folds away so the content can have its 230px back. The band's
// size is pure CSS — flex-basis on .wc-carousel — so what is worth testing here
// is the part CSS cannot express, and specifically the parts that fail quietly:
//
//   * `inert` on the collapsed carousel. overflow:hidden clips it but leaves
//     its six cards focusable, so without this a keyboard visitor tabs into
//     links they cannot see and the kiosk appears to navigate at random.
//   * the toggle must never navigate. Collapsing is a view change, not a
//     destination change; if it committed a section, tucking the menu away
//     would reload whatever the visitor was reading.
//   * the drawer is sticky across sections but NOT across visitors. Collapse
//     it and it stays down while you work; the attract reset re-opens it, and
//     that is the only thing that does — otherwise the next person arrives at
//     a terminal with no visible way to navigate.

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const SOURCE = readFileSync(join(here, '../../resources/js/welcome-screen.js'), 'utf8');

// Same import-stripping harness as the other welcome-* tests — see their
// headers for why a plain new Function() body cannot tolerate the leading
// ESM imports.
function stripLeadingImports(source) {
  const lines = source.split('\n');
  let inBlockComment = false;
  let inImport = false;
  let cut = 0;

  for (; cut < lines.length; cut++) {
    const trimmed = lines[cut].trim();
    if (inBlockComment) {
      if (trimmed.endsWith('*/')) inBlockComment = false;
      continue;
    }
    if (inImport) {
      if (trimmed.endsWith(';')) inImport = false;
      continue;
    }
    if (trimmed.startsWith('/*')) {
      inBlockComment = !trimmed.endsWith('*/');
      continue;
    }
    if (trimmed.startsWith('import ')) {
      inImport = !trimmed.endsWith(';');
      continue;
    }
    if (trimmed === '') continue;
    break;
  }
  return lines.slice(cut).join('\n');
}

const STRIPPED_SOURCE = stripLeadingImports(SOURCE);

function makeEl(attrs = {}) {
  return {
    attrs: { ...attrs },
    listeners: {},
    setAttribute(n, v) { this.attrs[n] = String(v); },
    getAttribute(n) { return n in this.attrs ? this.attrs[n] : null; },
    removeAttribute(n) { delete this.attrs[n]; },
    hasAttribute(n) { return n in this.attrs; },
    toggleAttribute(n, force) {
      const on = force === undefined ? !(n in this.attrs) : !!force;
      if (on) this.attrs[n] = '';
      else delete this.attrs[n];
      return on;
    },
    addEventListener(t, fn) { (this.listeners[t] ||= []).push(fn); },
    removeEventListener() {},
  };
}

async function boot({ withToggle = true, currentSection = 'sec-0' } = {}) {
  const shell = makeEl({ 'data-nav': 'expanded' });
  const toggle = makeEl({ 'aria-expanded': 'true', 'aria-label': 'Hide the kiosk menu' });
  const panel = makeEl({ id: 'kiosk-menu' });

  const cards = Array.from({ length: 6 }, (_, i) => ({
    dataset: { menuId: `sec-${i}`, menuTitle: `Card ${i}`, menuEmbed: `/kiosk/embed/sec-${i}` },
    classList: { add() {}, remove() {}, toggle() {} },
    getAttribute(n) {
      if (n === 'href') return `/kiosk/sec-${i}`;
      if (n === 'data-menu-id') return `sec-${i}`;
      if (n === 'data-menu-embed') return `/kiosk/embed/sec-${i}`;
      return null;
    },
    setAttribute() {},
    closest(sel) { return sel === '.feature-card' ? this : null; },
  }));

  const carouselListeners = {};
  const carouselEl = {
    querySelector: (sel) => (sel === '.swiper-slide' ? cards[0] : null),
    addEventListener(t, fn) { (carouselListeners[t] ||= []).push(fn); },
    removeEventListener() {},
  };

  const swiperEvents = {};
  const updateCalls = [];
  let swiperInstance = null;
  function SwiperStub(_c, options) {
    swiperInstance = {
      slides: cards,
      activeIndex: (options && options.initialSlide) || 0,
      on(t, fn) { (swiperEvents[t] ||= []).push(fn); },
      slideTo(i) { this.activeIndex = i; (swiperEvents.slideChange || []).forEach((f) => f()); },
      update() { updateCalls.push(true); },
    };
    return swiperInstance;
  }

  const configEl = {
    getAttribute(n) {
      if (n === 'data-active-index') return '0';
      if (n === 'data-active-section') return 'sec-0';
      if (n === 'data-default-section') return 'sec-0';
      return '';
    },
  };

  const docListeners = {};
  const document = {
    addEventListener(t, fn) { (docListeners[t] ||= []).push(fn); },
    removeEventListener() {},
    getElementById: (id) => (id === 'kiosk-config' ? configEl : id === 'kiosk-menu' ? panel : null),
    querySelector: (sel) => {
      if (sel === '[data-wc-swiper]') return carouselEl;
      if (sel === '.kiosk-shell') return shell;
      if (sel === '[data-wc-nav-toggle]') return withToggle ? toggle : null;
      return null;
    },
    querySelectorAll: (sel) => (sel === '.feature-card' ? cards : []),
    dispatchEvent() { return true; },
    body: { classList: { add() {}, remove() {}, contains: () => false } },
  };

  let now = 0;
  let seq = 0;
  const timers = new Map();
  const window = {
    addEventListener() {},
    removeEventListener() {},
    location: { pathname: '/kiosk/sec-0' },
    history: { pushState() {}, replaceState() {} },
    setTimeout(fn, delay) { const id = ++seq; timers.set(id, { fn, at: now + (delay || 0) }); return id; },
    clearTimeout(id) { timers.delete(id); },
    setInterval: () => 0,
    clearInterval() {},
    requestAnimationFrame(fn) { fn(); return 0; },
  };

  const shown = [];
  window.__kioskContent = {
    show(id, opts) { shown.push({ id, opts: opts || {} }); return true; },
    current: () => currentSection,
    defaultId: () => 'sec-0',
    indexOf: (id) => cards.findIndex((c) => c.dataset.menuId === id),
    sections: () => [],
  };

  const fetch = async () => ({ ok: false, json: async () => ({}) });

  new Function(
    'document', 'window', 'fetch', 'Swiper', 'Navigation', 'Keyboard', 'A11y',
    STRIPPED_SOURCE,
  )(document, window, fetch, SwiperStub, {}, {}, {});

  docListeners.DOMContentLoaded.forEach((fn) => fn());
  await new Promise((r) => setImmediate(r));

  return {
    shell,
    toggle,
    panel,
    cards,
    shown,
    updateCalls,
    swiper: () => swiperInstance,
    nav: () => shell.getAttribute('data-nav'),
    tapToggle() { (toggle.listeners.click || []).forEach((fn) => fn()); },
    tapCard(card) {
      const ev = {
        target: card, button: 0,
        metaKey: false, ctrlKey: false, shiftKey: false, altKey: false,
        preventDefault() {},
      };
      (carouselListeners.click || []).forEach((fn) => fn(ev));
    },
    advance(ms) {
      now += ms;
      for (const [id, t] of [...timers]) {
        if (t.at <= now) { timers.delete(id); t.fn(); }
      }
    },
    // What the 30s attract does when nobody has touched the terminal.
    attract() {
      (docListeners.__attract || []).forEach((fn) => fn());
    },
    docListeners,
  };
}

test('the kiosk boots with its menu up', async () => {
  const k = await boot();

  assert.equal(k.nav(), 'expanded');
  assert.equal(k.toggle.getAttribute('aria-expanded'), 'true');
  assert.equal(k.panel.hasAttribute('inert'), false);
});

test('tapping the toggle collapses the menu', async () => {
  const k = await boot();

  k.tapToggle();

  assert.equal(k.nav(), 'collapsed');
  assert.equal(k.toggle.getAttribute('aria-expanded'), 'false');
});

test('the accessible name says what pressing it will do', async () => {
  const k = await boot();
  assert.equal(k.toggle.getAttribute('aria-label'), 'Hide the kiosk menu');

  k.tapToggle();

  // Not "Menu is hidden": aria-expanded already carries the state, and naming
  // the state as well leaves the listener to work out which is which.
  assert.equal(k.toggle.getAttribute('aria-label'), 'Show the kiosk menu');
});

test('a collapsed carousel is removed from the tab order', async () => {
  const k = await boot();

  k.tapToggle();
  assert.equal(k.panel.hasAttribute('inert'), true,
    'overflow:hidden clips the cards but leaves them focusable — a keyboard '
    + 'visitor would tab into six links they cannot see');

  k.tapToggle();
  assert.equal(k.panel.hasAttribute('inert'), false);
});

test('the toggle never navigates', async () => {
  const k = await boot();

  k.tapToggle();
  k.tapToggle();
  k.advance(1000);

  assert.deepEqual(k.shown, [],
    'collapsing is a view change, not a destination change — committing a '
    + 'section here would reload whatever the visitor was reading');
});

test('the swiper is refreshed when the menu comes back', async () => {
  const k = await boot();
  const before = k.updateCalls.length;

  k.tapToggle();
  assert.equal(k.updateCalls.length, before, 'nothing to refresh on the way down');

  k.tapToggle();
  assert.equal(k.updateCalls.length, before + 1, 'refreshed on the way up');
});

test('the menu stays down while the visitor moves between sections', async () => {
  const k = await boot();
  k.tapToggle();

  k.tapCard(k.cards[3]);
  k.advance(1000);
  k.tapCard(k.cards[1]);
  k.advance(1000);

  assert.equal(k.nav(), 'collapsed',
    'this is the whole request: put it away, work, put it back when finished');
  assert.equal(k.shown.length, 2, 'and navigation still works while it is down');
});

test('the attract reset puts the menu back up for the next visitor', async () => {
  // Parked on a section other than the default, so the reset has observable
  // work to do beyond the drawer -- without that, "expanded" could pass simply
  // because nothing ever collapsed it.
  const k = await boot({ currentSection: 'sec-3' });
  k.tapToggle();
  assert.equal(k.nav(), 'collapsed', 'precondition');

  // playIdleAttract() -> resetContentToDefault(), the only thing that re-opens
  // the drawer. Reached here through the same 30s timer the kiosk uses.
  k.advance(30 * 1000);

  assert.deepEqual(k.shown, [{ id: 'sec-0', opts: { push: false } }],
    'proves the idle path actually fired, and that the content reset rides '
    + 'along with the menu rather than being a separate timer');
  assert.equal(k.nav(), 'expanded',
    'otherwise the next person arrives at a terminal with no visible way to '
    + 'navigate, and no reason to think there is one');
  assert.equal(k.panel.hasAttribute('inert'), false);
});

test('a shell with no toggle still boots', async () => {
  // An older cached welcome.html, or a harness rendering only the carousel.
  const k = await boot({ withToggle: false });

  assert.equal(k.nav(), 'expanded');
  k.tapCard(k.cards[2]);
  assert.equal(k.shown.length, 1, 'navigation is unaffected');
});
