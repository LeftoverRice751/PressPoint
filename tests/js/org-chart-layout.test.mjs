// Run with: node --test tests/js/
//
// These cover the three things that stopped the org board canvas from being
// genuinely free-form:
//
//   1. The origin used to be the content's own bounding box, so dragging a card
//      past the current leftmost one moved minX and shifted every card by the
//      padding — the dropped card did not stay where it was released.
//   2. A hand-placed coordinate applied to that node alone, leaving its reports
//      at the position the tidy-tree pass had computed for them.
//   3. Connectors always left the parent's bottom edge for the child's top
//      edge, which doubles back through both cards once a child can sit above
//      or beside its parent.

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

// org-chart-layout.js is a browser IIFE that hangs itself off `window`; there is
// no module boundary to import, so run it against a stand-in global.
const here = dirname(fileURLToPath(import.meta.url));
const source = readFileSync(join(here, '../../resources/js/org-chart-layout.js'), 'utf8');
const fakeWindow = {};
new Function('window', source)(fakeWindow);
const OrgChart = fakeWindow.OrgChart;

/** A member node in the shape OrgBoardTree.member_node() serialises. */
function node(id, extra) {
    return Object.assign(
        { id, name: `Member ${id}`, position: '', parent_id: null, children: [], pos_x: null, pos_y: null },
        extra || {}
    );
}

function placedById(placed, id) {
    return placed.find((item) => String(item.id) === String(id));
}

test('exports the geometry the editor and kiosk both rely on', () => {
    for (const name of ['DEFAULTS', 'GRID', 'snap', 'layout', 'connectors', 'bounds', 'stageSize',
        'fitScale', 'MIN_SCALE', 'MAX_SCALE']) {
        assert.ok(OrgChart[name] !== undefined, `OrgChart.${name} is missing`);
    }
});

test('snap rounds to the visible grid and never goes negative', () => {
    assert.equal(OrgChart.snap(0), 0);
    assert.equal(OrgChart.snap(13), 0);
    assert.equal(OrgChart.snap(15), 28);
    assert.equal(OrgChart.snap(28), 28);
    assert.equal(OrgChart.snap(-500), 0, 'the fixed origin has no negative quadrant');
    assert.equal(OrgChart.snap('not a number'), 0);
});

test('a pinned card lands on exactly the coordinates it was given', () => {
    const roots = [node(1, { pos_x: 308, pos_y: 140 })];
    const placed = OrgChart.layout(roots, {});

    assert.equal(placedById(placed, 1).x, 308);
    assert.equal(placedById(placed, 1).y, 140);
});

test('moving one card does not shift the others — the origin is fixed', () => {
    // The regression: card 2 is dragged left of card 1, which used to become the
    // new bounding-box minimum and drag every other card sideways with it.
    const before = OrgChart.layout(
        [node(1, { pos_x: 400, pos_y: 0 }), node(2, { pos_x: 800, pos_y: 0 })],
        {}
    );
    const after = OrgChart.layout(
        [node(1, { pos_x: 400, pos_y: 0 }), node(2, { pos_x: 0, pos_y: 0 })],
        {}
    );

    assert.equal(placedById(before, 1).x, 400);
    assert.equal(placedById(after, 1).x, 400, 'the untouched card must not move');
    assert.equal(placedById(after, 2).x, 0, 'the dragged card keeps the coordinate it was given');
});

test('coordinates left of the origin are folded back without distorting the chart', () => {
    // Rows saved by the older bounds-relative editor can hold negatives.
    const placed = OrgChart.layout(
        [node(1, { pos_x: -100, pos_y: -40 }), node(2, { pos_x: 100, pos_y: 60 })],
        {}
    );

    const first = placedById(placed, 1);
    const second = placedById(placed, 2);

    assert.equal(first.x, 0);
    assert.equal(first.y, 0);
    assert.equal(second.x - first.x, 200, 'relative spacing survives the shift');
    assert.equal(second.y - first.y, 100);
});

test('a pinned parent carries its unpinned reports with it', () => {
    const child = node(2, { parent_id: 1 });
    const parent = node(1, { children: [child] });

    const auto = OrgChart.layout([parent], {});
    const autoGap = placedById(auto, 2).y - placedById(auto, 1).y;

    const pinnedParent = node(1, { pos_x: 500, pos_y: 300, children: [node(2, { parent_id: 1 })] });
    const moved = OrgChart.layout([pinnedParent], {});

    assert.equal(placedById(moved, 1).x, 500);
    assert.equal(placedById(moved, 1).y, 300);
    assert.equal(
        placedById(moved, 2).y - placedById(moved, 1).y,
        autoGap,
        'the report keeps its offset beneath the parent instead of staying behind'
    );
});

