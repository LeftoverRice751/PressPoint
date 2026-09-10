// Run with: node --test tests/js/
//
// The kiosk carousel as the kiosk's navigation (resources/js/welcome-screen.js).
//
// The contract this file pins was inverted by the direct-content rework, so
// read this before "fixing" a failure back towards the old behaviour:
//
//   BEFORE  browse-then-commit. A tap on a SIDE card only re-centred it; a
//           second tap on the now-centred card was what opened it, and a
//           `.wc-stage` preview with a VIEW button sat between the two. Three
//           commits (f52b85e, 86747f0, 881e017) went into a `preTapActiveIndex`
//           snapshot that told those two taps apart.
//   NOW     the carousel IS the navigation. Centring a card is opening it.
//           There is no second gesture for a first one to be distinguished
//           from, so the snapshot machinery is gone with the preview it served.
//
// What still matters, and is what these tests actually guard:
//
//   * every gesture that changes the active card renders that section, with no
//     second interaction anywhere;
//   * a fast swipe across several cards commits ONCE — otherwise it loads a
//     document per card AND pushes a history entry per card, which makes Back
//     walk through cards the visitor only flew past;
//   * with kiosk-content.js absent the cards still navigate as plain links,
//     which is the no-JS guarantee they have always carried.

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const SOURCE = readFileSync(join(here, '../../resources/js/welcome-screen.js'), 'utf8');

// Same import-stripping harness as welcome-idle-bfcache.test.mjs and
// welcome-idle-wake.test.mjs — see their header comments for why a plain
// `new Function(...)` body can't tolerate the file's leading ESM imports.
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
    if (trimmed === '') {
      continue;
    }
    break;
  }

  return lines.slice(cut).join('\n');
}

const STRIPPED_SOURCE = stripLeadingImports(SOURCE);

const CARD_COUNT = 6;
// Must stay >= COMMIT_DELAY_MS in welcome-screen.js.
const COMMIT_DELAY_MS = 180;

/**
 * Boots welcome-screen.js with a live carousel and a controllable clock.
 *
 * @param {object}  [opts]
 * @param {boolean} [opts.withContent]  install window.__kioskContent (default true)
 * @param {number}  [opts.activeIndex]  what the server rendered as active
 */
