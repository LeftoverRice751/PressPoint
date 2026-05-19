document.addEventListener("DOMContentLoaded", () => {
  const cards = Array.from(document.querySelectorAll(".feature-card"));
  const tickerTrack = document.getElementById("ticker-track");
  const configEl = document.getElementById("kiosk-config");
  const flashUpdatesUrl = configEl ? (configEl.getAttribute("data-flash-updates-url") || "").trim() : "";
  const pusherKey = configEl ? (configEl.getAttribute("data-pusher-key") || "").trim() : "";
  const cluster = configEl ? (configEl.getAttribute("data-pusher-cluster") || "mt1").trim() : "mt1";
  const flashUpdatesChannel = "flash-updates-channel";
  const flashUpdatesEvent = "new-news";
  const pusherScriptId = "welcome-flash-pusher-script";

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

    if (!window.flashArticles.length) {
      tickerTrack.innerHTML = "";
      return;
    }

    const items = window.flashArticles
      .map(
        (article) => `
          <span class="news-ticker__item">
            <span class="news-ticker__headline">${escapeHtml(article.headline)}</span>
            ${article.date ? `<span class="news-ticker__bullet">•</span><span class="news-ticker__date">${escapeHtml(article.date)}</span>` : ""}
            ${article.copy ? `<span class="news-ticker__bullet">•</span><span class="news-ticker__copy">${escapeHtml(article.copy)}</span>` : ""}
          </span>
        `,
      )
      .join("");

    tickerTrack.innerHTML = `
      <div class="news-ticker__group">${items}</div>
      <div class="news-ticker__group" aria-hidden="true">${items}</div>
    `;
  }

  function loadPusherScript() {
    if (window.Pusher) {
      return Promise.resolve(window.Pusher);
    }

    return new Promise((resolve, reject) => {
      const script = document.createElement("script");
      script.id = pusherScriptId;
      script.src = "https://js.pusher.com/8.2.0/pusher.min.js";
      script.async = true;
      script.onload = () => resolve(window.Pusher);
      script.onerror = reject;
      document.head.appendChild(script);
    });
  }

  function normalizeFlashArticle(payload) {
    const headline = payload && (payload.headline || payload.title) ? (payload.headline || payload.title) : "News update";
    const date = payload && (payload.date || payload.occured_on) ? (payload.date || payload.occured_on) : "";
    const copy = payload && (payload.copy || payload.description) ? (payload.copy || payload.description) : "";

    return {
      headline,
      date,
      copy,
    };
  }

  function prependFlashArticle(payload) {
    const article = normalizeFlashArticle(payload);
    const currentArticles = Array.isArray(window.flashArticles) ? [...window.flashArticles] : [];
    const nextArticles = [article, ...currentArticles].slice(0, 12);
    window.flashArticles = createReactiveArray(nextArticles);
    renderTicker();
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

  async function loadFlashArticles() {
    if (!flashUpdatesUrl) {
      window.flashArticles = createReactiveArray([]);
      renderTicker();
      return;
    }

    try {
      const response = await fetch(flashUpdatesUrl, {
        headers: {
          Accept: "application/json",
        },
        cache: "no-store",
        credentials: "same-origin",
      });

      const payload = response.ok ? await response.json() : { flash_articles: [] };
      const flashArticles = Array.isArray(payload.flash_articles) ? payload.flash_articles : [];
      window.flashArticles = createReactiveArray(flashArticles);
      renderTicker();
    } catch (error) {
      window.flashArticles = createReactiveArray([]);
      renderTicker();
    }
  }

  function initFlashUpdatesRealtime() {
    if (!pusherKey) {
      return;
    }

    loadPusherScript()
      .then((Pusher) => {
        if (!Pusher) {
          return;
        }

        const pusher = new Pusher(pusherKey, { cluster });
        const channel = pusher.subscribe(flashUpdatesChannel);

        channel.bind(flashUpdatesEvent, (payload) => {
          prependFlashArticle(payload || {});
        });
      })
      .catch(() => {
        return;
      });
  }

  window.flashArticles = createReactiveArray([]);

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
  loadFlashArticles();
  initFlashUpdatesRealtime();
  window.setInterval(loadFlashArticles, 15 * 1000);

  // ───────────────────────────────────────────────────────────────────────
  // Idle attract loop.
  //
  // After IDLE_MS of inactivity on the welcome screen, an editor-flagged
  // video plays full-bleed via the existing #kiosk-stage overlay. Any
  // pointer/key/wheel input wakes the kiosk and re-arms the countdown.
  // The bottom CTA is purely visual — the same global listeners catch
  // taps on it.
  // ───────────────────────────────────────────────────────────────────────
  const IDLE_MS = 20 * 1000;
  let idleTimer = null;
  let idleVideoSrc = null;
  let idleVideoTitle = "";
  let idleVideoPlaying = false;
  let pollingTimer = null;

  async function fetchIdleVideo() {
    try {
      const response = await fetch("/kiosk/idle-video", {
        headers: { Accept: "application/json" },
        cache: "no-store",
        credentials: "same-origin",
      });
      if (!response.ok) return;
      const payload = await response.json();
      idleVideoSrc = payload && payload.src ? payload.src : null;
      idleVideoTitle = (payload && payload.title) || "";
    } catch (error) {
      // Network blip — leave the previously-known src in place so the
      // attract loop still works during a momentary outage.
    }
  }

  function startIdleCountdown() {
    if (idleTimer) window.clearTimeout(idleTimer);
    if (idleVideoPlaying) return;
    if (!idleVideoSrc) return;
    idleTimer = window.setTimeout(playIdleAttract, IDLE_MS);
  }

  function playIdleAttract() {
    if (!idleVideoSrc) return;
    if (typeof window.__kioskPlaySrc !== "function") return;
    idleVideoPlaying = true;
    document.body.classList.add("kiosk-idle-active");
    window.__kioskPlaySrc(idleVideoSrc, idleVideoTitle);
  }

  function stopIdleAttract() {
    if (!idleVideoPlaying) return;
    idleVideoPlaying = false;
    document.body.classList.remove("kiosk-idle-active");
    if (typeof window.__kioskCloseVideo === "function") {
      window.__kioskCloseVideo();
    }
    // Re-arm the countdown immediately so a quick tap doesn't leave the
    // kiosk in attract limbo.
    startIdleCountdown();
  }

  function onUserActivity(e) {
    if (idleVideoPlaying) {
      if (e && typeof e.stopPropagation === "function") {
        e.stopPropagation();
      }
      stopIdleAttract();
      // Swallow the click that follows this pointerdown so no card fires
      document.addEventListener("click", function swallow(ev) {
        ev.stopPropagation();
        document.removeEventListener("click", swallow, true);
      }, true);
    } else {
      startIdleCountdown();
    }
  }

  ["pointerdown", "touchstart", "wheel", "keydown"].forEach((evt) => {
    document.addEventListener(evt, onUserActivity, { passive: true, capture: true });
  });

  // Initial fetch + first countdown. Re-poll every 60s so dashboard
  // changes to the flagged video propagate without a hard reload.
  fetchIdleVideo().then(startIdleCountdown);
  pollingTimer = window.setInterval(fetchIdleVideo, 60 * 1000);
});
