// Run with: npm run test:js  (node --test tests/js/*.test.mjs)
//
// THE DEAD TOOLBAR BUTTON.
//
// `.news-toolbar` is a SIBLING of `[data-news-composer]` in
// templates/gears/partials/panel-news.html, not a descendant of it. So a
// toolbar control looked up with `composer.querySelector(...)` resolves to
// null, its `if (btn)` guard is skipped, and no listener is ever attached.
// The button still renders, still looks enabled, and does nothing at all when
// clicked — there is no error in the console to find, because nothing ran.
//
// That is exactly how "Add New News" shipped broken: the markup went into the
// toolbar, the lookup was scoped to the composer, and the same mistake took
// the prev/next story stepper with it.
//
// The codebase already warns about this. `libraryCardById()` carries the
// comment "Scoped to `root`, not `composer`: the library cards render inside
// the drawer <dialog>, which is a SIBLING of [data-news-composer] in the DOM
// … Scoping this to `composer` meant the lookup could never find a card", and
// the working Story Library button next to these ones is found with
// `root.querySelector('[data-news-library-open]')`.
//
// There is no jsdom in this project and none should be added (see the note in
// org-board-drag.test.mjs), so this cannot click a real button. It instead
// pins the two facts that decide the outcome: WHERE each hook sits in the
// template, and WHICH root the source queries it from — deriving the first
// from the markup rather than hardcoding a list, so moving a control between
// the toolbar and the composer updates the expectation automatically.

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const read = (rel) => readFileSync(join(here, '../../', rel), 'utf8');

const SOURCE = read('resources/js/news-dashboard.js');
const PANEL = read('templates/gears/partials/panel-news.html');

