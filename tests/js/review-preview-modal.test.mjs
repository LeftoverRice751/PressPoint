// Run with: node --test tests/js/
//
// The review queue's "Preview the issue" opens a centred <dialog> and fills it
// with the kiosk's own render of the issue. It used to expand an inline frame
// under the card, scaled to 62%, where the admin squinted at a shrunken kiosk
// page that the 20s live poll could wipe mid-read. Three contracts here:
//
//   1. Clicking Preview opens the dialog (showModal) and puts the fetched HTML
//      in [data-review-preview-target] -- the modal lives outside the
//      live-refreshed host, so the handler has to find it from `document`,
//      not from the card.
//   2. Closing empties the target: the kiosk partial carries images, and a
//      closed dialog should not keep them alive until the next open.
//   3. A failed fetch reports inside the dialog rather than leaving
//      "Loading preview…" up forever.
//
// The module is a browser IIFE with no module boundary, so it runs here
// against a hand-rolled DOM stand-in, like tour-preview.test.mjs.

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const SOURCE = readFileSync(join(here, '../../resources/js/review-queue.js'), 'utf8');

class FakeElement {
  constructor(tag, selectors = []) {
    this.tagName = tag;
    this.selectors = new Set(selectors);
    this.attributes = {};
    this.children = [];
    this.listeners = {};
    this.parent = null;
    this.textContent = '';
    this.innerHTML = '';
    this.hidden = false;
    this.disabled = false;
    this.style = {};
    this.scrollHeight = 0;
    this.clientWidth = 0;
  }
  setAttribute(name, value) { this.attributes[name] = value; }
  getAttribute(name) { return name in this.attributes ? this.attributes[name] : null; }
  removeAttribute(name) { delete this.attributes[name]; }
  appendChild(child) { child.parent = this; this.children.push(child); return child; }
  addEventListener(type, fn) { (this.listeners[type] ||= []).push(fn); }
  dispatch(type, event) { (this.listeners[type] || []).forEach((fn) => fn(event)); }
  contains() { return true; }
  focus() {}
  getBoundingClientRect() { return { top: 0, left: 0, right: 0, bottom: 0, width: 0, height: 0 }; }
  closest(selector) {
    let node = this;
    while (node) {
      if (node.selectors.has(selector)) return node;
      node = node.parent;
    }
    return null;
  }
  querySelector(selector) {
    for (const child of this.children) {
      if (child.selectors.has(selector)) return child;
      const found = child.querySelector(selector);
      if (found) return found;
    }
    return null;
  }
  querySelectorAll(selector) {
    const out = [];
    for (const child of this.children) {
      if (child.selectors.has(selector) || (selector === 'button' && child.tagName === 'button')) {
        out.push(child);
      }
      out.push(...child.querySelectorAll(selector));
    }
    return out;
  }
}

class FakeDialog extends FakeElement {
  constructor(selectors) {
    super('dialog', selectors);
    this.open = false;
  }
  showModal() { this.open = true; }
  close() { this.open = false; this.dispatch('close', {}); }
}

/**
 * Boots review-queue.js against a stub DOM holding one pending issue.
 *
 * `fetches` records every URL asked for; `respond` decides what comes back
 * (a JSON body, or a rejection when `fail` is set).
 */
function boot({ fail = false, html = '<section class="issue">Issue 01</section>' } = {}) {
  const root = new FakeElement('div', ['[data-dashboard-shell]']);
  const host = new FakeElement('div', ['[data-review-queue-host]']);
  root.appendChild(host);

  const card = new FakeElement('article', ['[data-review-issue]']);
  card.setAttribute('data-review-issue-id', '7');
  host.appendChild(card);
  const previewButton = new FakeElement('button', ['[data-review-preview]']);
  card.appendChild(previewButton);

  const modal = new FakeDialog(['[data-review-preview-modal]']);
  const target = new FakeElement('div', ['[data-review-preview-target]']);
  const closeButton = new FakeElement('button', ['[data-review-preview-close]']);
  modal.appendChild(target);
  modal.appendChild(closeButton);
  root.appendChild(modal);

  const fetches = [];
  const fakeWindow = {
    addEventListener() {},
    requestAnimationFrame: (fn) => fn(),
  };
  const fakeDocument = {
    querySelector: (selector) => {
      if (selector === '[data-dashboard-shell]') return root;
      if (selector === '[data-review-preview-modal]') return modal;
      return null;
    },
  };
  const fakeFetch = (url) => {
    fetches.push(url);
    if (fail) return Promise.reject(new Error('offline'));
    return Promise.resolve({ json: () => Promise.resolve({ ok: true, html }) });
  };

  new Function('window', 'document', 'fetch', SOURCE)(fakeWindow, fakeDocument, fakeFetch);

  return { host, card, previewButton, modal, target, closeButton, fetches };
}

const settle = () => new Promise((resolve) => setTimeout(resolve, 0));

test('preview opens the centred dialog and fills it with the kiosk render', async () => {
  const { host, previewButton, modal, target, fetches } = boot();

  host.dispatch('click', { target: previewButton, preventDefault() {} });
  assert.equal(modal.open, true, 'the dialog opens on click, before the fetch lands');
  assert.deepEqual(fetches, ['/gears/review/issue/7/preview']);

  await settle();
  assert.match(target.innerHTML, /Issue 01/);
});

test('closing the dialog empties the render so its images are released', async () => {
  const { host, previewButton, modal, target, closeButton } = boot();

  host.dispatch('click', { target: previewButton, preventDefault() {} });
  await settle();
  assert.match(target.innerHTML, /Issue 01/);

  modal.dispatch('click', { target: closeButton, preventDefault() {} });
  assert.equal(modal.open, false);
  assert.equal(target.innerHTML, '');
});

test('a failed fetch says so inside the dialog instead of loading forever', async () => {
  const { host, previewButton, modal, target } = boot({ fail: true });

  host.dispatch('click', { target: previewButton, preventDefault() {} });
  await settle();
  assert.equal(modal.open, true);
  assert.match(target.innerHTML, /Could not load the preview/);
});
