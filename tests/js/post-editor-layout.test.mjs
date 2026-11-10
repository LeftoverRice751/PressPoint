// Run with: npm run test:js  (node --test tests/js/*.test.mjs)
//
// The editor's drag/resize layer (resources/js/post-editor-layout.mjs). Its maths
// is pure and tested for real; its DOM wiring is pinned on the source in the style
// of post-editor-wiring.test.mjs, because this runner has no jsdom.

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

import {
  pxToCqw, snapshot, serializeLayout, remeasured, resizeBox, misplacedPieces, LAYOUT_PROBLEM,
} from '../../resources/js/post-editor-layout.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const read = (name) => readFileSync(join(here, '../../resources/js', name), 'utf8');

const LAYOUT = {
  panel_h: 40,
  logo: { x: 40, y: 4, s: 1 },
  kicker: { x: 10, y: 4, w: 80, h: 4, s: 1 },
  headline: { x: 10, y: 10, w: 80, h: 6, s: 1 },
  body: { x: 10, y: 18, w: 80, h: 8, s: 1 },
};

test('pxToCqw divides by the card width, two decimals', () => {
  assert.equal(pxToCqw(200, 400), 50);
  assert.equal(pxToCqw(1, 300), 0.33);
  assert.equal(pxToCqw(10, 0), 0);
});

test('snapshot converts px to cqw and sets s=1', () => {
  const layout = snapshot({
    panel_h: 160,
    logo: { x: 133, y: 16 },
    kicker: { x: 24, y: 18, w: 352, h: 13.2 },
    headline: { x: 40, y: 40, w: 320, h: 20 },
    body: { x: 40, y: 66, w: 320, h: 30 },
  }, 400);
  assert.deepEqual(layout, {
    panel_h: 40,
    logo: { x: 33.25, y: 4, s: 1 },
    kicker: { x: 6, y: 4.5, w: 88.5, h: 3.3, s: 1 },
    headline: { x: 10, y: 10, w: 80.5, h: 5, s: 1 },
    body: { x: 10, y: 16.5, w: 80.5, h: 7.5, s: 1 },
  });
});

test('snapshot rounds sizes up and adds width slack so a line never rewraps', () => {
  const layout = snapshot({ ...{ panel_h: 160, logo: { x: 0, y: 0 } },
    kicker: { x: 0, y: 0, w: 100.01, h: 10 },
    headline: { x: 0, y: 0, w: 100, h: 10 }, body: { x: 0, y: 0, w: 100, h: 10 } }, 400);
  assert.equal(layout.kicker.w, 25.51);
});

test('snapshot keeps every number inside the server ranges', () => {
  const layout = snapshot({ panel_h: 400, logo: { x: -3, y: 0 },
    kicker: { x: 0, y: 0, w: 2, h: 0 },
    headline: { x: 0, y: 0, w: 100, h: 10 }, body: { x: 0, y: 0, w: 100, h: 10 } }, 400);
  assert.equal(layout.panel_h, 70);
  assert.equal(layout.kicker.w, 5);
  assert.equal(layout.kicker.h, 1);
  assert.equal(layout.logo.x, 0);
});

test('snapshot width slack never pushes a box past the right edge', () => {
  const layout = snapshot({ panel_h: 160, logo: { x: 0, y: 0 },
    kicker: { x: 200, y: 0, w: 200, h: 10 },
    headline: { x: 0, y: 40, w: 100, h: 10 }, body: { x: 0, y: 80, w: 100, h: 10 } }, 400);
  assert.equal(layout.kicker.x + layout.kicker.w, 100);
});

test('a flow panel taller than the cap shifts text up by the difference', () => {
  // 320px of 400 = 80cqw, capped to 70: the panel top moves down 10cqw.
  const layout = snapshot({ panel_h: 320, logo: { x: 0, y: 0 },
    kicker: { x: 0, y: 60, w: 100, h: 10 },
    headline: { x: 0, y: 100, w: 100, h: 10 }, body: { x: 0, y: 20, w: 100, h: 10 } }, 400);
  assert.equal(layout.panel_h, 70);
  assert.equal(layout.kicker.y, 5);
  assert.equal(layout.headline.y, 15);
  assert.equal(layout.body.y, 0);
});

test('serialize is empty in flow mode', () => {
  assert.equal(serializeLayout(null, () => 1), '');
});

