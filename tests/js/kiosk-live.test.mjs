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

// ---------------------------------------------------------------------------
// Latency budget. The tests above prove *what* happens; these pin *when*, in
// milliseconds, because "the kiosk updates live" is a timing claim. The gate
// is the only deliberate delay between an editor's save and the terminal
// re-fetching (the rest is network and render), so this is where "no delay"
// is decided. flushTimers() above runs everything at once and cannot tell a
// 750ms reload from a 75s one; this clock can. Hand-rolled because CI runs
// Node 18, which predates node:test's mock.timers.

const BUDGET_MS = 750; // DEBOUNCE_MS in kiosk-live.js; raising it slows every live update

function bootClock(opts) {
  const window = {};
  new Function('window', SOURCE)(window);
  let now = 0;
  let nextId = 1;
  const timers = new Map();
  const calls = { evict: [], reloadContent: [] };
  const state = { attract: true, mode: 'video', ...opts };

  const live = window.__kioskLiveCreate({
    evict: (s) => calls.evict.push({ s, at: now }),
    reloadContent: (s) => { calls.reloadContent.push({ s, at: now }); return true; },
    reloadAttract: () => {},
    isAttract: () => state.attract,
    attractMode: () => state.mode,
    setTimeout: (fn, ms) => { const id = nextId++; timers.set(id, { fn, due: now + ms }); return id; },
    clearTimeout: (id) => { timers.delete(id); },
  });

  // Advance the clock to `t`, firing due timers in order.
  function advanceTo(t) {
    for (;;) {
      const due = [...timers].filter(([, x]) => x.due <= t).sort((a, b) => a[1].due - b[1].due)[0];
      if (!due) break;
      timers.delete(due[0]);
      now = due[1].due;
      due[1].fn();
    }
    now = t;
  }
  return { live, calls, state, advanceTo };
}

test('budget: an unattended kiosk re-fetches exactly DEBOUNCE_MS after the event', () => {
  const { live, calls, advanceTo } = bootClock();
  live.onEvent({ section: 'latest-news', stamp: 1 });
  advanceTo(BUDGET_MS - 1);
  assert.deepEqual(calls.reloadContent, [], 'not before the debounce');
  advanceTo(BUDGET_MS);
  assert.deepEqual(calls.reloadContent, [{ s: 'latest-news', at: BUDGET_MS }]);
});

test('budget: eviction is at t=0 even while a visitor is reading', () => {
  // The reload waits for the visitor; the eviction must not, or their next
  // tap on Latest News re-serves the copy the editor just replaced.
  const { live, calls, advanceTo } = bootClock({ attract: false });
  advanceTo(5000);
  live.onEvent({ section: 'latest-news', stamp: 1 });
  assert.deepEqual(calls.evict, [{ s: 'latest-news', at: 5000 }]);
  advanceTo(60000);
  assert.deepEqual(calls.reloadContent, [], 'never pulled out from under a visitor');
  assert.deepEqual(live.dirty(), ['latest-news']);
});

test('budget: a visitor-deferred update lands the moment attract appears', () => {
  const { live, calls, state, advanceTo } = bootClock({ attract: false });
  live.onEvent({ section: 'latest-news', stamp: 1 });
  advanceTo(45000);
  state.attract = true;
  live.onAttract({ contentJustNavigated: false });
  assert.deepEqual(calls.reloadContent, [{ s: 'latest-news', at: 45000 }], 'no second debounce');
});

test('budget: sustained edits do not starve the reload past the last one', () => {
  // An editor dragging cards emits an event per drop. The debounce restarts
  // on each, which is correct -- but the reload must still land within
  // DEBOUNCE_MS of the LAST event, not wait for a quiet period that a busy
  // editing session never has.
  const { live, calls, advanceTo } = bootClock();
  for (let i = 0; i < 5; i += 1) {
    advanceTo(i * 500);
    live.onEvent({ section: 'latest-news', stamp: i + 1 });
  }
  const last = 4 * 500;
  advanceTo(last + BUDGET_MS);
  assert.deepEqual(calls.reloadContent, [{ s: 'latest-news', at: last + BUDGET_MS }]);
  assert.equal(calls.evict.length, 5);
});

test('budget: two sections changed together each reload on time', () => {
  // Per-section debounce: an About save must not reset the news timer.
  const { live, calls, advanceTo } = bootClock();
  live.onEvent({ section: 'latest-news', stamp: 1 });
  advanceTo(400);
  live.onEvent({ section: 'about-lspu', stamp: 2 });
  advanceTo(400 + BUDGET_MS);
  assert.deepEqual(calls.reloadContent, [
    { s: 'latest-news', at: BUDGET_MS },
    { s: 'about-lspu', at: 400 + BUDGET_MS },
  ]);
});

test('budget: DEBOUNCE_MS in the source is still the budget these tests assume', () => {
  const declared = Number(/var DEBOUNCE_MS = (\d+);/.exec(SOURCE)?.[1]);
  assert.equal(declared, BUDGET_MS, 'changing the debounce changes kiosk latency; update BUDGET_MS knowingly');
});
