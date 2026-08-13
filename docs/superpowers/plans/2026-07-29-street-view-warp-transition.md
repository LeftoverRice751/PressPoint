# Street-View-style walking transition Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the internals of the existing Marzipano `startWarp` scene transition in `resources/js/kiosk-tour.js` with a two-phase stretch-then-blend model (radial CSS stretch + FOV zoom + locked blur, then opacity blend), matching the design in `docs/superpowers/specs/2026-07-29-street-view-warp-transition-design.md`.

**Architecture:** One `scene.switchTo({ transitionDuration, transitionUpdate })` call (unchanged entry point) drives per-frame `easeInOutQuad`-eased `stretchRamp`/`blendRamp`/`zoomK` values. `zoomK` drives a CSS `transform: scale(...)` + `filter: blur(...)` applied directly to `#pano` (the single shared Marzipano canvas wrapper — there's no per-scene DOM node to isolate). FOV and opacity continue to be driven per-scene via the existing Marzipano view/layer APIs. All surrounding orchestration (`moveToScene`, `warping` guard, autorotate/controls pause, `switchScene`'s plain crossfade, error fallback) is untouched.

**Tech Stack:** Vanilla JS (ES5-style, no build step for this file), Marzipano 0.10.2 (vendored, `window.Marzipano`), plain CSS.

## Global Constraints

- No automated test suite exists for `kiosk-tour.js`; verification is manual in-browser per the design doc — do not invent a test framework for this file.
- Config shape is exactly `{ durationMs, stretchPhase, zoomStrength, blurPx, easing }` (durationMs 900–2400, stretchPhase 0–0.95, zoomStrength 0–0.5, blurPx 0–30).
- `zoomK = stretchRamp * (1 - blendRamp)`, both ramps eased with `easeInOutQuad`.
- Never blur/transform UI or hotspots — only `#pano` itself.
- First and last frame of the transition must be visually identical to the idle old/new scene renders (no pop at t=0 or t=1).
- Never leave `#pano` transformed/blurred or a hotspot container hidden if the transition errors out — always reset in both the completion callback and the `catch` block.
- Do not touch `moveToScene`, `TURN`, `switchScene`, `currentSceneObj`, autorotate/controls logic, or anything outside `startWarp`/`WARP`/the CSS blur rule.

---

### Task 1: Rewrite `WARP` config and `startWarp`'s transition math in `kiosk-tour.js`

**Files:**
- Modify: `resources/js/kiosk-tour.js:268-292` (the `WARP` config block — `TURN` block at 288-292 stays, only `WARP` at 268-281 changes)
- Modify: `resources/js/kiosk-tour.js:307-324` (delete `applyWarpBlur`/`clearWarpBlur`/`blurClearTimer` — no longer used)
- Modify: `resources/js/kiosk-tour.js:401-474` (`startWarp` function body)

**Interfaces:**
- Consumes: `currentScene` (wrapper object with `.view` [RectilinearView instance], `.scene` [Marzipano Scene], `.data` [scene data incl. `initialViewParameters`]), `newSceneObj` (same shape), `hotspot` (`{ yaw, pitch, targetYaw? }`) — all already passed in by `moveToScene`/`switchScene`'s fallback, signature unchanged.
- Produces: `startWarp(currentScene, newSceneObj, hotspot)` — same signature and call sites as before (no caller changes needed). Internally no longer calls `applyWarpBlur`/`clearWarpBlur`.

- [ ] **Step 1: Replace the `WARP` config object**

Replace `resources/js/kiosk-tour.js:268-281`:

```js
  // ── Transition tuning ──────────────────────────────────────────
  // Every parameter of the Street-View-style warp lives here so the
  // whole effect can be re-timed from one place.
  var WARP = {
    durationMs:     900,   // total arrow warp (spec: 800–1000)
    zoomFactor:     0.5,   // outgoing FOV pushes down to 0.5 × base (narrow)
    wideFactor:     1.25,  // incoming FOV starts at 1.25 × base (capped to FOV_MAX)
    zoomInFrac:     0.4,   // outgoing push completes by this fraction
    zoomOutStart:   0.3,   // incoming settle begins at this fraction
    fadeStart:      0.15,  // when the destination starts becoming visible
    blurPx:         6,     // motion-blur peak; set 0 to disable the blur
    blurClearAt:    0.5,   // fraction of duration at which blur starts clearing
    menuCrossfadeMs: 450   // plain crossfade for scene-list jumps (no dolly)
  };
```

