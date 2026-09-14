// Run with: npm run test:js  (node --test tests/js/*.test.mjs)
//
// THE SILENTLY DISCARDED NEWSLETTER.
//
// The composer renders every block of the issue as a card you type into — a
// lead, four briefs, three photo-essay photographs, an editorial, two quotes, a
// notice. Filling them in is the entire workflow.
//
// Persistence, however, was still one-story-per-submit. `syncFormFromSurface()`
// opens with `if (!activeArt) return` and every read it does is
// `region(activeArt, …)`, so it collects exactly ONE card: whichever the editor
// happened to have selected. `submitWithStatus()` calls it once and does one
// `postForm()`. Autosave could not cover the gap either — it bails on
// `if (!activeId) return`, and `activeId` is empty for precisely the
// newly-typed blocks that have no row yet.
//
// Then the submit finishes by calling `setLayoutDirty(false)`, which opens the
// canvas-refresh gate, and `refreshCanvasFragment()` does
// `editor.innerHTML = json.html`. Every block the editor filled in and did not
// happen to have selected is replaced by a freshly-rendered empty one.
//
// No error, no warning, nothing in the console. The editor writes a whole
// newsletter, submits it, an admin approves it, and the kiosk shows the lead
// story on its own.
//
// There is no jsdom in this project and none should be added (see the note in
// org-board-drag.test.mjs), so this cannot click Submit and count rows. It pins
// the facts that decide the outcome: that the save path COLLECTS more than one
// card, that it skips empty ones rather than posting a 422 for every unfilled
// slot, and that it posts each card against its own block and id.

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const read = (rel) => readFileSync(join(here, '../../', rel), 'utf8');