async function boot({ withContent = true, activeIndex = 0 } = {}) {
  const cards = Array.from({ length: CARD_COUNT }, (_, i) => ({
    index: i,
    dataset: { menuId: `sec-${i}`, menuTitle: `Card ${i}`, menuEmbed: `/kiosk/embed/sec-${i}` },
    classList: { add() {}, remove() {}, toggle() {} },
    getAttribute(name) {
      if (name === 'href') return `/kiosk/sec-${this.index}`;
      if (name === 'data-menu-id') return this.dataset.menuId;
      if (name === 'data-menu-embed') return this.dataset.menuEmbed;
      return null;
    },
    setAttribute() {},
    closest(sel) { return sel === '.feature-card' ? this : null; },
  }));

  const carouselListeners = {};
  const carouselEl = {
    querySelector: (sel) => (sel === '.swiper-slide' ? cards[0] : null),
    addEventListener(type, fn) { (carouselListeners[type] ||= []).push(fn); },
    removeEventListener() {},
  };

  const slideToCalls = [];
  const swiperEvents = {};
  let swiperInstance = null;
  function SwiperStub(container, options) {
    swiperInstance = {
      slides: cards,
      activeIndex: (options && options.initialSlide) || 0,
      on(type, fn) { (swiperEvents[type] ||= []).push(fn); },
      slideTo(i) {
        slideToCalls.push(i);
        this.activeIndex = i;
        // Swiper emits slideChange synchronously from slideTo, which is
        // exactly what the suppressCommit guard has to survive.
        (swiperEvents.slideChange || []).forEach((fn) => fn());
      },
    };
    return swiperInstance;
  }

  const configEl = {
    getAttribute(name) {
      if (name === 'data-active-index') return String(activeIndex);
      if (name === 'data-active-section') return `sec-${activeIndex}`;
      if (name === 'data-default-section') return 'sec-0';
      return '';
    },
  };

  const docListeners = {};
  const document = {
    addEventListener(type, fn) { (docListeners[type] ||= []).push(fn); },
    removeEventListener() {},
    getElementById: (id) => (id === 'kiosk-config' ? configEl : null),
    querySelector: (sel) => (sel === '[data-wc-swiper]' ? carouselEl : null),
    querySelectorAll: (sel) => (sel === '.feature-card' ? cards : []),
    dispatchEvent() { return true; },
    body: { classList: { add() {}, remove() {}, contains: () => false } },
  };

  // A controllable clock, so the commit debounce can be asserted rather than
  // waited out. Only setTimeout is modelled; the file's setInterval polls are
  // fire-and-forget here.
  let now = 0;
  let seq = 0;
  const timers = new Map();
  const window = {
    addEventListener() {},
    removeEventListener() {},
    location: { pathname: `/kiosk/sec-${activeIndex}` },
    history: { pushState() {}, replaceState() {} },
    setTimeout(fn, delay) {
      const id = ++seq;
      timers.set(id, { fn, at: now + (delay || 0) });
      return id;
    },
    clearTimeout(id) { timers.delete(id); },
    setInterval: () => 0,
    clearInterval() {},
    requestAnimationFrame(fn) { fn(); return 0; },
  };

  const contentCalls = { show: [] };
  if (withContent) {
    window.__kioskContent = {
      show(id, opts) {
        contentCalls.show.push({ id, opts: opts || {} });
        return true;
      },
      current: () => `sec-${activeIndex}`,
      defaultId: () => 'sec-0',
      indexOf: (id) => cards.findIndex((c) => c.dataset.menuId === id),
      sections: () => [],
    };
  }

  const fetch = async () => ({ ok: false, json: async () => ({}) });

  new Function(
    'document',
    'window',
    'fetch',
    'Swiper',
    'Navigation',
    'Keyboard',
    'A11y',
    STRIPPED_SOURCE,
  )(document, window, fetch, SwiperStub, {}, {}, {});

  docListeners.DOMContentLoaded.forEach((fn) => fn());
  await new Promise((r) => setImmediate(r));

  function advance(ms) {
    now += ms;
    for (const [id, t] of [...timers]) {
      if (t.at <= now) {
        timers.delete(id);
        t.fn();
      }
    }
  }

  function fireClick(card, extra = {}) {
    let prevented = false;
    const ev = {
      target: card,
      button: 0,
      metaKey: false, ctrlKey: false, shiftKey: false, altKey: false,
      preventDefault: () => { prevented = true; },
      ...extra,
    };
    (carouselListeners.click || []).forEach((fn) => fn(ev));
    return prevented;
  }

  return {
    cards,
    swiper: () => swiperInstance,
    slideToCalls,
    contentCalls,
    advance,
    tap: (card, extra) => fireClick(card, extra),
    // A swipe or an arrow press: Swiper moves itself, then emits slideChange.
    swipeTo(index) {
      swiperInstance.activeIndex = index;
      (swiperEvents.slideChange || []).forEach((fn) => fn());
    },
    emitContentChange(index) {
      (docListeners['kiosk-content:change'] || []).forEach((fn) =>
        fn({ detail: { section: `sec-${index}`, index } }),
      );
    },
  };
}

/* ── Every gesture navigates, with no second interaction ─────────────────── */

test('tapping a side card renders it immediately — no second tap', async () => {
  const k = await boot({ activeIndex: 1 });

  const prevented = k.tap(k.cards[3]);

  assert.equal(prevented, true, 'the anchor must not also navigate away from the shell');
  assert.deepEqual(k.slideToCalls, [3], 'the card is centred');
  assert.deepEqual(
    k.contentCalls.show.map((c) => c.id), ['sec-3'],
    'and rendered — this is the whole point of the change: a side tap used to '
    + 'ONLY re-centre, and needed a second tap to open',
  );
});

test('tapping the already-centred card renders it', async () => {
  const k = await boot({ activeIndex: 1 });

  const prevented = k.tap(k.cards[1]);

  assert.equal(prevented, true);
  assert.deepEqual(k.contentCalls.show.map((c) => c.id), ['sec-1']);
  assert.deepEqual(k.slideToCalls, [], 'already centred — no need to move it');
});

test('a tap commits immediately, without waiting out the swipe debounce', async () => {
  const k = await boot({ activeIndex: 0 });

  k.tap(k.cards[4]);

  // Asserted BEFORE advancing the clock: a direct tap names its destination
  // outright, so the debounce that protects a scrub has nothing to absorb and
  // would just be lag.
  assert.equal(k.contentCalls.show.length, 1, 'rendered on the tap itself');
  k.advance(COMMIT_DELAY_MS * 2);
  assert.equal(k.contentCalls.show.length, 1, 'and the cancelled debounce does not fire again');
});

