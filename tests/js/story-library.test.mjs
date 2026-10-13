// Run with: node --test tests/js/
//
// Story Library drawer, Published tab: tabs switch panes, and Duplicate walks
// 409 needs_confirm -> ConfirmModal -> re-post with discard=1. The module is a
// browser IIFE, so it runs here against a hand-rolled DOM stand-in, like
// review-preview-modal.test.mjs.

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import vm from 'node:vm';

const here = dirname(fileURLToPath(import.meta.url));
const SOURCE = readFileSync(join(here, '../../resources/js/story-library.js'), 'utf8');

class El {
  constructor(attrs = {}) {
    this.attrs = { ...attrs };
    this.hidden = false;
    this.listeners = {};
    this.disabled = false;
    this.classList = { set: new Set(), toggle(c, on) { on ? this.set.add(c) : this.set.delete(c); }, contains(c) { return this.set.has(c); } };
  }
  getAttribute(n) { return n in this.attrs ? this.attrs[n] : null; }
  setAttribute(n, v) { this.attrs[n] = String(v); }
  addEventListener(t, fn) { (this.listeners[t] ||= []).push(fn); }
  closest(sel) { return sel === '[data-library-issue]' ? this.row : null; }
  click() { (this.listeners.click || []).forEach((fn) => fn({ target: this, preventDefault() {} })); }
}

function boot({ responses, confirm = true, pendingFirst = false }) {
  const tabIssue = new El({ 'data-library-tab': 'issue' });
  const tabPub = new El({ 'data-library-tab': 'published' });
  const paneIssue = new El({ 'data-library-pane': 'issue' });
  const panePub = new El({ 'data-library-pane': 'published' });
  const row = new El({ 'data-library-duplicate-url': '/gears/issues/3/duplicate' });
  const dup = new El({ 'data-library-duplicate': '' });
  dup.row = row;
  const dup2 = new El({ 'data-library-duplicate': '' });
  dup2.row = row;
  const drawer = new El();
  const calls = [];
  const pending = [];
  const asked = [];
  let assigned = null;
  const byAll = {
    '[data-library-tab]': [tabIssue, tabPub],
    '[data-library-pane]': [paneIssue, panePub],
  };
  drawer.querySelectorAll = (s) => byAll[s] || [];
  const document = {
    readyState: 'complete',
    querySelector: (s) => (s === '[data-news-library-drawer]' ? drawer
      : s === 'meta[name="csrf-token"]' ? { getAttribute: () => 'tok' } : null),
    addEventListener() {},
  };
  // Delegated click handler on the drawer: route through it.
  const window = {
    location: { assign: (u) => { assigned = u; } },
    ConfirmModal: { ask: (o) => { asked.push(o); return Promise.resolve(confirm); } },
  };
  const fetch = (url, opts) => {
    calls.push({ url, body: opts.body.toString() });
    if (pendingFirst) return new Promise((res) => pending.push(res));
    const r = responses.shift();
    return Promise.resolve({ status: r.status, json: () => Promise.resolve(r.body) });
  };
  vm.runInNewContext(SOURCE, { window, document, fetch, URLSearchParams, Promise, console });
  return {
    tabIssue, tabPub, paneIssue, panePub, dup, dup2, drawer, calls, asked,
    get assigned() { return assigned; },
    clickDup2: () => (drawer.listeners.click || []).forEach((fn) => fn({ target: dup2, preventDefault() {} })),
    fireClose: () => (drawer.listeners.close || []).forEach((fn) => fn({})),
    clickDup: () => (drawer.listeners.click || []).forEach((fn) => fn({ target: dup, preventDefault() {} })),
  };
}

const tick = () => new Promise((r) => setTimeout(r, 0));

test('tabs show one pane at a time', () => {
  const ui = boot({ responses: [] });
  ui.tabPub.click();
  assert.equal(ui.panePub.hidden, false);
  assert.equal(ui.paneIssue.hidden, true);
  assert.equal(ui.tabPub.getAttribute('aria-selected'), 'true');
  ui.tabIssue.click();
  assert.equal(ui.paneIssue.hidden, false);
  assert.equal(ui.panePub.hidden, true);
});

test('a clean duplicate reloads into the composer', async () => {
  const ui = boot({ responses: [{ status: 200, body: { ok: true, issue_id: 50 } }] });
  ui.clickDup();
  await tick(); await tick();
  assert.equal(ui.calls.length, 1);
  assert.doesNotMatch(ui.calls[0].body, /discard/);
  assert.equal(ui.assigned, '/gears/dashboard?page=news');
});

test('409 asks, then re-posts with discard=1', async () => {
  const ui = boot({ responses: [
    { status: 409, body: { ok: false, needs_confirm: true, draft_story_count: 3 } },
    { status: 200, body: { ok: true, issue_id: 51 } },
  ] });
  ui.clickDup();
  for (let i = 0; i < 6; i++) await tick();
  assert.equal(ui.asked.length, 1);
  assert.match(ui.asked[0].body, /3 stories/);
  assert.equal(ui.calls.length, 2);
  assert.match(ui.calls[1].body, /discard=1/);
  assert.equal(ui.assigned, '/gears/dashboard?page=news');
});

test('cancelling the confirm posts nothing more', async () => {
  const ui = boot({ confirm: false, responses: [
    { status: 409, body: { ok: false, needs_confirm: true, draft_story_count: 1 } },
  ] });
  ui.clickDup();
  for (let i = 0; i < 6; i++) await tick();
  assert.equal(ui.calls.length, 1);
  assert.equal(ui.assigned, null);
});

test('closing the drawer resets to the issue pane', () => {
  const ui = boot({ responses: [] });
  ui.tabPub.click();
  assert.equal(ui.paneIssue.hidden, true);
  ui.fireClose();
  assert.equal(ui.paneIssue.hidden, false);
  assert.equal(ui.panePub.hidden, true);
  assert.equal(ui.tabIssue.getAttribute('aria-selected'), 'true');
});

test('a second duplicate click while one is in flight posts nothing', async () => {
  const ui = boot({ responses: [], pendingFirst: true });
  ui.clickDup();
  ui.clickDup2();
  await tick();
  assert.equal(ui.calls.length, 1);
});
