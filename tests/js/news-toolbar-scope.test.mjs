// Run with: npm run test:js  (node --test tests/js/*.test.mjs)
//
// THE DEAD TOOLBAR BUTTON.
//
// A control looked up with `composer.querySelector(...)` that renders OUTSIDE
// `[data-news-composer]` resolves to null, its `if (btn)` guard is skipped, and
// no listener is ever attached. The button still renders, still looks enabled,
// and does nothing at all when clicked — there is no error in the console to
// find, because nothing ran.
//
// This file used to pin one specific instance of that: a `.news-toolbar`
// element that sat as a SIBLING of the composer. That element is gone — the
// full-issue rebuild moved its one control into the composer's own issue
// header, which is inside `[data-news-composer]`, so the sibling hazard it
// described no longer exists. The hazard CLASS very much does, and it got
// sharper: Publish, Save Draft and all three add buttons are composer-scoped
// lookups, so any of them drifting outside that element is a silently dead
// button. The tests below derive the pairing from the source and the markup
// instead of naming controls, so they keep holding as the panel changes.
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

/** The panel with its `{% include %}`s inlined, because that is the DOM the
 *  browser actually gets. The canvas partial renders INSIDE
 *  [data-news-composer], so its hooks are composer-scoped at runtime even
 *  though they live in another file — reading panel-news.html alone would
 *  report them as absent and quietly weaken every check below. */
const PANEL = read('templates/gears/partials/panel-news.html').replace(
  /\{%\s*include\s*['"]([^'"]+)['"]\s*%\}/g,
  (_whole, rel) => read('templates/' + rel),
);

/** Markup that renders elsewhere in the page but is still queried from `root`
 *  by this bundle — the dashboard shell's chrome. */
const OUTSIDE_PANEL = read('templates/gears/shell.html');

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

/** Hooks the source looks up with `<root>.querySelector('[data-news-x]')`,
 *  as a Map of hook -> the variable the lookup was scoped to. Derived from the
 *  source so a control added later is covered without editing this file. */
function scopedLookups() {
  const found = new Map();
  const pattern = /(\w+)\.querySelector\(\s*'\[(data-news-[a-z0-9-]+)[^']*'/g;
  let match;
  while ((match = pattern.exec(CODE)) !== null) {
    const [, scope, hook] = match;
    if (scope !== 'composer' && scope !== 'root') continue;
    // `composer` is the stricter requirement, so it wins if a hook is looked
    // up both ways.
    if (found.get(hook) === 'composer') continue;
    found.set(hook, scope);
  }
  return found;
}

test('the premise: [data-news-composer] exists and its subtree is findable', () => {
  assert.notEqual(MARKUP.indexOf('data-news-composer'), -1);
  assert.ok(composerSubtree().length > 0, 'the composer subtree should not be empty');
});

test('every composer-scoped lookup resolves inside [data-news-composer]', () => {
  const lookups = scopedLookups();
  const composerScoped = [...lookups].filter(([, scope]) => scope === 'composer');

  // Sanity: the derivation should be finding real lookups, not an empty set.
  assert.ok(
    composerScoped.length >= 3,
    `expected several composer-scoped lookups, found ${composerScoped.length}`,
  );

  const dead = composerScoped
    .map(([hook]) => hook)
    // A hook the template never renders at all is a different problem (a
    // lookup left behind by removed markup), and is covered below.
    .filter((hook) => new RegExp(`${hook}(?![-\\w])`).test(MARKUP))
    .filter((hook) => !insideComposer(hook));

  assert.deepEqual(
    dead,
    [],
    'these render OUTSIDE [data-news-composer] but are queried from it, so their '
      + 'listeners are never attached and they are dead on click: ' + dead.join(', '),
  );
});

test('the publish path\'s own controls are inside the composer', () => {
  // Named explicitly, unlike the derived check above: these are the buttons
  // that submit the story. A dead Publish is the worst version of this bug,
  // so it is worth an assertion that does not depend on the regex above.
  for (const hook of [
    'data-news-canvas-save',
    'data-news-save-draft',
    'data-news-add-main',
    'data-news-add-secondary',
    'data-news-add-widget',
  ]) {
    assert.ok(
      insideComposer(hook),
      `${hook} is looked up with composer.querySelector and must render inside `
        + '[data-news-composer]',
    );
  }
});

test('root-scoped lookups may live anywhere, but must render somewhere', () => {
  const lookups = scopedLookups();
  const missing = [...lookups]
    .filter(([, scope]) => scope === 'root')
    .map(([hook]) => hook)
    // The composer's own wrapper hooks and anything the JS creates at runtime
    // rather than reading from the template.
    // Injected by the JS at runtime rather than rendered by any template.
    .filter((hook) => !['data-news-composer', 'data-news-discard-scratch'].includes(hook))
    .filter((hook) => {
      const present = new RegExp(`${hook}(?![-\\w])`);
      return !present.test(MARKUP) && !present.test(OUTSIDE_PANEL);
    });

  assert.deepEqual(
    missing,
    [],
    'the source queries these from root but no template renders them: ' + missing.join(', '),
  );
});
