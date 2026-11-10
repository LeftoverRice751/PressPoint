// Run with: node --test tests/js/
//
// The review queue's "Preview the post" opens a centred <dialog> and fills it
// with the kiosk's own render of the post. It used to expand an inline frame
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
// admin-console.html's js block calls super(), which pulls in modal-behavior.js
// from the shell ahead of this file, so the fake window needs it too.
const MODAL_BEHAVIOR = readFileSync(join(here, '../../resources/js/modal-behavior.js'), 'utf8');

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
 * Boots review-queue.js against a stub DOM holding one pending post.
 *
 * `fetches` records every URL asked for; `respond` decides what comes back
 * (a JSON body, or a rejection when `fail` is set).
 */
function boot({ fail = false, expires = '2026-12-01T12:30', html = '<article class="post-card">Post 01</article>' } = {}) {
  const root = new FakeElement('div', ['[data-dashboard-shell]']);
  const host = new FakeElement('div', ['[data-review-queue-host]']);
  root.appendChild(host);

  const card = new FakeElement('article', ['[data-review-post]']);
  card.setAttribute('data-review-post-id', '7');
  host.appendChild(card);
  const previewButton = new FakeElement('button', ['[data-review-preview]']);
  card.appendChild(previewButton);

  const approveButton = new FakeElement('button', ['[data-review-approve]']);
  card.appendChild(approveButton);

  const modal = new FakeDialog(['[data-review-preview-modal]']);
  const expiry = new FakeElement('input', ['[data-review-expiry]']);
  modal.appendChild(expiry);
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
  const bodies = [];
  const fakeFetch = (url, init) => {
    fetches.push(url);
    if (init && init.body) bodies.push(JSON.parse(init.body));
    if (fail) return Promise.reject(new Error('offline'));
    return Promise.resolve({
      json: () => Promise.resolve({
        ok: true, html, review_stamp: 'stamp-1', expires_input: expires, messages: ['Done'],
      }),
    });
  };

  new Function('window', MODAL_BEHAVIOR)(fakeWindow);
  new Function('window', 'document', 'fetch', SOURCE)(fakeWindow, fakeDocument, fakeFetch);

  return { host, card, previewButton, approveButton, expiry, bodies, modal, target, closeButton, fetches };
}

const settle = () => new Promise((resolve) => setTimeout(resolve, 0));

test('preview opens the centred dialog and fills it with the kiosk render', async () => {
  const { host, previewButton, modal, target, fetches } = boot();

  host.dispatch('click', { target: previewButton, preventDefault() {} });
  assert.equal(modal.open, true, 'the dialog opens on click, before the fetch lands');
  assert.deepEqual(fetches, ['/gears/review/7/preview']);

  await settle();
  assert.match(target.innerHTML, /Post 01/);
});

test('closing the dialog empties the render so its images are released', async () => {
  const { host, previewButton, modal, target, closeButton } = boot();

  host.dispatch('click', { target: previewButton, preventDefault() {} });
  await settle();
  assert.match(target.innerHTML, /Post 01/);

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

test('the preview prefills the expiry and approve sends it with the stamp', async () => {
  const { host, previewButton, approveButton, expiry, fetches, bodies } = boot();

  host.dispatch('click', { target: previewButton, preventDefault() {} });
  await settle();
  assert.equal(expiry.value, '2026-12-01T12:30');

  // The admin moves the expiry before approving.
  expiry.value = '2026-12-05T09:00';
  expiry.dispatch('change', {});

  host.dispatch('click', { target: approveButton, preventDefault() {} });
  await settle();
  assert.equal(fetches[1], '/gears/review/7/approve');
  assert.deepEqual(bodies[0], {
    reason: '',
    review_stamp: 'stamp-1',
    expires_at: '2026-12-05T09:00',
  });
});

test('an untouched prefilled expiry is not resent on approve', async () => {
  const { host, previewButton, approveButton, bodies } = boot();

  host.dispatch('click', { target: previewButton, preventDefault() {} });
  await settle();
  host.dispatch('click', { target: approveButton, preventDefault() {} });
  await settle();
  assert.equal(bodies[0].expires_at, '');
});

test('a lapsed expiry prefills empty and stays unsent', async () => {
  const { host, previewButton, approveButton, expiry, bodies } = boot({ expires: '' });

  host.dispatch('click', { target: previewButton, preventDefault() {} });
  await settle();
  assert.equal(expiry.value, '');
  host.dispatch('click', { target: approveButton, preventDefault() {} });
  await settle();
  assert.equal(bodies[0].expires_at, '');
});
