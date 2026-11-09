// Run with: npm run test:js  (node --test tests/js/*.test.mjs)
//
// The photo framing maths behind the post editor (resources/js/post-crop.mjs).
//
// The editor previews a crop with toStyle() and the kiosk renders the saved one
// with Posts.crop_style(); if the two strings ever differ, what an editor framed
// is not what the terminal shows. tests/unit/test_post_crop_parity.py asserts
// the SAME literal strings below against the Python side.

import test from 'node:test';
import assert from 'node:assert/strict';

import { clampCrop, panBy, zoomBy, toStyle } from '../../resources/js/post-crop.mjs';

test('clampCrop keeps x,y in [0,1] and zoom in [1,4], like Posts.parse_crop', () => {
  assert.deepEqual(clampCrop({ x: 2, y: -1, zoom: 99 }), { x: 1, y: 0, zoom: 4 });
  assert.deepEqual(clampCrop({ x: 0.3, y: 0.7, zoom: 0.2 }), { x: 0.3, y: 0.7, zoom: 1 });
});

test('clampCrop falls back to the default for garbage', () => {
  assert.deepEqual(clampCrop(null), { x: 0.5, y: 0.5, zoom: 1 });
  assert.deepEqual(clampCrop({ x: 'a', y: NaN, zoom: Infinity }), { x: 0.5, y: 0.5, zoom: 1 });
});

test('panBy moves the focal point opposite to the pointer, scaled by 1/zoom', () => {
  assert.equal(panBy({ x: 0.5, y: 0.5, zoom: 2 }, 100, 0, 400).x, 0.375);
  assert.equal(panBy({ x: 0.5, y: 0.5, zoom: 1 }, 0, -100, 400).y, 0.75);
  // and never leaves the frame
  assert.equal(panBy({ x: 0.1, y: 0.5, zoom: 1 }, 400, 0, 400).x, 0);
});

test('panBy ignores a zero-size frame instead of dividing by it', () => {
  assert.deepEqual(panBy({ x: 0.5, y: 0.5, zoom: 1 }, 50, 50, 0), { x: 0.5, y: 0.5, zoom: 1 });
});

test('zoomBy multiplies and clamps', () => {
  assert.equal(zoomBy({ x: 0.5, y: 0.5, zoom: 2 }, 1.5).zoom, 3);
  assert.equal(zoomBy({ x: 0.5, y: 0.5, zoom: 3 }, 10).zoom, 4);
  assert.equal(zoomBy({ x: 0.5, y: 0.5, zoom: 1.2 }, 0.1).zoom, 1);
});

// Same inputs and expected strings as tests/unit/test_post_crop_parity.py.
const PARITY = [
  [{ x: 0.25, y: 0.5, zoom: 1.5 },
    'object-position:25% 50%;transform:scale(1.5);transform-origin:25% 50%'],
  [{ x: 0.00001, y: 0.333333, zoom: 1 },
    'object-position:0% 33.33%;transform:scale(1);transform-origin:0% 33.33%'],
  [{ x: 1, y: 0, zoom: 2 },
    'object-position:100% 0%;transform:scale(2);transform-origin:100% 0%'],
  [{ x: 0.875, y: 0.1, zoom: 3.999 },
    'object-position:87.5% 10%;transform:scale(4);transform-origin:87.5% 10%'],
  [{ x: 0.123456, y: 0.5, zoom: 1.234 },
    'object-position:12.35% 50%;transform:scale(1.23);transform-origin:12.35% 50%'],
  [{ x: 0.0005, y: 0.99999, zoom: 1.006 },
    'object-position:0.05% 100%;transform:scale(1.01);transform-origin:0.05% 100%'],
];

test('toStyle matches Posts.crop_style exactly (2 decimals, no exponent)', () => {
  for (const [crop, expected] of PARITY) {
    assert.equal(toStyle(crop), expected, JSON.stringify(crop));
  }
});
