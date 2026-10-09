// Run with: node --test tests/js/
//
// The walkways are hand-digitised in QGIS, so a path that reads as one
// straight line on campus is several vertices with small kinks. Speaking a
// "turn" at every kink is the failure these guard against.
//
// Paths are [y, x] in layer space with y growing upward, so going from
// +x (east) to +y (north) is a left turn. Distances use 1 m/px for clarity.

import test from 'node:test';
import assert from 'node:assert/strict';

import {
    buildManeuvers,
    cumulativeFromPixels,
    cumulativeFromWgs84,
    nextAnnouncement,
    bannerFor,
    NOW_M,
    PREPARE_M,
} from '../../resources/js/route-maneuvers.mjs';

const build = (path) => buildManeuvers(path, cumulativeFromPixels(path, 1));

test('cumulative distance from pixels and from WGS84', () => {
    assert.deepEqual(cumulativeFromPixels([[0, 0], [0, 3], [4, 3]], 1), [0, 3, 7]);
    assert.deepEqual(cumulativeFromPixels([[0, 0], [0, 10]], 0.5), [0, 5]);
    const wgs = cumulativeFromWgs84([[14.0, 121.0], [14.001, 121.0]]);
    assert.equal(wgs[0], 0);
    // 0.001 degree of latitude is ~111 m.
    assert.ok(Math.abs(wgs[1] - 111.2) < 0.5);
});

test('a straight path with digitising wobble has no maneuvers', () => {
    // Under a metre of sideways wander per 10m: a hand-drawn straight path.
    // (A 3m swing per 10m is a real bend, and is reported as one.)
    const path = [[0, 0], [0.75, 10], [-0.75, 20], [0.75, 30], [-0.5, 40], [0, 50]];
    assert.deepEqual(build(path), []);
});

test('east then north is a single left turn at the corner', () => {
    const maneuvers = build([[0, 0], [0, 50], [50, 50]]);
    assert.equal(maneuvers.length, 1);
    assert.equal(maneuvers[0].direction, 'left');
    assert.equal(maneuvers[0].atMetres, 50);
});

test('east then south is a right turn', () => {
    const maneuvers = build([[0, 0], [0, 50], [-50, 50]]);
    assert.equal(maneuvers.length, 1);
    assert.equal(maneuvers[0].direction, 'right');
});

test('a gentle bend is a slight turn', () => {
    // ~45 degrees to the left.
    const maneuvers = build([[0, 0], [0, 50], [35, 85]]);
    assert.equal(maneuvers.length, 1);
    assert.equal(maneuvers[0].direction, 'slight-left');
});

test('a corner digitised as many short vertices is still one turn', () => {
    // A 90-degree arc of radius 4 drawn with 7 vertices between two legs.
    const arc = [];
    for (let i = 0; i <= 6; i += 1) {
        const a = (-Math.PI / 2) + (i / 6) * (Math.PI / 2);
        arc.push([4 + 4 * Math.sin(a), 50 + 4 * Math.cos(a)]);
    }
    const path = [[0, 0], ...arc, [60, 54]];
    const maneuvers = build(path);
    assert.equal(maneuvers.length, 1);
    assert.equal(maneuvers[0].direction, 'left');
});

test('two separate corners are two maneuvers in walking order', () => {
    const maneuvers = build([[0, 0], [0, 50], [50, 50], [50, 100]]);
    assert.deepEqual(maneuvers.map((m) => m.direction), ['left', 'right']);
    assert.ok(maneuvers[0].atMetres < maneuvers[1].atMetres);
});

test('degenerate paths yield nothing rather than throwing', () => {
    assert.deepEqual(build([]), []);
    assert.deepEqual(build([[0, 0]]), []);
    assert.deepEqual(build([[0, 0], [0, 10]]), []);
    assert.deepEqual(buildManeuvers(null, null), []);
});

const LEFT_AT_100 = [{ index: 3, direction: 'left', atMetres: 100 }];

test('nothing is said far from the next turn', () => {
    assert.equal(nextAnnouncement(LEFT_AT_100, 10, new Set()), null);
});

test('the turn is announced ahead of time, rounded to 5 m', () => {
    const said = nextAnnouncement(LEFT_AT_100, 100 - 22, new Set());
    assert.equal(said.key, '3:prepare');
    assert.equal(said.text, 'In 20 meters, turn left.');
});

test('the turn itself is announced at the corner', () => {
    const said = nextAnnouncement(LEFT_AT_100, 100 - NOW_M + 1, new Set());
    assert.equal(said.key, '3:now');
    assert.equal(said.text, 'Turn left.');
});

test('each prompt is spoken only once', () => {
    const spoken = new Set(['3:prepare']);
    assert.equal(nextAnnouncement(LEFT_AT_100, 100 - 20, spoken), null);
    spoken.add('3:now');
    assert.equal(nextAnnouncement(LEFT_AT_100, 99, spoken), null);
});

test('a turn already walked past is never announced late', () => {
    assert.equal(nextAnnouncement(LEFT_AT_100, 120, new Set()), null);
});

test('the prepare prompt is skipped once already at the corner', () => {
    // A GPS jump straight into the "now" window should say "Turn left",
    // not "In 5 meters, turn left" followed by "Turn left".
    const said = nextAnnouncement(LEFT_AT_100, 98, new Set());
    assert.equal(said.key, '3:now');
});

test('slight turns are spoken as "bear"', () => {
    const said = nextAnnouncement(
        [{ index: 2, direction: 'slight-right', atMetres: 40 }],
        40 - PREPARE_M + 1,
        new Set(),
    );
    assert.equal(said.text, 'In 25 meters, bear right.');
});

test('the banner shows the next maneuver and its distance', () => {
    assert.deepEqual(bannerFor(LEFT_AT_100, 40), { text: 'In 60 m, turn left', arrow: '←' });
    assert.deepEqual(bannerFor(LEFT_AT_100, 97), { text: 'Turn left', arrow: '←' });
    assert.deepEqual(bannerFor(LEFT_AT_100, 130), { text: 'Continue to your destination', arrow: '↑' });
    assert.deepEqual(bannerFor([], 0), { text: 'Continue to your destination', arrow: '↑' });
});

// Every route out of the SSB kiosk opens with a right-then-left jog ~4 m
// apart; announcing each separately was four prompts in the first 10 m.
const JOG = [
    { index: 1, direction: 'right', atMetres: 10 },
    { index: 2, direction: 'left', atMetres: 14 },
    { index: 5, direction: 'right', atMetres: 100 },
];

test('a turn closely followed by another is chained into one prompt', () => {
    const said = nextAnnouncement(JOG, 0, new Set());
    assert.equal(said.text, 'In 10 meters, turn right, then turn left.');
    assert.deepEqual(said.alsoKeys, ['2:prepare']);
    const now = nextAnnouncement(JOG, 6, new Set([said.key, ...said.alsoKeys]));
    assert.equal(now.text, 'Turn right, then turn left.');
});

test('a chained turn is still called out when reached', () => {
    const spoken = new Set(['1:prepare', '2:prepare', '1:now']);
    assert.equal(nextAnnouncement(JOG, 13, spoken).text, 'Turn left.');
});

test('turns far apart are not chained', () => {
    const said = nextAnnouncement(JOG, 80, new Set(['1:prepare', '1:now', '2:prepare', '2:now']));
    assert.equal(said.text, 'In 20 meters, turn right.');
    assert.deepEqual(said.alsoKeys, []);
});
