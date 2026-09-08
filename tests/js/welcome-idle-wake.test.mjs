// Run with: node --test tests/js/
//
// The tap that dismisses the idle attract video must not also open a menu card.
//
// #kiosk-stage is a fixed inset:0 overlay at z-index 9999, so the finger really
// does land on the video. But stopIdleAttract() hides the stage on pointerdown,
// and the browser resolves a click's target by hit-testing the DOM *as it
// stands when the finger lifts* — by then the stage is display:none and the
// click lands on the <a class="feature-card"> underneath. One tap to wake the
// kiosk therefore navigated straight into Campus Map (or whichever card the
// visitor happened to be touching).
//
// The original guard called only ev.stopPropagation(). Propagation and default
// actions are separate channels: stopping the first silences listeners, while
// an anchor's navigation is its default action and only preventDefault()
// cancels it. welcome-screen.js:177 records that the cards were deliberately
// changed from <button data-target> to plain <a href>, which is what turned a
// working guard into a no-op.
//
// The mirror-image defect guarded here too: the swallower used to unregister
// only from inside its own handler, so a wake gesture that never became a click
// (a swipe, a drifted tap, a keyboard wake) left it armed indefinitely and ate
// the visitor's NEXT genuine tap instead.

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const SOURCE = readFileSync(join(here, '../../resources/js/welcome-screen.js'), 'utf8');

const IDLE_MS = 30 * 1000;

// welcome-screen.js now opens with `import Swiper from "swiper"` plus a
// `swiper/modules` destructure (added for the menu carousel) so laravel-mix
// can bundle and tree-shake it. This harness still evaluates the file's text
// with `new Function('document', 'window', 'fetch', SOURCE)`, and Function's
// implicit body is parsed as a *script*, not a *module* — a script grammar
// has no import declaration at all, so the literal `import` keyword is a
// SyntaxError before a single statement of the module runs, let alone
// DOMContentLoaded. There is no bundler in this test process to resolve
// "swiper" against, so the fix isn't "make it a real module" — it's to strip
// the leading import statements (the source is otherwise plain browser JS,
// module or not) and hand the module's `new Swiper(...)` call a stub in
// place of the real import, exactly the way `document`/`window`/`fetch`
// already stand in for the browser.
//
// The strip only touches the *leading* run of import declarations — it walks
// line by line from the top of the file, tolerating the file's opening block
// comment and the blank lines around it, and stops for good at the first
// line that isn't a comment, an `import`, or blank. That guards against ever
// touching the word "import" if it later shows up inside a string or comment
// further down the file.
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
      // Blank line between the header comment and the imports, or between
      // import statements — not code, keep scanning.
      continue;
    }
    break; // first real line of code — stop stripping.
  }

  return lines.slice(cut).join('\n');
}

const STRIPPED_SOURCE = stripLeadingImports(SOURCE);

// Minimal, honest stand-in for the real Swiper constructor. welcome-screen.js
// only ever reads `.slides`, `.activeIndex` and calls `.on(...)` on the
// instance it gets back (see syncStage() and the "slideChange" wiring) — it
// never calls `.slideTo()` or reaches into `.navigation`/`.keyboard`, so the
// stub covers exactly that surface and no more. None of the tests in this
// file exercise the carousel branch at all (the stub `document` here has no
// `[data-wc-swiper]` element to find), so this mostly exists so the module
// doesn't throw a ReferenceError merely by mentioning `Swiper` at parse-adjacent
// evaluation time.
function SwiperStub(container, options) {
  const slides =
    container && typeof container.querySelectorAll === 'function'
      ? Array.from(container.querySelectorAll('.swiper-slide'))
      : [];
  return {
    slides,
    activeIndex: (options && options.initialSlide) || 0,
    on() {},
  };
}
const NavigationStub = {};
const KeyboardStub = {};
const A11yStub = {};

/** A click on a menu card, recording whether anything cancelled it. */
function cardClick() {
  return {
    type: 'click',
    defaultPrevented: false,
    propagationStopped: false,
    preventDefault() { this.defaultPrevented = true; },
    stopPropagation() { this.propagationStopped = true; },
    stopImmediatePropagation() { this.propagationStopped = true; },
  };
}