// Strip comments so the prose above the code cannot satisfy or trip a check.
const CODE = SOURCE
  .replace(/\/\*[\s\S]*?\*\//g, '')
  .split('\n')
  .map((line) => line.replace(/(^|[^:])\/\/.*$/, '$1'))
  .join('\n');

// Panel markup minus its Jinja comments, for the same reason.
const MARKUP = PANEL.replace(/\{#[\s\S]*?#\}/g, '');

/** The markup INSIDE the `[data-news-composer]` element, found by matching
 *  <div> depth from its opening tag to its own closing tag.
 *
 *  Slicing "from the composer to end of file" would be wrong and dangerously
 *  reassuring: the two <dialog>s render after the composer closes, so a naive
 *  slice reports them as inside it and would happily bless a
 *  `composer.querySelector` that returns null at runtime. */
function composerSubtree() {
  const at = MARKUP.indexOf('data-news-composer');
  assert.notEqual(at, -1, 'panel-news.html should still have [data-news-composer]');

  let i = MARKUP.indexOf('>', at) + 1;
  const tags = /<(\/?)div\b/g;
  tags.lastIndex = i;
  let depth = 1;
  let match;
  while ((match = tags.exec(MARKUP)) !== null) {
    depth += match[1] ? -1 : 1;
    if (depth === 0) return MARKUP.slice(i, match.index);
  }
  assert.fail('[data-news-composer] never closes — is the markup balanced?');
}

/** True when `hook` appears inside the composer element. The negative
 *  lookahead stops `data-news-add` matching `data-news-add-main`. */
function insideComposer(hook) {
  return new RegExp(`${hook}(?![-\\w])`).test(composerSubtree());
}

/** Every `data-news-*` hook that appears BEFORE the composer opens, i.e. the
 *  ones that must be queried from `root`. */
function hooksOutsideComposer() {
  const at = MARKUP.indexOf('data-news-composer');
  const before = MARKUP.slice(0, at);
  const found = new Set();
  const pattern = /data-news-[a-z0-9-]+/g;
  let match;
  while ((match = pattern.exec(before)) !== null) {
    found.add(match[0]);
  }
  // The composer element's own hook and the panel wrapper's are not controls.
  found.delete('data-news-composer');
  found.delete('data-news-toolbar');
  return found;
}

test('the toolbar really is outside the composer (the premise of this file)', () => {
  const toolbarAt = MARKUP.indexOf('data-news-toolbar');
  const composerAt = MARKUP.indexOf('data-news-composer');

  assert.notEqual(toolbarAt, -1, 'the news toolbar should still exist');
  assert.ok(
    toolbarAt < composerAt,
    'the toolbar is expected to render before [data-news-composer] opens. If this '
      + 'ever fails the toolbar has been moved INSIDE the composer, and the rest of '
      + 'this file is checking a constraint that no longer applies.',
  );
});

test('every toolbar control is queried from root, not composer', () => {
  const outside = hooksOutsideComposer();

  // Sanity: the fixture should be finding real controls, not an empty set.
  assert.ok(outside.size >= 2, `expected several toolbar hooks, found ${outside.size}`);

  const misscoped = [];
  for (const hook of outside) {
    // A `composer.querySelector('[data-news-add]')` for a hook that lives in
    // the toolbar is the bug. Allow any amount of whitespace/newline between
    // `composer.querySelector(` and the selector.
    const bad = new RegExp(`composer\\s*\\.\\s*querySelector\\(\\s*'\\[${hook}\\]'`);
    if (bad.test(CODE)) misscoped.push(hook);
  }

  assert.deepEqual(
    misscoped,
    [],
    'These controls render in .news-toolbar, which is a SIBLING of '
      + '[data-news-composer] — so composer.querySelector() returns null for them '
      + 'and their click listeners are never attached. Query them from `root`, the '
      + 'way libraryOpenBtn already does.',
  );
});

test('the Add New News button is wired up', () => {
  assert.ok(
    /root\s*\.\s*querySelector\(\s*'\[data-news-add\]'/.test(CODE),
    '"Add New News" must be found via root.querySelector — it lives in the toolbar.',
  );
  // The markup writes the attribute bare, and `data-news-add-main` /
  // `-secondary` / `-widget` all share the prefix — so the boundary matters.
  assert.ok(
    /data-news-add(?![-\w])/.test(MARKUP),
    'the panel should still render an [data-news-add] button',
  );
});

test('the story stepper controls are wired up', () => {
  for (const hook of ['data-news-prev', 'data-news-next', 'data-news-position']) {
    assert.ok(
      new RegExp(`root\\s*\\.\\s*querySelector\\(\\s*'\\[${hook}\\]'`).test(CODE),
      `${hook} lives in the toolbar and must be queried from root`,
    );
  }
});

test('the detached bench is inside the composer, so composer-scoped is correct', () => {
  // The counterweight to the tests above: not everything should move to
  // `root`. The bench deliberately sits inside the composer (as a sibling of
  // [data-news-editor], so refreshCanvasFragment's innerHTML rewrite cannot
  // swallow it), and composer.querySelector is the right lookup for it.
  assert.ok(
    insideComposer('data-news-bench'),
    'the detached bench should render inside [data-news-composer]',
  );
  assert.ok(
    /composer\s*\.\s*querySelector\(\s*'\[data-news-bench\]'/.test(CODE),
    'the bench is inside the composer, so it should be looked up from composer',
  );
});

test('the two dialogs are outside the composer, whatever their file position', () => {
  // Guards the subtree helper itself. Both <dialog>s render AFTER the composer
  // closes, so a "slice to end of file" reading of the markup would call them
  // inside it — and bless a composer.querySelector that is null at runtime.
  for (const hook of ['data-news-category-modal', 'data-news-library-drawer']) {
    assert.equal(
      insideComposer(hook),
      false,
      `${hook} renders after [data-news-composer] closes`,
    );
  }
});

test('no two composer controls share a var name', () => {
  // `var addBtn` was declared twice in the same IIFE scope — once for the new
  // toolbar button and once, 700 lines later, for "+ Add a story". The second
  // silently reassigns the first. It did not cause the dead-button bug (the
  // listener attaches before the reassignment runs), but a redeclaration that
  // reads as two independent variables is a trap for the next reader.
  const names = new Map();
  const pattern = /\bvar\s+([A-Za-z_$][\w$]*)\s*=\s*(?:composer|root)\s*\.\s*querySelector\(/g;
  let match;
  while ((match = pattern.exec(CODE)) !== null) {
    const name = match[1];
    names.set(name, (names.get(name) || 0) + 1);
  }

  const duplicated = [...names.entries()].filter(([, count]) => count > 1).map(([name]) => name);

  assert.deepEqual(
    duplicated,
    [],
    'these element vars are declared more than once in the same function scope',
  );
});