test('a report with its own coordinates outranks the parent it hangs from', () => {
    const pinnedParent = node(1, {
        pos_x: 500,
        pos_y: 300,
        children: [node(2, { parent_id: 1, pos_x: 40, pos_y: 40 })]
    });
    const placed = OrgChart.layout([pinnedParent], {});

    assert.equal(placedById(placed, 2).x, 40);
    assert.equal(placedById(placed, 2).y, 40);
});

test('stageSize measures from the origin and only ever grows', () => {
    const near = OrgChart.stageSize([{ id: 1, x: 0, y: 0, w: 200, h: 96 }], {}, 0);
    const far = OrgChart.stageSize([{ id: 1, x: 600, y: 400, w: 200, h: 96 }], {}, 0);

    assert.equal(near.width, 200);
    assert.equal(far.width, 800, 'a card pushed right extends the stage rather than re-anchoring it');
    assert.equal(far.height, 496);
});

test('a connector to a child above its parent leaves the parent going up', () => {
    const parent = node(1, { pos_x: 0, pos_y: 400, children: [node(2, { parent_id: 1, pos_x: 0, pos_y: 0 })] });
    const placed = OrgChart.layout([parent], {});
    const [edge] = OrgChart.connectors(placed, {});

    // "M x y" — the path must start on the parent's top edge (y = 400), not the
    // bottom edge (y = 496) it would have used before.
    const startY = Number(edge.d.split(' ')[2]);
    assert.equal(startY, 400);
});

test('a connector to a child beside its parent turns on the x axis', () => {
    const parent = node(1, { pos_x: 0, pos_y: 0, children: [node(2, { parent_id: 1, pos_x: 400, pos_y: 0 })] });
    const placed = OrgChart.layout([parent], {});
    const [edge] = OrgChart.connectors(placed, {});

    const parts = edge.d.split(' ');
    const startX = Number(parts[1]);
    const startY = Number(parts[2]);

    assert.equal(startX, 200, 'leaves the parent right edge');
    assert.equal(startY, 48, 'at the parent vertical midpoint');
});

test('a plain top-to-bottom tree still routes the classic elbow', () => {
    const parent = node(1, { children: [node(2, { parent_id: 1 })] });
    const placed = OrgChart.layout([parent], {});
    const [edge] = OrgChart.connectors(placed, {});

    const startY = Number(edge.d.split(' ')[2]);
    assert.equal(startY, 96, 'leaves the parent bottom edge');
});

/* ===== width-bounded layout (the kiosk) =============================
 *
 * The kiosk's deck card is a fixed width and the tidy-tree pass above is not:
 * a row of siblings is as wide as the sum of its children, so the Board of
 * Regents (9 members, 6 of them siblings) came out ~1704px wide inside a 660px
 * card and was clipped, with the overflow unreachable behind a scrollbar iOS
 * does not paint. `maxWidth` reflows a row that does not fit into a hanging
 * stack instead, trading horizontal growth for vertical.
 */

function withChildren(id, count) {
    const kids = [];
    for (let i = 0; i < count; i += 1) {
        kids.push(node(id * 100 + i, { parent_id: id }));
    }
    return node(id, { children: kids });
}

/** Every card's rectangle except the two an edge connects. */
function otherCards(placed, fromId, toId) {
    return placed
        .filter((item) => String(item.id) !== String(fromId) && String(item.id) !== String(toId))
        .map((item) => ({ x1: item.x, y1: item.y, x2: item.x + item.w, y2: item.y + item.h }));
}

/** Path points from an "M x y L x y ..." string. */
function points(d) {
    const parts = d.split(' ').filter((token) => token !== 'M' && token !== 'L');
    const out = [];
    for (let i = 0; i < parts.length; i += 2) {
        out.push({ x: Number(parts[i]), y: Number(parts[i + 1]) });
    }
    return out;
}

test('without maxWidth the editor path is untouched', () => {
    const roots = [withChildren(1, 8)];
    const placed = OrgChart.layout(roots, {});
    const box = OrgChart.bounds(placed, {}, 0);

    // 8 children x 200 + 7 gaps x 28 = 1796: the unbounded pass still grows
    // sideways without limit, which is what the free editor canvas wants.
    assert.equal(box.width, 1796);
    assert.ok(placed.every((item) => item.stacked === false || item.stacked === undefined));
});