with:

```js
  // ── Transition tuning ──────────────────────────────────────────
  // Street-View-style "walking" transition: a stretch+zoom phase (the
  // outgoing view pulls toward the travel direction and pushes forward),
  // then a blend phase (incoming scene fades in, FOV relaxes to base).
  // zoomK = stretchRamp * (1 - blendRamp) drives the CSS stretch + blur,
  // both ramps eased with `easing`.
  function easeInOutQuad(t) {
    return t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
  }

  var WARP = {
    durationMs:   1400,          // total transition (spec: 900–2400)
    stretchPhase: 0.6,           // fraction of timeline in stretch+zoom (0–0.95)
    zoomStrength: 0.35,          // max FOV reduction / CSS scale bump (0–0.5)
    blurPx:       8,             // peak blur in px at full stretch (0–30; 0 disables)
    easing:       easeInOutQuad,
    menuCrossfadeMs: 450         // plain crossfade for scene-list jumps (no dolly)
  };

  var SUPPORTS_CSS_FILTER = typeof CSS !== 'undefined' &&
    typeof CSS.supports === 'function' &&
    CSS.supports('filter', 'blur(1px)');
```

- [ ] **Step 2: Delete the now-unused blur-timer helpers**

Delete `resources/js/kiosk-tour.js:307-324` in full (the `blurClearTimer`/`applyWarpBlur`/`clearWarpBlur` block, including its leading comment block). Nothing else in the file calls these three names after Step 4 below is done (confirm with `grep -n "applyWarpBlur\|clearWarpBlur\|blurClearTimer" resources/js/kiosk-tour.js` — should return nothing once Step 4 is also applied).

- [ ] **Step 3: Delete the now-unused `smoothstep` helper**

