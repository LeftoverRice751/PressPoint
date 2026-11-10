// Run with: npm run test:js
//
// The element-layout maths behind the post editor (resources/js/post-layout.mjs).
// toStyles() must stay byte-identical to Posts.layout_styles(); the literals below
// are the ones tests/unit/test_post_layout.py::test_layout_styles_strings pins.
import test from 'node:test';
import assert from 'node:assert/strict';
import { toStyles, clampBox, overlaps, problems, nudge, round2 } from '../../resources/js/post-layout.mjs';

function fitting() {
  return {
    panel_h: 44,
    logo: { x: 40, y: 4, s: 1 },
    kicker: { x: 10, y: 5, w: 30, h: 3.5, s: 1.2 },
    headline: { x: 10, y: 10, w: 80, h: 10, s: 1 },
    body: { x: 10, y: 20, w: 80, h: 15, s: 1 },
  };
}

test('toStyles matches the Python literals', () => {
  const s = toStyles(fitting());
  assert.equal(s.panel, 'height:44cqw');
  assert.equal(s.logo, 'left:40cqw;top:4cqw;--s:1');
  assert.equal(s.kicker, 'left:10cqw;top:5cqw;width:36cqw;height:4.2cqw;--s:1.2');
  assert.equal(s.headline, 'left:10cqw;top:10cqw;width:80cqw;height:10cqw;--s:1');
});

test('round2 is half-up', () => {
  assert.equal(round2(1.005 + 0.0), Math.floor(1.005 * 100 + 0.5) / 100);
  assert.equal(round2(2.5), 2.5);
});

test('clampBox pulls a box back inside, respecting scaled size', () => {
  const area = { x0: 0, y0: 0, x1: 100, y1: 44 };
  const out = clampBox({ x: 90, y: 40, w: 20, h: 5, s: 1 }, area);
  assert.equal(out.x, 80);
  assert.equal(out.y, 39);
  const scaled = clampBox({ x: 90, y: 0, w: 20, h: 5, s: 2 }, area);
  assert.equal(scaled.x, 60);
  const neg = clampBox({ x: -5, y: -5, w: 20, h: 5, s: 1 }, area);
  assert.deepEqual([neg.x, neg.y], [0, 0]);
});

test('overlaps: touching is not overlap', () => {
  const a = { x: 0, y: 0, w: 10, h: 10, s: 1 };
  assert.equal(overlaps(a, { x: 10, y: 0, w: 10, h: 10, s: 1 }), false);
  assert.equal(overlaps(a, { x: 9.9, y: 0, w: 10, h: 10, s: 1 }), true);
  assert.equal(overlaps(a, { x: 0, y: 5, w: 5, h: 2, s: 2 }), true);
});

test('problems: fitting layout is clean', () => {
  assert.deepEqual(problems(fitting(), { footerH: 0, logoW: 0 }), []);
});

test('problems: overlap, outside panel, logo outside photo', () => {
  const l = fitting();
  l.headline.y = 8;
  assert.ok(problems(l, {}).includes('headline overlaps body') === false);
  l.body.y = 12;
  assert.ok(problems(l, {}).includes('headline overlaps body'));
  const m = fitting();
  m.body.y = 40;
  assert.ok(problems(m, {}).includes('body is outside the panel'));
  const n = fitting();
  n.logo.y = 50;
  assert.ok(problems(n, {}).includes('logo is outside the photo'));
});

test('problems: footer region and logo width count', () => {
  const l = fitting();
  l.body.y = 28; // ends at 43, panel 44
  assert.deepEqual(problems(l, { footerH: 0, logoW: 0 }), []);
  assert.ok(problems(l, { footerH: 3, logoW: 0 }).includes('body is outside the panel'));
  assert.ok(problems(fitting(), { footerH: 0, logoW: 70 }).includes('logo is outside the photo'));
});

test('nudge moves and stops at the edge', () => {
  const area = { x0: 0, y0: 0, x1: 100, y1: 44 };
  const b = { x: 1, y: 1, w: 20, h: 5, s: 1 };
  assert.equal(nudge(b, 1, 0, area).x, 2);
  assert.equal(nudge(b, -5, -5, area).x, 0);
  assert.equal(nudge({ ...b, x: 79.5 }, 5, 0, area).x, 80);
});
