// Run with: node --test tests/js/
//
// Tap discrimination on the kiosk menu carousel: a tap on a SIDE card must
// only re-centre it, and a tap on the ALREADY-centred card is what navigates
// — see the long comment above `preTapActiveIndex` in welcome-screen.js for
// why (the VIEW button that used to own navigation is gone as of f52b85e).
// None of this is exercised by welcome-idle-bfcache.test.mjs or
// welcome-idle-wake.test.mjs: both stub `document.querySelector: () => null`,
// so `carouselEl` is null, the `if (carouselEl && carouselEl.querySelector(...))`
// guard never opens, and the whole pointerdown/click pair is dead code under
// those harnesses. A silent failure here doesn't throw or log anything — it
// just sends an unattended kiosk visitor to a page they never tapped, so it
// needs its own coverage with a carousel that's actually wired up.
//
// This file also pins the fix for a real regression: `preTapActiveIndex` was
// written only from `pointerdown` and never reset, so a keyboard Enter (which
// fires `click` with no preceding `pointerdown`) was judged against `null`
// forever on a fresh page, or against a stale snapshot left over from an
// unrelated earlier tap once one existed. Case 4-6 below pin the fix; case 6
// specifically is written to fail against the pre-fix code (see the comment
// on that test).

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

/**
 * Boots welcome-screen.js with a carousel that's actually present, unlike
 * the idle-* tests' `document.querySelector: () => null`. Returns handles to
 * drive pointerdown/click on the carousel and inspect the Swiper stub.
 */
async function boot() {
  // Six fake .feature-card slides. `closest()` returns the card itself,
  // matching what `ev.target.closest(".feature-card")` needs when the event
  // target IS the card (the click handler doesn't care about the anchor's
  // internal markup, only that closest() resolves to a slide).
  const cards = Array.from({ length: CARD_COUNT }, (_, i) => ({
    index: i,
    closest(sel) { return sel === '.feature-card' ? this : null; },
  }));

  const carouselListeners = {};
  const carouselEl = {
    // `.querySelector(".swiper-slide")` just needs to be truthy so the
    // `if (carouselEl && carouselEl.querySelector(...))` guard at
    // welcome-screen.js:366 opens and the carousel actually gets built.
    querySelector: (sel) => (sel === '.swiper-slide' ? cards[0] : null),
    addEventListener(type, fn) {
      (carouselListeners[type] ||= []).push(fn);
    },
    removeEventListener() {},
  };

  // Swiper stub: unlike the idle-* tests' stub (which is never exercised),
  // this one needs a real, mutable `activeIndex` and a `slides` array that
  // `Array.prototype.indexOf` can find the fake cards in, plus a `slideTo`
  // spy so case 5 can assert the keyboard branch actually re-centres.
  const slideToCalls = [];
  let swiperInstance = null;
  function SwiperStub(container, options) {
    swiperInstance = {
      slides: cards,
      activeIndex: (options && options.initialSlide) || 0,
      on() {},
      slideTo(i) {
        slideToCalls.push(i);
        this.activeIndex = i;
      },
    };
    return swiperInstance;
  }

  const docListeners = {};
  const document = {
    addEventListener(type, fn) { (docListeners[type] ||= []).push(fn); },
    removeEventListener() {},
    getElementById: () => null,
    // Only [data-wc-swiper] resolves to a real element; every other lookup
    // in the setup block (stage title/icon/blurb, #kiosk-config, ticker)
    // stays null and is guarded elsewhere in the file — none of that is
    // this file's concern.
    querySelector: (sel) => (sel === '[data-wc-swiper]' ? carouselEl : null),
    body: { classList: { add() {}, remove() {}, contains: () => false } },
  };

  const window = {
    addEventListener() {},
    setTimeout: () => 0,
    clearTimeout() {},
    setInterval: () => 0,
    clearInterval() {},
    requestAnimationFrame: () => 0,
  };

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

  function firePointerdown() {
    (carouselListeners.pointerdown || []).forEach((fn) => fn());
  }

  function fireClick(card) {
    let prevented = false;
    const ev = { target: card, preventDefault: () => { prevented = true; } };
    (carouselListeners.click || []).forEach((fn) => fn(ev));
    return prevented;
  }

  return {
    cards,
    swiper: () => swiperInstance,
    slideToCalls,
    tap(card) {
      // A real touch/mouse tap always fires pointerdown before click.
      firePointerdown();
      return fireClick(card);
    },
    keyboardActivate(card) {
      // Enter/Space on a focused anchor fires click with NO pointerdown —
      // that's the whole bug. Don't call firePointerdown() here.
      return fireClick(card);
    },
    // Raw click with an arbitrary target, no card semantics assumed — used
    // for the "click resolves to no card at all" fail-safe case.
    clickWithTarget(target) {
      return fireClick(target);
    },
  };
}

