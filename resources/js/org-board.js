(function () {
  var root = document.querySelector('[data-org-board]');
  if (!root) return;

  var viewport = root.querySelector('[data-ob-viewport]');
  if (!viewport) return;

  // ===== charts =====
  // Read-only mirror of the dashboard editor: the same OrgChart module lays out
  // the same coordinates, so visitors see exactly what an editor arranged.
  renderCharts();

  function renderCharts() {
    if (!window.OrgChart) return;

    var metrics = window.OrgChart.DEFAULTS;
    var charts = Array.prototype.slice.call(root.querySelectorAll('[data-ob-chart]'));

    charts.forEach(function (chart) {
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

      var placed = window.OrgChart.layout(members, metrics);
      if (!placed.length) return;

      var box = window.OrgChart.bounds(placed, metrics, 24);

      stage.style.width = box.width + 'px';
      stage.style.height = box.height + 'px';

      edges.setAttribute('viewBox', box.minX + ' ' + box.minY + ' ' + box.width + ' ' + box.height);
      edges.setAttribute('width', box.width);
      edges.setAttribute('height', box.height);
      edges.innerHTML = window.OrgChart.connectors(placed, metrics).map(function (path) {
        return '<path class="ob-chart__edge" d="' + path.d + '" />';
      }).join('');

      nodes.innerHTML = '';
      placed.forEach(function (item) {
        nodes.appendChild(buildNode(item, box, metrics));
      });

      fitChart(chart, stage, box);

      // A deck card has no usable size until the deck has laid itself out, so
      // refit whenever the container actually gets (or changes) its size.
      if ('ResizeObserver' in window) {
        new ResizeObserver(function () {
          fitChart(chart, stage, box);
        }).observe(chart);
      }
    });

    window.addEventListener('resize', function () {
      charts.forEach(function (chart) {
        var stage = chart.querySelector('[data-ob-chart-stage]');
        if (!stage || !stage.__obBox) return;
        fitChart(chart, stage, stage.__obBox);
      });
    });
  }

  function buildNode(item, box, metrics) {
    var member = item.node;
    var card = document.createElement('div');
    card.className = 'ob-chart__node';
    card.style.left = (item.x - box.minX) + 'px';
    card.style.top = (item.y - box.minY) + 'px';
    card.style.width = metrics.cardWidth + 'px';
    card.style.height = metrics.cardHeight + 'px';

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
   * Scale the chart to fit its deck card, but never below MIN_SCALE — past that
   * the names stop being readable from kiosk distance, so the card scrolls
   * instead. The spacer carries the scaled size so scrolling has real extents.
   */
  var MIN_SCALE = 0.55;

  function fitChart(chart, stage, box) {
    stage.__obBox = box;
    var width = chart.clientWidth;
    var height = chart.clientHeight;
    if (!width || !height) return;

    var scale = Math.max(Math.min(width / box.width, height / box.height, 1), MIN_SCALE);
    var scaledWidth = box.width * scale;
    var scaledHeight = box.height * scale;

    var spacer = chart.querySelector('[data-ob-chart-spacer]');
    if (spacer) {
      spacer.style.width = scaledWidth + 'px';
      spacer.style.height = scaledHeight + 'px';
    }

    stage.style.transform =
      'translate(' + Math.max((width - scaledWidth) / 2, 0) + 'px, ' +
      Math.max((height - scaledHeight) / 2, 0) + 'px) scale(' + scale + ')';
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
      nameLabel.textContent = cards[index].getAttribute('data-department-name') || '';
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
