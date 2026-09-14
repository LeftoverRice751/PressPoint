// Run with: node --test tests/js/
//
// The About LSPU kiosk client (resources/js/about-lspu-kiosk.js).
//
// The page opens on the mission and the rail down the right edge is the only
// navigation. What is worth pinning is the part CSS cannot express and that
// fails quietly:
//
//   * the landing view is `mission`, not the hub the page used to open on —
//     the hub markup is gone, so booting to it would show an empty shell.
//   * `aria-current` follows the open pane. The rail's highlight is bound to
//     that attribute, so a stale one shows the visitor in two places at once.
//   * leaving the hymn pauses the media, or it keeps playing under a pane
//     that shows no player and offers no way to stop it.
//   * the idle timer returns to the mission, and only runs away from it — a
//     terminal parked on its own home screen has nowhere to return to.

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const SOURCE = readFileSync(join(here, '../../resources/js/about-lspu-kiosk.js'), 'utf8');

const SLUGS = ['mission', 'values', 'history', 'quality', 'hymn', 'seal'];

function makeEl(attrs = {}) {
  return {
    attrs: { ...attrs },
    listeners: {},
    classList: { toggle() {}, add() {}, remove() {} },
    scrollTop: 99,
    setAttribute(n, v) { this.attrs[n] = String(v); },
    getAttribute(n) { return n in this.attrs ? this.attrs[n] : null; },
    removeAttribute(n) { delete this.attrs[n]; },
    hasAttribute(n) { return n in this.attrs; },
    addEventListener(t, fn) { (this.listeners[t] ||= []).push(fn); },
    click() { (this.listeners.click || []).forEach((fn) => fn({})); },
  };
}

// A hand-rolled stand-in for the handful of selectors the script uses. Each
// query is matched literally against what the script asks for, so a new
// selector in the source fails loudly here rather than silently matching [].
function boot() {
  const rail = Object.fromEntries(SLUGS.map((s) => [s, makeEl({ 'data-target': s })]));
  rail.mission.setAttribute('aria-current', 'true');
  const bodies = Object.fromEntries(SLUGS.map((s) => [s, makeEl()]));
  const media = { paused: false, pause() { this.paused = true; } };

  const app = {
    dataset: {},
    querySelectorAll(sel) {
      if (sel === '[data-target]' || sel === '.about-rail__btn[data-target]') return Object.values(rail);
      if (sel === '[data-hymn-media]') return [media];
      if (sel === '[data-history]' || sel === '[data-hymn]' || sel === '.seal') return [];
      throw new Error('unexpected querySelectorAll: ' + sel);
    },
    querySelector(sel) {
      const m = /^\.about-detail\[data-pane="(\w+)"\] \.about-body$/.exec(sel);
      if (m) return bodies[m[1]];
      throw new Error('unexpected querySelector: ' + sel);
    },
  };

  const timers = [];
  const window = {
    scrollTo() {},
    setTimeout(fn, ms) { timers.push({ fn, ms }); return timers.length; },
    clearTimeout(id) { if (timers[id - 1]) timers[id - 1].cleared = true; },
  };
  const document = {
    querySelector(sel) { return sel === '.about-app' ? app : null; },
    addEventListener() {},
  };

  new Function('window', 'document', SOURCE)(window, document);
  return { app, rail, bodies, media, timers };
}

function current(rail) {
  return SLUGS.filter((s) => rail[s].getAttribute('aria-current') === 'true');
}

test('boots on the mission, with the mission marked current', () => {
  const { app, rail } = boot();
  assert.equal(app.dataset.view, 'mission');
  assert.deepEqual(current(rail), ['mission']);
});

test('a rail tap switches the pane and moves aria-current with it', () => {
  const { app, rail, bodies } = boot();
  rail.values.click();
  assert.equal(app.dataset.view, 'values');
  assert.deepEqual(current(rail), ['values']);
  // The freshly opened pane starts at the top, not where the last visitor left it.
  assert.equal(bodies.values.scrollTop, 0);
});

test('leaving the hymn pauses whatever was playing', () => {
  const { rail, media } = boot();
  rail.hymn.click();
  media.paused = false;
  rail.seal.click();
  assert.equal(media.paused, true);
});

test('idle returns to the mission and is only armed away from it', () => {
  const { app, timers } = boot();
  // Booting onto the home view arms nothing.
  assert.equal(timers.filter((t) => !t.cleared).length, 0);

  const { app: app2, rail: rail2, timers: timers2 } = boot();
  rail2.history.click();
  const live = timers2.filter((t) => !t.cleared);
  assert.equal(live.length, 1);
  assert.equal(live[0].ms, 60 * 1000);
  live[0].fn();
  assert.equal(app2.dataset.view, 'mission');
  assert.equal(app.dataset.view, 'mission');
});