test('keyboard activation renders the card, centred or not', async () => {
  const k = await boot({ activeIndex: 0 });

  const prevented = k.tap(k.cards[2]);

  assert.equal(prevented, true);
  assert.deepEqual(k.slideToCalls, [2]);
  assert.deepEqual(k.contentCalls.show.map((c) => c.id), ['sec-2']);
});

/* ── Swiping: commit once, when it settles ───────────────────────────────── */

test('a swipe renders the section it lands on', async () => {
  const k = await boot({ activeIndex: 0 });

  k.swipeTo(2);
  assert.equal(k.contentCalls.show.length, 0, 'not before the debounce elapses');

  k.advance(COMMIT_DELAY_MS);
  assert.deepEqual(k.contentCalls.show.map((c) => c.id), ['sec-2']);
});

test('a fast swipe across four cards commits exactly once', async () => {
  const k = await boot({ activeIndex: 0 });

  // Four slideChanges inside the debounce window, as a flick produces.
  k.swipeTo(1);
  k.advance(40);
  k.swipeTo(2);
  k.advance(40);
  k.swipeTo(3);
  k.advance(40);
  k.swipeTo(4);
  k.advance(COMMIT_DELAY_MS);

  assert.deepEqual(
    k.contentCalls.show.map((c) => c.id), ['sec-4'],
    'one load and — the part that actually bites — ONE history entry. Without '
    + 'the debounce, Back would step through every card the finger flew past',
  );
});

/* ── popstate: the carousel follows without re-pushing ───────────────────── */

test('kiosk-content:change moves the carousel without committing again', async () => {
  const k = await boot({ activeIndex: 0 });

  // What kiosk-content.js emits after a popstate has already rendered a
  // section and moved the history cursor.
  k.emitContentChange(3);
  k.advance(COMMIT_DELAY_MS * 2);

  assert.deepEqual(k.slideToCalls, [3], 'the strip follows the content');
  assert.deepEqual(
    k.contentCalls.show, [],
    'but must NOT push a fresh entry for a Back the browser already performed '
    + '— that is what makes Back walk in place',
  );
});

test('a genuine swipe still commits after a popstate-driven move', async () => {
  const k = await boot({ activeIndex: 0 });

  k.emitContentChange(3);
  k.advance(COMMIT_DELAY_MS * 2);
  assert.deepEqual(k.contentCalls.show, [], 'precondition: the sync was suppressed');

  // suppressCommit is released on the next animation frame; the stub runs rAF
  // synchronously, so by here it must already be off again.
  k.swipeTo(4);
  k.advance(COMMIT_DELAY_MS);

  assert.deepEqual(
    k.contentCalls.show.map((c) => c.id), ['sec-4'],
    'the guard must be released, not latched — a latched one would leave the '
    + 'carousel permanently unable to change the content',
  );
});

/* ── Degradation and edge cases ──────────────────────────────────────────── */

test('with no content controller the card navigates as a plain link', async () => {
  const k = await boot({ withContent: false, activeIndex: 1 });

  const prevented = k.tap(k.cards[3]);

  assert.equal(
    prevented, false,
    'kiosk-content.js absent (older cached shell, or the bundle failed to '
    + 'load) must fall back to the anchor rather than swallowing the tap and '
    + 'leaving a dead card',
  );
});

test('a modified click is left to the browser', async () => {
  const k = await boot({ activeIndex: 0 });

  const prevented = k.tap(k.cards[2], { metaKey: true });

  assert.equal(prevented, false, 'cmd/ctrl-click opens the section in a new tab');
  assert.deepEqual(k.contentCalls.show, [], 'and does not change this document');
});

test('a click that resolves to no card is ignored', async () => {
  const k = await boot({ activeIndex: 1 });

  const prevented = k.tap({ closest: () => null });

  assert.equal(prevented, false, 'nothing to activate when no card was hit');
  assert.deepEqual(k.contentCalls.show, []);
});

test('the carousel starts on the section the server rendered', async () => {
  // /kiosk/virtual-tour must arrive with the tour BOTH centred and loaded;
  // a hardcoded initialSlide would show the wrong card over the right content.
  const k = await boot({ activeIndex: 3 });

  assert.equal(k.swiper().activeIndex, 3);
  assert.deepEqual(k.contentCalls.show, [], 'and must not re-render what is already there');
});
