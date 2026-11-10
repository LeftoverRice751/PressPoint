/*
 * Element layout maths for the square photo post (event title, headline,
 * summary), DOM-free so it is unit-tested (tests/js/post-layout.test.mjs).
 *
 * Mirrors Posts.layout_problems / Posts.layout_styles step for step: toStyles()
 * must stay byte-identical to the server's strings, and problems() uses the same
 * messages, eps and strict-touching rule, or the editor would accept a layout the
 * server rejects. Every number is cqw on a 100x100 card.
 */
import { formatNumber } from './post-crop.mjs';

export const PIECES = Object.freeze(['kicker', 'headline', 'body']);
export const RANGES = Object.freeze({
  x: [0, 100],
  y: [0, 100],
  w: [5, 100],
  h: [1, 70],
  s: [0.5, 2.5],
  panel_h: [25, 70],
});
const EPS = 1e-9;

/** Posts._round2: half-up, non-negative values. */
export function round2(value) {
  return Math.floor(value * 100 + 0.5) / 100;
}

function scaled(box) {
  return { x: box.x, y: box.y, w: round2(box.w * box.s), h: round2(box.h * box.s) };
}

export function toStyles(layout) {
  const t = formatNumber;
  const styles = {
    panel: `height:${t(layout.panel_h)}cqw`,
    photo: `height:${t(100 - layout.panel_h + 5)}cqw`,
  };
  for (const piece of PIECES) {
    const b = scaled(layout[piece]);
    styles[piece] =
      `left:${t(b.x)}cqw;top:${t(b.y)}cqw;width:${t(b.w)}cqw;height:${t(b.h)}cqw;` +
      `--s:${t(layout[piece].s)}`;
  }
  return styles;
}

/** Keep a box's scaled size inside area = {x0, y0, x1, y1}. */
export function clampBox(box, area) {
  const b = scaled(box);
  const x = Math.max(area.x0, Math.min(box.x, area.x1 - b.w));
  const y = Math.max(area.y0, Math.min(box.y, area.y1 - b.h));
  return { ...box, x: round2(Math.max(area.x0, x)), y: round2(Math.max(area.y0, y)) };
}

/** Strict intersection of scaled boxes: touching edges do not overlap. */
export function overlaps(a, b) {
  const p = scaled(a);
  const q = scaled(b);
  return p.x < q.x + q.w - EPS && q.x < p.x + p.w - EPS && p.y < q.y + q.h - EPS && q.y < p.y + p.h - EPS;
}

/**
 * Same messages as Posts.layout_problems. footerH shrinks the text area (the
 * source lines sit at the panel's bottom).
 */
export function problems(layout, { footerH = 0 } = {}) {
  const out = [];
  const panelH = layout.panel_h;
  const boxes = {};
  for (const piece of PIECES) {
    const b = scaled(layout[piece]);
    boxes[piece] = b;
    if (b.x < 0 || b.y < 0 || b.x + b.w > 100 + EPS || b.y + b.h > panelH - footerH + EPS) {
      out.push(`${piece} is outside the panel`);
    }
  }
  PIECES.forEach((a, i) => {
    for (const b of PIECES.slice(i + 1)) {
      if (overlaps(layout[a], layout[b])) out.push(`${a} overlaps ${b}`);
    }
  });
  return out;
}

export function nudge(box, dx, dy, area) {
  return clampBox({ ...box, x: box.x + dx, y: box.y + dy }, area);
}
