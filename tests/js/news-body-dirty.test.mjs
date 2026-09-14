// Run with: npm run test:js  (node --test tests/js/*.test.mjs)
//
// Guards the "Discard unsaved changes?" false positive.
//
// Editors could not edit a story: opening one in the composer marked the body
// dirty with no keystrokes, so the very next click — onto another card, or
// another region of the same story — put up "Discard unsaved changes?".
//
// The cause was that Quill 2 watches its root with a MutationObserver and
// delivers what it sees a MICROTASK LATER, reporting the source as 'user'
// because Quill did not initiate the change. mountEditor() therefore ran:
//
//     quill.root.innerHTML = staged;   // queues a mutation
//     bodyDirty = false;               // runs now
//     ...                              // spurious 'user' text-change lands here
//
// and the handler set bodyDirty back to true. Measured in a real browser
// against the repo's own Quill 2.0.2: one spurious text-change, source 'user',
// dirty === true one frame after a load with no input. With quill.update()
// draining the mutations synchronously first: zero events, dirty === false,
// and a genuine edit still detected.
//
// The same bug fired after a discard and after a successful body save, since
// both reload the editor the same way. So the invariant these tests hold is:
// no raw assignment to quill.root.innerHTML anywhere — every programmatic load
// goes through setEditorHtml(), which drains before returning.
//
// Note a `source === 'user'` guard in the text-change handler would NOT have
// fixed this: 'user' is exactly what Quill reports for a DOM change it did not
// make. That is why this is tested structurally rather than by trusting source.

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const SOURCE = readFileSync(join(here, '../../resources/js/news-dashboard.js'), 'utf8');

