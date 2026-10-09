// Turn-by-turn maneuvers for the mobile route, derived from the route
// geometry alone.
//
// MapWayfinderService only returns a shortest-path polyline -- there is no
// step list anywhere in the app -- so turns have to be read off the line.
// mobile-route.js used to do that per raw segment (the angle between the
// segment you're on and the next), which was fine for a banner but unusable
// for speech: the walkways are hand-digitised in QGIS, so one straight path
// is several vertices with small kinks, and a tight corner is several short
// vertices that each look like a partial turn. Here a turn is measured over
// LOOK_M either side of a vertex, and adjacent turning vertices are merged.
//
// Pure functions of their arguments, like route-gating.mjs, so they run
// under `node --test` without a DOM.

// Campus scale, measured from the CampusGeoTransform ground control points
// (same figure route-gating.mjs's OFF_ROUTE_PX is derived from). Only used
// when a session has no WGS84 route to measure along.
export const METRES_PER_PX = 0.2707;

// How far back/ahead of a vertex its turn angle is measured. Longer than a
// digitising wobble, shorter than the gap between two real corners.
export const LOOK_M = 8;
// Below this, a bend is not worth mentioning; below TURN_MIN_DEG it is "bear".
export const SLIGHT_MIN_DEG = 30;
export const TURN_MIN_DEG = 60;
// Turning vertices closer than this along the route are one corner.
export const MERGE_M = 6;
// A kink this close to the end is the spur into the door, not a turn.
export const MIN_TAIL_M = 3;

// "In 20 meters, turn left" fires inside PREPARE_M; "Turn left" inside NOW_M.
export const PREPARE_M = 25;
export const NOW_M = 6;
// A maneuver this far behind the walker is done; never announce it late.
export const PASSED_M = 3;
// A turn this soon after another is announced with it ("Turn right, then
// turn left"). Every route out of the SSB kiosk opens with a right-left jog
// ~4 m apart, which was otherwise four prompts in the first 10 m.
export const CHAIN_M = 15;

const ARROWS = {
    left: '←',
    right: '→',
    'slight-left': '↖',
    'slight-right': '↗',
};

// Path points are [y, x] in the 2.5D layer space, where less negative y is
// further up the map, so a plain atan2(dy, dx) is a standard math angle and
// a positive change of heading is a left turn.
export const bearingDeg = (a, b) => Math.atan2(b[0] - a[0], b[1] - a[1]) * (180 / Math.PI);

export const normalizeAngle = (deg) => {
    let d = deg % 360;
    if (d > 180) d -= 360;
    if (d < -180) d += 360;
    return d;
};

function haversineMeters(lat1, lng1, lat2, lng2) {
    const radius = 6371000;
    const toRad = (deg) => (deg * Math.PI) / 180;
    const dPhi = toRad(lat2 - lat1);
    const dLambda = toRad(lng2 - lng1);
    const a = Math.sin(dPhi / 2) ** 2
        + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLambda / 2) ** 2;
    return 2 * radius * Math.asin(Math.sqrt(a));
}

const cumulative = (points, segmentLength) => {
    const out = [];
    let total = 0;
    (points || []).forEach((point, i) => {
        if (i > 0) total += segmentLength(points[i - 1], point);
        out.push(total);
    });
    return out;
};

/** Metres from the route start to each vertex of a [lat, lng] polyline. */
export const cumulativeFromWgs84 = (route) => cumulative(
    route,
    (a, b) => haversineMeters(a[0], a[1], b[0], b[1]),
);

/** Metres from the route start to each vertex of a [y, x] layer polyline. */
export const cumulativeFromPixels = (path, metresPerPx = METRES_PER_PX) => cumulative(
    path,
    (a, b) => Math.hypot(b[0] - a[0], b[1] - a[1]) * metresPerPx,
);

// The [y, x] point `metres` along the path, clamped to its ends.
const pointAt = (path, cum, metres) => {
    const last = path.length - 1;
    if (metres <= 0) return path[0];
    if (metres >= cum[last]) return path[last];
    let i = 0;
    while (i < last - 1 && cum[i + 1] < metres) i += 1;
    const span = cum[i + 1] - cum[i];
    const t = span > 0 ? (metres - cum[i]) / span : 0;
    return [
        path[i][0] + (path[i + 1][0] - path[i][0]) * t,
        path[i][1] + (path[i + 1][1] - path[i][1]) * t,
    ];
};

const samePoint = (a, b) => a[0] === b[0] && a[1] === b[1];

// Heading change across [fromIndex, toIndex], each side measured LOOK_M out.
const turnAcross = (path, cum, fromIndex, toIndex) => {
    const before = pointAt(path, cum, cum[fromIndex] - LOOK_M);
    const after = pointAt(path, cum, cum[toIndex] + LOOK_M);
    if (samePoint(before, path[fromIndex]) || samePoint(after, path[toIndex])) return 0;
    return normalizeAngle(
        bearingDeg(path[toIndex], after) - bearingDeg(before, path[fromIndex]),
    );
};

