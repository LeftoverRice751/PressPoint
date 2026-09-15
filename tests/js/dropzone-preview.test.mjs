// Run with: npm run test:js  (node --test tests/js/*.test.mjs)
//
// Which preview a dashboard dropzone shows for a picked file
// (resources/js/dropzone-preview.mjs).
//
// upload-meter.js used to show only a filename and a size once a file was
// chosen, so an editor could not tell a wrong PDF from the right one until it
// had already uploaded. The dropzone now renders the file itself — image,
// video, audio, or a PDF's first page — and this module is the one place that
// decides which. Kept DOM-free so the decision can be pinned here.

import test from 'node:test';
import assert from 'node:assert/strict';

import { previewKindFor } from '../../resources/js/dropzone-preview.mjs';

test('an image file previews as an image', () => {
  assert.equal(previewKindFor({ type: 'image/png', name: 'seal.png' }), 'image');
  assert.equal(previewKindFor({ type: 'image/webp', name: 'seal.webp' }), 'image');
});

test('a video file previews as a video', () => {
  assert.equal(previewKindFor({ type: 'video/mp4', name: 'promo.mp4' }), 'video');
});

test('an audio file previews as audio', () => {
  assert.equal(previewKindFor({ type: 'audio/mpeg', name: 'hymn.mp3' }), 'audio');
});

test('a PDF previews as a pdf', () => {
  assert.equal(previewKindFor({ type: 'application/pdf', name: 'likaw.pdf' }), 'pdf');
});

test('falls back to the extension when the browser reports no MIME type', () => {
  // Some Linux file pickers hand over File objects with type === '' for
  // anything the desktop database does not know.
  assert.equal(previewKindFor({ type: '', name: 'Silip 2025.PDF' }), 'pdf');
  assert.equal(previewKindFor({ type: '', name: 'cover.JPG' }), 'image');
  assert.equal(previewKindFor({ type: '', name: 'promo.m4v' }), 'video');
  assert.equal(previewKindFor({ type: '', name: 'hymn.ogg' }), 'audio');
});

test('anything else gets no preview', () => {
  assert.equal(previewKindFor({ type: 'application/zip', name: 'bundle.zip' }), null);
  assert.equal(previewKindFor({ type: '', name: 'README' }), null);
  assert.equal(previewKindFor(null), null);
});
