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

test('the three programmatic load sites all go through the helper', () => {
  // mountEditor (opening a story), the discard path, and the post-save
  // refresh. Each is followed by `bodyDirty = false`, so each reintroduced the
  // prompt independently.
  const calls = [...CODE.matchAll(/setEditorHtml\(/g)];
  // One declaration + three call sites.
  assert.ok(calls.length >= 4,
    `expected the helper to be called from all three load sites, saw ${calls.length - 1}`);
});

test('the dirty flag is still cleared after loading, and set by real edits', () => {
  // The fix must not have removed the flag handling it exists to make correct.
  assert.match(CODE, /bodyDirty\s*=\s*false/, 'loads must still clear the flag');
  assert.match(CODE, /bodyDirty\s*=\s*true/, 'real edits must still set it');
  assert.match(CODE, /if\s*\(\s*!bodyDirty\s*\)\s*return Promise\.resolve\(true\)/,
    'confirmLeavingDirtyBody must still short-circuit when the body is clean');
});
