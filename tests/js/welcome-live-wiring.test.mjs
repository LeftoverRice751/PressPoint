// Run with: node --test tests/js/
//
// welcome-screen.js is the only file that knows about iframes, the service
// worker and the attract state machine; kiosk-live.js is the decision logic
// and is tested on its own. This file guards the seam between them: the
// effects welcome-screen.js hands the factory, and the moments it calls
// back into it. The other welcome-* harnesses load no kiosk-live.js, so
// every branch here is one they skip.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const SOURCE = readFileSync(join(here, '../../resources/js/welcome-screen.js'), 'utf8');

const IDLE_MS = 30 * 1000;

// Same leading-import strip as welcome-idle-wake.test.mjs: the file opens with
// Swiper imports the script grammar cannot parse.
function stripLeadingImports(source) {
  const lines = source.split('\n');
  let inBlockComment = false;
  let inImport = false;
  let cut = 0;
  for (; cut < lines.length; cut++) {
    const trimmed = lines[cut].trim();
    if (inBlockComment) { if (trimmed.endsWith('*/')) inBlockComment = false; continue; }
    if (inImport) { if (trimmed.endsWith(';')) inImport = false; continue; }
    if (trimmed.startsWith('/*')) { inBlockComment = !trimmed.endsWith('*/'); continue; }
    if (trimmed.startsWith('import ')) { inImport = !trimmed.endsWith(';'); continue; }
    if (trimmed === '') continue;
    break;
  }
  return lines.slice(cut).join('\n');
}
const STRIPPED_SOURCE = stripLeadingImports(SOURCE);

function SwiperStub() { return { slides: [], activeIndex: 0, on() {} }; }

async function boot({ video = true, currentSection = 'latest-news' } = {}) {
  const timers = new Map();
  let nextId = 1;
  let clock = 0;
  const listeners = { document: {} };

  const attractEl = { hidden: true };
  const attractHost = { child: null, replaceChildren(el) { this.child = el; } };
  const document = {
    addEventListener: (type, fn) => { (listeners.document[type] ||= []).push(fn); },
    removeEventListener() {},
    getElementById: (id) => {
      if (id === 'kiosk-attract') return attractEl;
      if (id === 'kiosk-attract-frame') return attractHost;
      return null;
    },
    querySelector: () => null,
    querySelectorAll: () => [],
    createElement: () => ({ attrs: {}, setAttribute(k, v) { this.attrs[k] = v; } }),
    body: { classList: { add() {}, remove() {}, contains: () => false } },
  };

  const posted = [];
  // One ordered log across the three things attract does, so a test can
  // assert which goes first.
  const order = [];
  const navigator = { serviceWorker: { controller: { postMessage: (m) => { posted.push(m); order.push(m.type); } } } };

  const contentCalls = { reload: [], show: [] };
  const created = { deps: null, onAttract: [], onEvent: [] };

  const window = {
    addEventListener() {},
    removeEventListener() {},
    setTimeout(fn, ms) { const id = nextId++; timers.set(id, { fn, at: clock + ms }); return id; },
    clearTimeout(id) { timers.delete(id); },
    setInterval: () => nextId++,
    clearInterval() {},
    location: { protocol: 'https:' },
    __kioskPlaySrc: () => { order.push('PLAY_VIDEO'); },
    __kioskCloseVideo: () => {},
    __kioskContent: {
      defaultId: () => 'latest-news',
      current: () => currentSection,
      show: (id) => { contentCalls.show.push(id); },
      reload: (id) => { contentCalls.reload.push(id); return true; },
    },
    __kioskLiveCreate: (deps) => {
      created.deps = deps;
      return {
        onEvent: (p) => created.onEvent.push(p),
        onAttract: (o) => { created.onAttract.push(o); order.push('FLUSH'); },
        dirty: () => [],
      };
    },
  };

  const fetch = async () => ({
    ok: true,
    json: async () => (video ? { src: '/storage/Videos/attract.mp4', title: 'Reel' } : {}),
  });

  new Function('document', 'window', 'fetch', 'navigator', 'Swiper', 'Navigation', 'Keyboard', 'A11y', STRIPPED_SOURCE)(
    document, window, fetch, navigator, SwiperStub, {}, {}, {},
  );
  listeners.document.DOMContentLoaded.forEach((fn) => fn());
  await new Promise((r) => setImmediate(r));

  function advance(ms) {
    clock += ms;
    for (;;) {
      const due = [...timers.entries()].filter(([, t]) => t.at <= clock).sort((a, b) => a[1].at - b[1].at);
      if (!due.length) return;
      const [id, t] = due[0];
      timers.delete(id);
      t.fn();
    }
  }

  return { created, posted, contentCalls, attractEl, attractHost, advance, order };
}