const classify = (delta) => {
    const abs = Math.abs(delta);
    if (abs < SLIGHT_MIN_DEG) return null;
    const side = delta > 0 ? 'left' : 'right';
    return abs < TURN_MIN_DEG ? `slight-${side}` : side;
};

/**
 * The real turns along a [y, x] path, in walking order:
 * [{ index, direction, atMetres }]. `cum` is the parallel array of metres
 * from the start (cumulativeFromWgs84 / cumulativeFromPixels).
 */
export function buildManeuvers(path, cum) {
    if (!Array.isArray(path) || path.length < 3) return [];
    if (!Array.isArray(cum) || cum.length !== path.length) return [];
    const total = cum[cum.length - 1];

    const candidates = [];
    for (let i = 1; i < path.length - 1; i += 1) {
        if (total - cum[i] < MIN_TAIL_M) continue;
        const delta = turnAcross(path, cum, i, i);
        if (Math.abs(delta) >= SLIGHT_MIN_DEG) candidates.push({ index: i, delta });
    }

    // A corner drawn as several short vertices shows up as a run of
    // same-direction candidates; it is one maneuver, judged end to end.
    const clusters = [];
    candidates.forEach((candidate) => {
        const current = clusters[clusters.length - 1];
        const previous = current && current[current.length - 1];
        if (previous
            && Math.sign(previous.delta) === Math.sign(candidate.delta)
            && cum[candidate.index] - cum[previous.index] <= MERGE_M) {
            current.push(candidate);
        } else {
            clusters.push([candidate]);
        }
    });

    const maneuvers = [];
    clusters.forEach((cluster) => {
        const first = cluster[0].index;
        const last = cluster[cluster.length - 1].index;
        const direction = classify(turnAcross(path, cum, first, last));
        if (!direction) return;
        const sharpest = cluster.reduce((a, b) => (Math.abs(b.delta) > Math.abs(a.delta) ? b : a));
        maneuvers.push({ index: sharpest.index, direction, atMetres: cum[sharpest.index] });
    });
    return maneuvers;
}

// "turn left" / "bear left".
const phrase = (direction) => (direction.startsWith('slight-')
    ? `bear ${direction.slice('slight-'.length)}`
    : `turn ${direction}`);

const capitalize = (text) => text.charAt(0).toUpperCase() + text.slice(1);

const roundTo5 = (metres) => Math.max(5, Math.round(metres / 5) * 5);

// The first maneuver not yet walked past.
const upcoming = (maneuvers, metresAlong) => (maneuvers || []).find(
    (m) => m.atMetres - metresAlong >= -PASSED_M,
);

/**
 * What to say now, if anything: { key, text, alsoKeys } or null. `spoken` is
 * the set of keys already said; the caller adds `key` and `alsoKeys` to it,
 * so each maneuver's "prepare" and "now" prompts fire at most once however
 * much the projected position jitters back and forth. `alsoKeys` is the
 * chained turn's "prepare", already covered by "..., then turn left".
 */
export function nextAnnouncement(maneuvers, metresAlong, spoken) {
    const list = maneuvers || [];
    for (let i = 0; i < list.length; i += 1) {
        const m = list[i];
        const distance = m.atMetres - metresAlong;
        if (distance < -PASSED_M) continue;

        const following = list[i + 1];
        const chained = following && following.atMetres - m.atMetres <= CHAIN_M ? following : null;
        const then = chained ? `, then ${phrase(chained.direction)}` : '';
        const alsoKeys = chained ? [`${chained.index}:prepare`] : [];

        if (distance <= NOW_M) {
            const key = `${m.index}:now`;
            if (!spoken.has(key)) {
                return { key, text: `${capitalize(phrase(m.direction))}${then}.`, alsoKeys };
            }
            // Said already; the next corner may be close behind this one.
            continue;
        }
        if (distance <= PREPARE_M) {
            const key = `${m.index}:prepare`;
            if (spoken.has(key)) return null;
            return {
                key,
                text: `In ${roundTo5(distance)} meters, ${phrase(m.direction)}${then}.`,
                alsoKeys,
            };
        }
        return null;
    }
    return null;
}

/** The on-screen instruction, from the same maneuvers the voice speaks. */
export function bannerFor(maneuvers, metresAlong) {
    const next = upcoming(maneuvers, metresAlong);
    if (!next) return { text: 'Continue to your destination', arrow: '↑' };
    const arrow = ARROWS[next.direction];
    const distance = next.atMetres - metresAlong;
    if (distance <= NOW_M) return { text: capitalize(phrase(next.direction)), arrow };
    return { text: `In ${roundTo5(distance)} m, ${phrase(next.direction)}`, arrow };
}