// Strip comments so the prose above (and in the source) cannot satisfy or
// trip the checks below.
const CODE = SOURCE
  .replace(/\/\*[\s\S]*?\*\//g, '')
  .split('\n')
  .map((line) => line.replace(/(^|[^:])\/\/.*$/, '$1'))
  .join('\n');

test('the editor exposes a single guarded way to load HTML', () => {
  assert.match(CODE, /function setEditorHtml\s*\(/,
    'setEditorHtml() is the one place allowed to write quill.root.innerHTML');
});

test('setEditorHtml drains Quill pending mutations before returning', () => {
  const body = CODE.slice(CODE.indexOf('function setEditorHtml'));
  const fn = body.slice(0, body.indexOf('\n  }') + 4);

  assert.match(fn, /quill\.root\.innerHTML\s*=/, 'it should still assign the HTML directly');
  assert.match(fn, /quill\.update\(/,
    'without a synchronous update() the mutation lands after bodyDirty = false '
    + 'and marks a freshly-loaded story dirty');

  // Order matters: draining before the assignment would drain nothing.
  assert.ok(
    fn.indexOf('quill.root.innerHTML') < fn.indexOf('quill.update('),
    'update() must come after the assignment it is draining',
  );
});

test('no raw quill.root.innerHTML assignment survives outside the helper', () => {
  const assignments = [...CODE.matchAll(/quill\.root\.innerHTML\s*=/g)];
  assert.equal(assignments.length, 1,
    `expected exactly one assignment (inside setEditorHtml), found ${assignments.length}. `
    + 'A raw assignment reintroduces the false "Discard unsaved changes?" prompt.');

  const helperAt = CODE.indexOf('function setEditorHtml');
  const helperEnd = CODE.indexOf('\n  }', helperAt);
  const at = assignments[0].index;
  assert.ok(at > helperAt && at < helperEnd,
    'the surviving assignment must be the one inside setEditorHtml()');
});

test('every programmatic load site goes through the helper', () => {
  // mountEditor (opening a story) and the post-save refresh. Each is followed
  // by `bodyDirty = false`, so each reintroduced the prompt independently.
  //
  // There used to be a third: the discard path, which restored bodySnapshot
  // when an editor confirmed "Discard unsaved changes?". That path is gone --
  // switching cards no longer discards anything (see news-multi-block-save),
  // so there is nothing there to load.
  const calls = [...CODE.matchAll(/setEditorHtml\(/g)];
  // One declaration + two call sites.
  assert.ok(calls.length >= 3,
    `expected the helper to be called from both load sites, saw ${calls.length - 1}`);
});

test('the dirty flag is still cleared after loading, and set by real edits', () => {
  // The fix must not have removed the flag handling it exists to make correct.
  assert.match(CODE, /bodyDirty\s*=\s*false/, 'loads must still clear the flag');
  assert.match(CODE, /bodyDirty\s*=\s*true/, 'real edits must still set it');
  // The guard no longer prompts at all -- a clean body and a dirty one both
  // simply proceed, because a card switch keeps what was typed. What this
  // test protects is that the flag itself is still maintained above.
  const guard = CODE.slice(CODE.indexOf('function confirmLeavingDirtyBody('));
  assert.match(guard.slice(0, 1400), /return Promise\.resolve\(true\)/,
    'confirmLeavingDirtyBody must let a card switch proceed');
});

// ── Moving between fields of the SAME story must not prompt ──────────────────
//
// A second, distinct source of the same dialog, found after the first was
// fixed. Type a headline, click into the body (or the reverse): "Discard
// unsaved changes? The headline has unsaved edits that will be lost." Nothing
// would actually be lost — the text-change handler writes every keystroke into
// that target's hidden form field, and unmountBodyEditor() writes the editor's
// HTML back into the region it stood in for — so the prompt guarded against a
// loss that could not happen, and an editor could not move between a story's
// own fields without answering it every time.
//
// The prompt is still right when leaving for a DIFFERENT story: selectStory()
// re-seeds every field from the new story, and THAT drops the staged edits.
// So the same-story branch skips the prompt and carries the dirty flag across
// the re-mount instead of clearing it, and the story-switch branches keep
// asking.

/** The body of the `if (regionEl !== mountedBodyRegion) { … }` branch in the
 *  card click handler — the only place a same-story field switch happens. */
function sameStoryBranch() {
  const at = CODE.indexOf('regionEl !== mountedBodyRegion');
  assert.notEqual(at, -1, 'the same-story field-switch branch should still exist');
  const open = CODE.indexOf('{', at);
  let depth = 0;
  for (let i = open; i < CODE.length; i++) {
    if (CODE[i] === '{') depth += 1;
    else if (CODE[i] === '}' && --depth === 0) return CODE.slice(open + 1, i);
  }
  assert.fail('unbalanced braces after the same-story branch');
}

test('switching fields within the active story does not ask to discard', () => {
  const branch = sameStoryBranch();
  assert.equal(/confirmLeavingDirtyBody\s*\(/.test(branch), false,
    'the same-story branch must not call confirmLeavingDirtyBody() — every keystroke is '
      + 'already staged in the hidden field, so nothing is lost by moving the editor');
  assert.match(branch, /mountEditor\s*\(\s*activeArt\s*,\s*regionKey\s*,\s*true\s*\)/,
    'it should re-mount with the carry flag so the dirty state survives the switch');
});

test('a same-story re-mount carries the dirty flag instead of clearing it', () => {
  // mountEditor(art, key, carryDirty): the third argument decides whether
  // bodyDirty is preserved. Without it, "headline typed, then body clicked,
  // then another story clicked" would lose the headline silently, because the
  // body mount had reset the flag the story-switch guard relies on.
  assert.match(CODE, /function mountEditor\s*\(\s*art\s*,\s*targetKey\s*,\s*carryDirty\s*\)/,
    'mountEditor should take a carryDirty parameter');
  assert.match(CODE, /bodyDirty\s*=\s*carryDirty\s*\?\s*bodyDirty\s*:\s*false/,
    'the flag should be preserved when carrying and cleared otherwise');
});

test('the two story-switch branches still ask before discarding', () => {
  // The counterweight: those are the only paths that re-seed the fields.
  const guardCalls = CODE.match(/confirmLeavingDirtyBody\s*\(\)\s*\.then/g) || [];
  assert.ok(guardCalls.length >= 2,
    `expected the story-switch branches to keep the guard, found ${guardCalls.length} call(s)`);
});

test('mounting inside a collapsed body disclosure opens it', () => {
  // The side and widget cards wrap their body region in a closed <details>.
  // Mounting there without opening it puts the editor somewhere the editor
  // cannot see — which is where a brand-new side story lands by default.
  const at = CODE.indexOf('function mountEditor');
  const fn = CODE.slice(at, CODE.indexOf('function ', at + 10));
  assert.match(fn, /closest\(\s*'details'\s*\)/,
    'mountEditor should look for a <details> ancestor of the target region');
  assert.match(fn, /\.open\s*=\s*true/,
    'and open it, so the mounted editor is visible');
});
