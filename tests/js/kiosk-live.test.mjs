// Run with: node --test tests/js/
//
// The idle gate for live editor -> kiosk updates (resources/js/kiosk-live.js).
//
// Two rules carry the whole feature and both are easy to get backwards:
//
//   * Evict IMMEDIATELY, reload CONDITIONALLY. Eviction is invisible, so it is
//     never deferred; a deferred eviction would let the visitor's next tap
//     re-serve the stale entry the event just told us about.
//   * A visitor mid-read is never interrupted. The reload waits for the attract
//     screen, which arrives at most KIOSK_IDLE_TIMEOUT after their last touch.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const SOURCE = readFileSync(join(here, '../../resources/js/kiosk-live.js'), 'utf8');

function boot({ attract = false, mode = null } = {}) {
  const window = {};
  new Function('window', SOURCE)(window);

  const timers = new Map();
  let nextId = 1;
  const calls = { evict: [], reloadContent: [], reloadAttract: 0 };
  const state = { attract, mode };

  const live = window.__kioskLiveCreate({
    evict: (s) => calls.evict.push(s),
    reloadContent: (s) => { calls.reloadContent.push(s); return true; },
    reloadAttract: () => { calls.reloadAttract += 1; },
    isAttract: () => state.attract,
    attractMode: () => state.mode,
    setTimeout: (fn, ms) => { const id = nextId++; timers.set(id, { fn, ms }); return id; },
    clearTimeout: (id) => { timers.delete(id); },
  });

  function flushTimers() {
    for (const [id, t] of Array.from(timers)) { timers.delete(id); t.fn(); }
  }
  return { live, calls, state, timers, flushTimers };
}

test('evicts immediately on receipt, before any debounce', () => {
  const { live, calls, timers } = boot();
  live.onEvent({ section: 'latest-news', stamp: 10 });
  assert.deepEqual(calls.evict, ['latest-news']);
  assert.equal(timers.size, 1, 'reload is debounced, eviction is not');
  assert.deepEqual(calls.reloadContent, []);
});

test('unattended terminal: reloads the content frame after the debounce', () => {
  const { live, calls, flushTimers } = boot({ attract: true, mode: 'video' });
  live.onEvent({ section: 'about-lspu', stamp: 10 });
  flushTimers();
  assert.deepEqual(calls.reloadContent, ['about-lspu']);
  assert.equal(calls.reloadAttract, 0, 'an idle video is never disturbed');
});

test('newsletter attract on screen: a news event reloads the attract iframe too', () => {
  const { live, calls, flushTimers } = boot({ attract: true, mode: 'newsletter' });
  live.onEvent({ section: 'latest-news', stamp: 10 });
  flushTimers();
  assert.equal(calls.reloadAttract, 1);
  assert.deepEqual(calls.reloadContent, ['latest-news']);
});

test('newsletter attract on screen: an About event leaves the attract alone', () => {
  const { live, calls, flushTimers } = boot({ attract: true, mode: 'newsletter' });
  live.onEvent({ section: 'about-lspu', stamp: 10 });
  flushTimers();
  assert.equal(calls.reloadAttract, 0);
  assert.deepEqual(calls.reloadContent, ['about-lspu']);
});

test('visitor present: defers the reload and flushes it on the next attract', () => {
  const { live, calls, state, flushTimers } = boot({ attract: false });
  live.onEvent({ section: 'latest-news', stamp: 10 });
  flushTimers();
  assert.deepEqual(calls.reloadContent, [], 'never yank the page from a visitor');
  assert.deepEqual(live.dirty(), ['latest-news']);

  state.attract = true; state.mode = 'video';
  live.onAttract({ contentJustNavigated: false });
  assert.deepEqual(calls.reloadContent, ['latest-news']);
  assert.deepEqual(live.dirty(), []);
});

test('flush skips the content reload when attract already navigated the frame', () => {
  // playIdleAttract() resets the frame to the default section BEFORE calling
  // onAttract; that reset is itself a fresh post-eviction fetch, so a second
  // reload would just cost a request.
  const { live, calls, state, flushTimers } = boot({ attract: false });
  live.onEvent({ section: 'latest-news', stamp: 10 });
  flushTimers();
  state.attract = true; state.mode = 'newsletter';
  live.onAttract({ contentJustNavigated: true });
  assert.deepEqual(calls.reloadContent, []);
  assert.equal(calls.reloadAttract, 0, 'showNewsletterAttract re-srcs the iframe itself');
  assert.deepEqual(live.dirty(), []);
});

test('a burst of events collapses to one reload per section', () => {
  const { live, calls, flushTimers } = boot({ attract: true, mode: 'video' });
  live.onEvent({ section: 'latest-news', stamp: 10 });
  live.onEvent({ section: 'latest-news', stamp: 11 });
  live.onEvent({ section: 'latest-news', stamp: 12 });
  flushTimers();
  assert.deepEqual(calls.reloadContent, ['latest-news']);
  assert.equal(calls.evict.length, 3, 'every event still evicts; eviction is idempotent');
});

test('ignores an event whose stamp is not newer than the last applied', () => {
  const { live, calls, flushTimers } = boot({ attract: true, mode: 'video' });
  live.onEvent({ section: 'latest-news', stamp: 10 });
  flushTimers();
  live.onEvent({ section: 'latest-news', stamp: 10 });
  live.onEvent({ section: 'latest-news', stamp: 9 });
  flushTimers();
  assert.deepEqual(calls.evict, ['latest-news']);
  assert.deepEqual(calls.reloadContent, ['latest-news']);
});

test('ignores unknown sections and malformed payloads', () => {
  const { live, calls, timers } = boot();
  live.onEvent({ section: 'org-chart', stamp: 10 });
  live.onEvent({ section: 'latest-news' });
  live.onEvent(null);
  live.onEvent({ section: 'latest-news', stamp: 'soon' });
  assert.deepEqual(calls.evict, []);
  assert.equal(timers.size, 0);
});

test('survives a dependency that throws', () => {
  const window = {};
  new Function('window', SOURCE)(window);
  const live = window.__kioskLiveCreate({
    evict: () => { throw new Error('no SW controller'); },
    reloadContent: () => { throw new Error('frame gone'); },
    reloadAttract: () => {},
    isAttract: () => true,
    attractMode: () => 'video',
    setTimeout: (fn) => { fn(); return 1; },
    clearTimeout: () => {},
  });
  assert.doesNotThrow(() => live.onEvent({ section: 'latest-news', stamp: 1 }));
});
