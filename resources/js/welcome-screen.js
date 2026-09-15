/*
 * Kiosk menu (welcome screen): flash ticker, destination carousel, idle attract.
 *
 * NOTE: do not `import 'swiper/css'` here — laravel-mix extracts JS-imported
 * CSS to storage/compiled/js/<entry>.css, which nothing links, and that file
 * silently shadows the real stylesheet. The bundle CSS is vendored by
 * webpack.mix.js to /assets/css/swiper-bundle.min.css and welcome.html links
 * it by hand. Same rule as kiosk-archives.js.
 */

import Swiper from "swiper";
import {
  // No EffectCoverflow: coverflow's translateZ pushes the peeking slides
  // *behind* .swiper-wrapper, so side taps stop hit-testing — that is the
  // whole reason mobile-archives.js carries ~60 lines of hand-rolled side-tap
  // handling. The flat default slide effect keeps every slide clickable.
  // No Manipulation either: this menu is a fixed six and is never filtered,
  // so appendSlide/removeAllSlides would be dead weight in the bundle.
  Navigation,
  Keyboard,
  A11y,
} from "swiper/modules";
import { tickerDurationSeconds } from "./ticker-pace.mjs";

document.addEventListener("DOMContentLoaded", () => {
  const tickerTrack = document.getElementById("ticker-track");
  const configEl = document.getElementById("kiosk-config");
  const flashUpdatesUrl = configEl ? (configEl.getAttribute("data-flash-updates-url") || "").trim() : "";
  const pusherKey = configEl ? (configEl.getAttribute("data-pusher-key") || "").trim() : "";
  const cluster = configEl ? (configEl.getAttribute("data-pusher-cluster") || "mt1").trim() : "mt1";
  const pusherHost = configEl ? (configEl.getAttribute("data-pusher-host") || "").trim() : "";
  const pusherPort = configEl ? (configEl.getAttribute("data-pusher-port") || "").trim() : "";
  const liveChannelName = "kiosk-content";
  const liveEventName = "app.events.KioskSectionChanged";
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
    paceTicker();
  }

  // The keyframes travel one content copy, so the CSS duration is the speed:
  // it has to follow the measured width or a busy news day scrolls
  // unreadably fast (see ticker-pace.mjs). Measured on the next frame
  // because innerHTML has not been laid out yet at this point, and the
  // first group's width is read rather than the track's so the gap between
  // the copies never counts as content.
  function paceTicker() {
    const raf = window.requestAnimationFrame || ((fn) => window.setTimeout(fn, 16));
    raf(() => {
      const group = tickerTrack.querySelector(".news-ticker__group");
      const width = group ? group.getBoundingClientRect().width : 0;
      tickerTrack.style.setProperty("--ticker-duration", `${tickerDurationSeconds(width)}s`);
    });
  }

  // Hosted pusher.com by default. With PUSHER_HOST set the same client talks
  // to a self-hosted Pusher-protocol server (Soketi) through nginx, with TLS
  // terminating there -- so forceTLS follows the page's own scheme.
  function pusherOptions() {
    const options = { cluster };
    if (pusherHost) {
      options.wsHost = pusherHost;
      options.wsPort = Number(pusherPort) || 80;
      options.wssPort = Number(pusherPort) || 443;
      options.forceTLS = window.location.protocol === "https:";
      options.enabledTransports = ["ws", "wss"];
    }
    return options;
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

  // One socket per terminal. The flash ticker and the live content updates
  // share it; a second connection would just be a second thing to reconnect.
  // kioskLive is declared further down with the attract state it reads; it is
  // only touched inside the async .then(), by which point it exists.
  function initRealtime() {
    if (!pusherKey) {
      return;
    }

    loadPusherScript()
      .then((Pusher) => {
        if (!Pusher) {
          return;
        }

        const pusher = new Pusher(pusherKey, pusherOptions());

        const flash = pusher.subscribe(flashUpdatesChannel);
        flash.bind(flashUpdatesEvent, (payload) => {
          prependFlashArticle(payload || {});
        });

        if (kioskLive) {
          const live = pusher.subscribe(liveChannelName);
          live.bind(liveEventName, (payload) => {
            kioskLive.onEvent(payload || {});
          });
        }
      })
      .catch(() => {
        return;
      });
  }

  window.flashArticles = createReactiveArray([]);

  // The cards are plain <a href> elements. They used to be <button
  // data-target> with a location.href assignment here, which cost two things —
  // the speculation rules in welcome.html have no link to prerender on press,
  // and a script failure anywhere above this line left the whole menu dead.
  // With no JS at all the six anchors are still a working menu.
  //
  // That's MORE true now than it used to be, not less: a tap on a side card
  // still only re-centres it (the capture-phase listener further down
  // preventDefault()s that click), but a tap on the already-centred card is
  // no longer intercepted at all — the anchor's own default navigation is
  // once again the actual mechanism that carries the visitor to the
  // destination, the same as it would with no JS running at all. There used
  // to be a separate stage VIEW button that was the only thing that ever
  // navigated; it's gone, so the anchors are doing real work again.
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
  initRealtime();
  window.setInterval(loadFlashArticles, 15 * 1000);

  // ───────────────────────────────────────────────────────────────────────
  // The carousel IS the navigation.
  //
  // Whatever is centred is what is rendered in the content frame above. There
  // is no preview and no commit step: swipe, arrow, or tap a card, and that
  // section is already there.
  //
  // This used to be browse-then-commit — the centred card was mirrored into a
  // `.wc-stage` preview (title, icon, blurb) and only a VIEW link actually
  // opened it. All five gestures in the spec resolve to the same thing,
  // Swiper's activeIndex, so they all now go through one handler and none
  // needs special-casing.
  // ───────────────────────────────────────────────────────────────────────
  const carouselEl = document.querySelector("[data-wc-swiper]");

  let menuSwiper = null;

  // Where the carousel starts. Server-rendered from the URL, so
  // /kiosk/virtual-tour arrives with the tour both centred and already loaded
  // in the frame — the carousel and the content can never disagree on the
  // first paint.
  const initialIndex = (() => {
    const raw = configEl ? parseInt(configEl.getAttribute("data-active-index"), 10) : NaN;
    return Number.isInteger(raw) && raw >= 0 ? raw : 0;
  })();

  function activeSlideId() {
    if (!menuSwiper || !menuSwiper.slides) return null;
    const slide = menuSwiper.slides[menuSwiper.activeIndex];
    return slide && slide.dataset ? slide.dataset.menuId || null : null;
  }

  /*
   * Commit-on-settle.
   *
   * A ~180ms debounce sits between the carousel moving and the content
   * changing, and it is doing two jobs, not one:
   *
   *   1. A fast swipe across four cards must load ONE document, not four.
   *   2. More importantly, it must write ONE history entry, not four.
   *      Without that, Back would step the visitor through every card their
   *      finger flew past — a history stack that reads as broken rather than
   *      merely wasteful.
   *
   * Short enough to still feel immediate (the spec's "responsiveness >
   * animation"), long enough that a flick never commits a card nobody chose.
   */
  const COMMIT_DELAY_MS = 180;
  let commitTimer = null;

  // Set while kiosk-content.js is driving the carousel from a popstate. The
  // slideTo() it performs fires slideChange like any other move, and without
  // this guard that would push a fresh history entry for a Back the browser
  // has already performed — Back would then walk in place forever.
  let suppressCommit = false;

  function scheduleCommit() {
    if (suppressCommit) return;
    if (!window.__kioskContent) return;

    if (commitTimer) window.clearTimeout(commitTimer);
    commitTimer = window.setTimeout(() => {
      commitTimer = null;
      const id = activeSlideId();
      if (id) window.__kioskContent.show(id);
    }, COMMIT_DELAY_MS);
  }

  // Activate a card immediately, skipping the debounce. Used for a direct tap
  // or keyboard activation, where the visitor has named the destination
  // outright rather than scrubbing past it — waiting 180ms there would be a
  // lag with nothing to absorb.
  function commitNow(id) {
    if (!window.__kioskContent) return false;
    if (commitTimer) {
      window.clearTimeout(commitTimer);
      commitTimer = null;
    }
    return window.__kioskContent.show(id);
  }

  // ───────────────────────────────────────────────────────────────────────
  // The menu drawer.
  //
  // The carousel folds away so the content can have its 230px. On a 768x1024
  // panel the shell spends 480px on chrome, and Campus Map then stacks another
  // ~258px of its own inside the frame — its live Leaflet viewport is 285px,
  // 28% of the physical screen. Collapsing this band takes the content from
  // 544px to 774px and the map from 285px to 516px.
  //
  // The band's size is pure CSS (flex-basis, see .wc-carousel); this only owns
  // the state attribute and the things CSS cannot do — the accessible name, the
  // pressed state, and removing a clipped carousel from the tab order.
  //
  // Deliberately in this file rather than a bundle of its own: the drawer has
  // to cooperate with the Swiper instance and with the attract loop that
  // re-opens it, and both live here and nowhere else.
  // ───────────────────────────────────────────────────────────────────────
  const shellEl = document.querySelector(".kiosk-shell");
  const navToggleEl = document.querySelector("[data-wc-nav-toggle]");
  const navPanelEl = document.getElementById("kiosk-menu");

  function setNavExpanded(expanded) {
    if (!shellEl) return;

    shellEl.setAttribute("data-nav", expanded ? "expanded" : "collapsed");

    if (navToggleEl) {
      navToggleEl.setAttribute("aria-expanded", expanded ? "true" : "false");
      // The name says what pressing it will DO, not what state it is in — the
      // state is already carried by aria-expanded, and announcing both leaves a
      // screen-reader user to work out which is which.
      navToggleEl.setAttribute(
        "aria-label",
        expanded ? "Hide the kiosk menu" : "Show the kiosk menu",
      );
    }

    if (navPanelEl) {
      // #kiosk-menu is the carousel TRACK, not the whole band — the handle is
      // the band's first row and must stay live, or the control that undoes
      // the collapse would go inert along with it.
      //
      // inert rather than CSS: overflow:hidden clips the cards but leaves them
      // focusable, so a keyboard visitor could tab into six links they cannot
      // see and watch the kiosk navigate for no visible reason.
      navPanelEl.toggleAttribute("inert", !expanded);
    }

    // Insurance, not a fix: the swiper's height is pinned in CSS precisely so
    // its measurements do not change when the band collapses. If a later edit
    // unpins it, this is what stops the carousel coming back mis-measured.
    if (expanded && menuSwiper && typeof menuSwiper.update === "function") {
      menuSwiper.update();
    }
  }

  function navExpanded() {
    return !shellEl || shellEl.getAttribute("data-nav") !== "collapsed";
  }

  if (navToggleEl) {
    navToggleEl.addEventListener("click", () => {
      setNavExpanded(!navExpanded());
    });
  }

  if (carouselEl && carouselEl.querySelector(".swiper-slide")) {
    menuSwiper = new Swiper(carouselEl, {
      modules: [Navigation, Keyboard, A11y],
      slidesPerView: "auto",
      centeredSlides: true,
      // From the URL, via data-active-index on #kiosk-config — NOT a constant.
      // The shell is served at all six section paths, so /kiosk/virtual-tour
      // has to arrive with the tour centred as well as loaded in the frame;
      // a hardcoded index would show Campus Map's card over the tour's
      // content. See KioskShellController.shell_context.
      initialSlide: initialIndex,
      slideToClickedSlide: true,
      speed: 420,
      grabCursor: true,
      keyboard: { enabled: true },
      navigation: {
        prevEl: "[data-wc-prev]",
        nextEl: "[data-wc-next]",
        disabledClass: "is-disabled",
      },
      watchSlidesProgress: true,
    });

    // Swiping and the arrows both land here: any move of the carousel is a
    // section change, committed once the visitor settles (see scheduleCommit).
    menuSwiper.on("slideChange", scheduleCommit);

    // ── Card activation ──────────────────────────────────────────────────
    //
    // There used to be ~70 lines of tap discrimination here, snapshotting
    // activeIndex on a capture-phase pointerdown so a tap on a SIDE card
    // could be told from a tap on the ALREADY-centred one: the first only
    // re-centred, and only the second was allowed to navigate. Commits
    // f52b85e / 86747f0 / 881e017 were all fixes to that machinery.
    //
    // It is gone because the distinction it drew no longer exists. The
    // carousel is the navigation now, so re-centring a card IS opening it —
    // there is no second, committing gesture for a first tap to be
    // distinguished from. Keeping the snapshot would mean a tap on a side
    // card centred it and then deliberately refused to show it, which is
    // exactly the "press View" step this change removes.
    //
    // Swiper's own slideToClickedSlide still does the centring, and its
    // preventClicks still swallows the synthetic click a drag emits, so a
    // swipe never reaches this listener at all.
    carouselEl.addEventListener(
      "click",
      (ev) => {
        const card = ev.target && ev.target.closest ? ev.target.closest(".feature-card") : null;
        if (!card) return;

        // Let a modified click (middle-click, ctrl/cmd-click) do what the
        // browser would: open the section's own URL in a new tab. That URL
        // serves the shell, so it opens a whole working kiosk rather than a
        // bare fragment.
        if (ev.button !== 0 || ev.metaKey || ev.ctrlKey || ev.shiftKey || ev.altKey) return;

        const id = card.dataset ? card.dataset.menuId : null;
        if (!id) return;

        // Centre it, then render it. slideTo() fires slideChange, which would
        // schedule a debounced commit for this same section; commitNow()
        // cancels that timer, so a direct tap is immediate rather than waiting
        // out a debounce it does not need.
        const index = Array.prototype.indexOf.call(menuSwiper.slides, card);
        if (index !== -1 && index !== menuSwiper.activeIndex) menuSwiper.slideTo(index);

        // preventDefault ONLY if the content frame actually took it. With
        // kiosk-content.js absent (an older cached shell, or the bundle
        // failing to load) the anchor navigates to the section's own URL
        // exactly as it always did — the same no-JS guarantee the cards have
        // always carried, and why they are still real links.
        if (commitNow(id)) ev.preventDefault();
      },
      true,
    );

    // kiosk-content.js moves the carousel on popstate; suppressCommit stops
    // that move from pushing a duplicate history entry for a Back the browser
    // has already performed. The section is already rendered by the time this
    // fires — this only keeps the strip in sync with it.
    document.addEventListener("kiosk-content:change", (ev) => {
      const index = ev.detail ? ev.detail.index : -1;
      if (!menuSwiper || typeof index !== "number" || index < 0) return;
      if (index === menuSwiper.activeIndex) return;

      suppressCommit = true;
      menuSwiper.slideTo(index);
      // Released after Swiper has emitted slideChange for the move above.
      // A rAF rather than setTimeout(0): Swiper emits synchronously during
      // slideTo, so one painted frame is more than enough and cannot land
      // inside the same task as a later, genuine gesture.
      window.requestAnimationFrame(() => {
        suppressCommit = false;
      });
    });
  }

  // ───────────────────────────────────────────────────────────────────────
  // Idle attract loop.
  //
  // After KIOSK_IDLE_TIMEOUT of inactivity on the welcome screen the kiosk
  // shows an attract screen. Two modes, one timer:
  //   - an editor has flagged an idle video → it plays full-bleed via the
  //     existing #kiosk-stage overlay, exactly as before;
  //   - otherwise → the newsletter (/kiosk/latest-news) fills #kiosk-attract
  //     in a lazily-injected iframe. This is the fallback, so the countdown
  //     now always arms.
  // Any pointer/key/wheel input wakes the kiosk and re-arms the countdown.
  // The bottom CTA in either overlay is purely visual — the same global
  // listeners catch taps on it.
  // ───────────────────────────────────────────────────────────────────────

  // The one place to change how long the kiosk waits before attracting.
  //
  // This is now the kiosk's ONLY navigating idle timer. The content pages used
  // to run their own and reset themselves to /kiosk; framed inside this shell
  // that would have loaded the kiosk inside its own content area. They report
  // activity upward instead (see the kiosk-content:activity listener below),
  // so the countdown here is the single authority. The in-page timers that
  // merely close a page's own overlays — the map's 60s pane reset, About's
  // return to its hub — are untouched, because they never navigate.
  const KIOSK_IDLE_TIMEOUT = 30 * 1000;

  // The EMBED path, not /kiosk/latest-news — that now serves this very shell,
  // so framing it would nest the whole kiosk inside its own attract overlay.
  //
  // Same-origin document, so it is a normal navigation for the service worker
  // (sw-kiosk.js isKioskDocument() matches /kiosk/*, and an iframe load IS
  // mode:'navigate') and it is precached by partials/kiosk-sw.html — the
  // attract screen has to render with the campus link down.
  const ATTRACT_SRC = "/kiosk/embed/latest-news";

  let idleTimer = null;
  let idleVideoSrc = null;
  let idleVideoTitle = "";
  // Covers *both* attract modes. It used to be idleVideoPlaying, back when the
  // video was the only attract screen; every wake/guard path below asks the
  // same question of both.
  let attractShowing = false;
  let pollingTimer = null;

  const attractEl = document.getElementById("kiosk-attract");
  const attractFrameHost = document.getElementById("kiosk-attract-frame");
  let attractIframe = null;

  // Which attract is on screen. kiosk-live.js needs to know, because a
  // latest-news event has to re-src the newsletter iframe (the thing a
  // passer-by is looking at) but must never interrupt the idle video.
  let attractMode = null; // 'video' | 'newsletter' | null

  function evictSection(section) {
    // Invisible and idempotent, so it is never deferred. Without it a frame
    // reload would re-serve sw-kiosk.js's stale-while-revalidate copy.
    if (!("serviceWorker" in navigator) || !navigator.serviceWorker.controller) return;
    navigator.serviceWorker.controller.postMessage({ type: "EVICT", section });
  }

  function reloadContentFrame(section) {
    if (!window.__kioskContent || typeof window.__kioskContent.reload !== "function") return false;
    return window.__kioskContent.reload(section);
  }

  function reloadAttractFrame() {
    if (attractIframe) attractIframe.setAttribute("src", ATTRACT_SRC);
  }

  // Absent in the node test harnesses (no kiosk-live.js loaded), and then
  // every live-update branch below is simply skipped.
  const kioskLive =
    typeof window.__kioskLiveCreate === "function"
      ? window.__kioskLiveCreate({
          evict: evictSection,
          reloadContent: reloadContentFrame,
          reloadAttract: reloadAttractFrame,
          isAttract: () => attractShowing,
          attractMode: () => attractMode,
        })
      : null;

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
    if (attractShowing) return;
    // The countdown always arms now, even though content is always showing.
    // It used to be parked while a destination was open, back when opening one
    // was a deliberate act the visitor could also undo; with the carousel as
    // the navigation there is no "closed" state to return to, so an unattended
    // terminal left on the map would never attract again.
    //
    // What makes that safe is the activity relay: a touch inside the content
    // frame never reaches this document's listeners, so the framed page posts
    // one up (see the kiosk-content:activity listener) and it re-arms the
    // countdown exactly as a touch on the shell would.
    //
    // There is deliberately no `if (!idleVideoSrc) return;` here any more.
    // The countdown used to be video-only, so an unflagged kiosk never armed
    // it at all; the newsletter is now the fallback attract screen, so the
    // timer must arm whether or not an editor has flagged a video. Which of
    // the two shows is decided at fire time, in playIdleAttract().
    idleTimer = window.setTimeout(playIdleAttract, KIOSK_IDLE_TIMEOUT);
  }

  // Lazily injected, never written into welcome.html: an iframe present at
  // render would pull /kiosk/latest-news on every menu load — a second full
  // page (Quill bodies, images) behind a hidden overlay most visitors never
  // reach. On later attracts the src is reassigned so the newsletter is
  // freshly rendered; an editor may have published since the last idle.
  function showNewsletterAttract() {
    if (!attractEl || !attractFrameHost) return false;

    if (!attractIframe) {
      attractIframe = document.createElement("iframe");
      // Empty title + aria-hidden + tabindex=-1: this is decoration over a
      // menu that is still the real document underneath, so it must not
      // announce itself to a screen reader or take focus. #kiosk-attract is
      // aria-hidden in the markup for the same reason.
      attractIframe.setAttribute("title", "");
      attractIframe.setAttribute("aria-hidden", "true");
      attractIframe.setAttribute("tabindex", "-1");
      attractIframe.setAttribute("src", ATTRACT_SRC);
      attractFrameHost.replaceChildren(attractIframe);
    } else {
      attractIframe.setAttribute("src", ATTRACT_SRC);
    }

    attractEl.hidden = false;
    // Drives the "Touch to begin" CTA's breathe animation
    // (body.kiosk-idle-active .kiosk-idle-cta in welcome-screen.css).
    document.body.classList.add("kiosk-idle-active");
    return true;
  }

  // ── Warm the whole kiosk while nobody is using it ──────────────────────
  //
  // The service worker can only precache what a document actually loaded, so
  // until now a destination stayed uncached until somebody visited it: the
  // first visitor of the day paid full price for every screen, and a terminal
  // whose campus link dropped overnight could only offer whatever had been
  // opened before it went. The kiosk is idle most of the day and its
  // destinations are a known, fixed six, so the attract screen is free time to
  // fetch all of them.
  //
  // Once per boot, not per attract: the documents are stale-while-revalidate,
  // so every later visit refreshes them anyway, and repeating a six-document
  // sweep every 30 seconds of idle would be a busy kiosk pretending to be an
  // idle one.
  let routesPrecached = false;

  function precacheAllDestinations() {
    if (routesPrecached) return;
    // typeof, not a bare read: this runs from playIdleAttract(), which the
    // idle test harnesses drive directly in Node, where `navigator` does not
    // exist at all on the versions this repo builds under.
    if (typeof navigator === "undefined" || !navigator.serviceWorker) return;

    const worker = navigator.serviceWorker.controller;
    if (!worker) return;

    // data-menu-embed, NOT href. The cards' hrefs are the section paths, and
    // every one of those serves this same shell — sweeping them would cache
    // six copies of the menu and not one byte of the content the frame loads.
    const routes = Array.prototype.map
      .call(document.querySelectorAll(".feature-card"), (card) =>
        card.getAttribute("data-menu-embed"),
      )
      .filter((path) => path && path.charAt(0) === "/");
    if (!routes.length) return;

    routesPrecached = true;

    const send = () => worker.postMessage({ type: "PRECACHE_ROUTES", routes });

    // Never precache the kiosk out of its own storage. The archives are the
    // bulk of what is held and the most expensive to rebuild (hundreds of
    // rasterised pages), so a sweep that pushed the origin over quota would
    // evict exactly the thing worth keeping to cache six documents.
    if (!navigator.storage || !navigator.storage.estimate) {
      send();
      return;
    }

    navigator.storage
      .estimate()
      .then((estimate) => {
        const quota = estimate && estimate.quota;
        const usage = estimate && estimate.usage;
        if (quota && usage && usage / quota > 0.8) return;
        send();
      })
      .catch(send);
  }

  function playIdleAttract() {
    if (attractShowing) return;

    // Behind the attract overlay, so the swap is never seen — and before the
    // flag below is set, so the reset isn't mistaken for visitor activity.
    const contentJustNavigated = resetContentToDefault();

    // Now unattended: flush any section an editor changed while a visitor
    // was reading. FIRST — before the video and before the route warm-up
    // below — because a post-eviction reload is a real network fetch and the
    // browser issues requests in program order. Issued after the idle video's
    // Range stream and six PRECACHE_ROUTES fetches it queued behind all of
    // them: on the single-threaded dev server it starved for over a minute,
    // and on production it was simply the last thing served. The content
    // frame was just reset above only if it moved, and kiosk-live skips the
    // redundant reload in that case.
    if (kioskLive) kioskLive.onAttract({ contentJustNavigated });

    if (idleVideoSrc && typeof window.__kioskPlaySrc === "function") {
      attractShowing = true;
      attractMode = "video";
      document.body.classList.add("kiosk-idle-active");
      // quiet=true: no "Now playing" banner. Nobody asked for the attract
      // loop, so it should arrive without announcing itself. An editor's
      // Pusher push still shows the banner.
      window.__kioskPlaySrc(idleVideoSrc, idleVideoTitle, true);
    } else if (showNewsletterAttract()) {
      // No video flagged (or kiosk.js never loaded, so there is no player):
      // fall back to the newsletter. If even that host element is missing the
      // kiosk simply stays on the menu rather than latching a flag it can
      // never clear.
      attractShowing = true;
      attractMode = "newsletter";
    }

    // Last: the warm-up is free time, so it must never get ahead of anything
    // a visitor could see.
    precacheAllDestinations();
  }

  // An unattended terminal shouldn't greet the next visitor with whatever the
  // last one left half-finished — a zoomed panorama, a route to somebody
  // else's building, page 40 of an issue. Attracting is the point at which the
  // previous session is over, so the content goes back to the default section.
  //
  // push:false: this is a reset, not somewhere the visitor navigated, so it
  // must not add a history entry (and must not make Back walk into the section
  // they abandoned).
  function resetContentToDefault() {
    // The menu comes back up with it. The drawer is deliberately sticky while
    // somebody is using the terminal — collapse it once and it stays down
    // across every section — so attracting is the only thing that re-opens it,
    // and the only reason the next visitor is not met by a kiosk with no
    // visible way to navigate.
    setNavExpanded(true);

    if (!window.__kioskContent) return false;
    const fallback = window.__kioskContent.defaultId();
    if (!fallback || window.__kioskContent.current() === fallback) return false;
    window.__kioskContent.show(fallback, { push: false });
    return true;
  }

  function stopIdleAttract() {
    attractShowing = false;
    attractMode = null;
    document.body.classList.remove("kiosk-idle-active");
    // Close BOTH paths unconditionally, not just the one we think is open.
    // The bfcache re-arm below calls this blind on restore, and a mode that
    // was left showing but not flagged (a poll that flipped modes mid-attract,
    // say) would otherwise stay on screen over the menu forever.
    if (typeof window.__kioskCloseVideo === "function") {
      window.__kioskCloseVideo();
    }
    if (attractEl) {
      attractEl.hidden = true;
    }
    // The iframe is left loaded on purpose: hiding the overlay is enough, and
    // tearing it down would cost a full re-render on every wake. Its src is
    // reassigned on the next showNewsletterAttract() to pick up new stories.
    //
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
    if (attractShowing) {
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

  // Activity inside the content frame.
  //
  // Events do not cross a frame boundary, so every listener above is blind to
  // a visitor panning the map, turning a page or dragging the panorama — this
  // document looks completely idle while somebody is actively using it, and
  // would drop the attract screen on them mid-gesture. The framed page relays
  // a throttled signal up (see the bridge in partials/kiosk-back.html) and
  // kiosk-content.js re-emits it here.
  //
  // Deliberately NOT routed through onUserActivity: that also handles waking
  // FROM attract, and a relayed message is not a real gesture. The attract
  // iframe carries pointer-events:none precisely so the wake tap lands on this
  // document instead, and letting a message dismiss the overlay would fight
  // the click-swallowing that keeps the wake tap from also activating a card.
  document.addEventListener("kiosk-content:activity", () => {
    if (attractShowing) return;
    startIdleCountdown();
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
  // the video did manage to start, and give the visitor the full
  // KIOSK_IDLE_TIMEOUT.
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
