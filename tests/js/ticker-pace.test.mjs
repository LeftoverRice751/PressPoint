// Run with: npm run test:js  (node --test tests/js/*.test.mjs)
//
// The flash ticker's scroll pace (resources/js/ticker-pace.mjs).
//
// The band used to animate on a fixed 50s loop while the keyframes travel one
// full copy of the content, so the speed was content width / 50s: two
// bulletins crawled and a dozen — the real 24h payload, bodies included —
// sprinted past at ~500 px/s, unreadable on the terminal. The duration has
// to be derived from the measured width at a fixed pixels-per-second, and
// this pins that arithmetic.

import test from 'node:test';
import assert from 'node:assert/strict';

import { TICKER_PX_PER_SECOND, tickerDurationSeconds } from '../../resources/js/ticker-pace.mjs';

test('the pace is a reading speed, not a sprint', () => {
  assert.ok(TICKER_PX_PER_SECOND >= 50 && TICKER_PX_PER_SECOND <= 120, `${TICKER_PX_PER_SECOND} px/s`);
});

test('duration scales linearly with the width of one content copy', () => {
  const one = tickerDurationSeconds(1000);
  const ten = tickerDurationSeconds(10000);
  assert.ok(Math.abs(ten - one * 10) < 1e-9);
  assert.ok(Math.abs(one - 1000 / TICKER_PX_PER_SECOND) < 1e-9);
});

test('a long payload no longer collapses into a fixed 50s loop', () => {
  // Roughly the width of the live payload at the time of the fix.
  const seconds = tickerDurationSeconds(26000);
  assert.ok(seconds > 200, `${seconds}s`);
});

test('a tiny or unmeasured track still gets a sane, non-zero duration', () => {
  for (const width of [0, -5, NaN, undefined, null]) {
    const seconds = tickerDurationSeconds(width);
    assert.ok(Number.isFinite(seconds) && seconds > 0, `${width} -> ${seconds}`);
  }
  // A single short headline should not flash by in a fraction of a second.
  assert.ok(tickerDurationSeconds(120) >= 8);
});
