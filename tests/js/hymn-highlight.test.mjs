// Run with: npm run test:js  (node --test tests/js/*.test.mjs)
//
// Lyric highlighting on the kiosk hymn pane (resources/js/about-lspu-kiosk.js).
//
// The pane follows the song one line at a time. With editorial timings it
// uses them; without, it splits the track evenly. The case worth pinning is
// the one in between: a recording made against a different number of lines.
// Per-index fallback would light the timed lines by the clock and the rest
// by arithmetic, which reads as random. A partial set must be ignored whole.

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const SOURCE = readFileSync(join(here, '../../resources/js/about-lspu-kiosk.js'), 'utf8');

function makeLine() {
  return {
    active: false,
    classList: {
      toggle: function (name, on) { if (name === 'is-active') this.owner.active = !!on; },
      add() {}, remove() {},
    },
  };
}

function boot({ timings, lineCount, duration }) {
  const lines = Array.from({ length: lineCount }, () => {
    const l = makeLine();
    l.classList.owner = l;
    return l;
  });
  const media = {
    paused: true, duration, currentTime: 0, listeners: {},
    addEventListener(t, fn) { (this.listeners[t] ||= []).push(fn); },
    fire(t) { (this.listeners[t] || []).forEach((fn) => fn({})); },
    play() {}, pause() {},
  };
  const root = {
    attrs: { 'data-timings': JSON.stringify(timings) },
    classList: { add() {}, remove() {}, toggle() {} },
    getAttribute(n) { return this.attrs[n] ?? null; },
    querySelector(sel) { return sel === '[data-hymn-media]' ? media : null; },
    querySelectorAll(sel) { return sel === '[data-hymn-line]' ? lines : []; },
  };
  const app = {
    dataset: {},
    querySelectorAll(sel) {
      if (sel === '[data-hymn]') return [root];
      if (sel === '[data-hymn-media]') return [media];
      return [];
    },
    querySelector() { return { scrollTop: 0 }; },
  };
  const window = { scrollTo() {}, setTimeout() { return 1; }, clearTimeout() {} };
  const document = {
    querySelector(sel) { return sel === '.about-app' ? app : null; },
    addEventListener() {},
  };
  new Function('window', 'document', SOURCE)(window, document);
  return { media, lines };
}

function activeIndex(lines) {
  return lines.findIndex((l) => l.active);
}

test('a full set of timings drives the highlight by the clock', () => {
  const { media, lines } = boot({
    timings: [{ start: 10, end: 20 }, { start: 20, end: null }],
    lineCount: 2, duration: 60,
  });
  media.currentTime = 5; media.fire('timeupdate');
  assert.equal(activeIndex(lines), -1, 'nothing during the intro');
  media.currentTime = 15; media.fire('timeupdate');
  assert.equal(activeIndex(lines), 0);
  media.currentTime = 59; media.fire('timeupdate');
  assert.equal(activeIndex(lines), 1, 'a null end runs to the end of the track');
});

test('no timings splits the track evenly', () => {
  const { media, lines } = boot({ timings: [], lineCount: 4, duration: 40 });
  media.currentTime = 25; media.fire('timeupdate');
  assert.equal(activeIndex(lines), 2);
});

test('timings for a different number of lines are ignored whole', () => {
  // Two timed lines against three lyric lines: fall back to thirds for all
  // three rather than trusting the first two and guessing the third.
  const { media, lines } = boot({
    timings: [{ start: 10, end: 20 }, { start: 20, end: null }],
    lineCount: 3, duration: 30,
  });
  media.currentTime = 5; media.fire('timeupdate');
  assert.equal(activeIndex(lines), 0, 'even split lights line 1 from 0s');
  media.currentTime = 25; media.fire('timeupdate');
  assert.equal(activeIndex(lines), 2);
});