test('remeasure updates h before serialize', () => {
  const heights = { kicker: 6, headline: 18, body: 9 };
  const out = JSON.parse(serializeLayout({ ...LAYOUT, headline: { ...LAYOUT.headline, s: 2 } },
    (piece) => heights[piece]));
  assert.equal(out.kicker.h, 6);
  assert.equal(out.headline.h, 9); // measured at s=2, stored at s=1
  assert.equal(out.body.h, 9);
});

test('remeasure keeps the stored h when a piece cannot be measured', () => {
  assert.deepEqual(remeasured(LAYOUT, () => null), LAYOUT);
});

test('resize changes only s, proportionally to the corner drag', () => {
  const area = { x0: 2, y0: 2, x1: 98, y1: 34 };
  const box = { x: 10, y: 10, w: 40, h: 5, s: 1 };
  const grown = resizeBox(box, 20, 2.5, area);
  assert.equal(grown.s, 1.5);
  assert.deepEqual({ ...grown, s: 1 }, box);
});

test('resize stops growing at the edge of the area and stays in range', () => {
  const area = { x0: 2, y0: 2, x1: 98, y1: 34 };
  const box = { x: 10, y: 10, w: 40, h: 5, s: 1 };
  assert.equal(resizeBox(box, 500, 500, area).s, 2.2); // (98 - 10) / 40
  assert.equal(resizeBox(box, -500, -500, area).s, 0.5);
  const tiny = { x: 10, y: 10, w: 10, h: 2, s: 1 };
  assert.equal(resizeBox(tiny, 500, 0, { x0: 0, y0: 0, x1: 100, y1: 100 }).s, 2.5);
});

test('a problem message marks the pieces it names', () => {
  assert.deepEqual([...misplacedPieces(['kicker overlaps headline', 'logo is outside the photo'])].sort(),
    ['headline', 'kicker', 'logo']);
  assert.equal(misplacedPieces([]).size, 0);
  assert.equal(LAYOUT_PROBLEM, 'A piece doesn\'t fit — move or shrink it.');
});

// ── Wiring ─────────────────────────────────────────────────────────────

test('post-editor.js appends element_layout from the layout editor', () => {
  const source = read('post-editor.js');
  assert.match(source, /import \{ createLayoutEditor[^}]*\} from '\.\/post-editor-layout\.mjs'/);
  assert.match(source, /form\.append\('element_layout', layoutEditor\.serialize\(\)\)/);
  assert.match(source, /layoutEditor\.load\(row\.layout/);
});

test('logo pointerdown stops propagation so it never pans the photo', () => {
  const source = read('post-editor-layout.mjs');
  assert.match(source, /draggable\(logo, 'logo', 'move'\)/);
  const start = source.indexOf("target.addEventListener('pointerdown'");
  assert.ok(start > -1, 'pointerdown listener in draggable()');
  const body = source.slice(start, source.indexOf('});', start));
  assert.match(body, /event\.stopPropagation\(\)/);
});

test('submit is disabled while problems exist', () => {
  const source = read('post-editor.js');
  const start = source.indexOf('function setSaving');
  const body = source.slice(start, source.indexOf('\n  }\n', start));
  assert.match(body, /ui\.submit\.disabled = saving \|\| layoutProblems\.length > 0/);
  assert.match(source, /onProblems: function \(list\)/);
});

test('every text input re-measures the layout', () => {
  assert.match(read('post-editor.js'), /onInput: function \(\) \{[^}]*layoutEditor\.remeasure\(\)/);
});

test('grips are labelled buttons and frames never enter the contenteditable', () => {
  const source = read('post-editor-layout.mjs');
  assert.match(source, /grip\.type = 'button'/);
  assert.match(source, /'Move ' \+/);
  assert.match(source, /post-layout-overlay/);
  assert.match(source, /new ResizeObserver/);
  assert.doesNotMatch(source, /pieceEl\.appendChild|els\[[^\]]+\]\.appendChild/);
});

test('the kiosk and review never load the layout editor', () => {
  for (const name of ['post-card.css']) {
    assert.doesNotMatch(readFileSync(join(here, '../../resources/css', name), 'utf8'), /post-layout-overlay/);
  }
  const mix = readFileSync(join(here, '../../webpack.mix.js'), 'utf8');
  assert.doesNotMatch(mix, /post-editor-layout/);
});
