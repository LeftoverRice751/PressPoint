// Run with: npm run test:js  (node --test tests/js/*.test.mjs)
//
// THE SAVE THAT COULD NOT SUCCEED.
//
// NewsController.store requires a category_id ("Please choose a category for
// this story.") since news_categories went live, but the composer's hidden
// form had no such field and nothing ever set one — so every Save Draft and
// every Submit for review came back 422 with no control that could satisfy
// it. The category modal is that control, and it sits in FRONT of both exits
// of the Publish box: the buttons open it, and only its Confirm runs
// submitWithStatus().
//
// There is no jsdom here (see org-board-drag.test.mjs), so this pins the
// wiring structurally: the field exists, both exits route through the modal,
// the modal is looked up from `root` (it is a sibling <dialog>, not inside
// [data-news-composer] — the same trap news-toolbar-scope.test.mjs is about),
// and a "restorable" answer is offered, never applied.

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const read = (rel) => readFileSync(join(here, '../../', rel), 'utf8');

const CODE = read('resources/js/news-dashboard.js')
  .replace(/\/\*[\s\S]*?\*\//g, '')
  .split('\n')
  .map((line) => line.replace(/(^|[^:])\/\/.*$/, '$1'))
  .join('\n');
const PANEL = read('templates/gears/partials/panel-news.html').replace(/\{#[\s\S]*?#\}/g, '');
const LIST = read('templates/gears/partials/news-categories-list.html').replace(/\{#[\s\S]*?#\}/g, '');

/** Body of the click listener attached to `varName`. */
function clickHandler(varName) {
  const at = CODE.indexOf(`${varName}.addEventListener('click'`);
  assert.notEqual(at, -1, `${varName} should have a click listener`);
  const open = CODE.indexOf('{', at);
  let depth = 0;
  for (let i = open; i < CODE.length; i++) {
    if (CODE[i] === '{') depth += 1;
    else if (CODE[i] === '}' && --depth === 0) return CODE.slice(open + 1, i);
  }
  assert.fail(`unbalanced braces in ${varName}'s click handler`);
}

test('the hidden form carries the category_id the server requires', () => {
  assert.match(PANEL, /name="category_id"[^>]*data-news-field="category_id"/,
    'panel-news.html should have a hidden category_id input in the sync form');
  assert.match(CODE, /categoryId:\s*field\('category_id'\)/,
    'the field map should expose it as f.categoryId');
});

test('both exits of the Publish box open the category modal first', () => {
  for (const btn of ['saveBtn', 'draftBtn']) {
    const body = clickHandler(btn);
    assert.match(body, /askCategoryThen\s*\(/,
      `${btn} must go through askCategoryThen — a direct submitWithStatus() is the 422`);
    // The submit must be INSIDE the callback, never before it.
    const ask = body.indexOf('askCategoryThen');
    const submit = body.indexOf('submitWithStatus');
    assert.ok(submit > ask, `${btn}: submitWithStatus should run only after the modal confirms`);
  }
});

test('the modal lives outside the composer and is queried from root', () => {
  const composerAt = PANEL.indexOf('data-news-composer');
  const modalAt = PANEL.indexOf('data-news-category-modal');
  assert.ok(modalAt > composerAt, 'the modal should render after the composer opens');
  assert.match(CODE, /root\s*\.\s*querySelector\(\s*'\[data-news-category-modal\]'/,
    'a composer.querySelector here would return null and silently wire nothing');
});

test('an existing story arrives with its category pre-selected', () => {
  assert.match(LIST.length ? read('templates/gears/partials/news-slots.html') : '',
    /data-news-library-category-id=/, 'the library row should carry the category id');
  assert.match(CODE, /categoryId:\s*card\.getAttribute\('data-news-library-category-id'\)/,
    'cardData() should read it');
  assert.match(CODE, /f\.categoryId\.value\s*=\s*data\.categoryId/,
    'selectStory() should seed the hidden field from it');
});

test('confirm is disabled until a category is chosen', () => {
  assert.match(PANEL, /data-news-category-confirm[^>]*\bdisabled\b/,
    'the Confirm button should render disabled');
  assert.match(CODE, /categoryConfirm\.disabled\s*=\s*!/,
    'and be enabled only from a real selection');
});

test('a soft-deleted name is offered for restore, never restored on Add', () => {
  // The controller answers 409 + ok:true + restore_url for a name in the
  // trash. Restoring resurrects every story cascade-deleted with it, so it
  // must be a second, explicit click.
  const addAt = CODE.indexOf("categoryAddForm.addEventListener('submit'");
  const restoreAt = CODE.indexOf("categoryRestore.addEventListener('click'");
  assert.ok(addAt !== -1 && restoreAt !== -1, 'both the Add and Restore handlers should exist');
  const addBody = CODE.slice(addAt, restoreAt);
  assert.match(addBody, /outcome\s*===\s*'restorable'/, 'Add should recognise the restorable outcome');
  assert.equal(/categoryRestoreUrl\s*,\s*'POST'/.test(addBody), false,
    'Add must not POST to the restore url itself');
  assert.match(CODE.slice(restoreAt), /categoryRequest\(\s*url\s*,\s*'POST'/,
    'only the Restore button posts to it');
});

test('the list is its own live section so a rename reaches other editors', () => {
  assert.match(PANEL, /data-live-section="news-categories"/,
    'a rename touches no news row, so the "news" stamp never moves for it');
  assert.match(LIST, /data-news-categories-json/, 'the fragment should keep its JSON handoff block');
});
