document.addEventListener("DOMContentLoaded", () => {
  const cards = Array.from(document.querySelectorAll(".feature-card"));
  const tickerTrack = document.getElementById("ticker-track");

  function escapeHtml(value) {
    return String(value)
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#39;");
  }

  function renderTicker() {
    if (!tickerTrack) {
      return;
    }

    const items = window.flashArticles
      .map(
        (article) => `
          <span class="news-ticker__item">
            <span class="news-ticker__headline">${escapeHtml(article.headline)}</span>
            <span class="news-ticker__bullet">•</span>
            <span class="news-ticker__copy">${escapeHtml(article.copy)}</span>
          </span>
        `,
      )
      .join("");

    tickerTrack.innerHTML = `
      <div class="news-ticker__group">${items}</div>
      <div class="news-ticker__group" aria-hidden="true">${items}</div>
    `;
  }

  function createReactiveArray(initialItems) {
    const target = [...initialItems];

    return new Proxy(target, {
      get(arrayTarget, property, receiver) {
        const value = Reflect.get(arrayTarget, property, receiver);

        if (
          typeof value === "function" &&
          ["push", "pop", "shift", "unshift", "splice", "sort", "reverse"].includes(property)
        ) {
          return (...args) => {
            const result = Array.prototype[property].apply(arrayTarget, args);
            renderTicker();
            return result;
          };
        }

        return value;
      },
      set(arrayTarget, property, value, receiver) {
        const result = Reflect.set(arrayTarget, property, value, receiver);
        if (property !== "length") {
          renderTicker();
        }
        return result;
      },
    });
  }

  window.flashArticles = createReactiveArray([
    { headline: "Campus Event", copy: "Student showcase starts at 10:00 AM." },
    { headline: "Library", copy: "Extended study hours are available tonight." },
    { headline: "Dining Hall", copy: "Fresh seasonal menu now serving." },
  ]);

  function setSelectedCard(activeCard) {
    cards.forEach((card) => {
      const isActive = card === activeCard;
      card.classList.toggle("is-selected", isActive);
      card.setAttribute("aria-pressed", String(isActive));
    });
  }

  cards.forEach((card) => {
    card.addEventListener("click", () => {
      setSelectedCard(card);
      const target = card.dataset.target;
      if (target) {
        window.location.href = target;
      }
    });
  });

  renderTicker();
});
