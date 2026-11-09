// Run with: npm run test:js  (node --test tests/js/*.test.mjs)
//
// The pure rules behind the post editor's text fields and expiry button
// (resources/js/post-editor-fields.mjs): the *_MAX caps applied to typing and
// paste, and the campus-local expiry the server's Posts.parse_local_expiry reads.

import test from 'node:test';
import assert from 'node:assert/strict';

import {
  FIELD_MAX, PHOTO_MAX_BYTES, fitInsert, expiryLabel, campusInputNow, usableExpiry,
} from '../../resources/js/post-editor-fields.mjs';

test('caps mirror Posts.KICKER_MAX / HEADLINE_MAX / BODY_MAX and the 8 MB photo cap', () => {
  assert.deepEqual(FIELD_MAX, { kicker: 40, headline: 110, body: 420 });
  assert.equal(PHOTO_MAX_BYTES, 8 * 1024 * 1024);
});

test('fitInsert keeps what fits and drops the rest', () => {
  assert.equal(fitInsert(105, 0, 'abcdefgh', 110), 'abcde');
  assert.equal(fitInsert(110, 0, 'a', 110), '');
});

test('fitInsert counts a selection as room, since it is replaced', () => {
  assert.equal(fitInsert(110, 3, 'abcdef', 110), 'abc');
});

test('fitInsert never returns a negative slice for an over-full field', () => {
  assert.equal(fitInsert(200, 0, 'abc', 110), '');
});

test('an unset expiry reads as the server default', () => {
  assert.equal(expiryLabel(''), 'Expires 7 days after approval');
  assert.equal(expiryLabel(null), 'Expires 7 days after approval');
});

test('a set expiry reads back in campus time, from the input value itself', () => {
  assert.equal(expiryLabel('2026-11-16T17:05'), 'Expires Nov 16, 2026, 5:05 PM');
  assert.equal(expiryLabel('2026-01-02T00:00'), 'Expires Jan 2, 2026, 12:00 AM');
  assert.equal(expiryLabel('2026-07-04T12:30'), 'Expires Jul 4, 2026, 12:30 PM');
});

test('campusInputNow is Asia/Manila wall time in datetime-local format', () => {
  // 16:30 UTC is 00:30 the next day in Manila (+08:00, no DST).
  assert.equal(campusInputNow(new Date(Date.UTC(2026, 10, 9, 16, 30))), '2026-11-10T00:30');
  assert.equal(campusInputNow(new Date(Date.UTC(2026, 10, 9, 3, 5))), '2026-11-09T11:05');
});

test('a lapsed expiry is dropped on load so a re-save is not refused', () => {
  // Posts.parse_local_expiry 422s "Pick an expiry in the future" otherwise.
  assert.equal(usableExpiry('2026-11-01T08:00', '2026-11-09T10:00'), '');
  assert.equal(usableExpiry('2026-11-09T10:00', '2026-11-09T10:00'), '');
  assert.equal(usableExpiry('2026-11-20T08:00', '2026-11-09T10:00'), '2026-11-20T08:00');
  assert.equal(usableExpiry('', '2026-11-09T10:00'), '');
});
