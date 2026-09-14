// Run with: npm run test:js  (node --test tests/js/*.test.mjs)
//
// Guards the composer's "+ Add …" scratch cards against two regressions.
//
// 1. THE FLOAT-IN-A-GRID BUG.
//
// `.secondary-story` is a two-column grid (108px thumb | text), and the real
// server-rendered card in kiosk/_issue.html puts exactly two elements in
// it: the thumb and `.secondary-story__body`. The scratch card built by
// "+ Add a story" added a THIRD — the "Discard draft" button — styled
// `float: right`.
//
// Floats are ignored on grid items. So the button took grid cell 1, the thumb
// took cell 2, and the body wrapped onto a second row inside the 108px column:
// the Discard chip sat where the photo belongs and the mounted Quill headline
// editor was squeezed into a narrow strip that overflowed onto the Secondary
// slot below it. `.feature-story` is a grid too, so the lead scratch carried
// the same bug in a less obvious form (a full-width row shoved in at the top).
//
// The saved cards escaped it only because their own overlay — the position
// badge and Move Up/Down arrows in `.news-card-controls` — is
// `position: absolute` and so leaves grid flow entirely. That is the property
// the Discard button was missing, and it is what these tests pin: a scratch
// card may not contribute an extra IN-FLOW child to a card whose geometry is
// a grid. Asserting "no float" alone would not do — the requirement is being
// out of flow, and absolute positioning is what delivers it.
//
// There is no jsdom in this project and none should be added (see the note in
// org-board-drag.test.mjs), so real box geometry cannot be computed here.
// These tests instead check the two inputs that decide it: the template's
// child list, and whether the CSS takes each child out of flow.
//
// 2. THE MISSING WIDGET AUTHORING PATH.
//
// The front page has three slot types but the composer shipped only two "add"
// buttons. A widget could be filled only by assigning a story that already
// existed, via the Story Library placeholder — so with an empty library the
// slot was unreachable and read as "not editable", even though `.info-card`
// has had working title/excerpt/body regions all along.

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const read = (rel) => readFileSync(join(here, '../../', rel), 'utf8');

const SOURCE = read('resources/js/news-dashboard.js');
const PANEL = read('templates/gears/partials/panel-news.html');
const SLOTS = read('templates/kiosk/_issue.html');
const CSS = read('resources/css/kiosk-news.css') + '\n' + read('resources/css/news-dashboard.css');