test('tapping the already-centred card navigates', async () => {
  const k = await boot();
  k.swiper().activeIndex = 1;

  const prevented = k.tap(k.cards[1]);

  assert.equal(prevented, false, 'the anchor default action must go through on a centred tap');
});

test('tapping a side card is swallowed, not navigated', async () => {
  const k = await boot();
  k.swiper().activeIndex = 1;

  const prevented = k.tap(k.cards[3]);

  assert.equal(prevented, true, 'a side tap must only re-centre, never navigate');
});

test('side tap then a second tap on the now-centred card navigates', async () => {
  const k = await boot();
  k.swiper().activeIndex = 1;

  // First tap: side card 3. Swallowed, and (in the real app) Swiper's own
  // slideToClickedSlide centres it — simulate that by moving activeIndex,
  // since our Swiper stub doesn't run Swiper's internal click handling.
  const firstPrevented = k.tap(k.cards[3]);
  assert.equal(firstPrevented, true, 'precondition: the first tap must be swallowed');
  k.swiper().activeIndex = 3;

  // Second tap: same card, now centred. This is the real two-tap visitor
  // journey and the case most likely to regress.
  const secondPrevented = k.tap(k.cards[3]);

  assert.equal(secondPrevented, false, 'the second tap on the now-centred card must navigate');
});

test('keyboard Enter with no prior pointerdown navigates the centred card', async () => {
  const k = await boot();
  k.swiper().activeIndex = 2;

  const prevented = k.keyboardActivate(k.cards[2]);

  assert.equal(
    prevented, false,
    'preTapActiveIndex is null here (no pointerdown ever fired) — the fix must '
    + 'fall back to comparing against the live activeIndex, not block this forever',
  );
});

test('keyboard Enter on a non-centred card re-centres instead of navigating', async () => {
  const k = await boot();
  k.swiper().activeIndex = 0;

  const prevented = k.keyboardActivate(k.cards[4]);

  assert.equal(prevented, true, 'an off-centre keyboard activation must not navigate');
  assert.deepEqual(
    k.slideToCalls, [4],
    'unlike a tap (which Swiper centres via slideToClickedSlide on its own), '
    + 'keyboard input never goes through Swiper click handling — the fix must '
    + 'call slideTo itself or an off-centre card could never be reached by keyboard',
  );
});

// This is the regression case. Pre-fix, preTapActiveIndex is written by
// pointerdown and NEVER reset — so a stale snapshot from an earlier, totally
// unrelated tap survives to be compared against a later keyboard activation
// that has nothing to do with it. Against the pre-fix code this test FAILS:
// the tap on card 3 below leaves preTapActiveIndex = 1 (activeIndex at the
// time of that pointerdown) sitting there forever, so the later Enter on the
// now-centred card 2 gets compared to the wrong number (1 !== 2) and is
// wrongly swallowed instead of allowed through. The fix (reset to null at
// the end of every click handler run) is what makes this pass.
test('a stale pointerdown snapshot cannot leak into a later keyboard activation', async () => {
  const k = await boot();
  k.swiper().activeIndex = 1;

  // Earlier, unrelated gesture: tap centred card 1 (navigates, prevented=false).
  const earlierPrevented = k.tap(k.cards[1]);
  assert.equal(earlierPrevented, false, 'precondition: the earlier tap navigated normally');

  // Time passes; the visitor is now on card 2 (say, via keyboard arrow keys,
  // which move Swiper's activeIndex without going through this click handler
  // at all) and presses Enter on the card that IS centred.
  k.swiper().activeIndex = 2;
  const prevented = k.keyboardActivate(k.cards[2]);

  assert.equal(
    prevented, false,
    'a stale snapshot from the earlier tap must not block this unrelated, '
    + 'later keyboard activation on the card that is actually centred now',
  );
});

test('a click that resolves to no card is ignored, not treated as navigable', async () => {
  const k = await boot();
  k.swiper().activeIndex = 1;

  // ev.target.closest(".feature-card") finds nothing (e.g. a click on the
  // carousel's own padding). The handler must return early — no card means
  // no index to judge, so it neither swallows nor navigates anything.
  const noCardTarget = { closest: () => null };
  const prevented = k.clickWithTarget(noCardTarget);

  assert.equal(prevented, false, 'nothing to swallow when no card was found');
});

test('a card not present in menuSwiper.slides is swallowed (fail-safe)', async () => {
  const k = await boot();
  k.swiper().activeIndex = 1;

  // indexOf(...) === -1: a card element that closest() resolves to, but
  // that Swiper doesn't know about. Must still preventDefault — the
  // documented fail-safe default is "never navigate on ambiguity".
  const foreignCard = { closest(sel) { return sel === '.feature-card' ? this : null; } };
  const prevented = k.tap(foreignCard);

  assert.equal(prevented, true, 'an index that cannot be resolved must never be allowed to navigate');
});
