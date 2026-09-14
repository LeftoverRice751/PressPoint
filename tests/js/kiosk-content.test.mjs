// Run with: node --test tests/js/
//
// The kiosk content frame and its history (resources/js/kiosk-content.js).
//
// Three of these guard failures that are silent and expensive on a terminal
// that runs for weeks without a reload:
//
//   * loadFrame() must navigate via contentWindow.location.replace(), never by
//     writing src. A frame's navigations join the TOP-LEVEL session history, so
//     writing src adds an entry per section change and the visitor's first Back
//     merely reloads the frame they are already looking at. Measured on the
//     real page before the fix: our own pushState fired once while
//     history.length grew by 2.
//   * popstate must not push. A Back that appends a fresh entry makes Back
//     walk in place, and no test of the forward path would ever catch it.
//   * showing the section already displayed must not reload the frame, or
//     every popstate onto the current section throws away a live map.

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const SOURCE = readFileSync(join(here, '../../resources/js/kiosk-content.js'), 'utf8');

// Plain IIFE with no imports, so unlike welcome-screen.js this goes straight
// into new Function().

const SECTIONS = [
  { id: 'latest-news', title: 'Latest News' },
  { id: 'campus-map', title: 'Campus Map' },
  { id: 'gears-archive', title: 'Gears Archive' },
  { id: 'virtual-tour', title: 'Virtual Tour' },
];

function makeCard(section) {
  return {
    dataset: { menuId: section.id },
    classes: new Set(),
    attrs: {},
    classList: {
      toggle(name, on) {
        if (on) this.owner.classes.add(name);
        else this.owner.classes.delete(name);
      },
    },
    setAttribute(name, value) { this.attrs[name] = String(value); },
    getAttribute(name) {
      if (name === 'data-menu-id') return section.id;
      if (name === 'data-menu-title') return section.title;
      if (name === 'href') return `/kiosk/${section.id}`;
      if (name === 'data-menu-embed') return `/kiosk/embed/${section.id}`;
      return this.attrs[name] ?? null;
    },
  };
}

function boot({ activeId = 'latest-news', withHost = true } = {}) {
  const cards = SECTIONS.map((s) => {
    const card = makeCard(s);
    card.classList.owner = card;
    return card;
  });
  cards.find((c) => c.dataset.menuId === activeId).classes.add('is-active');

  // Every frame navigation, in order. A bare URL is a location.replace (the
  // correct path, no history entry); a "src=" prefix marks the fallback, which
  // costs one.
  const srcLog = [];
  const frame = {
    attrs: {},
    setAttribute(name, value) {
      this.attrs[name] = String(value);
      // A real src write is a frame navigation AND a history entry; the code
      // must only ever reach it as a last resort, so log it distinctly.
      if (name === 'src') srcLog.push(`src=${value}`);
    },
    getAttribute(name) { return this.attrs[name] ?? null; },
  };
  frame.contentWindow = {
    id: 'content-frame',
    location: {
      replace(url) { srcLog.push(String(url)); },
      // A live-update reload; logged distinctly so a test can tell it from
      // a section change.
      reload() { srcLog.push('<reload>'); },
    },
  };

  const host = {
    attrs: { 'data-active-section': activeId },
    querySelector: (sel) => (sel === '[data-kiosk-frame]' ? frame : null),
    setAttribute(name, value) { this.attrs[name] = String(value); },
    getAttribute(name) { return this.attrs[name] ?? null; },
  };

  const configEl = {
    getAttribute(name) {
      if (name === 'data-active-section') return activeId;
      if (name === 'data-default-section') return 'latest-news';
      return null;
    },
  };

  const dispatched = [];
  const document = {
    title: '',
    querySelector: (sel) =>
      withHost && sel === '[data-kiosk-content]' ? host : null,
    querySelectorAll: (sel) => (sel === '.feature-card' ? cards : []),
    getElementById: (id) => (id === 'kiosk-config' ? configEl : null),
    addEventListener() {},
    dispatchEvent(ev) { dispatched.push(ev); return true; },
  };

  const winListeners = {};
  const historyLog = [];
  const window = {
    location: { origin: 'https://presspoint-gears.me', pathname: `/kiosk/${activeId}` },
    addEventListener(type, fn) { (winListeners[type] ||= []).push(fn); },
    history: {
      pushState(state, _t, url) {
        historyLog.push({ op: 'push', state, url });
        window.location.pathname = url;
      },
      replaceState(state, _t, url) {
        historyLog.push({ op: 'replace', state, url });
        window.location.pathname = url;
      },
    },
  };

  function CustomEventStub(type, init) {
    return { type, detail: (init && init.detail) || {} };
  }

  new Function('document', 'window', 'CustomEvent', SOURCE)(document, window, CustomEventStub);

  return {
    api: () => window.__kioskContent,
    cards,
    frame,
    host,
    srcLog,
    historyLog,
    dispatched,
    document,
    location: window.location,
    firePopstate(state, pathname) {
      if (pathname) window.location.pathname = pathname;
      (winListeners.popstate || []).forEach((fn) => fn({ state }));
    },
    fireMessage(data, source, origin = 'https://presspoint-gears.me') {
      (winListeners.message || []).forEach((fn) => fn({ data, source, origin }));
    },
  };
}