// Strip comments so the prose above (and in the source) cannot satisfy or trip
// the checks below.
const CODE = SOURCE
  .replace(/\/\*[\s\S]*?\*\//g, '')
  .split('\n')
  .map((line) => line.replace(/(^|[^:])\/\/.*$/, '$1'))
  .join('\n');

// ── Reading a declaration out of the source ─────────────────
//
// Both readers respect single-quoted strings and nesting. Strings matter
// because the markup carries HTML entities (`&middot;`, `&uarr;`) whose own
// semicolons would end a statement early; nesting matters because
// SCRATCH_SHAPE holds inline functions, so its first `;` is several
// properties short of the end.
/** The initialiser of `var NAME = …`, up to its terminating semicolon. */
function statementAfter(marker) {
  const at = CODE.indexOf(marker);
  if (at === -1) return null;
  const from = at + marker.length;
  let depth = 0;
  let inString = false;
  let i = from;
  for (; i < CODE.length; i++) {
    const ch = CODE[i];
    if (inString) {
      if (ch === '\\') i += 1;
      else if (ch === "'") inString = false;
      continue;
    }
    if (ch === "'") inString = true;
    else if (ch === '{' || ch === '(' || ch === '[') depth += 1;
    else if (ch === '}' || ch === ')' || ch === ']') depth -= 1;
    else if (ch === ';' && depth === 0) break;
  }
  return CODE.slice(from, i);
}

/** The balanced `{ … }` body of the declaration named by `marker`. Brace
 *  matching starts at the first `{` after the marker, so the marker may stop
 *  anywhere ahead of the body — mid-argument-list included. */
function blockAfter(marker) {
  const at = CODE.indexOf(marker);
  if (at === -1) return null;
  const open = CODE.indexOf('{', at + marker.length);
  if (open === -1) return null;
  let depth = 0;
  let inString = false;
  for (let i = open; i < CODE.length; i++) {
    const ch = CODE[i];
    if (inString) {
      if (ch === '\\') i += 1;
      else if (ch === "'") inString = false;
      continue;
    }
    if (ch === "'") inString = true;
    else if (ch === '{') depth += 1;
    else if (ch === '}') {
      depth -= 1;
      if (depth === 0) return CODE.slice(open, i + 1);
    }
  }
  return null;
}

// The templates are plain concatenations of string literals and each other, so
// evaluating one with its dependencies bound resolves it exactly as the
// browser would build it.
function htmlConstant(name, scope = {}) {
  const expr = statementAfter('var ' + name + ' =');
  assert.ok(expr, `${name} is not declared in news-dashboard.js`);
  const keys = Object.keys(scope);
  return new Function(...keys, 'return (' + expr + ');')(...keys.map((k) => scope[k]));
}

function scratchHtml(name) {
  const discard = htmlConstant('SCRATCH_DISCARD_HTML');
  return htmlConstant(name, { SCRATCH_DISCARD_HTML: discard });
}

// ── Tiny markup / CSS readers ───────────────────────────────

/** Direct element children of the template's root <article>. */
function topLevelChildren(html) {
  const inner = html
    .replace(/^\s*<article[^>]*>/, '')
    .replace(/<\/article>\s*$/, '');
  const children = [];
  let depth = 0;
  const tag = /<(\/?)([a-z0-9]+)([^>]*)>/gi;
  let match;
  while ((match = tag.exec(inner))) {
    if (match[1] === '/') depth -= 1;
    else {
      if (depth === 0) children.push(match[3]);
      depth += 1;
    }
  }
  return children;
}

function classesOf(attrs) {
  const found = /class=("|')(.*?)\1/.exec(attrs || '');
  return found ? found[2].split(/\s+/).filter(Boolean) : [];
}

/** Every declaration block whose selector list mentions `.cls`. */
function rulesFor(cls) {
  const blocks = [];
  const rule = /([^{}]+)\{([^{}]*)\}/g;
  let match;
  while ((match = rule.exec(CSS))) {
    const selectors = match[1];
    if (new RegExp('\\.' + cls + '(?![\\w-])').test(selectors)) blocks.push(match[2]);
  }
  return blocks;
}

/** True when the CSS lifts an element out of normal (here: grid) flow. */
function isOutOfFlow(classes) {
  return classes.some((cls) =>
    rulesFor(cls).some((block) => /position\s*:\s*(absolute|fixed)/.test(block)));
}

function inFlowChildCount(html) {
  return topLevelChildren(html).filter((attrs) => !isOutOfFlow(classesOf(attrs))).length;
}

// ── 1. The scratch cards must not disturb the grid ──────────

test('the secondary card is still a fixed two-column grid', () => {
  // The premise the next test rests on. If the card is ever re-laid-out as a
  // block or a flex row, an in-flow extra child stops being fatal — and this
  // assertion is where someone making that change finds out why the rule
  // below exists.
  const rule = /\.secondary-story\s*\{([^}]*)\}/.exec(CSS);
  assert.ok(rule, '.secondary-story should have a base rule in kiosk-news.css');
  assert.match(rule[1], /display\s*:\s*grid/);
  assert.match(rule[1], /grid-template-columns\s*:\s*108px/);
});

test('the saved cards keep their overlay controls out of grid flow', () => {
  // The behaviour the scratch cards have to copy: `.news-card-controls` is
  // what a real card adds in editor mode, and it costs the grid nothing.
  assert.ok(SLOTS.includes('news-card-controls'),
    'the editor overlay should still be part of the shared slot markup');
  assert.ok(isOutOfFlow(['news-card-controls']),
    'position: absolute is what keeps the Move Up/Down overlay from taking a grid cell');
});

test('the discard control does not take a grid cell', () => {
  const classes = classesOf(topLevelChildren(scratchHtml('SCRATCH_SECONDARY_HTML'))[0]);
  assert.ok(classes.length, 'the discard control should carry a class to style it by');
  assert.ok(isOutOfFlow(classes),
    'float: right is ignored on a grid item — the discard button must be absolutely '
    + 'positioned, like .news-card-controls, or it consumes the thumbnail\'s cell and '
    + 'pushes the headline editor into the 108px column');
});

test('a secondary scratch card fills the same two cells as a saved one', () => {
  assert.equal(inFlowChildCount(scratchHtml('SCRATCH_SECONDARY_HTML')), 2,
    'the grid has two columns and the real card puts exactly two things in them: '
    + 'the thumb and .secondary-story__body');
});

test('a lead scratch card fills the same two rows as a saved one', () => {
  // `.feature-story` is a single-column grid, so a third in-flow child is an
  // extra row rather than a stolen column — wrong in the same way, quieter.
  assert.equal(inFlowChildCount(scratchHtml('SCRATCH_MAIN_HTML')), 2,
    'the real lead card is a figure plus .feature-story__content');
});

// ── 2. Widget authoring ─────────────────────────────────────

test('the composer offers an add button for every slot type', () => {
  ['data-news-add-main', 'data-news-add-secondary', 'data-news-add-widget'].forEach((hook) => {
    assert.ok(PANEL.includes(hook),
      `${hook} is missing — a slot with no add button can only be filled from the `
      + 'Story Library, so it is unreachable when no spare story exists');
  });
});

test('the widget slot has a scratch shape of its own', () => {
  const shape = statementAfter('var SCRATCH_SHAPE =');
  assert.ok(shape, 'SCRATCH_SHAPE should still be declared');
  assert.match(shape, /\bwidget\s*:/,
    'without a widget entry ensureNewStoryScratch() silently falls back to the '
    + 'secondary shape and inserts the new card into the wrong slot');
});

test('the widget scratch carries every region the widget card can edit', () => {
  const html = scratchHtml('SCRATCH_WIDGET_HTML');
  assert.match(html, /class="[^"]*\binfo-card\b/,
    'the scratch has to be an .info-card so it inherits the widget type scale');
  // syncFormFromSurface() only writes a field when its region exists on the
  // active card, so a region missing here is a column silently dropped on save.
  ['title', 'excerpt', 'body'].forEach((key) => {
    assert.ok(html.includes('data-news-edit="' + key + '"'),
      `the widget card edits ${key} — a scratch without that region drops it on Publish`);
  });
});