async function boot() {
  const timers = new Map();
  let nextId = 1;
  let clock = 0;

  const listeners = { document: {}, window: {} };
  const played = [];

  function addTo(bag) {
    return (type, fn) => { (bag[type] ||= []).push(fn); };
  }
  function removeFrom(bag) {
    return (type, fn) => {
      const list = bag[type];
      if (!list) return;
      const i = list.indexOf(fn);
      if (i !== -1) list.splice(i, 1);
    };
  }

  const document = {
    addEventListener: addTo(listeners.document),
    removeEventListener: removeFrom(listeners.document),
    getElementById: () => null,
    // No [data-wc-swiper] either: the carousel setup block is dead code for
    // these tests, it just must not throw while getting there.
    querySelector: () => null,
    body: { classList: { add() {}, remove() {}, contains: () => false } },
  };

  const window = {
    addEventListener: addTo(listeners.window),
    removeEventListener: removeFrom(listeners.window),
    setTimeout(fn, ms) { const id = nextId++; timers.set(id, { fn, at: clock + ms }); return id; },
    clearTimeout(id) { timers.delete(id); },
    setInterval: () => nextId++,
    clearInterval() {},
    __kioskPlaySrc: (src, title, quiet) => played.push({ src, title, quiet }),
    __kioskCloseVideo: () => {},
  };

  const fetch = async () => ({
    ok: true,
    json: async () => ({ src: '/storage/Videos/attract.mp4', title: 'Campus reel' }),
  });

  new Function(
    'document',
    'window',
    'fetch',
    'Swiper',
    'Navigation',
    'Keyboard',
    'A11y',
    STRIPPED_SOURCE,
  )(document, window, fetch, SwiperStub, NavigationStub, KeyboardStub, A11yStub);

  listeners.document.DOMContentLoaded.forEach((fn) => fn());
  await new Promise((r) => setImmediate(r));

  /** Fire every timer due within `ms` from now, in due order. */
  function advance(ms) {
    clock += ms;
    for (;;) {
      const due = [...timers.entries()]
        .filter(([, t]) => t.at <= clock)
        .sort((a, b) => a[1].at - b[1].at);
      if (!due.length) return;
      const [id, t] = due[0];
      timers.delete(id);
      t.fn();
    }
  }

  /** Dispatch to document listeners, newest last (capture order is enough here). */
  function dispatch(type, event) {
    (listeners.document[type] || []).slice().forEach((fn) => fn(event));
    return event;
  }

  return {
    played,
    advance,
    dispatch,
    /** Run the countdown out so the attract video is on screen. */
    startAttract() {
      advance(IDLE_MS);
      assert.equal(played.length, 1, 'precondition: the attract video is playing');
    },
  };
}

test('the tap that wakes the kiosk does not open the card underneath', async () => {
  const k = await boot();
  k.startAttract();

  // Finger down on the video overlay: the stage is torn down here, so the
  // click that follows will hit-test onto a menu card.
  k.dispatch('pointerdown', { type: 'pointerdown', stopPropagation() {} });

  const click = k.dispatch('click', cardClick());

  assert.equal(
    click.defaultPrevented, true,
    'the wake tap must cancel the click\'s default action — the cards are '
    + 'plain <a href>, so stopPropagation alone still lets the browser '
    + 'navigate and the visitor lands on a page they never chose',
  );
});

test('a wake gesture that never becomes a click does not eat the next real tap', async () => {
  const k = await boot();
  k.startAttract();

  // A swipe or a drifted tap: pointerdown fires, no click ever follows.
  k.dispatch('pointerdown', { type: 'pointerdown', stopPropagation() {} });
  k.advance(2000);

  // Later, the visitor deliberately presses a card.
  const click = k.dispatch('click', cardClick());

  assert.equal(
    click.defaultPrevented, false,
    'a stale swallower must expire — otherwise it silently eats the next '
    + 'genuine tap and the card appears not to work at all',
  );
});

test('a keyboard wake does not arm the click swallower', async () => {
  const k = await boot();
  k.startAttract();

  k.dispatch('keydown', { type: 'keydown', stopPropagation() {} });
  const click = k.dispatch('click', cardClick());

  assert.equal(
    click.defaultPrevented, false,
    'only a pointer gesture produces the stray click worth swallowing',
  );
});

test('ordinary taps are untouched while no attract video is playing', async () => {
  const k = await boot();

  k.dispatch('pointerdown', { type: 'pointerdown', stopPropagation() {} });
  const click = k.dispatch('click', cardClick());

  assert.equal(
    click.defaultPrevented, false,
    'the menu must stay a plain set of links when the kiosk is awake',
  );
});
