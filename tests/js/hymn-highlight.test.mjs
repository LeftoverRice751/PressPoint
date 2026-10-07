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

function boot({ timings, lineCount, duration, raf }) {
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
  const timers = [];
  const intervals = [];
  const posts = [];
  const window = {
    scrollTo() {},
    setTimeout(fn, ms) { timers.push({ fn, ms }); return timers.length; },
    clearTimeout(id) { if (timers[id - 1]) timers[id - 1].cleared = true; },
    setInterval(fn, ms) { intervals.push({ fn, ms }); return intervals.length; },
    clearInterval(id) { if (intervals[id - 1]) intervals[id - 1].cleared = true; },
    requestAnimationFrame: raf,
    __kioskFrame: { post(t) { posts.push(t); return true; } },
  };
  const document = {
    querySelector(sel) { return sel === '.about-app' ? app : null; },
    addEventListener() {},
  };
  new Function('window', 'document', SOURCE)(window, document);
  return { media, lines, app, timers, intervals, posts };
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

test('while playing, the highlight follows every frame, not just timeupdate', () => {
  // timeupdate fires only ~4 times a second; waiting for it lit each line up
  // to 250ms after it was sung.
  const frames = [];
  const { media, lines } = boot({
    timings: [{ start: 10, end: 20 }, { start: 20, end: null }],
    lineCount: 2, duration: 60,
    raf: (fn) => { frames.push(fn); return frames.length; },
  });
  media.paused = false;
  media.fire('play');
  media.currentTime = 20.01;
  frames.shift()();
  assert.equal(activeIndex(lines), 1, 'lit on the next frame with no timeupdate');
  assert.equal(frames.length, 1, 'keeps ticking while playing');
  media.paused = true;
  frames.shift()();
  assert.equal(frames.length, 0, 'stops once paused');
});

// ── Idle while the hymn plays ─────────────────────────────────────
// Nobody touches the glass to watch a four-minute hymn, so both idle timers
// used to cut into it: this page's 60s return-home (which pauses the media)
// and the shell's 30s attract screen, which only hears relayed activity.

const live = (list) => list.filter((t) => !t.cleared);

test('playing the hymn holds the page idle; pausing re-arms it', () => {
  const { media, app, timers } = boot({ timings: [], lineCount: 2, duration: 60 });
  app.dataset.view = 'hymn';
  media.paused = false;
  media.fire('play');
  assert.equal(live(timers).length, 0, 'no return-home countdown mid-song');
  media.paused = true;
  media.fire('pause');
  assert.equal(live(timers).length, 1);
  assert.equal(live(timers)[0].ms, 60 * 1000);
});

test('the end of the hymn re-arms the page idle too', () => {
  const { media, app, timers } = boot({ timings: [], lineCount: 2, duration: 60 });
  app.dataset.view = 'hymn';
  media.paused = false;
  media.fire('play');
  media.paused = true; media.ended = true;
  media.fire('ended');
  assert.equal(live(timers).length, 1);
});

test('playback keeps the shell fed with activity until it stops', () => {
  const { media, app, intervals, posts } = boot({ timings: [], lineCount: 2, duration: 60 });
  app.dataset.view = 'hymn';
  media.paused = false;
  media.fire('play');
  assert.deepEqual(posts, ['activity'], 'one beat straight away');
  assert.equal(live(intervals).length, 1);
  assert.ok(live(intervals)[0].ms < 30 * 1000, 'beats faster than the shell\'s 30s countdown');
  live(intervals)[0].fn();
  assert.equal(posts.length, 2);
  media.paused = true;
  media.fire('pause');
  assert.equal(live(intervals).length, 0, 'no beats once paused');
});