test('maxWidth keeps the whole chart inside the width it was given', () => {
    const roots = [withChildren(1, 8)];
    const maxWidth = 640;
    const placed = OrgChart.layout(roots, { maxWidth, ignorePins: true });
    const box = OrgChart.bounds(placed, {}, 0);

    assert.ok(
        box.width <= maxWidth,
        `chart is ${box.width}px wide inside a ${maxWidth}px card`
    );
    assert.equal(placed.length, 9, 'every member is still placed, none dropped');
});

test('a row that fits keeps the classic centred layout', () => {
    const roots = [withChildren(1, 2)];
    const placed = OrgChart.layout(roots, { maxWidth: 640, ignorePins: true });
    const kids = placed.filter((item) => item.parentId !== null);

    assert.equal(kids[0].y, kids[1].y, 'siblings that fit stay on one row');
    assert.ok(kids.every((kid) => kid.stacked === false), 'and are not marked as hanging');
});

test('children that do not fit hang in a single stacked column', () => {
    const roots = [withChildren(1, 8)];
    const placed = OrgChart.layout(roots, { maxWidth: 640, ignorePins: true });
    const kids = placed.filter((item) => item.parentId !== null);

    assert.ok(kids.every((kid) => kid.stacked === true));
    assert.ok(kids.every((kid) => kid.x === kids[0].x), 'all share one left edge');
    for (let i = 1; i < kids.length; i += 1) {
        assert.ok(kids[i].y > kids[i - 1].y, 'and descend in order');
    }
});

test('ignorePins lays out from the hierarchy, not the editor coordinates', () => {
    const roots = [node(1, { pos_x: 1484, pos_y: 476 })];
    const placed = OrgChart.layout(roots, { maxWidth: 640, ignorePins: true });

    assert.notEqual(placedById(placed, 1).x, 1484, 'the drag position must not reach the kiosk');
    assert.equal(placedById(placed, 1).x, 0);
});

test('a stacked connector never crosses a sibling card', () => {
    // The bug the comb routing exists to prevent: elbow() turns at the vertical
    // midpoint between two cards, which for the third card in a stack is a
    // height the first two occupy — so its edge would be drawn straight through
    // them.
    const roots = [withChildren(1, 8)];
    const placed = OrgChart.layout(roots, { maxWidth: 640, ignorePins: true });

    for (const edge of OrgChart.connectors(placed, {})) {
        const blockers = otherCards(placed, edge.from, edge.to);
        const path = points(edge.d);

        for (let i = 1; i < path.length; i += 1) {
            const a = path[i - 1];
            const b = path[i];
            const lo = { x: Math.min(a.x, b.x), y: Math.min(a.y, b.y) };
            const hi = { x: Math.max(a.x, b.x), y: Math.max(a.y, b.y) };

            for (const card of blockers) {
                const overlaps = lo.x < card.x2 && hi.x > card.x1 && lo.y < card.y2 && hi.y > card.y1;
                assert.ok(
                    !overlaps,
                    `edge ${edge.from}->${edge.to} runs through the card at ${card.x1},${card.y1}`
                );
            }
        }
    }
});

test('roots stack too rather than running off the edge together', () => {
    const roots = [node(1), node(2), node(3), node(4), node(5)];
    const placed = OrgChart.layout(roots, { maxWidth: 400, ignorePins: true });
    const box = OrgChart.bounds(placed, {}, 0);

    assert.ok(box.width <= 400);
    assert.equal(placed.length, 5);
});

/* ---- skipPins and the kiosk's outlier guard ---------------------------
 *
 * The kiosk shows the arrangement an editor built, scaled to fit a 768x1024
 * portrait screen with no scrolling and no zoom. One card parked far from the
 * rest therefore costs every *other* card its legibility, and a visitor has no
 * way to compensate. These cover the per-node pin exception that lets the
 * kiosk drop such a coordinate, and the rule that decides which one it is.
 */

/** A pinned card, at the coordinates the editor would have saved. */
function pinned(id, x, y, extra) {
    return node(id, Object.assign({ pos_x: x, pos_y: y }, extra || {}));
}

test('exports the outlier guard the kiosk fits with', () => {
    for (const name of ['KIOSK_FRAME', 'outlierPins', 'layoutWithoutOutliers']) {
        assert.ok(OrgChart[name] !== undefined, `OrgChart.${name} is missing`);
    }
    assert.ok(OrgChart.KIOSK_FRAME.height > OrgChart.KIOSK_FRAME.width,
        'the frame stands portrait, like the screen it describes');
});

test('skipPins ignores one coordinate and honours the rest', () => {
    const roots = [pinned(1, 0, 0, {
        children: [pinned(2, 40, 200, { parent_id: 1 }), pinned(3, 900, 200, { parent_id: 1 })],
    })];

    const placed = OrgChart.layout(roots, { skipPins: { 3: true } });

    assert.equal(placedById(placed, 2).x, 40, 'an unskipped pin is still honoured');
    assert.notEqual(placedById(placed, 3).x, 900, 'the skipped pin was not applied');
});

