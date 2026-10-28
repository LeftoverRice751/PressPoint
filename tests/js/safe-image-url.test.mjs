// Run with: npm run test:js  (node --test tests/js/*.test.mjs)
//
// Which image URLs the news composer will hand to img.src / background-image
// (resources/js/safe-image-url.mjs).
//
// The library card's data-news-library-image is a DB value read back through
// getAttribute(), which decodes the template's HTML escaping — so whatever is
// in news.image reaches the sink verbatim. Only same-origin paths and blob:
// previews are ever legitimate there.

import test from 'node:test';
import assert from 'node:assert/strict';

import { safeImageUrl, cssUrl } from '../../resources/js/safe-image-url.mjs';

test('a stored image path and a local file preview pass through', () => {
  assert.equal(safeImageUrl('/storage/News/a.webp'), '/storage/News/a.webp');
  assert.equal(
    safeImageUrl('blob:https://presspoint-gears.me/0b6c2f1e-1d2a-4e1b-9f3a-2c1d7e8f9a0b'),
    'blob:https://presspoint-gears.me/0b6c2f1e-1d2a-4e1b-9f3a-2c1d7e8f9a0b'
  );
});

test('script, data and off-site URLs are refused', () => {
  [
    'javascript:alert(1)',
    ' JaVaScRiPt:alert(1)',
    'data:image/svg+xml,<svg onload=alert(1)>',
    'https://evil.com/x.png',
    'http://evil.com/x.png',
    'storage/News/a.webp',
  ].forEach(function (value) {
    assert.equal(safeImageUrl(value), '', value);
  });
});

test('protocol-relative forms that look like paths are refused', () => {
  assert.equal(safeImageUrl('//evil.com/x.png'), '');
  assert.equal(safeImageUrl('/\\evil.com/x.png'), '');
});

test('empty, non-string and control-character values are refused', () => {
  assert.equal(safeImageUrl(''), '');
  assert.equal(safeImageUrl(null), '');
  assert.equal(safeImageUrl(undefined), '');
  assert.equal(safeImageUrl(42), '');
  assert.equal(safeImageUrl('/storage/a\n.webp'), '');
  assert.equal(safeImageUrl('/storage/a\u0000.webp'), '');
});

test('cssUrl escapes quotes and backslashes so the value cannot leave url("…")', () => {
  assert.equal(cssUrl('/storage/a.webp'), 'url("/storage/a.webp")');
  assert.equal(cssUrl('/a"b\\c'), 'url("/a\\"b\\\\c")');
  assert.equal(cssUrl('/a"); background: red; x: url("b'), 'url("/a\\"); background: red; x: url(\\"b")');
});
