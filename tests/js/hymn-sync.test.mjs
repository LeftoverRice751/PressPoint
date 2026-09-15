// Run with: npm run test:js  (node --test tests/js/*.test.mjs)
//
// The tap-to-sync model behind the hymn editor (resources/js/hymn-sync.mjs).
//
// An editor plays the uploaded hymn and taps once at the start of each sung
// line. Every tap opens a window for the next line and closes the previous
// one; a "gap" closes the current line without opening the next, for the
// instrumental intro and the breaks between verses. The kiosk reads the
// result by index, so the model never reorders — it only appends, pops and
// closes. Kept DOM-free so the arithmetic can be pinned here.

import test from 'node:test';
import assert from 'node:assert/strict';

import { mark, gap, back, isStale, syncStatus, splitLyricLines } from '../../resources/js/hymn-sync.mjs';

test('first tap opens line 1 at the tapped time with no end', () => {
  assert.deepEqual(mark([], 8.2), [{ start: 8.2, end: null }]);
});

test('each later tap closes the previous line and opens the next', () => {
  const t = mark(mark([], 8), 14.5);
  assert.deepEqual(t, [{ start: 8, end: 14.5 }, { start: 14.5, end: null }]);
});

test('a tap after a gap leaves the gapped end alone', () => {
  const t = mark(gap(mark([], 8), 12), 20);
  assert.deepEqual(t, [{ start: 8, end: 12 }, { start: 20, end: null }]);
});

test('a tap that is not after the open line is ignored', () => {
  // Double-tap, or the editor scrubbed backwards without pressing Back.
  const open = mark([], 8);
  assert.deepEqual(mark(open, 8), open);
  assert.deepEqual(mark(open, 3), open);
});

test('gap closes the open line and nothing else', () => {
  assert.deepEqual(gap(mark([], 8), 12), [{ start: 8, end: 12 }]);
});

test('gap on an already-closed line or before its start is a no-op', () => {
  const closed = gap(mark([], 8), 12);
  assert.deepEqual(gap(closed, 15), closed);
  assert.deepEqual(gap(mark([], 8), 5), [{ start: 8, end: null }]);
  assert.deepEqual(gap([], 5), []);
});

test('mark does not mutate its input', () => {
  const before = mark([], 8);
  const snapshot = JSON.stringify(before);
  mark(before, 14);
  gap(before, 14);
  assert.equal(JSON.stringify(before), snapshot);
});

test('back drops the last line, reopens the one before it and says where to seek', () => {
  const t = mark(mark([], 8), 14.5);
  const r = back(t);
  assert.deepEqual(r.timings, [{ start: 8, end: null }]);
  assert.equal(r.seekTo, 8);
});

test('back on one line returns to the start of the track', () => {
  const r = back(mark([], 8));
  assert.deepEqual(r.timings, []);
  assert.equal(r.seekTo, 0);
});

test('back on nothing is harmless', () => {
  assert.deepEqual(back([]), { timings: [], seekTo: 0 });
});

test('timings are stale when they no longer match the line count', () => {
  // The kiosk only trusts a full set; a lyric edit that adds or removes a
  // line makes the whole recording describe the wrong lines.
  const t = mark(mark([], 8), 14);
  assert.equal(isStale(t, 2), false);
  assert.equal(isStale(t, 3), true);
  assert.equal(isStale(t, 1), true);
  assert.equal(isStale([], 5), false, 'nothing recorded yet is not stale');
});

test('splitLyricLines mirrors AboutValues.hymn_lines', () => {
  // One <p> per line (what Quill emits on Enter) and one <p> with <br>s
  // (shift+Enter) must yield the same list, or the widget numbers lines
  // differently from the kiosk that will play them.
  const perP = '<p>Hail to thee</p><p>our <strong>alma</strong> mater</p><p><br></p>';
  const withBr = '<p>Hail to thee<br>our <strong>alma</strong> mater<br></p>';
  assert.deepEqual(splitLyricLines(perP), ['Hail to thee', 'our alma mater']);
  assert.deepEqual(splitLyricLines(withBr), ['Hail to thee', 'our alma mater']);
  assert.deepEqual(splitLyricLines(''), []);
});

test('syncStatus tells a half-finished recording from lyrics that moved', () => {
  // The kiosk only trusts a full set. Mid-recording the count is short and
  // that is normal; after a lyric edit it can be short or long. Short is
  // reported as partial (finish the recording), long means lines were
  // removed since — nothing the editor can fix except re-recording.
  const two = mark(mark([], 8), 14);
  assert.equal(syncStatus([], 6), 'empty');
  assert.equal(syncStatus(two, 6), 'partial');
  assert.equal(syncStatus(two, 2), 'complete');
  assert.equal(syncStatus(two, 1), 'mismatch');
});
