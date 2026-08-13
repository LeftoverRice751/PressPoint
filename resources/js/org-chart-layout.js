/**
 * Shared org-chart geometry.
 *
 * The dashboard editor and the public kiosk both run this module against the
 * same serialized member tree, so what an editor arranges is exactly what a
 * visitor sees. Nodes carrying pos_x/pos_y keep those coordinates; everything
 * else is placed by a tidy-tree pass.
 */
(function (global) {
  'use strict';

  var DEFAULTS = {
    cardWidth: 200,
    cardHeight: 96,
    hGap: 28,
    vGap: 72
  };

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
    var placed = [];
    var cursor = 0; // running left edge, in card-slot units

    function measure(node) {
      var kids = children(node);
      if (!kids.length) {
        return opts.cardWidth;
      }

      var total = 0;
      kids.forEach(function (child, index) {
        total += measure(child);
        if (index > 0) {
          total += opts.hGap;
        }
      });

      return Math.max(total, opts.cardWidth);
    }

    function place(node, left, depth, parentId) {
      var kids = children(node);
      var width = measure(node);
      var x = left + (width - opts.cardWidth) / 2;
      var y = depth * (opts.cardHeight + opts.vGap);

      if (isPinned(node)) {
        x = Number(node.pos_x);
        y = Number(node.pos_y);
      }

      placed.push({
        id: node.id,
        node: node,
        x: x,
        y: y,
        depth: depth,
        parentId: parentId === undefined ? null : parentId
      });

      var childLeft = left;
      kids.forEach(function (child) {
        var childWidth = measure(child);
        place(child, childLeft, depth + 1, node.id);
        childLeft += childWidth + opts.hGap;
      });

      return width;
    }

    (roots || []).forEach(function (root) {
      var width = place(root, cursor, 0, null);
      cursor += width + opts.hGap * 2;
    });

    return placed;
  }

  function byId(placed) {
    var lookup = {};
    (placed || []).forEach(function (item) {
      lookup[item.id] = item;
    });
    return lookup;
  }

  /**
   * Orthogonal elbow paths from each parent's bottom edge to its children's top
   * edge. Returns [{ from, to, d }] with `d` ready for an SVG <path>.
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

      var startX = parent.x + opts.cardWidth / 2;
      var startY = parent.y + opts.cardHeight;
      var endX = item.x + opts.cardWidth / 2;
      var endY = item.y;
      var midY = startY + Math.max((endY - startY) / 2, 12);

      paths.push({
        from: parent.id,
        to: item.id,
        d: 'M ' + startX + ' ' + startY +
           ' L ' + startX + ' ' + midY +
           ' L ' + endX + ' ' + midY +
           ' L ' + endX + ' ' + endY
      });
    });

    return paths;
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
      maxX = Math.max(maxX, item.x + opts.cardWidth);
      maxY = Math.max(maxY, item.y + opts.cardHeight);
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
    layout: layout,
    connectors: connectors,
    bounds: bounds,
    flatten: flatten,
    subtreeIds: subtreeIds,
    isPinned: isPinned
  };
})(window);
