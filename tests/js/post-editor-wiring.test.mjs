// Run with: npm run test:js  (node --test tests/js/*.test.mjs)
//
// The post editor's DOM wiring (resources/js/post-editor*.{js,mjs}). There is no
// jsdom in this runner, so the photo gate is tested for real (it is pure) and
// the request contract with NewsController.store is pinned on the source: a
// renamed form field is a silent data loss, not an error.

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

import { photoProblem, INVALID_IMAGE } from '../../resources/js/post-editor-photo.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const read = (name) => readFileSync(join(here, '../../resources/js', name), 'utf8');
const MB = 1024 * 1024;

test('a photo over 8 MB is refused with the server\'s own message', () => {
  assert.equal(photoProblem({ type: 'image/jpeg', size: 8 * MB + 1 }), 'Photo is too large (max 8 MB)');
  assert.equal(photoProblem({ type: 'image/jpeg', size: 8 * MB }), '');
});

test('only the image types the server accepts preview', () => {
  for (const type of ['image/jpeg', 'image/png', 'image/gif', 'image/webp']) {
    assert.equal(photoProblem({ type, size: 10 }), '', type);
  }
  assert.equal(photoProblem({ type: 'image/svg+xml', size: 10 }), INVALID_IMAGE);
  assert.equal(photoProblem({ type: 'application/pdf', size: 10 }), INVALID_IMAGE);
  assert.equal(photoProblem(null), INVALID_IMAGE);
});

test('a save posts every field NewsController.store reads, under its name', () => {
  const source = read('post-editor.js');
  for (const name of ['id', 'kicker', 'headline', 'body', 'image', 'logo', 'remove_logo',
    'image_crop', 'source_lines', 'expires_at', 'status']) {
    assert.match(source, new RegExp(`form\\.append\\('${name}'`), name);
  }
  assert.match(source, /save\('draft'\)/);
  assert.match(source, /save\('review'\)/);
  assert.match(source, /'X-CSRF-TOKEN': token/);
});

test('the buttons are disabled while a save is in flight', () => {
  const source = read('post-editor.js');
  const start = source.indexOf('function setSaving');
  const body = source.slice(start, source.indexOf('\n  }\n', start));
  assert.match(body, /ui\.saveDraft\.disabled = saving/);
  assert.match(body, /ui\.submit\.disabled = saving/);
});

test('every library change refreshes the post-library live section', () => {
  assert.match(read('post-editor.js'), /DashboardLive\.refresh\('post-library'\)/);
});

test('pasted text is inserted as plain text, capped', () => {
  const source = read('post-editor-text.mjs');
  assert.match(source, /getData\('text\/plain'\)/);
  assert.match(source, /fitInsert\(/);
});

test('dragging the photo captures the pointer', () => {
  assert.match(read('post-editor-photo.mjs'), /setPointerCapture\(event\.pointerId\)/);
});
