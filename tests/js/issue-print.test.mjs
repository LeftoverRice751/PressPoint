// Run with: npm run test:js  (node --test tests/js/*.test.mjs)
//
// resources/js/issue-print.js is a bare IIFE, so it is run against a
// hand-rolled DOM stub. Covers the two ways the print dialog used to stall or
// print blank photos: lazy images that never start loading, and an image that
// never settles.

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const SOURCE = fs.readFileSync(new URL('../../resources/js/issue-print.js', import.meta.url), 'utf8');

function fakeImage(complete) {
  const listeners = {};
  return {
    complete,
    loading: 'lazy',
    addEventListener(type, fn) { listeners[type] = fn; },
    fire(type) { this.complete = true; if (listeners[type]) listeners[type](); },
  };
}

function run(images) {
  const timers = [];
  let prints = 0;
  const sandbox = {
    document: {
      body: { getAttribute: (name) => (name === 'data-autoprint' ? '1' : null) },
      images,
      fonts: { ready: Promise.resolve() },
    },
    window: { print() { prints += 1; } },
    setTimeout(fn, ms) { timers.push({ fn, ms }); return timers.length; },
    Promise,
    Array,
  };
  vm.runInNewContext(SOURCE, sandbox);
  return { timers, prints: () => prints };
}

const tick = () => new Promise((resolve) => setImmediate(resolve));

test('every image is forced to eager so off-screen ones start loading', () => {
  const imgs = [fakeImage(false), fakeImage(true)];
  run(imgs);
  assert.deepEqual(imgs.map((i) => i.loading), ['eager', 'eager']);
});

test('print fires once, after every image has settled', async () => {
  const a = fakeImage(false);
  const b = fakeImage(false);
  const page = run([a, b]);
  await tick();
  assert.equal(page.prints(), 0);
  a.fire('load');
  b.fire('error');
  await tick();
  assert.equal(page.prints(), 1);
  page.timers.forEach((t) => t.fn());
  assert.equal(page.prints(), 1, 'the timeout must not print a second time');
});

test('print still fires at the timeout when an image never settles', async () => {
  const stuck = fakeImage(false);
  const page = run([stuck]);
  await tick();
  assert.equal(page.prints(), 0);
  assert.equal(page.timers.length, 1);
  assert.equal(page.timers[0].ms, 10000);
  page.timers[0].fn();
  assert.equal(page.prints(), 1);
});