test('a skipped pin releases the reports that were following it', () => {
    // The regression test for reverting a coordinate in place instead: applyPins
    // cascades a pinned card's delta to its unpinned descendants, so editing one
    // card's x/y afterwards would strand its reports at the old offset.
    const tree = () => [node(1, {
        children: [pinned(2, 2000, 200, { parent_id: 1, children: [node(3, { parent_id: 2 })] })],
    })];

    const honoured = OrgChart.layout(tree(), {});
    assert.ok(placedById(honoured, 3).x > 1800, 'the report follows its pinned manager out');

    const skipped = OrgChart.layout(tree(), { skipPins: { 2: true } });
    assert.ok(placedById(skipped, 3).x < 600, 'and comes back with them when the pin is skipped');
});

test('a cluster with no outlier is returned untouched', () => {
    const roots = [withChildren(1, 3)];
    const result = OrgChart.layoutWithoutOutliers(roots, {});

    assert.deepEqual(result.reverted, []);
    assert.deepEqual(result.placed.map((item) => [item.id, item.x, item.y]),
        OrgChart.layout(roots, {}).map((item) => [item.id, item.x, item.y]));
});

test('a card parked far outside the cluster loses its pin', () => {
    const roots = [pinned(1, 100, 0, {
        children: [
            pinned(2, 0, 200, { parent_id: 1 }),
            pinned(3, 240, 200, { parent_id: 1 }),
            pinned(4, 4000, 3000, { parent_id: 1 }),
        ],
    })];

    const result = OrgChart.layoutWithoutOutliers(roots, {});

    assert.deepEqual(result.reverted, [4]);
    const box = OrgChart.bounds(result.placed, {}, 0);
    assert.ok(box.width < 1000, `chart still ${box.width}px wide`);
    assert.ok(box.height < 1000, `chart still ${box.height}px tall`);
    assert.equal(placedById(result.placed, 2).x, 0, 'every other pin survived');
    assert.equal(placedById(result.placed, 3).x, 240);
});

test('a chart an editor merely spread out keeps every pin', () => {
    const roots = [pinned(1, 300, 0, {
        children: [
            pinned(2, 0, 220, { parent_id: 1 }),
            pinned(3, 300, 220, { parent_id: 1 }),
            pinned(4, 600, 220, { parent_id: 1 }),
        ],
    })];

    const result = OrgChart.layoutWithoutOutliers(roots, {});

    assert.deepEqual(result.reverted, [], 'spreading a chart out is a legitimate arrangement');
});

test('a root is never called the outlier', () => {
    // Pinning the root drags the whole chart, so removing it "shrinks" the box
    // only because it removed everything.
    const roots = [pinned(1, 5000, 5000, {
        children: [node(2, { parent_id: 1 }), node(3, { parent_id: 1 })],
    })];

    const result = OrgChart.layoutWithoutOutliers(roots, {});

    assert.deepEqual(result.reverted, []);
});

test('outlier reverting terminates on a chart where every card is scattered', () => {
    const kids = [];
    for (let i = 0; i < 11; i += 1) {
        kids.push(pinned(100 + i, i * 700, (i % 3) * 900, { parent_id: 1 }));
    }
    const roots = [pinned(1, 0, 0, { children: kids })];

    const result = OrgChart.layoutWithoutOutliers(roots, {});

    assert.ok(result.reverted.length <= 3, 'the round cap holds');
    assert.equal(result.placed.length, 12, 'and every card is still on the board');
});

test('the editor path never reverts anything', () => {
    // Only the kiosk clamps. The editor has to show the board as it really is,
    // or the person who can move the stray card never learns it is stray.
    const roots = [pinned(1, 100, 0, {
        children: [pinned(2, 0, 200, { parent_id: 1 }), pinned(4, 4000, 3000, { parent_id: 1 })],
    })];

    const placed = OrgChart.layout(roots, {});

    assert.equal(placedById(placed, 4).x, 4000);
    assert.equal(placedById(placed, 4).y, 3000);
});

test('seeding inside the kiosk frame keeps a wide row within it', () => {
    // What seedPositions() persists for a new organization. Eight siblings laid
    // out unbounded are ~1800px wide -- outside the frame from birth, which is
    // how the live board ended up needing a 0.46 scale.
    const roots = [withChildren(1, 8)];

    const seeded = OrgChart.layout(roots, {
        ignorePins: true,
        maxWidth: OrgChart.KIOSK_FRAME.width,
    });

    const box = OrgChart.bounds(seeded, {}, 0);
    assert.ok(box.width <= OrgChart.KIOSK_FRAME.width,
        `seeded ${box.width}px wide, frame is ${OrgChart.KIOSK_FRAME.width}px`);
});

