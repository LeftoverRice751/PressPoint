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

import {
  photoProblem, INVALID_IMAGE, storagePhotoUrl, resolveLogoUrl,
} from '../../resources/js/post-editor-photo.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const read = (name) => readFileSync(join(here, '../../resources/js', name), 'utf8');
const MB = 1024 * 1024;

test('a photo over 8 MB is refused with the server\'s own message', () => {
  assert.equal(photoProblem({ type: 'image/jpeg', size: 6 * MB + 1 }), 'Photo is too large (max 6 MB)');
  assert.equal(photoProblem({ type: 'image/jpeg', size: 6 * MB }), '');
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

// Row JSON and the save/duplicate responses are data. A hostile or corrupted
// stored value must render as "no image", never reach img.src.
const HOSTILE = ['javascript:alert(1)', 'http://evil.example/x.png', '//evil.example/x.png',
  'data:image/svg+xml,<svg onload=alert(1)>', 'JaVaScRiPt:alert(1)', '/\\evil.example/x.png'];

test('a stored photo path becomes a same-origin /storage/ URL', () => {
  assert.equal(storagePhotoUrl('news/a.large.webp'), '/storage/news/a.large.webp');
  assert.equal(storagePhotoUrl(''), '');
  assert.equal(storagePhotoUrl(null), '');
});

test('a hostile photo path from a row is refused, not prefixed into a path', () => {
  for (const value of HOSTILE) {
    assert.equal(storagePhotoUrl(value), '', value);
  }
});

test('a hostile logo URL falls back to the site logo', () => {
  for (const value of HOSTILE) {
    assert.equal(resolveLogoUrl(value, '/storage/Branding/logo.png'), '/storage/Branding/logo.png', value);
  }
  assert.equal(resolveLogoUrl('/storage/Branding/posts/l.png', '/x.png'), '/storage/Branding/posts/l.png');
});

test('a hostile site logo is refused too, leaving no src at all', () => {
  for (const value of HOSTILE) {
    assert.equal(resolveLogoUrl('', value), '', value);
    assert.equal(resolveLogoUrl(value, value), '', value);
  }
});

test('every img.src assignment in the editor goes through the allowlist', () => {
  const photo = read('post-editor-photo.mjs');
  assert.match(photo, /import \{ safeImageUrl \} from '\.\/safe-image-url\.mjs'/);
  // show() sanitises whatever it is handed before assigning it.
  const show = photo.slice(photo.indexOf('function show('), photo.indexOf('function accept('));
  assert.match(show, /const src = safeImageUrl\(rawSrc\)/);
  // The logo only ever takes a blob: preview or a resolveLogoUrl() result.
  for (const [, rhs] of photo.matchAll(/logo\.src = ([^;]+);/g)) {
    assert.equal(rhs, 'objectUrl', rhs);
  }
  const editor = read('post-editor.js');
  assert.doesNotMatch(editor, /'\/storage\/' \+/);
  assert.match(editor, /photo\.load\(storagePhotoUrl\(row\.image_large\)/);
  assert.match(editor, /photo\.saved\(storagePhotoUrl\(savedCard\.image_large\)\)/);
});

test('the pickers are opened by real buttons, so the keyboard reaches them', () => {
  const photo = read('post-editor-photo.mjs');
  assert.equal((photo.match(/pickButton\.addEventListener\('click', \(\) => input\.click\(\)\)/g) || []).length, 2);
});

test('a duplicate opens even when the library refresh was skipped', () => {
  const source = read('post-editor.js');
  const start = source.indexOf('function duplicatePost');
  const body = source.slice(start, source.indexOf('\n  }\n', start));
  assert.match(body, /rowData\(id\) \|\| Object\.assign\(\{\}, payload\.card/);
});

test('the review queue no longer refreshes a news section the console lacks', () => {
  assert.doesNotMatch(read('review-queue.js'), /refresh\('news'\)/);
});
