/**
 * Shared org-chart geometry.
 *
 * The dashboard editor and the public kiosk both run this module against the
 * same serialized member tree, so what an editor arranges is exactly what a
 * visitor sees. Nodes carrying pos_x/pos_y keep those coordinates; everything
 * else is placed by a tidy-tree pass.
 *
 * Coordinates live in a *fixed* space whose origin is (0, 0) and which never
 * holds a negative value. That matters because the editor round-trips a
 * position through the pointer: it converts a drop point into canvas
 * coordinates, saves them, and must then render the card back under the
 * cursor. An origin defined by the content's own bounding box breaks that —
 * dragging a card past the current leftmost card moves minX, which shifts
 * every other card by the padding and drops the dragged card somewhere it was
 * not released. Callers that only *display* a chart (the kiosk) may still
 * translate by bounds() for a tight fit; a uniform translation preserves the
 * arrangement exactly.
 */
(function (global) {
  'use strict';

  // cardWidth/cardHeight are the *minimum* card box. A caller that can measure
  // its own DOM passes `measure` (see sizer) so a long name or a long position
  // gets a wider/taller card instead of an ellipsis; the geometry then follows
  // the real card rather than a fixed 200x96 slot.
  var DEFAULTS = {
    cardWidth: 200,
    cardHeight: 96,
    hGap: 28,
    vGap: 72
  };

  // Free-placed cards snap to this grid. It matches the dot-grid background of
  // .org-board-canvas (28px in gears-dashboard.css) so the snapping the editor
  // feels is the grid they can actually see.
  var GRID = 28;

  /** Snap to the canvas grid and keep the fixed origin non-negative. */
  function snap(value, grid) {
    var step = typeof grid === 'number' && grid > 0 ? grid : GRID;
    var numeric = Number(value);
    if (isNaN(numeric)) {
      numeric = 0;
    }
    return Math.max(0, Math.round(numeric / step) * step);
  }

  function options(overrides) {
    var merged = {};
    Object.keys(DEFAULTS).forEach(function (key) {
      merged[key] = DEFAULTS[key];
    });
    Object.keys(overrides || {}).forEach(function (key) {
      if (typeof overrides[key] === 'number' && !isNaN(overrides[key])) {
        merged[key] = overrides[key];
      }
    });
    return merged;
  }

  /**
   * Per-node size resolver. `overrides.measure(node)` may return
   * { width, height } in unscaled canvas pixels; anything missing or
   * non-positive falls back to the fixed card box, so a caller that cannot
   * measure (or measures before layout is possible) still gets the old
   * uniform grid.
   */
  function sizer(overrides, opts) {
    var measure = overrides && typeof overrides.measure === 'function'
      ? overrides.measure
      : null;

    return function (node) {
      var size = measure ? measure(node) : null;
      var width = size && typeof size.width === 'number' && size.width > 0
        ? size.width
        : opts.cardWidth;
      var height = size && typeof size.height === 'number' && size.height > 0
        ? size.height
        : opts.cardHeight;
      return { width: width, height: height };
    };
  }

  /* Placed items carry their own w/h; older payloads (or a caller that did not
     measure) fall back to the fixed box. */
  function itemWidth(item, opts) {
    return item && typeof item.w === 'number' && item.w > 0 ? item.w : opts.cardWidth;
  }

  function itemHeight(item, opts) {
    return item && typeof item.h === 'number' && item.h > 0 ? item.h : opts.cardHeight;
  }

  function isPinned(node) {
    return node
      && node.pos_x !== null && node.pos_x !== undefined && node.pos_x !== ''
      && node.pos_y !== null && node.pos_y !== undefined && node.pos_y !== '';
  }

  function children(node) {
    return (node && node.children) || [];
  }

  /**
   * Lay out a forest of root nodes.
   *
   * Returns a flat array of { id, node, x, y, parentId, depth } where x/y is the
   * top-left of the card in canvas space.
   */
  function layout(roots, overrides) {
    var opts = options(overrides);
    var sizeOf = sizer(overrides, opts);
    var placed = [];
    var cursor = 0; // running left edge, in canvas pixels

    // Each row sits below the tallest card of the row above it. With uniform
    // cards this is just depth * (cardHeight + vGap); with measured cards, a
    // single two-line name would otherwise overlap its own children.
    var rowHeights = [];

    function scan(nodes, depth) {
      (nodes || []).forEach(function (node) {
        var height = sizeOf(node).height;
        rowHeights[depth] = Math.max(rowHeights[depth] || 0, height);
        scan(children(node), depth + 1);
      });
    }

    scan(roots, 0);

    var rowTops = [];
    for (var depth = 0; depth < rowHeights.length; depth += 1) {
      rowTops[depth] = depth === 0
        ? 0
        : rowTops[depth - 1] + rowHeights[depth - 1] + opts.vGap;
    }

    /** Horizontal span a node's subtree needs, in pixels. */
    function span(node) {
      var own = sizeOf(node).width;
      var kids = children(node);
      if (!kids.length) {
        return own;
      }

      var total = 0;
      kids.forEach(function (child, index) {
        total += span(child);
        if (index > 0) {
          total += opts.hGap;
        }
      });

      return Math.max(total, own);
    }

    function place(node, left, depth, parentId) {
      var kids = children(node);
      var size = sizeOf(node);
      var width = span(node);
      var x = left + (width - size.width) / 2;
      var y = typeof rowTops[depth] === 'number'
        ? rowTops[depth]
        : depth * (opts.cardHeight + opts.vGap);

      placed.push({
        id: node.id,
        node: node,
        x: x,
        y: y,
        w: size.width,
        h: size.height,
        depth: depth,
        parentId: parentId === undefined ? null : parentId
      });

      var childLeft = left;
      kids.forEach(function (child) {
        var childWidth = span(child);
        place(child, childLeft, depth + 1, node.id);
        childLeft += childWidth + opts.hGap;
      });

      return width;
    }

    (roots || []).forEach(function (root) {
      var width = place(root, cursor, 0, null);
      cursor += width + opts.hGap * 2;
    });

    applyPins(placed);
    return placed;
  }

  /**
   * Resolve hand-placed coordinates over the tidy-tree result.
   *
   * A pin used to be applied to that one node only, which left its reports
   * behind at the position the auto pass had computed for them — drag a
   * manager and the elbows stretched across the canvas. Instead a pinned node
   * contributes the delta between where it was auto-placed and where it was
   * pinned, and that delta rides down to its descendants, so a subtree that
   * has never been touched moves as one piece. A descendant carrying its own
   * pin wins outright and starts a fresh delta for what hangs beneath it.
   *
   * `placed` is depth-first preorder, so every parent is resolved before the
   * children that read its offset — one forward pass is enough.
   */
  function applyPins(placed) {
    var offsets = {};

    placed.forEach(function (item) {
      var key = String(item.id);
      var inherited = offsets[String(item.parentId)] || { dx: 0, dy: 0 };

      if (isPinned(item.node)) {
        var pinX = Number(item.node.pos_x);
        var pinY = Number(item.node.pos_y);
        offsets[key] = { dx: pinX - item.x, dy: pinY - item.y };
        item.x = pinX;
        item.y = pinY;
        return;
      }

      item.x += inherited.dx;
      item.y += inherited.dy;
      offsets[key] = inherited;
    });

    // The fixed origin has no negative quadrant. Anything a pin pushed above
    // or left of it (including coordinates saved by the older bounds-relative
    // editor, which could go negative) is folded back by translating the whole
    // chart, which keeps every relative offset intact.
    var shiftX = 0;
    var shiftY = 0;
    placed.forEach(function (item) {
      shiftX = Math.min(shiftX, item.x);
      shiftY = Math.min(shiftY, item.y);
    });

    if (shiftX < 0 || shiftY < 0) {
      placed.forEach(function (item) {
        item.x -= shiftX;
        item.y -= shiftY;
      });
    }
  }

  function byId(placed) {
    var lookup = {};
    (placed || []).forEach(function (item) {
      lookup[item.id] = item;
    });
    return lookup;
  }

  /**
   * Orthogonal elbow paths between each parent and its children. Returns
   * [{ from, to, d }] with `d` ready for an SVG <path>.
   *
   * The path used to leave the parent's bottom edge and arrive at the child's
   * top edge unconditionally, which is only right while a tidy tree is putting
   * every child below its parent. On a free canvas a card can sit above or
   * beside the one it reports to, and that fixed elbow then doubled back
   * through both cards. Each edge now leaves and arrives on the pair of faces
   * that actually front each other.
   */
  function connectors(placed, overrides) {
    var opts = options(overrides);
    var lookup = byId(placed);
    var paths = [];

    (placed || []).forEach(function (item) {
      if (item.parentId === null || item.parentId === undefined) {
        return;
      }

      var parent = lookup[item.parentId];
      if (!parent) {
        return;
      }

      paths.push({
        from: parent.id,
        to: item.id,
        d: elbow(parent, item, opts)
      });
    });

    return paths;
  }

  /** Minimum stub length before an elbow turns, so corners stay readable. */
  var STUB = 12;

  function elbow(parent, child, opts) {
    var pw = itemWidth(parent, opts);
    var ph = itemHeight(parent, opts);
    var cw = itemWidth(child, opts);
    var ch = itemHeight(child, opts);

    var pTop = parent.y;
    var pBottom = parent.y + ph;
    var cTop = child.y;
    var cBottom = child.y + ch;

    // Child clears the parent downwards: the classic top-to-bottom elbow.
    if (cTop >= pBottom) {
      return verticalElbow(
        parent.x + pw / 2, pBottom,
        child.x + cw / 2, cTop
      );
    }

    // Child clears the parent upwards: the same elbow mirrored.
    if (cBottom <= pTop) {
      return verticalElbow(
        parent.x + pw / 2, pTop,
        child.x + cw / 2, cBottom
      );
    }

    // The two overlap vertically, so they read as side by side: run the edge
    // out of the facing vertical faces instead and turn on the x axis.
    var goesRight = (child.x + cw / 2) >= (parent.x + pw / 2);
    return horizontalElbow(
      goesRight ? parent.x + pw : parent.x, parent.y + ph / 2,
      goesRight ? child.x : child.x + cw, child.y + ch / 2
    );
  }

  function verticalElbow(startX, startY, endX, endY) {
    var midY = startY + (endY - startY) / 2;
    if (Math.abs(endY - startY) < STUB * 2) {
      midY = startY + (endY >= startY ? STUB : -STUB);
    }
    return 'M ' + startX + ' ' + startY +
           ' L ' + startX + ' ' + midY +
           ' L ' + endX + ' ' + midY +
           ' L ' + endX + ' ' + endY;
  }

  function horizontalElbow(startX, startY, endX, endY) {
    var midX = startX + (endX - startX) / 2;
    if (Math.abs(endX - startX) < STUB * 2) {
      midX = startX + (endX >= startX ? STUB : -STUB);
    }
    return 'M ' + startX + ' ' + startY +
           ' L ' + midX + ' ' + startY +
           ' L ' + midX + ' ' + endY +
           ' L ' + endX + ' ' + endY;
  }

  /** Canvas extents, padded, for fit-to-screen and SVG sizing. */
  function bounds(placed, overrides, padding) {
    var opts = options(overrides);
    var pad = typeof padding === 'number' ? padding : 48;

    if (!placed || !placed.length) {
      return { minX: 0, minY: 0, maxX: opts.cardWidth, maxY: opts.cardHeight, width: opts.cardWidth, height: opts.cardHeight };
    }

    var minX = Infinity;
    var minY = Infinity;
    var maxX = -Infinity;
    var maxY = -Infinity;

    placed.forEach(function (item) {
      minX = Math.min(minX, item.x);
      minY = Math.min(minY, item.y);
      maxX = Math.max(maxX, item.x + itemWidth(item, opts));
      maxY = Math.max(maxY, item.y + itemHeight(item, opts));
    });

    minX -= pad;
    minY -= pad;
    maxX += pad;
    maxY += pad;

    return {
      minX: minX,
      minY: minY,
      maxX: maxX,
      maxY: maxY,
      width: maxX - minX,
      height: maxY - minY
    };
  }

  /**
   * Canvas size measured from the fixed origin, for a stage that must keep
   * (0, 0) addressable. Unlike bounds(), this never shifts with the content —
   * it only ever grows to hold it — which is what lets a saved coordinate
   * render back under the cursor that dropped it.
   */
  function stageSize(placed, overrides, padding) {
    var opts = options(overrides);
    var pad = typeof padding === 'number' ? padding : 48;
    var width = 0;
    var height = 0;

    (placed || []).forEach(function (item) {
      width = Math.max(width, item.x + itemWidth(item, opts));
      height = Math.max(height, item.y + itemHeight(item, opts));
    });

    return { width: width + pad, height: height + pad };
  }

  /** Flatten a root list into every node it contains, depth-first. */
  function flatten(roots) {
    var out = [];

    function walk(node) {
      out.push(node);
      children(node).forEach(walk);
    }

    (roots || []).forEach(walk);
    return out;
  }

  /** Every id in a member's own subtree, including itself. */
  function subtreeIds(roots, memberId) {
    var ids = {};
    var found = null;

    function find(node) {
      if (found) return;
      if (String(node.id) === String(memberId)) {
        found = node;
        return;
      }
      children(node).forEach(find);
    }

    (roots || []).forEach(find);
    if (!found) {
      return ids;
    }

    flatten([found]).forEach(function (node) {
      ids[String(node.id)] = true;
    });

    return ids;
  }

  global.OrgChart = {
    DEFAULTS: DEFAULTS,
    GRID: GRID,
    snap: snap,
    layout: layout,
    connectors: connectors,
    bounds: bounds,
    stageSize: stageSize,
    flatten: flatten,
    subtreeIds: subtreeIds,
    isPinned: isPinned
  };
})(window);
