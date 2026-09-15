// Run with: node --test tests/js/
//
// The Latest News carousel is one slide per ISSUE, and issues differ wildly
// in height: a quote-heavy one ran to ~2000px while the next was ~800px.
// `.swiper-wrapper` is a flex row, so without autoHeight it is as tall as the
// TALLEST slide and the static pagination under it sat 1,200px below the
// bottom of a short issue -- the reader swiped to Issue 02, the page ended
// mid-screen, and the dots and arrows were nowhere to be seen.
//
// kiosk-news.js imports Swiper as an ES module, so unlike the IIFE bundles it
// cannot be booted here against a stub DOM. These pin the two halves of the
// fix at the source level instead; the behaviour itself is checked in the
// browser (wrapper height == active slide height after a swipe).
//
//   1. The Swiper init passes `autoHeight: true`, so the wrapper is sized to
//      the ACTIVE slide on every slide change and on update()/resize.
//   2. Swiper 14 does NOT re-measure when an <img> inside a slide finishes
//      loading -- and an issue is mostly photographs -- so the module has to
//      call updateAutoHeight() itself on image load, and again after the
//      lead's clamp (measure) changes the slide's height.

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const SOURCE = readFileSync(join(here, '../../resources/js/kiosk-news.js'), 'utf8');

/** The object literal handed to `new Swiper(swiperEl, {...})`. */
function swiperOptions() {
  const start = SOURCE.indexOf('new Swiper(swiperEl, {');
  assert.notEqual(start, -1, 'kiosk-news.js should construct the carousel from swiperEl');
  const end = SOURCE.indexOf('\n    });', start);
  return SOURCE.slice(start, end);
}

test('the carousel sizes its wrapper to the active issue, not the tallest one', () => {
  assert.match(swiperOptions(), /autoHeight:\s*true/);
});

/** Body of a top-level `function name() {...}` in the module. */
function functionBody(name) {
  const start = SOURCE.indexOf(`function ${name}()`);
  assert.notEqual(start, -1, `kiosk-news.js should define ${name}()`);
  return SOURCE.slice(start, SOURCE.indexOf('\n  }', start));
}

test('refitCarousel() is the one place that asks Swiper to re-measure', () => {
  // Both callers below go through it: measure() runs before the carousel is
  // built, so the helper has to tolerate `newsSwiper` being unset.
  assert.match(functionBody('refitCarousel'), /updateAutoHeight\(\)/);
});

test('a photograph finishing its load re-measures the active slide', () => {
  // A capture-phase 'load' listener on the carousel root is the only way to
  // hear <img> loads, which do not bubble.
  assert.match(SOURCE, /swiperEl\.addEventListener\(\s*'load'[\s\S]{0,200}refitCarousel\(\)[\s\S]{0,40}true\)/);
});

test('re-clamping the lead re-measures the slide it changed', () => {
  // measure() adds or removes the lead's max-height, which changes slide 1's
  // height after the wrapper was already sized -- on BOTH exits.
  const body = functionBody('measure');
  assert.equal((body.match(/refitCarousel\(\)/g) || []).length, 2);
});
