(function () {
  var root = document.querySelector('[data-org-board]');
  if (!root) return;

  var viewport = root.querySelector('[data-ob-viewport]');
  if (!viewport) return;

  // ===== charts =====
  // The kiosk lays the hierarchy out for the screen it actually has, from the
  // parent/child tree alone, and ignores the editor's hand-placed coordinates.
  //
  // It used to render those coordinates verbatim -- "what an editor arranges is
  // what a visitor sees". The trouble is that they are arranged on a wide
  // desktop canvas and shown on a 768x1024 portrait panel. The live board's
  // pins ran to x=1148, giving a ~1424x500 box in a ~752x829 slot: width bound
  // the fit at scale 0.53, names reached the glass at ~8px, and 40% of the
  // available height went unused. Raising the font sizes could not fix that --
  // a bigger card widens the box and the fit divides the gain straight back
  // out. The aspect ratio was the problem, so the aspect ratio is what changed.
  //
  // OrgChart's `maxWidth` pass reflows a row too wide to fit into a hanging
  // comb, trading horizontal growth for the vertical room a portrait panel has
  // spare. Editors keep their free-placement canvas; it just no longer decides
  // where a card lands on the kiosk.

  /**
   * Padding bounds() adds around the content, on each side.
   *
   * Small on purpose. With both axes fitted and the stage centred in its card,
   * the leftover space already reads as margin, and every padded pixel is paid
   * for out of the scale the chart is rendered at.
   */
  var BOX_PAD = 8;

  /**
   * Floor for the width a chart is laid out against.
   *
   * A card narrower than this is not a screen anyone reads a chart on; laying
   * out to it would produce a comb one card wide and taller than the document.
   */
  var MIN_LAYOUT_WIDTH = 320;

  renderCharts();

  function renderCharts() {
    if (!window.OrgChart) return;

    var charts = Array.prototype.slice.call(root.querySelectorAll('[data-ob-chart]'));

    charts.forEach(function (chart) {
      renderChart(chart);

      // A deck card has no usable size until the deck has laid itself out, and
      // the layout now *depends* on that width: the comb hangs a row only once
      // it does not fit. So a resize is only a re-fit while the width is
      // unchanged -- a new width has to go all the way back through the layout,
      // or a chart laid out against the 740px fallback would keep that shape on
      // a screen with room for a wider row.
      if ('ResizeObserver' in window) {
        new ResizeObserver(function () {
          var stage = chart.querySelector('[data-ob-chart-stage]');
          if (!stage || !stage.__obBox || stage.__obLayoutWidth !== layoutWidth(chart)) {
            renderChart(chart);
            return;
          }
          fitChart(chart, stage, stage.__obBox);
        }).observe(chart);
      }
    });

    window.addEventListener('resize', function () {
      charts.forEach(renderChart);
    });
  }

  function renderChart(chart) {
    var script = chart.querySelector('[data-ob-chart-data]');
    var stage = chart.querySelector('[data-ob-chart-stage]');
    var edges = chart.querySelector('[data-ob-chart-edges]');
    var nodes = chart.querySelector('[data-ob-chart-nodes]');
    if (!script || !stage || !edges || !nodes) return;

    var members;
    try {
      members = JSON.parse(script.textContent || '[]');
    } catch (error) {
      return;
    }

    // Cards are a fixed width but a content height -- a two-line position wraps
    // and grows the card -- so their geometry only exists once they are in the
    // DOM: build them hidden, measure, then lay out. Anything that measures 0
    // (chart still hidden in a collapsed deck card) falls back to the fixed card
    // box inside OrgChart.
    nodes.innerHTML = '';
    var elements = {};
    var sizes = {};
    var flat = window.OrgChart.flatten(members);

    flat.forEach(function (member) {
      var card = buildNode(member);
      card.style.visibility = 'hidden';
      nodes.appendChild(card);
      elements[String(member.id)] = card;
    });

    flat.forEach(function (member) {
      var card = elements[String(member.id)];
      var width = card.offsetWidth;
      var height = card.offsetHeight;
      sizes[String(member.id)] = width > 0 && height > 0
        ? { width: width, height: height }
        : null;
    });

    var chartMetrics = {};
    Object.keys(window.OrgChart.DEFAULTS).forEach(function (key) {
      chartMetrics[key] = window.OrgChart.DEFAULTS[key];
    });
    chartMetrics.measure = function (member) {
      return sizes[String(member.id)] || null;
    };

    // cardWidth/cardHeight are the fallback box for a card that measured 0 -- a
    // chart still inside a deck card the browser has not laid out yet -- and
    // must stay in step with .ob-chart__node's min-width/min-height in
    // org-board.css.
    //
    // hGap/vGap used to be dead weight: every chart was fully pinned, because
    // the editor's seedPositions() writes coordinates the first time an
    // organization is opened, and applyPins then overwrote every x/y. Ignoring
    // the pins puts the tidy-tree pass back in charge, so these are now the
    // real spacing of the rendered board. They are generous on purpose -- the
    // gap between two cards is what makes a reporting line readable at a
    // glance, and the comb has vertical room to spend.
    chartMetrics.cardWidth = 560;
    chartMetrics.cardHeight = 96;
    chartMetrics.hGap = 24;
    chartMetrics.vGap = 56;

    // Lay out against the width the chart really has. Two things follow: a row
    // is hung into a comb exactly when it would not have fitted, and the
    // resulting box is about one viewport wide, so fitScale lands near 1.0 --
    // which means the font sizes in org-board.css are very nearly the pixel
    // sizes a visitor reads, rather than being divided by an unknown fit.
    var frame = layoutWidth(chart);
    chartMetrics.ignorePins = true;
    chartMetrics.maxWidth = Math.max(frame - 2 * BOX_PAD, MIN_LAYOUT_WIDTH);

    var placed = window.OrgChart.layout(members, chartMetrics);
    if (!placed.length) return;
    stage.__obLayoutWidth = frame;

    var box = window.OrgChart.bounds(placed, chartMetrics, BOX_PAD);

    stage.style.width = box.width + 'px';
    stage.style.height = box.height + 'px';

    edges.setAttribute('viewBox', box.minX + ' ' + box.minY + ' ' + box.width + ' ' + box.height);
    edges.setAttribute('width', box.width);
    edges.setAttribute('height', box.height);
    edges.innerHTML = window.OrgChart.connectors(placed, chartMetrics).map(function (path) {
      return '<path class="ob-chart__edge" d="' + path.d + '" />';
    }).join('');

    placed.forEach(function (item) {
      var card = elements[String(item.id)];
      if (!card) return;
      card.style.left = (item.x - box.minX) + 'px';
      card.style.top = (item.y - box.minY) + 'px';
      card.style.visibility = '';
    });

    fitChart(chart, stage, box);
  }

  function buildNode(member) {
    var card = document.createElement('div');
    card.className = 'ob-chart__node';

    var avatar = document.createElement('div');
    avatar.className = 'ob-chart__avatar';
    if (member.photo_path) {
      var img = document.createElement('img');
      img.src = '/storage/' + member.photo_path;
      img.alt = member.name;
      img.loading = 'lazy';
      avatar.appendChild(img);
    } else {
      var initials = document.createElement('span');
      initials.className = 'ob-chart__initials';
      initials.setAttribute('aria-hidden', 'true');
      initials.textContent = (member.name || '?').trim().charAt(0).toUpperCase() || '?';
      avatar.appendChild(initials);
    }

    var info = document.createElement('div');
    info.className = 'ob-chart__info';

    var name = document.createElement('div');
    name.className = 'ob-chart__name';
    name.textContent = member.name;

    var position = document.createElement('div');
    position.className = 'ob-chart__position';
    position.textContent = member.position || 'Member';

    info.appendChild(name);
    info.appendChild(position);
    card.appendChild(avatar);
    card.appendChild(info);
    return card;
  }

  /**
   * The width a chart is laid out against.
   *
   * Falls back to the kiosk frame rather than to 0: renderChart() runs before
   * the deck has laid itself out, and laying out to 0 would hang every single
   * card into its own comb row. The ResizeObserver re-runs the layout as soon
   * as a real width arrives.
   */
  function layoutWidth(chart) {
    return chart.clientWidth || window.OrgChart.KIOSK_FRAME.width;
  }

  /**
   * Scale the chart to fit its deck card, centre it, and size the scroll extent.
   *
   * The arithmetic is OrgChart.fitScale(), which owns the MIN_SCALE floor that
   * keeps the hierarchy readable on a board too big to fit. When that floor
   * bites the chart is larger than its card, and the card has to scroll --
   * .ob-chart__stage is absolutely positioned and transformed, so it creates no
   * scrollable overflow of its own and a static spacer stands in for it.
   */
  function fitChart(chart, stage, box) {
    stage.__obBox = box;
    var width = chart.clientWidth;
    var height = chart.clientHeight;
    if (!width || !height) return;

    var fit = window.OrgChart.fitScale(box, width, height);

    stage.style.transform =
      'translate(' + fit.offsetX + 'px, ' + fit.offsetY + 'px) scale(' + fit.scale + ')';

    var extent = chart.querySelector('[data-ob-chart-extent]');
    if (extent) {
      extent.style.width = (box.width * fit.scale) + 'px';
      extent.style.height = (box.height * fit.scale) + 'px';
    }

    // Only a chart that actually overflows becomes a scroll surface. Left on
    // permanently it would swallow a vertical touch that the deck's own swipe
    // wants, on the far more common board that fits in one screen.
    chart.classList.toggle('is-scrollable', fit.overflows);
  }

  var cards = Array.prototype.slice.call(root.querySelectorAll('[data-ob-card]'));
  if (!cards.length) return;

  var prevBtn = root.querySelector('[data-ob-prev]');
  var nextBtn = root.querySelector('[data-ob-next]');
  var dots = Array.prototype.slice.call(root.querySelectorAll('[data-ob-dot]'));
  var nameLabel = root.querySelector('[data-ob-current-name]');
  var indexLabel = root.querySelector('[data-ob-current-index]');

  var activeIndex = 0;

  function setActive(index, scroll) {
    if (index < 0) index = 0;
    if (index > cards.length - 1) index = cards.length - 1;
    activeIndex = index;

    dots.forEach(function (dot, i) {
      dot.classList.toggle('is-active', i === index);
      dot.setAttribute('aria-selected', i === index ? 'true' : 'false');
    });

    if (nameLabel) {
      nameLabel.textContent = cards[index].getAttribute('data-organization-name') || '';
    }
    if (indexLabel) {
      indexLabel.textContent = String(index + 1);
    }

    if (prevBtn) prevBtn.disabled = index === 0;
    if (nextBtn) nextBtn.disabled = index === cards.length - 1;

    if (scroll) {
      cards[index].scrollIntoView({ behavior: 'smooth', inline: 'center', block: 'nearest' });
    }
  }

  if ('IntersectionObserver' in window) {
    var observer = new IntersectionObserver(
      function (entries) {
        var best = null;
        entries.forEach(function (entry) {
          if (!entry.isIntersecting) return;
          if (!best || entry.intersectionRatio > best.intersectionRatio) {
            best = entry;
          }
        });
        if (!best) return;
        var idx = cards.indexOf(best.target);
        if (idx !== -1 && idx !== activeIndex) {
          setActive(idx, false);
        }
      },
      {
        root: viewport,
        threshold: [0.45, 0.6, 0.8]
      }
    );
    cards.forEach(function (card) {
      observer.observe(card);
    });
  }

  if (prevBtn) {
    prevBtn.addEventListener('click', function () {
      setActive(activeIndex - 1, true);
    });
  }
  if (nextBtn) {
    nextBtn.addEventListener('click', function () {
      setActive(activeIndex + 1, true);
    });
  }

  dots.forEach(function (dot) {
    dot.addEventListener('click', function () {
      var idx = parseInt(dot.getAttribute('data-index') || '0', 10);
      setActive(idx, true);
    });
  });

  var isDown = false;
  var startX = 0;
  var startScroll = 0;
  var moved = false;

  viewport.addEventListener('mousedown', function (event) {
    // A chart that overflows scrolls vertically again (see fitChart), but this
    // handler still takes every drag: it only ever reads pageX and writes
    // scrollLeft, so the two axes do not contest each other. Touch never
    // reaches here at all -- there are no touch listeners and nothing calls
    // preventDefault, so the browser scrolls the chart natively while the deck
    // keeps the horizontal swipe. A mouse scrolls the chart with the wheel.
    isDown = true;
    moved = false;
    startX = event.pageX;
    startScroll = viewport.scrollLeft;
    viewport.classList.add('is-dragging');
  });

  window.addEventListener('mouseup', function () {
    if (!isDown) return;
    isDown = false;
    viewport.classList.remove('is-dragging');
  });

  window.addEventListener('mousemove', function (event) {
    if (!isDown) return;
    var dx = event.pageX - startX;
    if (Math.abs(dx) > 4) moved = true;
    viewport.scrollLeft = startScroll - dx;
  });

  viewport.addEventListener('click', function (event) {
    if (moved) {
      event.preventDefault();
      event.stopPropagation();
      moved = false;
    }
  }, true);

  window.addEventListener('keydown', function (event) {
    if (event.key === 'ArrowLeft') {
      setActive(activeIndex - 1, true);
    } else if (event.key === 'ArrowRight') {
      setActive(activeIndex + 1, true);
    }
  });

  setActive(0, false);
})();