test('the widget scratch goes into a cell that is actually free', () => {
  // Each `data-news-slot-list="widget"` cell is capacity 1 (that is where the
  // two-widget cap comes from), so the list resolver has to pick an EMPTY
  // one. Returning `querySelector(...)` — the first cell, full or not —
  // would stack an unsaved draft on top of a published widget story.
  const shape = statementAfter('var SCRATCH_SHAPE =');
  const widget = shape.slice(shape.indexOf('widget'));
  const named = /list\s*:\s*([A-Za-z_$][\w$]*)/.exec(widget);
  // The resolver may be inline or named; either way it has to consult
  // occupancy rather than just handing back the first cell.
  const body = named ? blockAfter('function ' + named[1] + '(') : widget;
  assert.ok(body, `${named && named[1]} is named as the widget list resolver but not declared`);
  assert.match(body, /realCardNodes\(/,
    'the widget list resolver must test occupancy before choosing a cell');
});

test('the one-draft-at-a-time rule sees a widget scratch too', () => {
  // The composer has ONE hidden form and Publish only ever writes the active
  // story, so a second simultaneous scratch is a draft that cannot be saved —
  // the next canvas refresh deletes it silently. startOrResumeScratch()
  // enforces "one at a time" through existingScratch(), so a shape missing
  // from that selector is a shape that can be created alongside another and
  // then lost.
  const fn = blockAfter('function existingScratch()');
  assert.ok(fn, 'existingScratch() should still be declared');
  ['.feature-story', '.secondary-story', '.info-card'].forEach((shape) => {
    assert.ok(fn.includes(shape + '[data-news-id=""]'),
      `existingScratch() does not match ${shape} — a draft in that slot can be `
      + 'created alongside another and is then guaranteed to be lost');
  });
});

test('every add-a-block chip is derived from its block capacity', () => {
  // A block at capacity must not offer to add to itself. This used to be three
  // hand-written lines (addMainBtn / addBtn / addWidgetBtn), one per bucket;
  // it is now derived for every block type, so a block added later is covered
  // without anyone remembering to add a fourth line.
  const fn = blockAfter('function syncPlaceholders()');
  assert.ok(fn, 'syncPlaceholders() should still be declared');

  assert.match(fn, /BLOCK_TYPES\s*\.\s*forEach/,
    'syncPlaceholders() should walk every block type rather than naming a few');
  assert.match(fn, /BLOCK_CAPACITY\s*\[/,
    'the disabled state has to come from the block capacity, not a literal');
  assert.match(fn, /chip\s*\.\s*disabled\s*=/,
    'syncPlaceholders() is the one place every mutation, refresh and init '
    + 'funnels through, so the chips have to be derived there');
});

test('every block excludes the scratch from the canvas list selector', () => {
  const selectors = statementAfter('var CANVAS_LIST_SELECTOR =');
  assert.ok(selectors, 'CANVAS_LIST_SELECTOR should still be declared');

  // Derived, not a hardcoded list: a block type added later is covered without
  // editing this test, and one that forgets the guard fails it. An unsaved
  // draft that Sortable indexes as a real card is draggable into a slot it has
  // not earned, and counts against a capacity it should not.
  const entries = [...selectors.matchAll(/(\w+)\s*:\s*'([^']*)'/g)];
  assert.ok(entries.length >= 6,
    `expected a selector per block, found ${entries.length}`);

  for (const [, block, selector] of entries) {
    assert.match(selector, /:not\(\.is-scratch\)/,
      `${block} must exclude the scratch; without it Sortable indexes an unsaved `
      + 'draft as a real, draggable card');
  }
});
