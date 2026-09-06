document.addEventListener("DOMContentLoaded", () => {
  const tickerTrack = document.getElementById("ticker-track");
  const configEl = document.getElementById("kiosk-config");
  const flashUpdatesUrl = configEl ? (configEl.getAttribute("data-flash-updates-url") || "").trim() : "";
  const pusherKey = configEl ? (configEl.getAttribute("data-pusher-key") || "").trim() : "";
  const cluster = configEl ? (configEl.getAttribute("data-pusher-cluster") || "mt1").trim() : "mt1";
  const flashUpdatesChannel = "flash-updates-channel";
  const flashUpdatesEvent = "new-news";
  const pusherScriptId = "welcome-flash-pusher-script";

  // The status-bar clock lives in kiosk-clock.js, which every kiosk screen
  // loads. It used to be duplicated here as well and both ran — this file
  // rendered a long "FRIDAY, AUGUST 21" over the short tracked format the
  // design calls for, so the one the mockup specifies never survived.

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
      // The FLASH block is a fixed part of the masthead furniture, so an empty
      // track leaves an orange tab labelling nothing. Say what the band is for
      // instead — it fills again on the next `new-news` broadcast.
      tickerTrack.innerHTML =
        '<div class="news-ticker__group">' +
        '<span class="news-ticker__item news-ticker__item--empty">' +
        "Campus bulletins appear here as they are published." +
        "</span></div>";
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

  // No click handler for the cards: they are plain <a href> elements and the
  // browser navigates them itself. They used to be <button data-target> with a
  // location.href assignment here, which cost two things — the speculation
  // rules in welcome.html have no link to prerender on press, and a script
  // failure anywhere above this line left the whole menu dead.
  //
  // Nothing on this screen is ever "selected" either. The cards used to latch
  // an .is-selected maroon fill and aria-pressed="true" on tap. Both were
  // wrong: aria-pressed announces a toggle button, and the fill outlived the
  // click — coming back to the menu restores the page from the bfcache with
  // the class still set, so the card the *previous* visitor tapped stayed
  // highlighted for the next one, showing a selection nobody made. Tap
  // acknowledgement is the :active press state in welcome-screen.css instead,
  // which cannot outlive the finger.

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
  const IDLE_MS = 30 * 1000;
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
    // quiet=true: no "Now playing" banner. Nobody asked for the attract loop,
    // so it should arrive without announcing itself. An editor's Pusher push
    // still shows the banner.
    window.__kioskPlaySrc(idleVideoSrc, idleVideoTitle, true);
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

  // ── Swallowing the wake tap ────────────────────────────────────────────
  //
  // The attract video plays inside #kiosk-stage, a fixed inset:0 overlay at
  // z-index 9999, so the finger really does land on the video and not on the
  // menu. But stopIdleAttract() hides the stage on *pointerdown*, and the
  // browser resolves a click's target by hit-testing the DOM as it stands
  // when the finger *lifts*. By then the stage is display:none, so the click
  // lands on the <a class="feature-card"> underneath and the tap that merely
  // woke the kiosk opened Campus Map as well.
  //
  // This used to call stopPropagation() alone, which cannot help: propagation
  // and default actions are separate channels. Stopping propagation silences
  // listeners, but an anchor's navigation is its default action and only
  // preventDefault() cancels it. The guard worked back when the cards were
  // <button data-target> with a location.href handler — see the note at the
  // top of this file about why they became plain links.
  let swallowTimer = null;

  function releaseSwallow() {
    document.removeEventListener("click", swallowWakeClick, true);
    if (swallowTimer) {
      window.clearTimeout(swallowTimer);
      swallowTimer = null;
    }
  }

  function swallowWakeClick(ev) {
    ev.preventDefault();
    ev.stopPropagation();
    if (typeof ev.stopImmediatePropagation === "function") {
      ev.stopImmediatePropagation();
    }
    releaseSwallow();
  }

  function armSwallow() {
    releaseSwallow();
    document.addEventListener("click", swallowWakeClick, true);
    // A gesture that never becomes a click — a swipe, or a tap that drifts far
    // enough for the browser to drop it — used to leave this listener armed
    // forever, and it would then eat the visitor's next deliberate tap
    // instead. Expire well after the pointerdown→click gap of a real tap, and
    // well before anyone reaches for a second one.
    swallowTimer = window.setTimeout(releaseSwallow, 700);
  }

  function onUserActivity(e) {
    if (idleVideoPlaying) {
      if (e && typeof e.stopPropagation === "function") {
        e.stopPropagation();
      }
      stopIdleAttract();
      // Only a pointer gesture produces the stray click worth swallowing. A
      // wheel or keydown wake never will, so arming here would just leave a
      // swallower lying in wait for an unrelated tap.
      if (e && (e.type === "pointerdown" || e.type === "touchstart")) {
        armSwallow();
      }
    } else {
      startIdleCountdown();
    }
  }

  ["pointerdown", "touchstart", "wheel", "keydown"].forEach((evt) => {
    document.addEventListener(evt, onUserActivity, { passive: true, capture: true });
  });

  // Returning to the menu with the back bar restores this page from the
  // browser's back/forward cache (partials/kiosk-back.html routes the bar
  // through history.back() on purpose, to keep the ticker and scroll
  // position). A restore does NOT re-fire DOMContentLoaded, so none of the
  // setup above runs again — but the countdown armed before the visitor left
  // is still pending, and a frozen setTimeout resolves the instant the page
  // is unfrozen. The attract video therefore started immediately on every
  // back-tap, however long the visitor had been away.
  //
  // Re-arm from zero instead: tear down the stale timer, close the overlay if
  // the video did manage to start, and give the visitor the full IDLE_MS.
  window.addEventListener("pageshow", (event) => {
    if (!event.persisted) return;
    if (idleTimer) {
      window.clearTimeout(idleTimer);
      idleTimer = null;
    }
    stopIdleAttract();
    // A restore is a fresh interaction context: never let a swallower armed
    // before the visitor navigated away eat their first tap on the way back.
    releaseSwallow();
    startIdleCountdown();
  });

  // Initial fetch + first countdown. Re-poll every 60s so dashboard
  // changes to the flagged video propagate without a hard reload.
  fetchIdleVideo().then(startIdleCountdown);
  pollingTimer = window.setInterval(fetchIdleVideo, 60 * 1000);
});