Delete `resources/js/kiosk-tour.js:303` (`function smoothstep(t) { t = clamp01(t); return t * t * (3 - 2 * t); }`). It was only used by the old `startWarp` math being replaced in Step 4; confirm nothing else references it with `grep -n "smoothstep" resources/js/kiosk-tour.js` (expect no matches once Step 4 is done — `lerp` at line 294 stays, it's still used elsewhere for the ground-indicator disc, e.g. `resources/js/kiosk-tour.js:826-827`).

- [ ] **Step 4: Rewrite the `startWarp` header comment and function**

Replace the comment block immediately preceding the function, `resources/js/kiosk-tour.js:391-400`:

```js
  // ── startWarp: Street-View dolly transition ────────────────────
  // A single Marzipano switchTo() drives the whole effect, so both scenes
  // stay live — no teardown, no black flash:
  //   1. the outgoing view pans toward the clicked hotspot while its FOV
  //      NARROWS (pushes forward down the path);
  //   2. the incoming scene is seated WIDE and facing the travel heading,
  //      then settles back to its normal FOV as it crossfades in;
  //   3. a container blur ramps up and clears as the new scene lands.
  // Everything is eased with smoothstep. Assumes the caller resolved the
  // current scene; falls back to switchScene on error.
```

with:

```js
  // ── startWarp: Street-View walking transition ──────────────────
  // A single Marzipano switchTo() drives the whole effect, so both scenes
  // stay live — no teardown, no black flash. Two phases on one timeline:
  //   1. stretch+zoom (first `stretchPhase` of the duration): the outgoing
  //      view pans toward the clicked hotspot and its FOV eases down
  //      (zoom in), while #pano gets a CSS radial-stretch transform and a
  //      blur, both locked to zoomK so they build with the stretch and
  //      land at zero exactly at the phase boundary/arrival;
  //   2. blend (remainder): the incoming scene fades in via layer opacity
  //      while its FOV relaxes back to base, landing sharp/normal-zoom at
  //      t=1. Both ramps use `WARP.easing`. Assumes the caller resolved
  //      the current scene; falls back to switchScene on error.
```

Then replace the full function body at `resources/js/kiosk-tour.js:401-474`:

```js
  function startWarp(currentScene, newSceneObj, hotspot) {
    var startView  = currentScene.view;
    var startYaw   = startView.yaw();
    var startPitch = startView.pitch();
    var startFov   = startView.fov();

    var initial   = newSceneObj.data.initialViewParameters || {};
    var baseFov   = typeof initial.fov === 'number' ? initial.fov : Math.PI / 2;
    // Direction of travel: an explicit per-arrow targetYaw wins; otherwise
    // open the destination facing the yaw of the clicked arrow.
    var landingYaw   = typeof hotspot.targetYaw === 'number' ? hotspot.targetYaw : hotspot.yaw;
    var landingPitch = typeof initial.pitch === 'number' ? initial.pitch : 0;

    // Screen projection of the clicked hotspot, for the CSS stretch's
    // transform-origin. Falls back to viewport center if the projection
    // is unavailable (e.g. hotspot outside the current frustum).
    var origin = '50% 50%';
    try {
      var screen = startView.coordinatesToScreen({ yaw: hotspot.yaw, pitch: hotspot.pitch });
      if (screen && typeof screen.x === 'number' && typeof screen.y === 'number' &&
          !isNaN(screen.x) && !isNaN(screen.y)) {
        origin = screen.x + 'px ' + screen.y + 'px';
      }
    } catch (e) { /* keep center fallback */ }

    var outgoingHotspots = currentScene.scene.hotspotContainer().domElement();
    var incomingHotspots = null; // resolved once newScene is available in transitionUpdate

    function resetPano() {
      panoElement.style.transform = '';
      panoElement.style.filter = '';
    }

    function restoreHotspots() {
      outgoingHotspots.style.opacity = '';
      if (incomingHotspots) incomingHotspots.style.opacity = '';
    }

    try {
      warping = true;
      stopAutorotate();
      viewer.controls().disable();

      // Hide both scenes' hotspots for the duration of the transition.
      outgoingHotspots.style.opacity = 0;

      // Seat the destination facing the travel direction, at base FOV,
      // before it starts fading in.
      newSceneObj.view.setParameters({ yaw: landingYaw, pitch: landingPitch, fov: baseFov });

      newSceneObj.scene.switchTo({
        transitionDuration: WARP.durationMs,
        transitionUpdate: function (val, newScene, oldScene) {
          if (!incomingHotspots) {
            incomingHotspots = newScene.hotspotContainer().domElement();
            incomingHotspots.style.opacity = 0;
          }

          var stretchRamp = WARP.easing(clamp01(val / WARP.stretchPhase));
          var blendRamp   = WARP.easing(clamp01((val - WARP.stretchPhase) / (1 - WARP.stretchPhase)));
          var zoomK       = stretchRamp * (1 - blendRamp);

          // Crossfade the destination (layers + its hotspots) in over the
          // still-visible current scene.
          newScene.listLayers().forEach(function (layer) {
            layer.mergeEffects({ opacity: blendRamp });
          });

          // Outgoing: pan toward the arrow + ease FOV down (zoom in).
          oldScene.view().setParameters({
            yaw:   lerpAngle(startYaw,   hotspot.yaw,   stretchRamp),
            pitch: lerpAngle(startPitch, hotspot.pitch, stretchRamp),
            fov:   startFov * (1 - WARP.zoomStrength * stretchRamp)
          });
          // Incoming: relax its FOV back to base over the blend phase.
          newScene.view().setFov(baseFov * (1 - WARP.zoomStrength * (1 - blendRamp)));

          // Radial stretch + locked blur, applied to the single shared
          // canvas wrapper (Marzipano has no per-scene DOM node here).
          panoElement.style.transformOrigin = origin;
          panoElement.style.transform = 'scale(' + (1 + WARP.zoomStrength * zoomK) + ')';
          if (SUPPORTS_CSS_FILTER && WARP.blurPx) {
            panoElement.style.filter = 'blur(' + (zoomK * WARP.blurPx) + 'px)';
          }
        }
      }, function () {
        // Land clean at the intended heading and base FOV.
        newSceneObj.view.setParameters({ yaw: landingYaw, pitch: landingPitch, fov: baseFov });
        // Reset the scene we left back to its resting view so it never
        // lingers mid-warp if the user returns to it later.
        currentScene.view.setParameters(currentScene.data.initialViewParameters);
        resetPano();
        restoreHotspots();
        viewer.controls().enable();
        warping = false;
        startAutorotate();
        updateSceneName(newSceneObj);
        updateSceneList(newSceneObj);
      });
    } catch (err) {
      // Never strand the viewer: undo transient state and hard-switch.
      resetPano();
      restoreHotspots();
      try { viewer.controls().enable(); } catch (e2) {}
      warping = false;
      switchScene(newSceneObj);
    }
  }
```

- [ ] **Step 5: Sanity-check for leftover references**

Run:

```bash
grep -n "applyWarpBlur\|clearWarpBlur\|blurClearTimer\|smoothstep\|zoomFactor\|wideFactor\|zoomInFrac\|zoomOutStart\|fadeStart" resources/js/kiosk-tour.js
```

Expected: no matches (all removed/renamed in Steps 1–4).

- [ ] **Step 6: Commit**

```bash
git add resources/js/kiosk-tour.js
git commit -m "Rework kiosk tour warp into stretch+zoom then blend model"
```

---

### Task 2: Clean up the now-unused blur CSS in `kiosk-tour.css`

**Files:**
- Modify: `resources/css/kiosk-tour.css:36-55`

**Interfaces:**
- Consumes: nothing new — `#pano` is the same element Task 1's JS now drives via inline `style.transform`/`style.filter`.
- Produces: `#pano` no longer has a `filter` CSS transition (would otherwise fight the per-frame inline `filter` set by `transitionUpdate`) and no longer has the `tour-warp-blur` class rule (dead code after Task 1 removes the class toggle).

- [ ] **Step 1: Remove the `filter` transition and the dead `tour-warp-blur` rule**

Replace `resources/css/kiosk-tour.css:36-55`:

```css
#pano {
  position: absolute;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  overflow: hidden;
  opacity: 0;
  pointer-events: none;
  transition: opacity 0.35s ease, filter 0.22s ease-out;
}

/* Motion blur during a scene warp — kiosk-tour.js adds this class at the
   start of a warp and removes it near the midpoint, so the CSS transition
   ramps the blur up then eases it back to 0. Class toggle only: no
   per-frame work competes with the WebGL render. */
#pano.tour-warp-blur {
  filter: blur(var(--warp-blur, 6px));
  will-change: filter;
}
```

with:

```css
#pano {
  position: absolute;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  overflow: hidden;
  opacity: 0;
  pointer-events: none;
  transition: opacity 0.35s ease;
}
```

(The warp's `transform`/`filter` are now set per-frame from JS via `requestAnimationFrame`-driven `transitionUpdate`, so a CSS transition on those properties would fight the inline styles rather than help them.)

- [ ] **Step 2: Confirm no other rule references the removed class/variable**

Run:

```bash
grep -n "tour-warp-blur\|--warp-blur" resources/css/kiosk-tour.css resources/js/kiosk-tour.js
```

Expected: no matches.

- [ ] **Step 3: Commit**

```bash
git add resources/css/kiosk-tour.css
git commit -m "Remove unused warp-blur CSS class now that blur is driven per-frame"
```

---

### Task 3: Manual verification in the browser

**Files:** none (verification only, no code changes)

- [ ] **Step 1: Start the app locally**

Use whatever this project's existing local-serve setup is (see project's `run` skill / `craft serve`, per `presspoint_devserver_threading` guidance — do not use `--threaded`).

- [ ] **Step 2: Load the kiosk tour and click an arrow hotspot between two adjacent nodes**

Confirm, watching the transition:
- It reads as a single forward "step": stretch+zoom outward from the clicked arrow's screen position, then blend into the new scene.
- The stretch's `transform-origin` visually tracks near where the arrow was clicked (not always screen center) for at least two different hotspots on two different scene pairs.
- The image is progressively blurrier through the stretch phase and fully sharp by arrival — no constant/flat blur.
- Arrival lands at normal zoom (no residual scale/blur), exactly matching the idle render of the new scene (no pop).
- Navigation hotspots are hidden during the transition and reappear immediately after landing, on both the departing and arriving scene.
- Rapid double-clicking an arrow does not stack transitions or strand the viewer (existing `warping` guard).

- [ ] **Step 3: Test a hotspot near the edge of the frustum**

Click an arrow that's far off-center (near the edge of the visible frame or requiring a large turn). Confirm the `transform-origin` fallback to viewport center (if the projection comes back null/NaN) doesn't look visually broken — the stretch should still read as a coherent zoom even if not anchored exactly on the arrow.

- [ ] **Step 4: Test the no-CSS-filter-support fallback**

In the browser devtools console, temporarily run `CSS.supports = function(){ return false; }` before triggering the module's `SUPPORTS_CSS_FILTER` check (e.g. reload with a snippet injected before `kiosk-tour.js` loads, or monkey-patch and re-run `initTour()` if the app exposes a hook). Confirm: the transition still runs (stretch transform + FOV zoom + blend), just without blur, and nothing throws.

- [ ] **Step 5: Confirm the design doc's completion note**

No commit needed for this task (verification only) — if any step fails, go back and fix Task 1/2's code, then re-run this task's checklist.
