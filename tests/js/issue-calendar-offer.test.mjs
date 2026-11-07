// Run with: npm run test:js  (node --test tests/js/*.test.mjs)
//
// THE EVENT THAT NEVER REACHED THE NEWSLETTER.
//
// Saving an event refreshed only the Events table, so the composer's calendar
// stayed as it was until a full reload. The save now asks whether to use the
// event on the open newsletter, and the answer swaps just the calendar.
//
// The dialog's wording is a pure function and is tested for real. There is no
// jsdom here (see org-board-drag.test.mjs), so the wiring is pinned structurally.

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

import { offerDialog } from '../../resources/js/issue-calendar-offer.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const read = (path) => readFileSync(join(here, '../../resources/js', path), 'utf8');

test('no offer means no question, including from a server without the key', () => {
  // Between the asset build and the gunicorn restart the new JS talks to old
  // Python, whose save response has no calendar_offer at all.
  assert.equal(offerDialog(null, 'Fair'), null);
  assert.equal(offerDialog(undefined, 'Fair'), null);
});

test('with room, it asks to add and names the event and issue', () => {
  const dialog = offerDialog({ issue_no: 12, count: 1, capacity: 3, full: false }, 'Fair');
  assert.equal(dialog.kind, 'add');
  assert.equal(dialog.confirmLabel, 'Add to newsletter');
  assert.equal(dialog.cancelLabel, 'Not now');
  assert.match(dialog.body, /Fair/);
  assert.match(dialog.body, /Issue No\. 12/);
});

test('with no open newsletter, it says a new draft will start', () => {
  const dialog = offerDialog({ issue_no: null, count: 0, capacity: 3, full: false }, 'Fair');
  assert.equal(dialog.kind, 'add');
  assert.match(dialog.body, /new draft/i);
});

test('when full, it offers the manager rather than an add that would be refused', () => {
  const dialog = offerDialog({ issue_no: 12, count: 3, capacity: 3, full: true }, 'Fair');
  assert.equal(dialog.kind, 'full');
  assert.equal(dialog.confirmLabel, 'Manage calendar');
  assert.equal(dialog.cancelLabel, 'Close');
  assert.match(dialog.body, /Fair/);
  assert.match(dialog.body, /3 dates/);
});

test('the event save asks through ConfirmModal, and only adds on yes', () => {
  const source = read('gears-dashboard.js');
  assert.match(source, /offerDialog\(payload\.calendar_offer/);
  assert.match(source, /window\.ConfirmModal\.ask\(dialog\)/);
  assert.match(source, /\/gears\/issues\/current\/events\//);
  assert.match(source, /issue-calendar:changed/);
  assert.match(source, /issue-calendar:manage/);
});

test('the composer refreshes only the calendar, past the unpublished-edits gate', () => {
  const source = read('news-dashboard.js');
  const start = source.indexOf('function refreshIssueCalendar');
  assert.notEqual(start, -1);
  const body = source.slice(start, source.indexOf('\n  }\n', start));
  assert.match(body, /fragment\/issue-calendar/);
  assert.match(body, /data-issue-calendar-dates/);
  assert.match(body, /data-issue-calendar-manager/);
  // refreshCanvasFragment() skips its swap while layoutDirty, which is the
  // state an editor mid-newsletter is in. Neither may appear here.
  assert.doesNotMatch(body, /layoutDirty/);
  assert.doesNotMatch(body, /refreshCanvasFragment/);
  assert.doesNotMatch(body, /editor\.innerHTML/);
});

test('every way a calendar changes triggers that refresh', () => {
  const source = read('news-dashboard.js');
  assert.match(source, /addEventListener\('issue-calendar:changed'/);
  assert.match(source, /addEventListener\('issue-calendar:manage'/);
  assert.match(source, /section === 'events'/);
  assert.match(source, /data-calendar-remove/);
  assert.match(source, /data-calendar-add/);
  assert.match(source, /data-issue-calendar-manage/);
});

test('the manager stays open on a narrow screen until the editor leaves it', () => {
  // Below 1280px the inspector is a slide-over, and syncInspector() runs a frame
  // after every click. Keyed to hasBlock alone, it closed the manager before it
  // ever painted, because opening the manager is what clears the selection.
  const source = read('news-dashboard.js');
  assert.match(source, /classList\.toggle\('is-open', hasBlock \|\| calendarManagerOpen\)/);
  const open = source.slice(source.indexOf('function openCalendarManager'));
  assert.match(open.slice(0, open.indexOf('\n  }\n')), /calendarManagerOpen = true/);
  // Selecting a story and clicking outside both have to be able to close it.
  assert.match(source, /if \(hasBlock\) calendarManagerOpen = false/);
  assert.match(source, /function closeCalendarManager/);
  assert.match(source, /closest\('\[data-news-properties\], dialog'\)/);
  assert.match(source, /e(vent)?\.key === 'Escape' && calendarManagerOpen/);
});