test('no host element means no API, so the cards keep navigating', () => {
  const k = boot({ withHost: false });
  assert.equal(k.api(), undefined,
    'welcome-screen.js feature-detects this to decide whether to cancel the '
    + 'anchor; defining it without a frame would swallow every gesture');
});

test('boot normalises the initial history entry with replaceState', () => {
  const k = boot({ activeId: 'campus-map' });

  assert.deepEqual(k.historyLog, [
    { op: 'replace', state: { kioskSection: 'campus-map' }, url: '/kiosk/campus-map' },
  ], 'replace, not push — this is the page the visitor already arrived at');
  assert.deepEqual(k.srcLog, [], 'and the server-rendered frame is left alone');
});

test('show() navigates the frame with location.replace, never src', () => {
  const k = boot({ activeId: 'latest-news' });

  k.api().show('virtual-tour');

  // A frame's navigations join the TOP-LEVEL session history, so writing src
  // would add an entry per section change and the visitor's first Back would
  // merely reload the frame they are already looking at.
  assert.deepEqual(k.srcLog, ['/kiosk/embed/virtual-tour']);
  assert.equal(k.frame.getAttribute('src'), null, 'the src attribute is never written');
  assert.equal(k.frame.getAttribute('data-src'), '/kiosk/embed/virtual-tour',
    'data-src mirrors it for tests and DevTools, and navigates nothing');
  assert.equal(k.frame.getAttribute('title'), 'Virtual Tour');
  assert.equal(k.host.getAttribute('data-active-section'), 'virtual-tour');
});

test('show() falls back to src when the frame has no reachable window', () => {
  const k = boot({ activeId: 'latest-news' });
  k.frame.contentWindow = null;

  k.api().show('campus-map');

  assert.deepEqual(k.srcLog, ['src=/kiosk/embed/campus-map'],
    'a spurious history entry beats a content area that stops changing');
});

test('show() pushes exactly one history entry', () => {
  const k = boot({ activeId: 'latest-news' });

  k.api().show('campus-map');

  assert.deepEqual(k.historyLog.slice(1), [
    { op: 'push', state: { kioskSection: 'campus-map' }, url: '/kiosk/campus-map' },
  ]);
});

test('show() with push:false renders without touching history', () => {
  const k = boot({ activeId: 'latest-news' });

  k.api().show('campus-map', { push: false });

  assert.deepEqual(k.srcLog, ['/kiosk/embed/campus-map'], 'still renders');
  assert.equal(k.historyLog.length, 1, 'only the boot replaceState');
});

test('showing the section already displayed does not reload the frame', () => {
  const k = boot({ activeId: 'campus-map' });

  k.api().show('campus-map');

  assert.deepEqual(k.srcLog, [],
    'a popstate can land on the section already on screen; reloading would '
    + 'throw away a live Leaflet map for nothing');
});

test('an unknown section id is refused rather than blanking the frame', () => {
  const k = boot({ activeId: 'latest-news' });

  assert.equal(k.api().show('does-not-exist'), false);
  assert.deepEqual(k.srcLog, []);
});

test('the active card tracks the rendered section', () => {
  const k = boot({ activeId: 'latest-news' });

  k.api().show('gears-archive');

  const active = k.cards.filter((c) => c.classes.has('is-active'));
  assert.equal(active.length, 1, 'exactly one card may claim to be current');
  assert.equal(active[0].dataset.menuId, 'gears-archive');
  assert.equal(active[0].attrs['aria-current'], 'page');
  assert.equal(
    k.cards.find((c) => c.dataset.menuId === 'latest-news').attrs['aria-current'],
    'false',
  );
});

