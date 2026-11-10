/*
 * The post editor's element layout: drag and resize the logo (over the photo)
 * and the event title / headline / summary (inside the panel) of the square card.
 *
 * Editor-only: imported by post-editor.js, never by the kiosk or the review
 * preview, which render the stored boxes with post-card.css alone.
 *
 * A card starts in flow mode (layout null, the stacked layout the kiosk has
 * always shown). The first drag, resize or nudge snapshots every piece's current
 * box from the DOM and switches the card to `post-card--positioned`; from then on
 * this module owns the inline styles, built by post-layout.mjs's toStyles() so
 * they match Posts.layout_styles byte for byte.
 *
 * Grips and resize handles live in an overlay of sibling frames, never inside
 * the contenteditable regions: a child there would be typed around, saved as
 * text, and broken by the next textContent write.
 */

import {
  PIECES, LOGO_BASE_H, RANGES, round2, toStyles, clampBox, overlaps, problems, nudge,
} from './post-layout.mjs';

export const LAYOUT_PROBLEM = 'A piece doesn\'t fit — move or shrink it.';

// Stricter than the server (which allows 0..100): a piece flush with the
// panel's rounded edge reads as clipped.
const INSET = 2;
const ALL = ['logo', ...PIECES];
const LABELS = { logo: 'logo', kicker: 'event title', headline: 'headline', body: 'summary' };
const KEYS = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] };

const clamp = (value, [lo, hi]) => Math.min(hi, Math.max(lo, value));
// Sizes round UP: a width rounded down by a hair rewraps the line it measured.
const ceil2 = (value) => Math.ceil(value * 100 - 1e-6) / 100;
const floor2 = (value) => Math.floor(value * 100 + 1e-6) / 100;

export function pxToCqw(px, cardPx) {
  return cardPx > 0 ? round2((px * 100) / cardPx) : 0;
}

/**
 * Measured px rects -> a complete layout in cqw at s=1. `m` is
 * {panel_h, logo: {x, y}, kicker|headline|body: {x, y, w, h}}: the logo relative
 * to the card, text relative to the panel. Every number lands inside RANGES.
 */
export function snapshot(m, cardPx) {
  const cq = (px) => (cardPx > 0 ? (px * 100) / cardPx : 0);
  const pos = (px) => round2(clamp(cq(px), RANGES.x));
  const layout = {
    panel_h: round2(clamp(cq(m.panel_h), RANGES.panel_h)),
    logo: { x: pos(m.logo.x), y: pos(m.logo.y), s: 1 },
  };
  for (const piece of PIECES) {
    const b = m[piece];
    layout[piece] = {
      x: pos(b.x),
      y: pos(b.y),
      w: clamp(ceil2(cq(b.w)), RANGES.w),
      h: clamp(ceil2(cq(b.h)), RANGES.h),
      s: 1,
    };
  }
  return layout;
}

/** New h per text piece; measure(piece) is its rendered height in cqw at its s, or null. */
export function remeasured(layout, measure) {
  const out = { ...layout };
  for (const piece of PIECES) {
    const height = measure(piece);
    if (height == null || !(height > 0)) continue;
    out[piece] = { ...layout[piece], h: clamp(ceil2(height / layout[piece].s), RANGES.h) };
  }
  return out;
}

/** The element_layout form value: '' is flow mode. */
export function serializeLayout(layout, measure) {
  return layout ? JSON.stringify(remeasured(layout, measure)) : '';
}

/**
 * The corner handle: only s changes, by the drag projected on the box's
 * diagonal, so the corner follows the pointer. It stops at the area's right and
 * bottom edges rather than leaving them.
 */
export function resizeBox(box, dx, dy, area) {
  const W = box.w * box.s;
  const H = box.h * box.s;
  const ratio = 1 + (dx * W + dy * H) / (W * W + H * H || 1);
  const room = Math.min((area.x1 - box.x) / box.w, (area.y1 - box.y) / box.h);
  let s = round2(clamp(box.s * ratio, RANGES.s));
  if (s > room) s = Math.max(RANGES.s[0], floor2(room));
  return { ...box, s };
}

