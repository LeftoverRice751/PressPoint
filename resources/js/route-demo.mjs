/**
 * Pure pieces of the kiosk's "Show Route" demonstration (kiosk-map.js):
 * the walkway draws itself from "You are here" to the chosen building with a
 * walker dot at its tip, holds the full route, then starts over.
 *
 * Paths are [y, x] pairs in the 2.5D layer's pixel space, the same shape as
 * `location.route`; distances come from route-maneuvers.mjs'
 * cumulativeFromPixels so there is one length function, not two.
 */

const DRAW_MIN_MS = 1800;
const DRAW_MAX_MS = 3500;
// A route across the whole campus is ~800 px; at 2 ms/px that lands near the
// ceiling, while a hop to a neighbouring building still takes the floor.
const DRAW_MS_PER_PX = 2;

const lerp = (a, b, t) => a + (b - a) * t;

/**
 * The prefix of `path` that is `distance` along it, ending in an
 * interpolated `tip` — also where the walker dot sits. Clamped to both ends.
 */
export function partialPath(path, cum, distance) {
    const last = path.length - 1;
    if (distance <= 0) return { points: [path[0]], tip: path[0] };
    if (distance >= cum[last]) return { points: path.slice(), tip: path[last] };

    let i = 1;
    while (cum[i] < distance) i += 1;
    const span = cum[i] - cum[i - 1];
    const t = span > 0 ? (distance - cum[i - 1]) / span : 0;
    const a = path[i - 1];
    const b = path[i];
    const tip = [lerp(a[0], b[0], t), lerp(a[1], b[1], t)];
    return { points: [...path.slice(0, i), tip], tip };
}

// Gentle start and gentle arrival, so the dot reads as walking, not sliding.
const easeInOutCubic = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);

/** Which part of the repeating draw → hold cycle `elapsedMs` falls in. */
export function demoPhase(elapsedMs, { drawMs, holdMs }) {
    const t = Math.max(0, elapsedMs) % (drawMs + holdMs);
    if (t >= drawMs) return { phase: 'hold', progress: 1 };
    return { phase: 'draw', progress: easeInOutCubic(t / drawMs) };
}

/** Draw time for a route `totalPx` long, clamped so no route drags or blinks. */
export function drawDurationFor(totalPx) {
    return Math.min(DRAW_MAX_MS, Math.max(DRAW_MIN_MS, DRAW_MIN_MS + totalPx * DRAW_MS_PER_PX));
}
