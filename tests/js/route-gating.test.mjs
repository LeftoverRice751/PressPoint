// Run with: node --test tests/js/
//
// These cover the two failures found during campus field testing:
// the freeze-then-teleport (accuracy was never inspected) and the walk
// finishing ~30m short of the building (one bad fix could jump progress to
// the end of the route).

import test from 'node:test';
import assert from 'node:assert/strict';

import {
    ACCURACY_GOOD_M,
    ACCURACY_REJECT_M,
    OFF_ROUTE_PX,
    AUTO_ARRIVAL_MAX_ACCURACY_M,
    accuracyVerdict,
    exceedsWalkingSpeed,
    isOffRoute,
    canCountAsArrival,
} from '../../resources/js/route-gating.mjs';

test('a sharp GNSS fix is trusted completely', () => {
    assert.equal(accuracyVerdict(4), 'good');
    assert.equal(accuracyVerdict(ACCURACY_GOOD_M), 'good');
});

test('a middling fix is drawn but flagged imprecise', () => {
    assert.equal(accuracyVerdict(ACCURACY_GOOD_M + 0.1), 'imprecise');
    assert.equal(accuracyVerdict(ACCURACY_REJECT_M), 'imprecise');
});

test('a WiFi/cell fallback fix is rejected outright', () => {
    // The teleport: the phone keeps delivering fixes after GNSS degrades,
    // just with a huge error bar. These must not move the puck.
    assert.equal(accuracyVerdict(ACCURACY_REJECT_M + 0.1), 'reject');
    assert.equal(accuracyVerdict(500), 'reject');
    assert.equal(accuracyVerdict(2000), 'reject');
});

test('an absent or nonsensical accuracy is unusable, not perfect', () => {
    assert.equal(accuracyVerdict(undefined), 'reject');
    assert.equal(accuracyVerdict(NaN), 'reject');
    assert.equal(accuracyVerdict(Infinity), 'reject');
    assert.equal(accuracyVerdict(-1), 'reject');
});

test('a stationary phone never trips the speed gate', () => {
    // GPS noise while standing still: metres of wander, no elapsed time.
    assert.equal(exceedsWalkingSpeed(0, 0), false);
    assert.equal(exceedsWalkingSpeed(8, 1), false);
});

test('an ordinary walking pace passes the speed gate', () => {
    // ~1.25 m/s over 20s is 25m, well inside slack + 20*4.
    assert.equal(exceedsWalkingSpeed(25, 20), false);
});

test('a teleport across campus is rejected', () => {
    // The 30m-early-finish bug: one fix lands near the destination a second
    // after a fix 300m away. No one covers 300m in a second.
    assert.equal(exceedsWalkingSpeed(300, 1), true);
});

test('a long gap earns a proportionally larger allowance', () => {
    // Same 300m, but after five minutes of walking: entirely plausible.
    assert.equal(exceedsWalkingSpeed(300, 300), false);
});

test('the speed gate fails closed on a non-finite distance', () => {
    assert.equal(exceedsWalkingSpeed(NaN, 10), true);
});

test('negative or missing elapsed time grants no allowance', () => {
    // A clock going backwards must not hand out a negative budget, nor an
    // unbounded one.
    assert.equal(exceedsWalkingSpeed(10, -50), false);   // within slack
    assert.equal(exceedsWalkingSpeed(1000, -50), true);  // beyond slack
});

test('a fix on the route is not off-route', () => {
    assert.equal(isOffRoute(0), false);
    assert.equal(isOffRoute(OFF_ROUTE_PX ** 2), false);
});

test('a fix well off the route is flagged instead of snapped', () => {
    // projectOntoPath always returns *some* nearest point; this is the only
    // signal that the snap is meaningless.
    assert.equal(isOffRoute((OFF_ROUTE_PX + 1) ** 2), true);
    assert.equal(isOffRoute(1000 ** 2), true);
});

test('arrival requires the reading to be tight enough to mean anything', () => {
    // "Within 10m" from a fix accurate to +/-30m is not evidence.
    assert.equal(canCountAsArrival(5, 8, 10), true);
    assert.equal(canCountAsArrival(AUTO_ARRIVAL_MAX_ACCURACY_M, 8, 10), true);
    assert.equal(canCountAsArrival(AUTO_ARRIVAL_MAX_ACCURACY_M + 0.1, 8, 10), false);
    assert.equal(canCountAsArrival(30, 8, 10), false);
    assert.equal(canCountAsArrival(500, 1, 10), false);
});

test('arrival still requires actually being close', () => {
    assert.equal(canCountAsArrival(5, 30, 10), false);
    assert.equal(canCountAsArrival(5, 10, 10), true);
});

test('arrival never fires on an unmeasurable distance', () => {
    // _destination_wgs84 returns null for a location with no coordinates.
    assert.equal(canCountAsArrival(5, NaN, 10), false);
    assert.equal(canCountAsArrival(undefined, 5, 10), false);
});
