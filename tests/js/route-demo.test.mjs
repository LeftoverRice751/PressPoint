// Run with: node --test tests/js/
//
// The kiosk's "Show Route" demonstration draws the walkway from "You are
// here" to the chosen building, a walker dot riding the line's tip, then
// holds the full route and starts over. These are the pure pieces of that
// loop: where the line ends at a given distance, which part of the cycle a
// timestamp falls in, and how long the draw takes.

import test from 'node:test';
import assert from 'node:assert/strict';
import { cumulativeFromPixels } from '../../resources/js/route-maneuvers.mjs';
import { partialPath, demoPhase, drawDurationFor } from '../../resources/js/route-demo.mjs';

// An L: 100 px down, then 50 px across. [y, x] pairs, like location.route.
const PATH = [[0, 0], [100, 0], [100, 50]];
const CUM = cumulativeFromPixels(PATH, 1); // [0, 100, 150]

test('partialPath at 0 is a single point on the start', () => {
  const { points, tip } = partialPath(PATH, CUM, 0);
  assert.deepEqual(tip, [0, 0]);
  assert.deepEqual(points, [[0, 0]]);
});

test('partialPath mid-segment interpolates the tip', () => {
  const { points, tip } = partialPath(PATH, CUM, 40);
  assert.deepEqual(tip, [40, 0]);
  assert.deepEqual(points, [[0, 0], [40, 0]]);
});

test('partialPath past a vertex keeps the corner', () => {
  const { points, tip } = partialPath(PATH, CUM, 125);
  assert.deepEqual(tip, [100, 25]);
  assert.deepEqual(points, [[0, 0], [100, 0], [100, 25]]);
});

test('partialPath at or beyond the total is the whole route', () => {
  for (const metres of [150, 999]) {
    const { points, tip } = partialPath(PATH, CUM, metres);
    assert.deepEqual(tip, [100, 50]);
    assert.deepEqual(points, PATH);
  }
});

test('partialPath clamps a negative distance to the start', () => {
  assert.deepEqual(partialPath(PATH, CUM, -5).tip, [0, 0]);
});

test('demoPhase draws, then holds, then starts over', () => {
  const opts = { drawMs: 1000, holdMs: 500 };
  assert.deepEqual(demoPhase(0, opts), { phase: 'draw', progress: 0 });
  assert.equal(demoPhase(500, opts).phase, 'draw');
  assert.deepEqual(demoPhase(1000, opts), { phase: 'hold', progress: 1 });
  assert.deepEqual(demoPhase(1499, opts), { phase: 'hold', progress: 1 });
  // the next cycle restarts from an empty line
  assert.deepEqual(demoPhase(1500, opts), { phase: 'draw', progress: 0 });
});

test('demoPhase progress eases and never runs backwards within a draw', () => {
  const opts = { drawMs: 1000, holdMs: 500 };
  let last = -1;
  for (let t = 0; t < 1000; t += 25) {
    const { progress } = demoPhase(t, opts);
    assert.ok(progress >= last, `progress went backwards at ${t}ms`);
    last = progress;
  }
  // eased, not linear: a quarter of the time covers less than a quarter
  assert.ok(demoPhase(250, opts).progress < 0.25);
  assert.equal(demoPhase(500, opts).progress, 0.5);
});

test('drawDurationFor scales with length and clamps to 1.8-3.5s', () => {
  assert.equal(drawDurationFor(0), 1800);
  assert.equal(drawDurationFor(100000), 3500);
  const mid = drawDurationFor(600);
  assert.ok(mid > 1800 && mid < 3500, `expected a scaled duration, got ${mid}`);
  assert.ok(drawDurationFor(700) > mid, 'a longer route should take longer');
});
