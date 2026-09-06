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

  /**
   * The shape the kiosk actually has for a chart, in unscaled canvas pixels.
   *
   * The editor canvas is a wide desktop strip and the kiosk is a 768x1024
   * portrait panel, so an arrangement that looked roomy to an editor came out
   * ~2.8:1 landscape and had to be scaled to ~0.46 to fit -- names at 6px. The
   * editor draws this rectangle behind the cards so a chart is arranged in the
   * proportion it will be shown in, and seeds new layouts inside it.
   *
   * It is a guide, not a clamp. The kiosk fits the content's own bounds, so a
   * chart that overflows still renders whole, just smaller -- and the editor
   * still shows a card exactly where it was dropped, because the person who
   * can move it back has to be able to see it.
   *
   * The numbers are the kiosk's chart area at 768x1024 once the page chrome is
   * slimmed (see the budget table in org-board.css): a full-bleed card, minus
   * its body padding, over the rows the masthead and the dock leave behind.
   */
  var KIOSK_FRAME = { width: 740, height: 820 };

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

  /* Shallow copy of an overrides bag plus a few extra keys. options() cannot do
     this -- it deliberately copies only keys that exist in DEFAULTS. */
  function merge(base, extra) {
    var out = {};
    Object.keys(base || {}).forEach(function (key) {
      out[key] = base[key];
    });
    Object.keys(extra || {}).forEach(function (key) {
      out[key] = extra[key];
    });
    return out;
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
   *
   * Two options are read straight off `overrides` (not through options(), which
   * only copies keys that exist in DEFAULTS) so the editor's call site keeps the
   * behaviour it has always had by simply not passing them:
   *
   *   maxWidth   -- cap the chart's width, reflowing wide sibling rows into
   *                 hanging stacks rather than letting the chart grow sideways
   *                 past its container. See boundedLayout(). No caller passes
   *                 this today; the kiosk used to, before it started mirroring
   *                 the editor's arrangement instead of reflowing it.
   *   ignorePins -- lay out from the hierarchy alone, ignoring pos_x/pos_y.
   *   skipPins   -- a { id: true } map of pins to ignore for this pass.
   *                 Unlike ignorePins, which is all or nothing, this is per
   *                 node: it is what lets a display surface drop one outlying
   *                 coordinate while honouring the rest of the arrangement.
   */
  function layout(roots, overrides) {
    var opts = options(overrides);
    var sizeOf = sizer(overrides, opts);
    var maxWidth = overrides && typeof overrides.maxWidth === 'number' && overrides.maxWidth > 0
      ? overrides.maxWidth
      : null;
    var ignorePins = !!(overrides && overrides.ignorePins);
    var skipPins = (overrides && overrides.skipPins) || null;

    if (maxWidth) {
      return boundedLayout(roots, opts, sizeOf, maxWidth, ignorePins, skipPins);
    }

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

    if (!ignorePins) {
      applyPins(placed, skipPins);
    }
    return placed;
  }

  /* ---- width-bounded layout -------------------------------------------
   *
   * The tidy-tree pass above grows sideways without limit: a parent's width is
   * the sum of its children's, so one row of eight VPs is ~2000px wide no
   * matter what it has to fit inside. On the kiosk that ran past the deck
   * card's edge and the chart was clipped, because scaling it down far enough
   * to fit made the names unreadable.
   *
   * Here a parent whose children do not fit within `maxWidth` hangs them in a
   * left-indented stack instead: the branch's width collapses to one card plus
   * the indent, and it grows downward, which is the axis a portrait kiosk has
   * to spare and the direction a touchscreen scrolls naturally. The decision is
   * per parent and recursive, so a branch that still fits keeps the classic
   * centred row and only the crowded one changes shape.
   */

  var INDENT = 32; // how far a hanging child sits right of its parent's left edge
  var TRUNK_INSET = 16; // where the comb's vertical trunk runs -- left of every child
  var STACK_GAP = 18; // vertical gap between hanging siblings

  /**
   * Bottom-up sizing pass. Returns a block tree carrying, per node, the size of
   * its own card, the total footprint of its subtree, and whether its children
   * hang. Sizing has to complete before placing because a parent is centred
   * over a row whose width depends on grandchildren.
   */
  function measureBlock(node, opts, sizeOf, maxWidth) {
    var size = sizeOf(node);
    var block = {
      node: node,
      size: size,
      kids: [],
      stacked: false,
      width: size.width,
      height: size.height,
      rowWidth: 0
    };

    var kids = children(node);
    if (!kids.length) {
      return block;
    }

    block.kids = kids.map(function (kid) {
      return measureBlock(kid, opts, sizeOf, maxWidth);
    });

    var rowWidth = 0;
    block.kids.forEach(function (kid, index) {
      rowWidth += kid.width + (index > 0 ? opts.hGap : 0);
    });

    if (rowWidth <= maxWidth) {
      var tallest = 0;
      block.kids.forEach(function (kid) {
        tallest = Math.max(tallest, kid.height);
      });
      block.rowWidth = rowWidth;
      block.width = Math.max(size.width, rowWidth);
      block.height = size.height + opts.vGap + tallest;
      return block;
    }

    var widest = 0;
    var stackHeight = 0;
    block.kids.forEach(function (kid, index) {
      widest = Math.max(widest, kid.width);
      stackHeight += kid.height + (index > 0 ? STACK_GAP : 0);
    });

    block.stacked = true;
    block.width = Math.max(size.width, INDENT + widest);
    block.height = size.height + STACK_GAP + stackHeight;
    return block;
  }

  /** Top-down placing pass over the block tree measureBlock() produced. */
  function placeBlock(block, left, top, parentId, depth, placed, opts) {
    var size = block.size;
    // A stacked parent anchors to the left edge of its block so the comb trunk
    // and the indent line up; a row parent centres over the row beneath it.
    var x = block.stacked ? left : left + (block.width - size.width) / 2;

    var item = {
      id: block.node.id,
      node: block.node,
      x: x,
      y: top,
      w: size.width,
      h: size.height,
      depth: depth,
      parentId: parentId === undefined ? null : parentId,
      stacked: false
    };
    placed.push(item);

    if (!block.kids.length) {
      return;
    }

    if (block.stacked) {
      // Read by connectors() to draw one trunk with a stub per child.
      item.trunkX = x + TRUNK_INSET;

      var childLeft = left + INDENT;
      var childTop = top + size.height + STACK_GAP;

      block.kids.forEach(function (kid) {
        var index = placed.length; // placeBlock pushes the child's item first
        placeBlock(kid, childLeft, childTop, block.node.id, depth + 1, placed, opts);
        placed[index].stacked = true;
        childTop += kid.height + STACK_GAP;
      });
      return;
    }

    var rowLeft = left + (block.width - block.rowWidth) / 2;
    var rowTop = top + size.height + opts.vGap;

    block.kids.forEach(function (kid) {
      placeBlock(kid, rowLeft, rowTop, block.node.id, depth + 1, placed, opts);
      rowLeft += kid.width + opts.hGap;
    });
  }

  function boundedLayout(roots, opts, sizeOf, maxWidth, ignorePins, skipPins) {
    var placed = [];
    var blocks = (roots || []).map(function (root) {
      return measureBlock(root, opts, sizeOf, maxWidth);
    });

    // Roots follow the same rule as siblings: side by side while they fit,
    // stacked once they do not, so a deck card holding several rootless
    // organizations never runs off its own edge either.
    var rowWidth = 0;
    blocks.forEach(function (block, index) {
      rowWidth += block.width + (index > 0 ? opts.hGap * 2 : 0);
    });

    if (rowWidth <= maxWidth) {
      var left = 0;
      blocks.forEach(function (block) {
        placeBlock(block, left, 0, null, 0, placed, opts);
        left += block.width + opts.hGap * 2;
      });
    } else {
      var top = 0;
      blocks.forEach(function (block) {
        placeBlock(block, 0, top, null, 0, placed, opts);
        top += block.height + opts.vGap;
      });
    }

    if (!ignorePins) {
      applyPins(placed, skipPins);
    }
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
   *
   * `skipPins` (optional) marks ids whose pin is to be treated as absent for
   * this pass. Going through here rather than editing coordinates afterwards is
   * the whole point: a skipped card takes its tidy-tree slot *and* its reports
   * come with it, because they read their offset from the resolution above.
   */
  function applyPins(placed, skipPins) {
    var offsets = {};

    placed.forEach(function (item) {
      var key = String(item.id);
      var inherited = offsets[String(item.parentId)] || { dx: 0, dy: 0 };

      if (isPinned(item.node) && !(skipPins && skipPins[key])) {
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
        d: item.stacked && typeof parent.trunkX === 'number'
          ? comb(parent, item, opts)
          : elbow(parent, item, opts)
      });
    });

    return paths;
  }

  /**
   * The hanging-stack connector: one vertical trunk down the parent's left
   * side, one horizontal stub into each child's left face.
   *
   * elbow() cannot draw these. It turns at the vertical midpoint between the
   * two cards, which for the third child in a stack is a horizontal line at a
   * height the first two cards occupy -- so a naive stack draws its edges
   * straight through its own siblings. The trunk runs at parent.x +
   * TRUNK_INSET, and every child starts at parent.x + INDENT, so the trunk is
   * left of all of them and crosses nothing however deep the stack gets.
   */
  function comb(parent, child, opts) {
    var midY = child.y + itemHeight(child, opts) / 2;
    return 'M ' + parent.trunkX + ' ' + (parent.y + itemHeight(parent, opts)) +
           ' L ' + parent.trunkX + ' ' + midY +
           ' L ' + child.x + ' ' + midY;
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

  /* ---- fitting a chart to a screen -------------------------------------
   *
   * A displayed chart is uniformly scaled, so what a visitor actually reads is
   * `font-size * scale`. That makes the scale a legibility number, not a layout
   * detail, and it is why it lives here beside the geometry rather than in the
   * kiosk's render loop: it is the one value worth having tests around.
   */

  /**
   * How far a small chart may be scaled up.
   *
   * Without a cap a two-person organization would be blown up to fill a
   * 768x1024 panel; without any upscaling at all it would sit marooned in the
   * middle of it. The stage is transformed, not re-rasterised, so text stays
   * crisp either way.
   */
  var MAX_SCALE = 1.6;

  /**
   * How far a large chart may be scaled *down* -- the legibility floor.
   *
   * There deliberately used to be none: the kiosk neither scrolled nor zoomed,
   * so a floor would have clipped, and clipping a chart nobody can pan puts
   * part of it permanently out of reach. The cost was that legibility degraded
   * without limit -- the live board rendered its names at ~8px on the glass,
   * unreadable for the elderly visitors the campus terminal is there for.
   *
   * With the chart's own viewport made scrollable, the trade reverses: an
   * oversized chart is now scrolled rather than shrunk, and a floor costs a
   * visitor a swipe instead of costing them the text.
   */
  var MIN_SCALE = 0.85;

  /**
   * Scale and centre `box` inside a `width` x `height` viewport.
   *
   * Returns { scale, offsetX, offsetY, overflows }. `overflows` tells the
   * caller the floor bit and the viewport has to become a scroll surface;
   * ignoring it would clip, which is the failure mode the floor is trading
   * against.
   *
   * Offsets are clamped at 0. They used to be non-negative by construction --
   * true only while the scale was bounded by the fit on both axes, which is
   * exactly the premise MIN_SCALE removes. Unclamped, an overflowing chart
   * centres to a negative offset and hangs the top of the hierarchy off the
   * screen, where the visitor cannot scroll back up to it.
   */
  function fitScale(box, width, height) {
    var boxWidth = box && box.width > 0 ? box.width : 1;
    var boxHeight = box && box.height > 0 ? box.height : 1;
    var viewWidth = Number(width);
    var viewHeight = Number(height);

    // A chart still inside a deck card the browser has not laid out yet has no
    // viewport to fit to. Render at natural size rather than propagating a NaN
    // into the transform, which would blank the whole board; the caller re-fits
    // once a ResizeObserver gives it real numbers.
    if (!isFinite(viewWidth) || !isFinite(viewHeight) || viewWidth <= 0 || viewHeight <= 0) {
      return { scale: 1, offsetX: 0, offsetY: 0, overflows: false };
    }

    var fit = Math.min(viewWidth / boxWidth, viewHeight / boxHeight);
    var scale = Math.min(Math.max(fit, MIN_SCALE), MAX_SCALE);

    var scaledWidth = boxWidth * scale;
    var scaledHeight = boxHeight * scale;

    return {
      scale: scale,
      offsetX: Math.max(0, (viewWidth - scaledWidth) / 2),
      offsetY: Math.max(0, (viewHeight - scaledHeight) / 2),
      // Sub-pixel slack: a chart that fits to within a pixel is not worth
      // handing a scrollbar to.
      overflows: scaledWidth > viewWidth + 1 || scaledHeight > viewHeight + 1
    };
  }

  /* ---- outlier pins ----------------------------------------------------
   *
   * NOTHING CALLS THESE ANY MORE. Kept, with their tests, only so the removal
   * is a separate commit from the behaviour change that stranded them.
   *
   * They were the kiosk's defence against one card parked far from the rest:
   * the kiosk rendered the editor's coordinates and scaled the result to fit,
   * so a stray pin cost every *other* card its legibility and the visitor could
   * not pan or zoom to compensate. Finding that card and laying out as if it had
   * never been pinned bought back some scale.
   *
   * It was never enough. The problem was not one stray card, it was that a
   * whole desktop-canvas arrangement does not fit a portrait panel -- so the
   * kiosk now ignores pins outright and lays out for its own screen (see
   * org-board.js). With no pins to revert there is no outlier to find.
   *
   * The editor deliberately never called them either. It has to show the board
   * as it really is, or the person who can move a stray card never learns it is
   * stray.
   */

  /* How much larger than its own tidy-tree footprint an arrangement may be
     before we go looking for a card parked away from the cluster. Spreading a
     chart out is a legitimate editorial act; 1.6 leaves room for it and trips
     only on a coordinate that is an order of magnitude out of place. */
  var SPREAD_TOLERANCE = 1.6;

  /* Share of the board's *area* one card's subtree must account for by itself
     to be called an outlier. Area, not distance: a card can sit far from the
     others and cost nothing if it is inside the box the rest already need. */
  var OUTLIER_SHARE = 0.18;

  /* A card holding most of the chart cannot be the outlier -- removing it
     "shrinks" the box only because it removed the chart. */
  var OUTLIER_MAX_SUBTREE = 0.5;

  /* Reverts per chart. Each round costs a layout pass; three is well past what
     a real board needs and makes a pathological input bounded. */
  var OUTLIER_ROUNDS = 3;

  function area(box) {
    return Math.max(box.width, 0) * Math.max(box.height, 0);
  }

  /** Size of every item's own subtree, keyed by id. */
  function subtreeSizes(placed) {
    var sizes = {};
    // placed is depth-first preorder, so walking it backwards visits every
    // child before its parent and one pass accumulates the whole tree.
    for (var i = placed.length - 1; i >= 0; i -= 1) {
      var key = String(placed[i].id);
      sizes[key] = (sizes[key] || 0) + 1;
      var parent = String(placed[i].parentId);
      if (placed[i].parentId !== null && placed[i].parentId !== undefined) {
        sizes[parent] = (sizes[parent] || 0) + sizes[key];
      }
    }
    return sizes;
  }

  /** Ids in an item's subtree, read off the placed array rather than the tree. */
  function placedSubtree(placed, rootId) {
    var ids = {};
    ids[String(rootId)] = true;
    placed.forEach(function (item) {
      if (ids[String(item.parentId)]) {
        ids[String(item.id)] = true;
      }
    });
    return ids;
  }

  /**
   * The one pinned card most responsible for the chart's size, or [].
   *
   * At most one per call: reverting a pin re-resolves every descendant, which
   * can change which of the remainder still looks like an outlier.
   */
  function outlierPins(placed, referenceBox, overrides) {
    if (!placed || placed.length < 3) {
      return [];
    }

    var box = bounds(placed, overrides, 0);
    if (referenceBox
        && box.width <= referenceBox.width * SPREAD_TOLERANCE
        && box.height <= referenceBox.height * SPREAD_TOLERANCE) {
      return []; // a normally-shaped chart never reaches the per-card work
    }

    var whole = area(box);
    if (whole <= 0) {
      return [];
    }

    var sizes = subtreeSizes(placed);
    var best = null;
    var bestShare = 0;

    placed.forEach(function (item) {
      if (!isPinned(item.node)) {
        return;
      }
      if ((sizes[String(item.id)] || 1) / placed.length > OUTLIER_MAX_SUBTREE) {
        return;
      }

      // Exclude the whole subtree, not just the card: a manager dragged to a
      // far corner takes their reports with them, so removing the manager
      // alone would show almost no shrinkage and the outlier would hide.
      var excluded = placedSubtree(placed, item.id);
      var rest = placed.filter(function (other) {
        return !excluded[String(other.id)];
      });
      if (!rest.length) {
        return;
      }

      var share = 1 - area(bounds(rest, overrides, 0)) / whole;
      if (share > bestShare) {
        bestShare = share;
        best = item.id;
      }
    });

    return bestShare >= OUTLIER_SHARE && best !== null ? [best] : [];
  }

  /**
   * layout() with the arrangement honoured, minus any hand-placed coordinate
   * inflating the board on its own.
   *
   * Returns { placed, reverted } -- `reverted` is the ids whose pins were
   * dropped, so a caller can log or badge them.
   */
  function layoutWithoutOutliers(roots, overrides) {
    var fallback = layout(roots, merge(overrides, { ignorePins: true, skipPins: null }));
    var referenceBox = bounds(fallback, overrides, 0);
    var placed = layout(roots, overrides);
    var skipPins = {};
    var reverted = [];

    for (var round = 0; round < OUTLIER_ROUNDS; round += 1) {
      var found = outlierPins(placed, referenceBox, overrides);
      if (!found.length) {
        break;
      }

      var next = merge(skipPins, {});
      next[String(found[0])] = true;
      var candidate = layout(roots, merge(overrides, { skipPins: next }));

      // Keep a revert only if it actually helped. applyPins() ends in a global
      // negative-fold, so a revert is not arithmetically guaranteed to shrink
      // the box; accepting only strict improvements makes the loop monotone,
      // and its termination no longer rests on the round cap alone.
      if (area(bounds(candidate, overrides, 0)) >= area(bounds(placed, overrides, 0))) {
        break;
      }

      skipPins = next;
      reverted.push(found[0]);
      placed = candidate;
    }

    return { placed: placed, reverted: reverted };
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
    KIOSK_FRAME: KIOSK_FRAME,
    GRID: GRID,
    MIN_SCALE: MIN_SCALE,
    MAX_SCALE: MAX_SCALE,
    snap: snap,
    layout: layout,
    connectors: connectors,
    bounds: bounds,
    stageSize: stageSize,
    fitScale: fitScale,
    flatten: flatten,
    subtreeIds: subtreeIds,
    isPinned: isPinned,
    outlierPins: outlierPins,
    layoutWithoutOutliers: layoutWithoutOutliers
  };
})(window);
