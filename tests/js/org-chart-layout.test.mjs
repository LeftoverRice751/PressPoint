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
    for (const name of ['DEFAULTS', 'GRID', 'snap', 'layout', 'connectors', 'bounds', 'stageSize']) {
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
