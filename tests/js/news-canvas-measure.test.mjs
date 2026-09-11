// Run with: npm run test:js  (node --test tests/js/*.test.mjs)
//
// Two composer-geometry regressions, both of which read to an editor as
// "the side and widget cards don't fit / don't line up".
//
// 1. THE HEADLINE THAT GREW WHEN YOU CLICKED IT.
//
// The composer renders the kiosk's own partial, so a saved card and the Quill
// editor that mounts over it must agree on type size — otherwise the text you
// are typing wraps differently from the text you were just looking at.
//
// The lead and widget pairs always agreed (1.9rem, 1.25rem). The side pair did
// not: the saved card was dropped to 1.15rem — with a two-line clamp, to keep
// the two columns of a row starting at the same height — but the Quill rule
// kept the kiosk's 1.35rem. Clicking a side headline inflated it ~17% inside
// the narrowest column on the canvas.
//
// 2. THE BREAKPOINT THAT MEASURED THE WRONG THING.
//
// The canvas width is almost independent of the window: it is what remains
// after the nav rail and the properties aside, so a 1366px window leaves a
// canvas near 548px. The widget reflow was guarded by
// `@media (max-width: 900px)` on the VIEWPORT, which on any ordinary desktop
// never fires — so the canvas sat well under the width the rule's own comment
// said it needed and nothing reflowed. A bigger monitor made it worse, since
// the extra pixels went to the window while the breakpoint stayed unreached.
//
// The fix is a container query on the canvas. These tests pin that the
// reflow rules ask the CONTAINER, never the viewport.
//
// There is no jsdom in this project and none should be added (see the note in
// org-board-drag.test.mjs), so this cannot compute real boxes. It checks the
// declarations that decide them.

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const read = (rel) => readFileSync(join(here, '../../', rel), 'utf8');

// Comments stripped so the prose above a rule cannot satisfy a check.
const strip = (css) => css.replace(/\/\*[\s\S]*?\*\//g, '');

const DASH = strip(read('resources/css/news-dashboard.css'));
const KIOSK = strip(read('resources/css/kiosk-news.css'));

/** The `font-size` declared by the first rule whose selector is exactly `sel`. */
function fontSize(css, sel) {
  const pattern = new RegExp(
    `(?:^|\\})\\s*${sel.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s*\\{([^}]*)\\}`,
    'm',
  );
  const block = pattern.exec(css);
  if (!block) return null;
  const size = /font-size:\s*([^;]+);/.exec(block[1]);
  return size ? size[1].trim() : null;
}

test('a saved headline and the editor that mounts over it are the same size', () => {
  const pairs = [
    ['lead', '.news-editor .feature-story__title',
      '.news-editor .feature-story .news-body-editor-host[data-news-target="title"] .ql-editor'],
    ['side', '.news-editor .secondary-story__title',
      '.news-editor .secondary-story .news-body-editor-host[data-news-target="title"] .ql-editor'],
  ];

  for (const [name, savedSel, editingSel] of pairs) {
    const saved = fontSize(DASH, savedSel);
    const editing = fontSize(DASH, editingSel);

    assert.ok(saved, `expected a dashboard font-size for the ${name} saved headline`);
    assert.ok(editing, `expected a dashboard font-size for the ${name} mounted editor`);
    assert.equal(
      editing,
      saved,
      `the ${name} headline changes size when Quill mounts (saved ${saved}, editing ${editing}) — `
        + 'the text being typed would wrap differently from the text just displayed',
    );
  }
});

test('the widget pair agrees too, inheriting the kiosk size', () => {
  // The widget headline has no dashboard override — it takes the kiosk's
  // 1.25rem — so the mounted editor must declare that same value.
  const kiosk = fontSize(KIOSK, '.info-card__title');
  const editing = fontSize(
    DASH,
    '.news-editor .info-card .news-body-editor-host[data-news-target="title"] .ql-editor',
  );

  assert.equal(fontSize(DASH, '.news-editor .info-card__title'), null,
    'if a dashboard override for the widget headline is added, this test must compare against it');
  assert.equal(editing, kiosk,
    `widget headline changes size on mount (kiosk ${kiosk}, editing ${editing})`);
});

test('the canvas declares itself a size container', () => {
  assert.match(DASH, /container-type:\s*inline-size/,
    '.news-editor must be a size container for the reflow rules to query');
  assert.match(DASH, /container-name:\s*news-canvas/,
    'the container needs a name so the @container rules cannot bind to some other ancestor');
});

/** Bodies of every `@<name> … { … }` block, found by matching braces.
 *  A regex cannot do this: these blocks nest one level (rules inside the
 *  at-rule), and a non-greedy pattern stops at the first inner `}`. */
function atRuleBodies(css, name) {
  const bodies = [];
  const marker = `@${name}`;
  let at = css.indexOf(marker);
  while (at !== -1) {
    const open = css.indexOf('{', at);
    if (open === -1) break;
    let depth = 0;
    let i = open;
    for (; i < css.length; i++) {
      if (css[i] === '{') depth += 1;
      else if (css[i] === '}') {
        depth -= 1;
        if (depth === 0) break;
      }
    }
    bodies.push(css.slice(open + 1, i));
    at = css.indexOf(marker, i);
  }
  return bodies;
}

test('the card reflows are container queries, not viewport media queries', () => {
  // The heart of it. Find every rule that reflows the side or widget grid to
  // a single column, and assert each sits inside an @container block.
  const reflows = [
    ['.secondary-grid', /\.news-editor\s+\.secondary-grid/],
    ['.widget-grid', /\.news-editor\s+\.widget-grid/],
  ];

  const containerBlocks = atRuleBodies(DASH, 'container');
  const mediaBlocks = atRuleBodies(DASH, 'media');

  // Sanity: the extractor should be finding real blocks, not an empty list.
  assert.ok(containerBlocks.length >= 2,
    `expected @container blocks, found ${containerBlocks.length}`);

  const single = /grid-template-columns:\s*(?:minmax\(\s*0\s*,\s*1fr\s*\)|1fr)\s*;/;

  for (const [label, selector] of reflows) {
    const blockFor = (blocks) => blocks.some((b) => {
      if (!selector.test(b)) return false;
      // Only look at the declarations of the matching rule, so an unrelated
      // single-column rule in the same block cannot vouch for this one.
      const from = b.search(selector);
      const rule = b.slice(from, b.indexOf('}', from));
      return single.test(rule);
    });

    assert.ok(blockFor(containerBlocks),
      `${label} should reflow to one column inside an @container block`);
    assert.equal(blockFor(mediaBlocks), false,
      `${label} still reflows inside an @media block — the canvas width is set by the nav `
        + 'rail and the properties aside, not the window, so a viewport query is measuring the '
        + 'wrong axis and will not fire when the canvas is actually narrow');
  }
});

test('the composer thumb still matches the kiosk crop', () => {
  // The counterweight: reflowing was chosen over shrinking the thumb precisely
  // so the composer keeps previewing the kiosk's real 108px square. If a later
  // change buys width back by shrinking it, that preview quietly stops being
  // true.
  const kioskThumb = /\.secondary-story__thumb[^{]*\{[^}]*width:\s*108px/.test(KIOSK);
  assert.ok(kioskThumb, 'the kiosk thumb should still be 108px');

  const overridden = /\.news-editor\s+\.secondary-story__thumb[^{]*\{[^}]*width:/.test(DASH);
  assert.equal(overridden, false,
    'the composer should not resize the thumb — it is a preview of the kiosk crop');
});
