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
  initFlashUpdatesRealtime();
  window.setInterval(loadFlashArticles, 15 * 1000);

  // ───────────────────────────────────────────────────────────────────────
  // Destination carousel.
  //
  // Browse-then-commit: the strip below the stage is a scrubber, not six
  // equal taps. Whatever is centred is mirrored up into .wc-stage, and only
  // the stage's VIEW link navigates. Structure mirrors kiosk-archives.js —
  // same modules, same slideToClickedSlide + centeredSlides shape, same
  // "sync the detail panel from the active slide's dataset" split.
  // ───────────────────────────────────────────────────────────────────────
  const carouselEl = document.querySelector("[data-wc-swiper]");
  const stageEl = document.querySelector("[data-wc-stage]");
  const stageTitleEl = document.querySelector("[data-wc-title]");
  const stageIconEl = document.querySelector("[data-wc-icon]");
  const stageBlurbEl = document.querySelector("[data-wc-blurb]");

  let menuSwiper = null;

  // The stage never re-declares a title, a blurb or a route: it copies them
  // off the active anchor's data-menu-* attributes, so the Jinja kiosk_menus
  // list in welcome.html stays the single source for all three renderings
  // (slide, server-rendered stage, JS stage swap).
  function syncStage() {
    if (!menuSwiper || !menuSwiper.slides) return;

    const slide = menuSwiper.slides[menuSwiper.activeIndex];
    if (!slide) return;

    const applyStage = () => {
      if (stageTitleEl) {
        stageTitleEl.textContent = slide.dataset.menuTitle || "";
      }
      if (stageBlurbEl) {
        stageBlurbEl.textContent = slide.dataset.menuBlurb || "";
      }
      if (stageIconEl) {
        // The icon is inline SVG rendered by the menu_icon() Jinja macro, so
        // clone the slide's own node rather than keeping a second copy of six
        // icon paths in JS. replaceChildren() with no argument on a missing
        // svg simply empties the box instead of throwing.
        const icon = slide.querySelector("svg");
        stageIconEl.replaceChildren(icon ? icon.cloneNode(true) : "");
      }
    };

    if (!stageEl) {
      applyStage();
      return;
    }

    // .is-swapping fades and lifts the title/icon/blurb out (see the comment
    // on it in welcome-screen.css); a plain content swap on a panel this size
    // reads as a glitch. Adding and removing a class inside one frame is
    // coalesced by the style engine into no transition at all, so the removal
    // has to wait for a painted frame — hence the nested rAF rather than a
    // setTimeout(0), which can land inside the same frame under load.
    stageEl.classList.add("is-swapping");
    window.requestAnimationFrame(() => {
      window.requestAnimationFrame(() => {
        applyStage();
        stageEl.classList.remove("is-swapping");
      });
    });
  }

  // ─────────────────────────────────────────────────────────────────────
  // Speculative prerender of the centred destination only.
  //
  // See the comment on the speculationrules block in welcome.html for why
  // this exists in place of the old static tiers. In short: a prerender is a
  // fully rendered, live page (unlike the .feature-card prefetch tier, which
  // is a plain cached response), Chromium can't run more than a couple at
  // once anyway, and running all six live would be heavier than the menu
  // itself. This injects one at a time, for whichever card the visitor has
  // settled on.
  //
  // Feature-detected up front: HTMLScriptElement.supports is itself new
  // enough that a kiosk on an older Chromium build (or a non-Chromium
  // browser, however unlikely on this hardware) simply never has it, and the
  // whole thing should no-op rather than throw.
  const supportsSpeculationRules =
    typeof HTMLScriptElement !== "undefined" &&
    typeof HTMLScriptElement.supports === "function" &&
    HTMLScriptElement.supports("speculationrules");

  let prerenderTimer = null;
  let prerenderScriptEl = null;

  function setActivePrerender(href) {
    if (!href) return;
    if (!document.head || typeof document.createElement !== "function") return;

    // Remove the previous injected element first — that is what cancels the
    // superseded prerender. Speculation rules aren't "updated" in place;
    // Chromium just stops honoring a ruleset once the <script> carrying it
    // is gone, so removing the old one before adding the new one is the
    // whole mechanism.
    if (prerenderScriptEl && prerenderScriptEl.parentNode) {
      prerenderScriptEl.parentNode.removeChild(prerenderScriptEl);
    }
    prerenderScriptEl = null;

    try {
      const script = document.createElement("script");
      script.type = "speculationrules";
      script.setAttribute("data-wc-prerender", "");
      // Deliberately no nonce: the CSP allows this element via the
      // 'inline-speculation-rules' token in script-src
      // (app/security_headers.py), which the spec matches speculation rules
      // against specifically — a nonce is not the mechanism it checks, so
      // adding one here would do nothing and shouldn't be "fixed" in later
      // by someone assuming every inline <script> needs one.
      script.textContent = JSON.stringify({
        prerender: [{ urls: [href], eagerness: "immediate" }],
      });
      document.head.appendChild(script);
      prerenderScriptEl = script;
    } catch (error) {
      // Degrade silently: the .feature-card prefetch tier in welcome.html
      // still covers every destination even with no live prerender at all.
    }
  }

  function schedulePrerender() {
    if (!supportsSpeculationRules) return;
    if (!menuSwiper || !menuSwiper.slides) return;

    if (prerenderTimer) window.clearTimeout(prerenderTimer);
    // Debounced ~300ms behind slideChange: swiping through several cards in
    // a row must not spin up (and immediately tear down) a prerender for
    // every card passed through, only the one the visitor stops on.
    prerenderTimer = window.setTimeout(() => {
      const slide = menuSwiper.slides[menuSwiper.activeIndex];
      const href = slide && slide.getAttribute ? slide.getAttribute("href") : null;
      setActivePrerender(href);
    }, 300);
  }

  if (carouselEl && carouselEl.querySelector(".swiper-slide")) {
    menuSwiper = new Swiper(carouselEl, {
      modules: [Navigation, Keyboard, A11y],
      slidesPerView: "auto",
      centeredSlides: true,
      // Campus Map, the second entry in kiosk_menus — the required initial
      // state, and the same index welcome.html server-renders into the stage
      // (kiosk_menus[1]) so the first paint and the first sync agree.
      initialSlide: 1,
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

    menuSwiper.on("slideChange", syncStage);

    // ── Tap discrimination: side tap re-centres, centre tap navigates ────
    //
    // A tap on a side card must only centre it; a tap on the card that is
    // ALREADY centred is what navigates now that the stage's VIEW button is
    // gone (see the comment up top on why the anchors are the real
    // navigation mechanism again). No tap-vs-swipe detector is needed to
    // tell a swipe apart from either kind of tap: Swiper's built-in
    // preventClicks already swallows the synthetic click a drag emits, so a
    // swipe never reaches this listener at all. (Contrast makeTapDetector in
    // kiosk-archive-book.js, which exists only because StPageFlip owns its
    // own drag and Swiper is not involved.)
    //
    // What IS needed is a reliable way to tell "tap centred this card just
    // now" apart from "this card was already centred before the finger
    // landed". kiosk-archives.js answers that by comparing
    // swiper.clickedIndex to swiper.activeIndex inside the click handler —
    // but that trusts that Swiper hasn't already applied
    // slideToClickedSlide's re-centring before the handler runs, and nothing
    // guarantees that ordering. Getting it wrong here means a side tap reads
    // as a centre tap and navigates the visitor somewhere they never chose —
    // on an unattended public kiosk that's a real failure, not a nitpick.
    //
    // So this records activeIndex on pointerdown — capture phase, before
    // Swiper's own handling and before any centring can have happened — and
    // compares the tapped card's index against that snapshot on click. The
    // snapshot can never be stale relative to the tap that produced it,
    // unlike clickedIndex/activeIndex read after the fact.
    let preTapActiveIndex = null;

    carouselEl.addEventListener(
      "pointerdown",
      () => {
        if (!menuSwiper) return;
        preTapActiveIndex = menuSwiper.activeIndex;
      },
      { capture: true, passive: true },
    );

    carouselEl.addEventListener(
      "click",
      (ev) => {
        const card = ev.target && ev.target.closest ? ev.target.closest(".feature-card") : null;
        if (!card) return;
        if (!menuSwiper || !menuSwiper.slides) return;

        const cardIndex = Array.prototype.indexOf.call(menuSwiper.slides, card);

        // Keyboard activation (Enter/Space on a focused card) fires click
        // with no preceding pointerdown, so preTapActiveIndex is either
        // still null (first activation ever) or a stale leftover from some
        // earlier, unrelated tap — comparing against it either blocks every
        // keyboard activation forever or judges this one against the wrong
        // card. A keyboard press can't have re-centred anything itself, so
        // the live activeIndex *is* the correct "was this already centred"
        // answer for this gesture.
        const referenceIndex = preTapActiveIndex === null ? menuSwiper.activeIndex : preTapActiveIndex;

        // Unresolvable or different from the reference index: this was a
        // side tap / off-centre keyboard activation (or something we can't
        // identify), so treat it as navigation-never — the safe default on
        // a public kiosk. Only an index that matches exactly is a tap (or
        // keypress) on the card that was already centred, and that's the
        // one case where the anchor's default action is allowed through.
        if (cardIndex === -1 || cardIndex !== referenceIndex) {
          ev.preventDefault();
          // For a keyboard activation specifically, mirror what a first tap
          // does: centre the card now so the next Enter navigates. A side
          // *tap* already gets this from slideToClickedSlide; keyboard
          // input never goes through Swiper's click handling at all, so
          // without this an off-centre card could never be reached by
          // keyboard — Enter would just keep no-op'ing on it forever.
          if (preTapActiveIndex === null && cardIndex !== -1) {
            menuSwiper.slideTo(cardIndex);
          }
        }

        // Reset for the next gesture so a snapshot from this tap (or the
        // lack of one, for a keyboard press) can never leak into judging a
        // later, unrelated activation — the exact regression this guards:
        // preTapActiveIndex used to live on forever, so one stale/absent
        // snapshot could block or misroute every activation after it.
        preTapActiveIndex = null;
      },
      true,
    );

    // ── Prerender only the centred destination ───────────────────────────
    // See the long comment on the speculationrules block in welcome.html for
    // why this exists (prerendering all six is neither possible nor
    // desirable) and why it targets the active slide alone.
    menuSwiper.on("slideChange", schedulePrerender);
    // slideChange doesn't fire on init, so the initially-centred card (Campus
    // Map, kiosk_menus[1] — see the Swiper config above) needs one explicit
    // kick here.
    schedulePrerender();
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
  // Deliberately the single declaration in this file; the other kiosk pages
  // keep their own timers (news 120s, tour/archives 60s) and are not unified
  // here.
  const KIOSK_IDLE_TIMEOUT = 30 * 1000;

  // Same-origin document, so it is a normal navigation for the service worker
  // (sw-kiosk.js isKioskDocument() matches /kiosk/*, and an iframe load IS
  // mode:'navigate') and it is precached by partials/kiosk-sw.html — the
  // attract screen has to render with the campus link down.
  const ATTRACT_SRC = "/kiosk/latest-news";

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

  function playIdleAttract() {
    if (attractShowing) return;

    if (idleVideoSrc && typeof window.__kioskPlaySrc === "function") {
      attractShowing = true;
      document.body.classList.add("kiosk-idle-active");
      // quiet=true: no "Now playing" banner. Nobody asked for the attract
      // loop, so it should arrive without announcing itself. An editor's
      // Pusher push still shows the banner.
      window.__kioskPlaySrc(idleVideoSrc, idleVideoTitle, true);
      return;
    }

    // No video flagged (or kiosk.js never loaded, so there is no player):
    // fall back to the newsletter. If even that host element is missing the
    // kiosk simply stays on the menu rather than latching a flag it can
    // never clear.
    if (showNewsletterAttract()) {
      attractShowing = true;
    }
  }

  function stopIdleAttract() {
    attractShowing = false;
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