/* ── History ─────────────────────────────────────────────────────────────── */

test('popstate renders the section without pushing a new entry', () => {
  const k = boot({ activeId: 'latest-news' });
  k.api().show('campus-map');
  const before = k.historyLog.length;

  k.firePopstate({ kioskSection: 'latest-news' }, '/kiosk/latest-news');

  assert.equal(k.api().current(), 'latest-news');
  assert.equal(k.historyLog.length, before,
    'the browser already moved the cursor; pushing here makes Back walk in place');
});

test('popstate falls back to the path when the entry carries no state', () => {
  const k = boot({ activeId: 'latest-news' });
  k.api().show('virtual-tour');

  // An entry written before this script existed, or by something else.
  k.firePopstate(null, '/kiosk/campus-map');

  assert.equal(k.api().current(), 'campus-map');
});

test('popstate onto an unknown path lands on the default, not nowhere', () => {
  const k = boot({ activeId: 'campus-map' });

  k.firePopstate(null, '/kiosk/some-removed-page');

  assert.equal(k.api().current(), 'latest-news',
    'a Back that visibly does nothing reads as a broken kiosk');
});

test('popstate emits the change event the carousel follows', () => {
  const k = boot({ activeId: 'latest-news' });
  k.api().show('gears-archive');
  k.dispatched.length = 0;

  k.firePopstate({ kioskSection: 'campus-map' }, '/kiosk/campus-map');

  const change = k.dispatched.find((e) => e.type === 'kiosk-content:change');
  assert.ok(change, 'welcome-screen.js moves the strip off this');
  assert.equal(change.detail.section, 'campus-map');
  assert.equal(change.detail.index, 1, 'carries the carousel position');
});

/* ── Messages from the framed page ───────────────────────────────────────── */

test('an activity message from the content frame is re-emitted', () => {
  const k = boot({ activeId: 'latest-news' });
  k.dispatched.length = 0;

  k.fireMessage({ source: 'kiosk-frame', type: 'activity' }, k.frame.contentWindow);

  assert.ok(k.dispatched.some((e) => e.type === 'kiosk-content:activity'),
    'without this relay the shell attracts over someone using the map');
});

test('a message from another same-origin frame is ignored', () => {
  const k = boot({ activeId: 'latest-news' });
  k.dispatched.length = 0;

  // The attract overlay is a same-origin frame of this same document, so an
  // origin check alone would let the decorative newsletter drive the shell.
  k.fireMessage({ source: 'kiosk-frame', type: 'activity' }, { id: 'attract-frame' });

  assert.deepEqual(k.dispatched, []);
});

test('a cross-origin message is ignored', () => {
  const k = boot({ activeId: 'latest-news' });
  k.dispatched.length = 0;

  k.fireMessage(
    { source: 'kiosk-frame', type: 'activity' },
    k.frame.contentWindow,
    'https://evil.example',
  );

  assert.deepEqual(k.dispatched, []);
});

test('every section is reachable, one frame navigation each', () => {
  const k = boot({ activeId: 'latest-news' });

  k.api().show('campus-map');
  k.api().show('gears-archive');
  k.api().show('virtual-tour');

  assert.deepEqual(k.srcLog, [
    '/kiosk/embed/campus-map',
    '/kiosk/embed/gears-archive',
    '/kiosk/embed/virtual-tour',
  ], 'exactly one navigation per section, and no history entries from any of them');
});

test('reload(id) reloads the frame only when that section is showing', () => {
  const k = boot({ activeId: 'latest-news' });

  assert.equal(k.api().reload('about-lspu'), false, 'not the current section: nothing to do');
  assert.deepEqual(k.srcLog, []);

  assert.equal(k.api().reload('latest-news'), true);
  assert.deepEqual(k.srcLog, ['<reload>']);
});

test('reload(id) never pushes history', () => {
  const k = boot({ activeId: 'latest-news' });
  const before = k.historyLog.length; // boot stamps the initial state with replaceState
  k.api().reload('latest-news');
  assert.equal(k.historyLog.length, before, 'a reload is not a navigation the visitor can Back out of');
  assert.ok(k.historyLog.every((h) => h.op !== 'push'));
});