/* ---- fitScale ---------------------------------------------------------
 *
 * The kiosk shows a chart at font-size x scale, so the scale IS the
 * legibility. These cover the floor that stops it running away: the board
 * used to render its names at ~8px on the glass, which is why the kiosk
 * stopped honouring editor pins in the first place.
 */

/** The kiosk's chart viewport at 768x1024, less .ob-card__body padding. */
const VIEWPORT = { width: 752, height: 829 };

test('fitScale never scales below the legibility floor', () => {
    // A chart three screens tall. Fitting it honestly would be ~0.33; the whole
    // point of the floor is that we refuse and let the visitor scroll instead.
    const fit = OrgChart.fitScale({ width: 600, height: 2500 }, VIEWPORT.width, VIEWPORT.height);

    assert.equal(fit.scale, OrgChart.MIN_SCALE);
    assert.ok(fit.scale > 829 / 2500, 'floor did not beat the honest fit ratio');
});

test('fitScale leaves nothing above or left of the viewport when the floor bites', () => {
    // The regression this guards: the offsets used to be "non-negative by
    // construction" because scale was bounded by the fit. With a floor they are
    // not, and a negative offset puts the top of the hierarchy permanently
    // off-screen on a panel that cannot be panned.
    const fit = OrgChart.fitScale({ width: 600, height: 2500 }, VIEWPORT.width, VIEWPORT.height);

    assert.ok(fit.offsetX >= 0, `offsetX ${fit.offsetX} clips the left edge`);
    assert.ok(fit.offsetY >= 0, `offsetY ${fit.offsetY} clips the top edge`);
    assert.equal(fit.offsetY, 0, 'an overflowing chart starts at the top, not centred');
});

test('fitScale reports whether the chart overflows its viewport', () => {
    const tall = OrgChart.fitScale({ width: 600, height: 2500 }, VIEWPORT.width, VIEWPORT.height);
    const small = OrgChart.fitScale({ width: 300, height: 300 }, VIEWPORT.width, VIEWPORT.height);

    assert.equal(tall.overflows, true, 'a floored chart must turn the scroll surface on');
    assert.equal(small.overflows, false, 'a chart that fits must not scroll');
});

test('fitScale still centres and caps a chart small enough to fit', () => {
    const fit = OrgChart.fitScale({ width: 200, height: 200 }, VIEWPORT.width, VIEWPORT.height);

    assert.equal(fit.scale, OrgChart.MAX_SCALE, 'a two-person org must not fill the panel');
    assert.ok(fit.offsetX > 0 && fit.offsetY > 0, 'a fitting chart is centred on both axes');
});

test('fitScale degrades safely on a viewport that has not been laid out yet', () => {
    // renderChart() runs before the deck has a width; a NaN scale here would
    // write `scale(NaN)` into the transform and blank the whole board.
    for (const args of [[0, 0], [VIEWPORT.width, 0], [NaN, NaN]]) {
        const fit = OrgChart.fitScale({ width: 600, height: 600 }, args[0], args[1]);
        assert.ok(Number.isFinite(fit.scale) && fit.scale > 0, `bad scale for ${args}`);
        assert.ok(Number.isFinite(fit.offsetX) && Number.isFinite(fit.offsetY));
    }
});

test('the live board shape is legible once it is laid out for a portrait panel', () => {
    // BOARD OF REGENTS: one chair, seven regents. Arranged on the editor's
    // desktop canvas its pins spanned x=0..1148, so the box was ~1424px wide in
    // a 752px slot -- scale 0.53, names on the glass at ~8px.
    const roots = [withChildren(1, 7)];
    const kiosk = { cardWidth: 260, cardHeight: 96, hGap: 24, vGap: 56 };

    const placed = OrgChart.layout(roots, Object.assign({
        ignorePins: true,
        maxWidth: VIEWPORT.width,
    }, kiosk));

    const box = OrgChart.bounds(placed, kiosk, 8);
    const fit = OrgChart.fitScale(box, VIEWPORT.width, VIEWPORT.height);

    assert.ok(box.width <= VIEWPORT.width, `${box.width}px wide in a ${VIEWPORT.width}px slot`);
    assert.ok(fit.scale >= 0.85,
        `scale ${fit.scale.toFixed(2)} is no better than the 0.53 this replaced`);
});
