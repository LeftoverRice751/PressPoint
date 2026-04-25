document.addEventListener("DOMContentLoaded", () => {
  const cards = Array.from(document.querySelectorAll(".feature-card"));
  const tickerTrack = document.getElementById("ticker-track");
  const kioskConfig = document.getElementById("kiosk-config");
  const pusherKey = (kioskConfig && kioskConfig.dataset.pusherKey) || "";
  const pusherCluster = (kioskConfig && kioskConfig.dataset.pusherCluster) || "mt1";
  const pusherScriptId = "welcome-pusher-script";
  let serverTodayKey = null;

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
      const fallback = `
        <span class="news-ticker__item">
          <span class="news-ticker__headline">Flash Updates</span>
          <span class="news-ticker__bullet">•</span>
          <span class="news-ticker__copy">No news or articles for today yet.</span>
        </span>
      `;

      tickerTrack.innerHTML = `
        <div class="news-ticker__group">${fallback}</div>
        <div class="news-ticker__group" aria-hidden="true">${fallback}</div>
      `;
      return;
    }

    const items = window.flashArticles
      .map(
        (article) => `
          <span class="news-ticker__item">
            <span class="news-ticker__headline">${escapeHtml(kindLabel(article.kind))}</span>
            <span class="news-ticker__bullet">•</span>
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
    ...(Array.isArray(window.initialFlashArticles) ? window.initialFlashArticles : []),
  ]);

  function kindLabel(kind) {
    const normalized = (kind || "").toString().trim().toLowerCase();
    if (normalized === "news") {
      return "NEWS";
    }
    if (normalized === "event") {
      return "EVENT";
    }
    return "UPDATE";
  }

  function loadPusherScript() {
    if (window.Pusher) {
      return Promise.resolve(window.Pusher);
    }

    return new Promise((resolve, reject) => {
      const existing = document.getElementById(pusherScriptId);
      if (existing) {
        existing.addEventListener("load", () => resolve(window.Pusher), { once: true });
        existing.addEventListener("error", reject, { once: true });
        return;
      }

      const script = document.createElement("script");
      script.id = pusherScriptId;
      script.src = "https://js.pusher.com/8.2.0/pusher.min.js";
      script.async = true;
      script.onload = () => resolve(window.Pusher);
      script.onerror = reject;
      document.head.appendChild(script);
    });
  }

  function localDateKey() {
    const now = new Date();
    const month = String(now.getMonth() + 1).padStart(2, "0");
    const day = String(now.getDate()).padStart(2, "0");
    return `${now.getFullYear()}-${month}-${day}`;
  }

  function currentTodayKey() {
    return serverTodayKey || localDateKey();
  }

  function setServerTodayKey(value) {
    const text = (value || "").toString().slice(0, 10);
    if (!text) {
      return;
    }
    serverTodayKey = text;
  }

  function normalizeItem(raw) {
    if (!raw || typeof raw !== "object") {
      return null;
    }

    const headline = (raw.headline || raw.title || "").toString().trim();
    const copy = (raw.copy || raw.description || "").toString().trim();
    const kind = (raw.kind || "update").toString().trim().toLowerCase();
    const occurredOn = (raw.occurred_on || "").toString().slice(0, 10);
    const todayKey = (raw.today_key || "").toString().slice(0, 10);

    if (!headline || !copy || !occurredOn) {
      return null;
    }

    return {
      headline,
      copy,
      kind,
      occurred_on: occurredOn,
      today_key: todayKey,
      uid: `${kind}|${occurredOn}|${headline}|${copy}`,
    };
  }

  function addFlashItem(raw) {
    const item = normalizeItem(raw);
    if (!item) {
      return;
    }

    if (item.today_key) {
      setServerTodayKey(item.today_key);
    }

    if (item.occurred_on !== currentTodayKey()) {
      return;
    }

    const existingIndex = window.flashArticles.findIndex((entry) => normalizeItem(entry)?.uid === item.uid);
    if (existingIndex >= 0) {
      window.flashArticles.splice(existingIndex, 1);
    }

    window.flashArticles.unshift(item);
    if (window.flashArticles.length > 20) {
      window.flashArticles.splice(20);
    }
  }

  function replaceFlashItems(items) {
    const normalized = Array.isArray(items) ? items.map(normalizeItem).filter(Boolean) : [];
    const filtered = normalized.filter((item) => item.occurred_on === currentTodayKey());

    window.flashArticles.splice(0, window.flashArticles.length, ...filtered);
  }

  function loadTodayFlashUpdates() {
    return fetch("/flash-updates/today", {
      headers: {
        Accept: "application/json",
      },
      cache: "no-store",
    })
      .then((response) => {
        if (!response.ok) {
          throw new Error("Unable to load flash updates");
        }
        return response.json();
      })
      .then((payload) => {
        setServerTodayKey(payload && payload.today_key);
        replaceFlashItems(payload && payload.items);
      })
      .catch(() => {
        replaceFlashItems(window.flashArticles);
      });
  }

  function bindRealtimeFlashUpdates() {
    if (!pusherKey) {
      return;
    }

    loadPusherScript()
      .then((Pusher) => {
        if (!Pusher) {
          return;
        }

        const pusher = new Pusher(pusherKey, { cluster: pusherCluster });
        const channel = pusher.subscribe("flash-updates-channel");

        channel.bind("app.events.NewNews", (data) => {
          addFlashItem(data);
        });

        channel.bind("app.events.NewEvent", (data) => {
          addFlashItem(data);
        });
      })
      .catch(() => {
        // Ignore realtime setup failures to keep ticker usable with HTTP fallback.
      });
  }

  function scheduleDailyRefresh() {
    setInterval(() => {
      loadTodayFlashUpdates();
    }, 60000);
  }

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
  loadTodayFlashUpdates();
  bindRealtimeFlashUpdates();
  scheduleDailyRefresh();
});
