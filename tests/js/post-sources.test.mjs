// Run with: npm run test:js  (node --test tests/js/*.test.mjs)
//
// The source-line rows under a post card (resources/js/post-sources.mjs). The
// server re-validates with Posts.parse_source_lines; this keeps what the editor
// previews equal to what will be stored.

import test from 'node:test';
import assert from 'node:assert/strict';

import {
  serialize, defaults, SOURCE_ICONS, SOURCE_LINES_MAX, SOURCE_TEXT_MAX,
} from '../../resources/js/post-sources.mjs';

test('defaults() equals Posts.DEFAULT_SOURCE_LINES', () => {
  assert.deepEqual(defaults(), [
    { icon: 'facebook', text: '/TheGearsOfficial' },
    { icon: 'email', text: '/thegearspublication@gmail.com' },
  ]);
});

test('defaults() hands out a fresh copy every time', () => {
  const rows = defaults();
  rows[0].text = 'changed';
  assert.equal(defaults()[0].text, '/TheGearsOfficial');
});

test('the caps and icon list mirror Posts', () => {
  assert.equal(SOURCE_LINES_MAX, 3);
  assert.equal(SOURCE_TEXT_MAX, 60);
  assert.deepEqual([...SOURCE_ICONS], ['facebook', 'email', 'instagram', 'website', 'link']);
});

test('serialize drops blank rows', () => {
  const json = serialize([
    { icon: 'facebook', text: '  ' },
    { icon: 'email', text: ' hi@x.org ' },
    { icon: 'website', text: '' },
  ]);
  assert.deepEqual(JSON.parse(json), [{ icon: 'email', text: 'hi@x.org' }]);
});

test('serialize caps at three rows', () => {
  const rows = ['a', 'b', 'c', 'd'].map((text) => ({ icon: 'link', text }));
  assert.deepEqual(JSON.parse(serialize(rows)).map((r) => r.text), ['a', 'b', 'c']);
});

test('serialize trims text to the cap and folds unknown icons to link', () => {
  const [row] = JSON.parse(serialize([{ icon: 'tiktok', text: 'x'.repeat(80) }]));
  assert.equal(row.icon, 'link');
  assert.equal(row.text.length, 60);
});

test('serialize of nothing is an empty list, not the defaults', () => {
  // The server reads "[]" as "show no sources" (an editor removed every line).
  assert.equal(serialize([]), '[]');
  assert.equal(serialize(null), '[]');
});