test('the shell builds the live gate with its five effects', async () => {
  const { created } = await boot();
  const deps = created.deps;
  assert.ok(deps, 'window.__kioskLiveCreate was called');
  for (const key of ['evict', 'reloadContent', 'reloadAttract', 'isAttract', 'attractMode']) {
    assert.equal(typeof deps[key], 'function', key);
  }
  assert.equal(deps.isAttract(), false);
  assert.equal(deps.attractMode(), null);
});

test('evict posts EVICT for the section to the controlling service worker', async () => {
  const { created, posted } = await boot();
  created.deps.evict('about-lspu');
  assert.deepEqual(posted, [{ type: 'EVICT', section: 'about-lspu' }]);
});

test('reloadContent delegates to __kioskContent.reload', async () => {
  const { created, contentCalls } = await boot();
  assert.equal(created.deps.reloadContent('latest-news'), true);
  assert.deepEqual(contentCalls.reload, ['latest-news']);
});

test('idle video attract reports mode video and flushes with no content navigation', async () => {
  const { created, advance } = await boot({ video: true, currentSection: 'latest-news' });
  advance(IDLE_MS);
  assert.equal(created.deps.isAttract(), true);
  assert.equal(created.deps.attractMode(), 'video');
  assert.deepEqual(created.onAttract, [{ contentJustNavigated: false }]);
});

test('attracting away from another section reports contentJustNavigated', async () => {
  const { created, contentCalls, advance } = await boot({ video: true, currentSection: 'campus-map' });
  advance(IDLE_MS);
  assert.deepEqual(contentCalls.show, ['latest-news'], 'the frame was reset to the default');
  assert.deepEqual(created.onAttract, [{ contentJustNavigated: true }]);
});

test('newsletter attract reports mode newsletter and reloadAttract re-srcs its iframe', async () => {
  const { created, attractHost, advance } = await boot({ video: false });
  advance(IDLE_MS);
  assert.equal(created.deps.attractMode(), 'newsletter');
  const iframe = attractHost.child;
  assert.ok(iframe, 'the newsletter iframe was injected');
  iframe.attrs.src = 'stale';
  created.deps.reloadAttract();
  assert.equal(iframe.attrs.src, '/kiosk/embed/latest-news');
});

test('attract flushes the live update BEFORE starting the video and the route warm-up', async () => {
  // A post-eviction reload is a real network fetch. Issued after the idle
  // video's Range stream and six PRECACHE_ROUTES fetches, it queues behind
  // all of them -- on the single-threaded dev server it starved for over a
  // minute, and on production it is simply the last thing served. The one
  // fetch a visitor will actually see goes first.
  const { order, advance } = await boot({ video: true });
  advance(IDLE_MS);
  const flush = order.indexOf('FLUSH');
  const play = order.indexOf('PLAY_VIDEO');
  const warm = order.indexOf('PRECACHE_ROUTES');
  assert.ok(flush !== -1, 'the flush ran');
  assert.ok(play !== -1 && flush < play, `flush (${flush}) must precede the video (${play})`);
  assert.ok(warm === -1 || flush < warm, `flush (${flush}) must precede the route warm-up (${warm})`);
});
