// Run with: node --test tests/js/
//
// The kiosk menu's idle attract loop vs. the back bar's bfcache restore.
//
// partials/kiosk-back.html routes the bar through history.back() on purpose,
// so returning to the menu restores this page from the browser's back/forward
// cache instead of re-rendering it. A bfcache restore does NOT re-fire
// DOMContentLoaded — the whole module body is skipped — but the setTimeout
// armed before the visitor left is merely frozen, and it resolves the instant
// the page is unfrozen. So the attract video started immediately on every
// back-tap, however long the visitor had been away on another kiosk page.
//
// The fix is a `pageshow` listener that discards the stale timer and re-arms a
// full-length countdown. That is what this file pins: neither half is
// observable from the other's tests, and the failure is silent — the video
// just plays "too early", which reads as a timing quirk rather than a bug.
//
// The module is a browser IIFE, so it runs here against stub globals and a
// fake clock that records pending timeouts rather than firing them.

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const SOURCE = readFileSync(join(here, '../../resources/js/welcome-screen.js'), 'utf8');

const IDLE_MS = 30 * 1000;

/** Boots welcome-screen.js and returns handles to poke at it. */
async function boot() {
  const timers = new Map();
  let nextId = 1;

  const docListeners = {};
  const winListeners = {};
  const played = [];
  const closed = [];

  const classList = {
    _set: new Set(),
    add(c) { this._set.add(c); },
    remove(c) { this._set.delete(c); },
    contains(c) { return this._set.has(c); },
  };

  const document = {
    addEventListener(type, fn) { (docListeners[type] ||= []).push(fn); },
    removeEventListener() {},
    // No #ticker-track and no #kiosk-config: renderTicker bails early, and an
    // empty pusher key / flash URL keeps the realtime + fetch paths dormant.
    // This test is only about the idle scheduler.
    getElementById: () => null,
    body: { classList },
  };

  const window = {
    addEventListener(type, fn) { (winListeners[type] ||= []).push(fn); },
    setTimeout(fn, ms) { const id = nextId++; timers.set(id, { fn, ms }); return id; },
    clearTimeout(id) { timers.delete(id); },
    setInterval: () => nextId++,
    clearInterval() {},
    __kioskPlaySrc: (src, title, quiet) => played.push({ src, title, quiet }),
    __kioskCloseVideo: () => closed.push(true),
  };

  const fetch = async () => ({
    ok: true,
    json: async () => ({ src: '/storage/Videos/attract.mp4', title: 'Campus reel' }),
  });

  new Function('document', 'window', 'fetch', SOURCE)(document, window, fetch);

  // Fire DOMContentLoaded, then let the idle-video fetch settle so the first
  // countdown is armed.
  docListeners.DOMContentLoaded.forEach((fn) => fn());
  await new Promise((r) => setImmediate(r));

  const pending = () => [...timers.entries()].map(([id, t]) => ({ id, ...t }));

  return {
    played,
    closed,
    classList,
    pending,
    pageshow(persisted) {
      (winListeners.pageshow || []).forEach((fn) => fn({ persisted }));
    },
    fireAll() {
      pending().forEach(({ id, fn }) => { timers.delete(id); fn(); });
    },
  };
}

test('the menu arms a 30s idle countdown on first load', async () => {
  const k = await boot();

  const idle = k.pending().filter((t) => t.ms === IDLE_MS);
  assert.equal(idle.length, 1, 'exactly one idle countdown should be armed');
});

test('a bfcache restore replaces the pending countdown with a fresh one', async () => {
  const k = await boot();

  const before = k.pending().find((t) => t.ms === IDLE_MS);
  assert.ok(before, 'precondition: a countdown is pending before we navigate away');

  // The visitor taps into Archives, reads for a while, then taps the back bar.
  // The page comes back from the bfcache with that timer still queued.
  k.pageshow(true);

  const after = k.pending().filter((t) => t.ms === IDLE_MS);
  assert.equal(after.length, 1, 'still exactly one countdown, not two stacked');
  assert.notEqual(
    after[0].id, before.id,
    'the countdown armed before the visitor left must be discarded and re-armed '
    + 'from zero — a frozen timer resolves the moment the page is unfrozen, so '
    + 'reusing it plays the attract video the instant they tap back',
  );
  assert.equal(k.played.length, 0, 'and nothing should have started playing yet');
});

test('a normal load is left alone by the pageshow handler', async () => {
  const k = await boot();
  const before = k.pending().find((t) => t.ms === IDLE_MS);

  // persisted=false is an ordinary navigation, where DOMContentLoaded has
  // already done the setup. Re-arming here would be harmless but wrong.
  k.pageshow(false);

  const after = k.pending().find((t) => t.ms === IDLE_MS);
  assert.equal(after.id, before.id, 'the first-load countdown should be untouched');
});

test('the idle attract video plays without the "Now playing" banner', async () => {
  const k = await boot();

  k.fireAll();

  assert.equal(k.played.length, 1, 'the countdown should have started the video');
  assert.equal(
    k.played[0].quiet, true,
    'the attract loop must pass quiet=true — nobody triggered it, so the green '
    + 'success banner is noise aimed at a visitor who never asked for it',
  );
});
