/*
 * Guards against two scripts binding a `submit` listener to the same form.
 *
 * The bug this exists for: upload-meter.js has owned `form[data-upload-form]`
 * since it was written, and a later "Implemented AJAX" pass added the very same
 * selector to gears-dashboard.js's AJAX_SELECTORS. Each file guards its own
 * binding (`form.__uploadWired` vs `form.dataset.ajaxBound`) but neither guard
 * is visible to the other, so both listeners attached, both called
 * preventDefault(), and both POSTed. One click on "Upload archive" or "Add
 * member" created two rows. It read like a double click; it was one click with
 * two submit handlers.
 *
 * There is no DOM in this test runner, so this asserts the ownership contract
 * on the source instead: exactly one script may claim a given form selector.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';

const JS = new URL('../../resources/js/', import.meta.url);
const TEMPLATES = new URL('../../templates/gears/partials/', import.meta.url);

const read = (dir, name) => readFileSync(new URL(name, dir), 'utf8');

/**
 * Every `form[data-*]` selector a file names.
 *
 * Matched on the string literal rather than at the querySelectorAll call site:
 * gears-dashboard.js assembles its list as an array it later `.join(', ')`s, so
 * a call-site regex sees nothing and this guard would pass while wide open.
 * Comment text is stripped first so a selector merely discussed in a comment
 * does not read as a binding.
 */
function claimedFormSelectors(source) {
  const code = source
    .replace(/\/\*[\s\S]*?\*\//g, ' ')
    .replace(/^\s*\/\/.*$/gm, ' ');

  const found = new Set();
  for (const [, attr] of code.matchAll(/['"`]form\[(data-[a-z-]+)\]['"`,\s]/g)) {
    found.add(attr);
  }
  return found;
}

test('no two dashboard scripts claim the same form selector', () => {
  // Only a script that intercepts the submit AND sends the request itself can
  // double-post. A listener that merely serializes hidden inputs and lets the
  // event through is cooperative -- about-lspu-editor.js is exactly that, and
  // it shares data-section-form with gears-dashboard.js on purpose.
  const binders = readdirSync(JS)
    .filter((name) => name.endsWith('.js'))
    .map((name) => [name, read(JS, name)])
    .filter(([, source]) =>
      /addEventListener\(\s*'submit'/.test(source) &&
      /preventDefault/.test(source) &&
      /fetch\(|XMLHttpRequest/.test(source));

  const owner = new Map();
  const clashes = [];

  for (const [name, source] of binders) {
    for (const selector of claimedFormSelectors(source)) {
      if (owner.has(selector)) {
        clashes.push(`form[${selector}] is bound by both ${owner.get(selector)} and ${name}`);
      } else {
        owner.set(selector, name);
      }
    }
  }

  assert.deepEqual(clashes, [], clashes.join('\n'));
});

test('upload-meter.js is the sole owner of form[data-upload-form]', () => {
  assert.ok(
    claimedFormSelectors(read(JS, 'upload-meter.js')).has('data-upload-form'),
    'upload-meter.js should still own the upload form selector'
  );

  for (const name of readdirSync(JS).filter((f) => f.endsWith('.js') && f !== 'upload-meter.js')) {
    assert.ok(
      !claimedFormSelectors(read(JS, name)).has('data-upload-form'),
      `${name} must not bind form[data-upload-form]; upload-meter.js owns that submit`
    );
  }
});

test('the archive and org board forms still opt into the upload meter', () => {
  // If these lose the attribute the submit stops being AJAX entirely, which is
  // the opposite failure and just as invisible from the JS side.
  for (const file of ['panel-archives.html', 'panel-org-board.html']) {
    assert.match(read(TEMPLATES, file), /data-upload-form/, `${file} lost data-upload-form`);
  }
});

test('upload-meter.js refuses a second submit while one is in flight', () => {
  // The single-owner rule above stops two *scripts* posting one click. It does
  // nothing about one script posting two clicks: gears-dashboard.js used to
  // disable the submit button for these forms, and dropping it from
  // AJAX_SELECTORS took that with it. An impatient double click on a slow NAS
  // upload would otherwise write two rows for real.
  const source = read(JS, 'upload-meter.js');

  assert.match(
    source,
    /__uploadInFlight/,
    'submitForm should mark the form in flight and bail out on re-entry'
  );
  assert.match(
    source,
    /loadend/,
    'the in-flight mark must be cleared on loadend, not only on success'
  );
});