/** The pieces named in problems() messages ("kicker overlaps headline"). */
export function misplacedPieces(messages) {
  const names = new Set();
  for (const message of messages) {
    for (const piece of ALL) {
      if (new RegExp(`\\b${piece}\\b`).test(message)) names.add(piece);
    }
  }
  return names;
}

export function createLayoutEditor({ card, onChange = () => {}, onProblems = () => {} }) {
  const photo = card.querySelector('.post-card__photo');
  const panel = card.querySelector('.post-card__panel');
  const footer = card.querySelector('.post-card__sources');
  const logo = card.querySelector('.post-card__logo');
  const els = { logo };
  PIECES.forEach((piece) => { els[piece] = card.querySelector(`.post-card__${piece}`); });

  let layout = null;
  let current = [];
  let drag = null;

  const cardPx = () => card.getBoundingClientRect().width;
  const cq = (px) => { const w = cardPx(); return w > 0 ? (px * 100) / w : 0; };

  // Footer height plus its bottom offset: the text area ends where it starts.
  const footerH = () => (footer
    ? cq(panel.getBoundingClientRect().bottom - footer.getBoundingClientRect().top) : 0);
  const logoW = () => cq(logo.getBoundingClientRect().width);

  function areaFor(piece) {
    if (piece === 'logo') return { x0: 0, y0: 0, x1: 100, y1: 100 - layout.panel_h };
    return { x0: INSET, y0: INSET, x1: 100 - INSET, y1: layout.panel_h - footerH() };
  }

  // The logo's box for clamping: its width at s=1 follows the image.
  function boxOf(piece) {
    if (piece !== 'logo') return layout[piece];
    return { ...layout.logo, w: logoW() / layout.logo.s, h: LOGO_BASE_H };
  }

  function setBox(piece, box) {
    const value = piece === 'logo' ? { x: box.x, y: box.y, s: box.s } : box;
    layout = { ...layout, [piece]: value };
  }

  const collides = (piece) => piece !== 'logo'
    && PIECES.some((other) => other !== piece && overlaps(layout[piece], layout[other]));

  // ── Overlay ─────────────────────────────────────────────────────────
  const overlay = document.createElement('div');
  overlay.className = 'post-layout-overlay';
  const frames = {};
  ALL.forEach((piece) => {
    const frame = document.createElement('div');
    frame.className = 'post-layout-frame';
    frame.setAttribute('data-piece', piece);
    const grip = document.createElement('button');
    grip.type = 'button';
    grip.className = 'post-layout-frame__grip';
    grip.setAttribute('aria-label', 'Move ' + LABELS[piece]);
    const handle = document.createElement('span');
    handle.className = 'post-layout-frame__handle';
    handle.setAttribute('aria-hidden', 'true');
    frame.append(grip, handle);
    overlay.appendChild(frame);
    frames[piece] = frame;
    draggable(grip, piece, 'move');
    draggable(handle, piece, 'resize');
    grip.addEventListener('keydown', (event) => onKey(event, piece));
  });
  card.appendChild(overlay);

  function sync() {
    const base = card.getBoundingClientRect();
    if (!base.width) return;
    ALL.forEach((piece) => {
      const r = els[piece].getBoundingClientRect();
      const style = frames[piece].style;
      style.left = `${r.left - base.left}px`;
      style.top = `${r.top - base.top}px`;
      style.width = `${r.width}px`;
      style.height = `${r.height}px`;
    });
  }

  function report(list) {
    const marked = misplacedPieces(list);
    ALL.forEach((piece) => {
      els[piece].classList.toggle('is-misplaced', marked.has(piece));
      frames[piece].classList.toggle('is-misplaced', marked.has(piece));
    });
    if (list.join('\n') === current.join('\n')) return;
    current = list;
    onProblems(list.slice());
  }

  // Judged only while the card is visible: a hidden card measures 0 everywhere.
  function check() {
    if (!layout) report([]);
    else if (cardPx()) report(problems(layout, { footerH: footerH(), logoW: logoW() }));
  }

  function apply() {
    card.classList.toggle('post-card--positioned', Boolean(layout));
    const styles = layout ? toStyles(layout) : null;
    // Only the photo FRAME: its <img> carries the crop style (post-editor-photo).
    const targets = { photo, panel, ...els };
    Object.keys(targets).forEach((name) => {
      if (styles) targets[name].setAttribute('style', styles[name]);
      else targets[name].removeAttribute('style');
    });
    check();
    sync();
  }

  function measureH(piece) {
    const el = els[piece];
    el.style.height = 'auto';
    const height = cq(el.getBoundingClientRect().height);
    return height > 0 ? height : null;
  }

  function remeasure() {
    if (!layout || !cardPx()) {
      sync();
      return;
    }
    layout = remeasured(layout, measureH);
    apply();
  }

  // First move: read every piece where flow mode put it, then go positioned.
  // Text is measured at fit-content (capped to the panel's inner width) so a box
  // hugs its words; an empty kicker measures its placeholder.
  function ensurePositioned() {
    if (layout) return;
    const base = card.getBoundingClientRect();
    const p = panel.getBoundingClientRect();
    const cs = getComputedStyle(panel);
    const inner = panel.clientWidth - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight);
    const l = logo.getBoundingClientRect();
    const m = { panel_h: p.height, logo: { x: l.left - base.left, y: l.top - base.top } };
    PIECES.forEach((piece) => {
      const el = els[piece];
      const saved = el.getAttribute('style');
      el.style.width = 'fit-content';
      el.style.maxWidth = `${inner}px`;
      const r = el.getBoundingClientRect();
      m[piece] = { x: r.left - p.left, y: r.top - p.top, w: r.width, h: r.height };
      if (saved == null) el.removeAttribute('style');
      else el.setAttribute('style', saved);
    });
    layout = snapshot(m, base.width);
    apply();
    remeasure();
  }

  // ── Pointer: move by the grip (or the logo itself), resize by the corner ──
  function draggable(target, piece, mode) {
    target.addEventListener('pointerdown', (event) => {
      if (event.button > 0) return;
      // The logo sits over the photo frame, which pans on pointerdown.
      event.preventDefault();
      event.stopPropagation();
      target.setPointerCapture(event.pointerId);
      drag = { id: event.pointerId, piece, mode, x: event.clientX, y: event.clientY, from: null };
    });
    target.addEventListener('pointermove', (event) => {
      if (!drag || drag.id !== event.pointerId) return;
      const dx = cq(event.clientX - drag.x);
      const dy = cq(event.clientY - drag.y);
      if (!drag.from) {
        // A click on a grip is not a move: don't leave flow mode for it.
        if (Math.hypot(dx, dy) < 0.3) return;
        ensurePositioned();
        drag.from = boxOf(piece);
      }
      const from = drag.from;
      const area = areaFor(piece);
      setBox(piece, mode === 'move'
        ? clampBox({ ...from, x: from.x + dx, y: from.y + dy }, area)
        : resizeBox(from, dx, dy, area));
      apply();
    });
    const end = (event) => {
      if (!drag || drag.id !== event.pointerId) return;
      const from = drag.from;
      drag = null;
      if (!from) return;
      // Dropped onto another piece: back to where the drag started.
      if (collides(piece)) setBox(piece, from);
      remeasure();
      onChange();
    };
    target.addEventListener('pointerup', end);
    target.addEventListener('pointercancel', end);
  }

  draggable(logo, 'logo', 'move');
  logo.draggable = false;

  function onKey(event, piece) {
    const dir = KEYS[event.key];
    if (!dir) return;
    event.preventDefault();
    ensurePositioned();
    const step = event.shiftKey ? 5 : 1;
    const from = boxOf(piece);
    setBox(piece, nudge(from, dir[0] * step, dir[1] * step, areaFor(piece)));
    if (collides(piece)) setBox(piece, from);
    apply();
    onChange();
  }

  // A late logo image, late web fonts and a resized column all move the pieces.
  logo.addEventListener('load', remeasure);
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(remeasure);
  if (typeof ResizeObserver === 'function') new ResizeObserver(() => remeasure()).observe(card);

  return {
    /** A stored layout (positioned) or null (flow). */
    load(saved) {
      drag = null;
      report([]);
      layout = saved ? JSON.parse(JSON.stringify(saved)) : null;
      apply();
      remeasure();
    },
    /** element_layout for news.store: re-measured, '' in flow mode. */
    serialize() {
      remeasure();
      return serializeLayout(layout, () => null);
    },
    problems: () => current.slice(),
    remeasure,
  };
}
