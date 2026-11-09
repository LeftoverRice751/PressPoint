/*
 * Photo framing for the post editor: a focal point (x, y in 0..1) and a zoom
 * (1..4), the same shape Posts.parse_crop stores in news.image_crop.
 *
 * DOM-free so the maths is unit-tested (tests/js/post-crop.test.mjs). toStyle()
 * must stay byte-identical to Posts.crop_style(), or what an editor framed is not
 * what the kiosk shows; tests/unit/test_post_crop_parity.py pins the same strings.
 */

export const DEFAULT_CROP = Object.freeze({ x: 0.5, y: 0.5, zoom: 1 });
export const ZOOM_MIN = 1;
export const ZOOM_MAX = 4;

function finite(value) {
  return typeof value === 'number' && Number.isFinite(value);
}

function clamp(value, low, high) {
  return Math.min(high, Math.max(low, value));
}

/** Same bounds as Posts.parse_crop; garbage falls back to the default, like there. */
export function clampCrop(crop) {
  if (!crop || typeof crop !== 'object') return { ...DEFAULT_CROP };
  const x = Number(crop.x);
  const y = Number(crop.y);
  const zoom = Number(crop.zoom);
  if (![x, y, zoom].every(finite)) return { ...DEFAULT_CROP };
  return { x: clamp(x, 0, 1), y: clamp(y, 0, 1), zoom: clamp(zoom, ZOOM_MIN, ZOOM_MAX) };
}

/**
 * Dragging the photo right should slide the picture right, which means the
 * focal point moves LEFT. Divided by zoom so a zoomed-in photo does not race
 * away under the pointer.
 */
export function panBy(crop, dxPx, dyPx, frameSizePx) {
  const current = clampCrop(crop);
  if (!finite(frameSizePx) || frameSizePx <= 0) return current;
  return clampCrop({
    x: current.x - dxPx / frameSizePx / current.zoom,
    y: current.y - dyPx / frameSizePx / current.zoom,
    zoom: current.zoom,
  });
}

export function zoomBy(crop, factor) {
  const current = clampCrop(crop);
  if (!finite(factor) || factor <= 0) return current;
  return clampCrop({ ...current, zoom: current.zoom * factor });
}

/** Posts._two_decimals, step for step: same multiply-add-floor, same formatting. */
function fmt(value) {
  const hundredths = Math.floor(value * 100 + 0.5);
  const whole = Math.floor(hundredths / 100);
  const frac = hundredths % 100;
  if (frac === 0) return String(whole);
  if (frac % 10 === 0) return `${whole}.${frac / 10}`;
  return `${whole}.${String(frac).padStart(2, '0')}`;
}

export function toStyle(crop) {
  const x = `${fmt(crop.x * 100)}%`;
  const y = `${fmt(crop.y * 100)}%`;
  const zoom = fmt(crop.zoom);
  return `object-position:${x} ${y};transform:scale(${zoom});transform-origin:${x} ${y}`;
}