// Comments stripped so the prose above the code cannot satisfy a check.
const CODE = read('resources/js/news-dashboard.js')
  .replace(/\/\*[\s\S]*?\*\//g, '')
  .split('\n')
  .map((line) => line.replace(/(^|[^:])\/\/.*$/, '$1'))
  .join('\n');

/** The body of the first function declared with `marker`, brace-matched. */
function blockAfter(marker) {
  const at = CODE.indexOf(marker);
  if (at === -1) return null;
  const open = CODE.indexOf('{', at + marker.length);
  if (open === -1) return null;
  let depth = 0;
  let inString = false;
  let quote = '';
  for (let i = open; i < CODE.length; i++) {
    const ch = CODE[i];
    if (inString) {
      if (ch === '\\') i += 1;
      else if (ch === quote) inString = false;
      continue;
    }
    if (ch === "'" || ch === '"') { inString = true; quote = ch; continue; }
    if (ch === '{') depth += 1;
    else if (ch === '}') {
      depth -= 1;
      if (depth === 0) return CODE.slice(open, i + 1);
    }
  }
  return null;
}

test('a collector for the filled-in blocks exists', () => {
  const fn = blockAfter('function collectPendingCards(');
  assert.ok(
    fn,
    'the save path needs something that gathers EVERY card an editor typed into. '
      + 'Without it a submit posts one story and the rest of the newsletter is '
      + 'thrown away by the canvas refresh that follows.',
  );
});

test('the collector walks the whole canvas, not the active card', () => {
  const fn = blockAfter('function collectPendingCards(');
  assert.ok(fn);

  assert.match(fn, /flatCanvasCards\(\)|querySelectorAll/,
    'it has to read the canvas itself; anything scoped to activeArt is the bug');
  assert.doesNotMatch(fn, /\bactiveArt\b/,
    'collecting from activeArt is what limited a save to one story');
});

test('empty blocks are skipped, not posted', () => {
  // Every unfilled slot renders a card too. Posting those would hand
  // NewsController.store() a blank title and description, which it rejects with
  // "Title and description are required." — one 422 per empty slot, on a form
  // the editor filled in correctly.
  const fn = blockAfter('function collectPendingCards(');
  assert.ok(fn);

  assert.match(fn, /title/i, 'emptiness has to be judged on the card\'s own content');
  assert.match(fn, /filter|if\s*\(/, 'the collector must drop empty cards');
});

test('each card is posted against its own block and its own row', () => {
  const fn = blockAfter('function flushPendingCards(');
  assert.ok(
    fn,
    'something has to post the collected cards; collecting them and still '
      + 'submitting one is no better than before',
  );

  // Posting every card with the ACTIVE card's layout_type would file the whole
  // newsletter into one slot, so the block type has to be re-derived per card.
  assert.match(fn, /f\.layout/,
    'each card must write its OWN block into layout_type');
  assert.match(fn, /cardBlockType|data-news-slot/,
    'the block type has to be read from the card, not carried over');
  // A card with a row updates it; a card without one creates it. Carrying a
  // stale article_id into the next post overwrites one story with another.
  assert.match(fn, /f\.articleId/,
    'each card must write its own article_id, so a new block creates a row '
      + 'rather than overwriting the one before it');
});

test('the cards are posted one after another, not all at once', () => {
  const fn = blockAfter('function flushPendingCards(');
  assert.ok(fn);

  // They share one hidden form. Firing the posts in parallel would have every
  // request read whatever the last card happened to write into those inputs,
  // so several stories would save with identical content.
  //
  // A fan-out is precisely `cards.forEach(... postForm ...)`, so that shape is
  // what this rules out; the advance must instead be explicit.
  assert.doesNotMatch(fn, /cards\s*\.\s*(forEach|map)\s*\(/,
    'iterating the cards and posting inside the loop fires them all at once; '
      + 'they share one form, so each request would read the last card\'s values');
  assert.match(fn, /index|\.then\(|await |reduce\(/,
    'the posts must be sequenced, with the next one starting only after the '
      + 'previous has come back');
});

test('Save Draft and Submit both flush every block', () => {
  const submit = blockAfter('function submitWithStatus(');
  assert.ok(submit, 'submitWithStatus() should still be declared');

  assert.match(submit, /flushPendingCards|collectPendingCards/,
    'Submit has to write the whole newsletter. This is the path an editor uses '
      + 'after filling every block, and the one that lost them.');
  assert.doesNotMatch(submit, /^\s*syncFormFromSurface\(\);\s*$/m,
    'a bare syncFormFromSurface() here is the single-card save this test exists '
      + 'to prevent');
});

// ── Round two: the flush posted the WRONG body, or none ─────────────────────
//
// The collector and the sequencing above were right and still lost every card.
// syncFormFromSurface() deliberately skipped the body when the editor was not
// mounted on it -- "f.description already has the same value from the
// keystroke sync". True with one active card. flushPendingCards() unmounts the
// editor FIRST, so during a flush no card has a mounted body, the branch is
// skipped for every card, and f.description is whatever it last held: the
// lead's text on one run (a brief saved with the lead story's body, word for
// word), empty on the next (every card refused with "Title and description are
// required."). Nothing said which.

test('an unmounted body is read from its region, never left alone', () => {
  const fn = blockAfter('function syncFormFromSurface(');
  assert.ok(fn);

  assert.doesNotMatch(fn, /left alone/,
    'the "left alone" body branch is the defect: during a flush no body is '
      + 'mounted, so every card posts whatever f.description last held');
  // The unmounted path must assign the body field from the region itself.
  assert.match(fn, /key === 'body'[\s\S]{0,200}innerHTML|innerHTML[\s\S]{0,200}key === 'body'/,
    'when the editor is not mounted on the body, f.description has to be '
      + 'read from the region -- which holds exactly what unmountBodyEditor() '
      + 'wrote back into it');
});

test('every field is cleared before a card is synced', () => {
  // syncFormFromSurface() writes a field only when the card HAS that region.
  // A quote has no headline; a notice has no byline. Without a reset those
  // fields keep the previous card's values and post them -- the same
  // contamination, other columns.
  const fn = blockAfter('function flushPendingCards(');
  assert.ok(fn);

  const reset = fn.indexOf('resetFormFields(');
  const sync = fn.indexOf('syncFormFromSurface(');
  assert.ok(reset !== -1, 'the flush must clear the shared form before each card');
  assert.ok(sync !== -1);
  assert.ok(reset < sync, 'the clear has to happen BEFORE the sync, or it undoes it');
});

test('a card with only a photograph is still collected', () => {
  // A photo-essay entry can be a photograph and nothing else. Judged on text
  // alone it is "empty", never posted, and the photograph is dropped.
  const fn = blockAfter('function collectPendingCards(');
  assert.ok(fn);

  assert.match(fn, /scratchDraftFor|img|image/,
    'a card holding a staged file or a rendered image has content');
});

test('switching cards never asks to discard, and never discards', () => {
  // In the multi-block composer an editor fills six cards and leaves each one.
  // mountEditor() writes the outgoing card back into its region and the flush
  // reads every card from its region, so nothing is lost on a switch -- the
  // old "Discard unsaved changes?" prompt guarded a loss that no longer
  // happens, and its Discard button was the only thing in the flow that
  // actually destroyed content.
  const fn = blockAfter('function confirmLeavingDirtyBody(');
  assert.ok(fn);

  assert.doesNotMatch(fn, /Discard unsaved changes/,
    'the switch prompt asks an editor to throw away the card they just filled');
  assert.doesNotMatch(fn, /bodySnapshot/,
    'restoring the snapshot IS the discard; a switch must keep what was typed');
  assert.match(fn, /Promise\.resolve\(true\)/,
    'a card switch simply proceeds');
});

// ── Round three: re-selecting a card reverted it ────────────────────────────
//
// The flush was right and the switch prompt was gone, and an edit STILL
// vanished: type into a body, click another card, click back, and the body
// showed its last-saved text. selectStory() overwrote every region of the
// card from the Story Library's data attributes -- the server's state -- on
// every selection. Right when "select" meant "load this story fresh"; data
// loss in a composer where an editor types into six cards and returns to any
// of them. mountEditor() then read the hidden form field rather than the
// region, so the editor could open on different text from what was on screen.
// The region is the truth: the flush reads it, unmount writes it, and the
// editor sees it. Nothing else may write it except the editor.

test('re-selecting a card does not overwrite its regions from the library', () => {
  const fn = blockAfter('function selectStory(');
  assert.ok(fn);

  assert.doesNotMatch(fn, /bodyRegion\.innerHTML\s*=\s*data\.description/,
    'writing the library body over the region reverts an unsaved edit on every click back');
  assert.doesNotMatch(fn, /setHtml\(activeArt,\s*'title',\s*data\.title/,
    'same for the headline');
  assert.doesNotMatch(fn, /setText\(activeArt,\s*'(excerpt|dek|source|caption|credit)',\s*data\./,
    'same for every plain region: the card on screen is the truth, not the library row');
  // The form must be seeded from what is on screen instead.
  assert.match(fn, /syncFormFromSurface\(\)/,
    'the hidden form takes its values from the card\'s own regions');
});

test('the editor mounts with what is on screen, not the hidden field', () => {
  const fn = blockAfter('function mountEditor(');
  assert.ok(fn);

  assert.doesNotMatch(fn, /var staged = \(input && input\.value\)/,
    'reading the hidden field on mount lets the editor open on text that differs '
      + 'from what the region shows, and unmount then writes that over the region');
  assert.match(fn, /staged[\s\S]{0,120}(target\.innerHTML|target\.textContent)/,
    'the staged content must come from the region the editor is standing on');
});

// ── Round four: the submit reloaded the canvas it had just saved ────────────
//
// N store() posts, then news.layout with base_stamp. Every store() moves the
// table's stamp (count:max(updated_at)); the browser's copy stayed at page
// load; layout() correctly saw a mismatch and returned 409 "someone else
// changed the front page"; handleLayoutConflict() reloaded the canvas. The
// system detected its own writes as someone else's, and the editor watched a
// successful submit "revert".

test('the flush adopts the stamp each save returns', () => {
  const fn = blockAfter('function flushPendingCards(');
  assert.ok(fn);

  assert.match(fn, /canvasStamp\s*=\s*json\.stamp/,
    'every store() moves the concurrency stamp; the flush has to carry the new '
      + 'one forward or the layout write that follows is refused as a conflict');
});
