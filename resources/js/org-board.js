(function () {
  var root = document.querySelector('[data-org-board]');
  if (!root) return;

  var viewport = root.querySelector('[data-ob-viewport]');
  if (!viewport) return;

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
