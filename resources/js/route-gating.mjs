// Pure decision helpers for the mobile route tracker.
//
// These live outside mobile-route.js so they can be exercised under
// `node --test` without a DOM, a Leaflet instance, or a geolocation stub.
// Field testing on campus surfaced two failures that all trace back to this
// logic, so it is the part of the tracker most worth testing directly:
//
//   * the puck froze and then teleported, because the tracker drew every fix
//     it received without ever reading coords.accuracy -- so a ~500m
//     WiFi/cell fallback fix was rendered exactly like a 4m GNSS fix;
//   * the walk finished ~30m short of the building, because a single bad fix
//     could snap onto the route polyline and jump progress to the end.
//
// Everything here is a total function of its arguments: no clocks, no
// globals, no side effects.

// Below GOOD we trust a fix completely; between GOOD and REJECT we draw it
// but won't end the walk on it; above REJECT we don't move the puck at all,
// because a stale-but-correct position beats a fresh-and-wrong one.
export const ACCURACY_GOOD_M = 15;
export const ACCURACY_REJECT_M = 35;

// How far off the drawn route a fix may land before we stop pretending it is
// on the route. ~40m at the campus scale of 0.2707 m/px, measured from the
// CampusGeoTransform ground control points.
export const OFF_ROUTE_PX = 150;

// 4 m/s is a run -- deliberately generous, since this only needs to catch
// physically impossible movement. SLACK absorbs ordinary GPS noise between
// two fixes taken moments apart, so a stationary phone doesn't trip it.
export const MAX_PLAUSIBLE_SPEED_M_PER_S = 4;
export const SPEED_GATE_SLACK_M = 15;

// A reading may only *end* the walk if its own error bar is at least this
// tight. The job is to exclude 100m+ fallback fixes, not to demand survey
// grade -- the manual "I've Arrived" button covers the rest. It was 15, and
// auto-arrival never fired in the field: right beside a building, where the
// walk ends, 15-25m is what phones actually report. Still well under
// ACCURACY_REJECT_M, and the 3-distinct-fix streak in mobile-route.js is
// what stops one lucky reading from ending the walk.
export const AUTO_ARRIVAL_MAX_ACCURACY_M = 20;

// How close to the door counts as arrived. Was 10, measured to the map pin;
// see arrivalTargetWgs84() for why that circle could be unreachable.
export const AUTO_ARRIVAL_RADIUS_M = 15;

/**
 * Classify a fix by its reported accuracy: 'good' | 'imprecise' | 'reject'.
 * A missing or non-finite accuracy is unusable, not perfect.
 */
export function accuracyVerdict(
    accuracy,
    good = ACCURACY_GOOD_M,
    reject = ACCURACY_REJECT_M,
) {
    if (!Number.isFinite(accuracy) || accuracy < 0) return 'reject';
    if (accuracy > reject) return 'reject';
    if (accuracy > good) return 'imprecise';
    return 'good';
}

/**
 * True when two fixes are further apart than a person could have walked in
 * the elapsed time, meaning at least one of them is wrong. A non-finite
 * distance is treated as a jump (fail closed); a non-finite or negative
 * elapsed time contributes no allowance rather than a negative one.
 */
export function exceedsWalkingSpeed(
    metres,
    seconds,
    maxSpeed = MAX_PLAUSIBLE_SPEED_M_PER_S,
    slack = SPEED_GATE_SLACK_M,
) {
    if (!Number.isFinite(metres)) return true;
    const elapsed = Number.isFinite(seconds) && seconds > 0 ? seconds : 0;
    return metres > slack + elapsed * maxSpeed;
}

/**
 * True when the nearest point on the route is far enough away that snapping
 * to it would be meaningless. Takes the *squared* pixel distance, which is
 * what projectOntoPath() already returns.
 */
export function isOffRoute(distSq, thresholdPx = OFF_ROUTE_PX) {
    if (!Number.isFinite(distSq) || distSq < 0) return false;
    return Math.sqrt(distSq) > thresholdPx;
}

/**
 * Whether a single reading is allowed to count toward auto-arrival.
 * "Within 10m" reported by a fix accurate to +/-30m is not evidence.
 */
export function canCountAsArrival(
    accuracy,
    metresToDestination,
    radiusM,
    maxAccuracy = AUTO_ARRIVAL_MAX_ACCURACY_M,
) {
    if (!Number.isFinite(accuracy) || accuracy > maxAccuracy) return false;
    if (!Number.isFinite(metresToDestination)) return false;
    return metresToDestination <= radiusM;
}

/**
 * The [lat, lng] the walk is judged against: the last point of the routed
 * polyline -- the walkway's door node -- when there is one, else the map pin.
 * Measuring to the pin is why auto-arrival never fired: pins sit on the
 * building, up to ~17m from where the walkway actually ends, so a 10m circle
 * around one could be entirely inside the building.
 */
export function arrivalTargetWgs84(routeWgs84, pinWgs84) {
    const isPoint = (p) => Array.isArray(p) && p.length === 2
        && Number.isFinite(p[0]) && Number.isFinite(p[1]);
    if (Array.isArray(routeWgs84) && routeWgs84.length >= 2) {
        const door = routeWgs84[routeWgs84.length - 1];
        if (isPoint(door)) return door;
    }
    return isPoint(pinWgs84) ? pinWgs84 : null;
}

/**
 * Distance used for arrival: the smaller of what's left along the route and
 * the straight line to the target. Along-route is null whenever the fix
 * didn't move far enough to re-project, which is exactly the case of
 * someone standing at the door waiting for the walk to end.
 */
export function arrivalDistance(alongRouteM, straightLineM) {
    const candidates = [alongRouteM, straightLineM].filter((v) => Number.isFinite(v));
    return candidates.length ? Math.min(...candidates) : NaN;
}
