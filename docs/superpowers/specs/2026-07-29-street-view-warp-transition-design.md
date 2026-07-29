# Street-View-style walking transition for the virtual tour

## Context

`resources/js/kiosk-tour.js` already implements a Marzipano-based Street-View-esque
dolly transition (`startWarp`, called from `moveToScene` when a hotspot/arrow is
clicked). It does an outgoing FOV push + pan toward the clicked hotspot, an incoming
FOV bloom-then-settle, an opacity crossfade of the incoming scene's layers/hotspot
container, and a CSS-class-based blur toggle (`tour-warp-blur` in
`resources/css/kiosk-tour.css`), all driven from one `scene.switchTo({ transitionUpdate })`
call. All tuning lives in a `WARP` config object near the top of `initTour()`.

This work replaces that transition's internals with a two-phase
stretch-then-blend model (matching Google Street View's walking transition more
literally) while keeping the surrounding orchestration — `moveToScene`'s
turn-then-travel pre-step, the `warping` re-entry guard, autorotate/controls
pause, `switchScene`'s plain crossfade for menu jumps, and the try/catch fallback
to `switchScene` on error — untouched.

## Constraint: no per-scene DOM wrapper

Marzipano renders all scenes onto a single shared WebGL `<canvas>` inside `#pano`.
There is no separate stage/DOM wrapper per scene to apply an independent CSS
transform to — this is why the existing code fakes "zoom" via each scene's own
independent FOV parameter rather than CSS, even though both scenes share one
canvas.

The new radial-stretch effect is approximated by applying the CSS transform to
`#pano` as a whole (the only available wrapper), with its magnitude driven by
`zoomK = stretchRamp · (1 - blendRamp)`. Because `zoomK → 0` by t=1 and the
incoming scene is still low-opacity early in the blend phase, this reads
correctly as "the outgoing view stretches, the incoming scene arrives
undistorted" even though technically the transform briefly affects both
scenes' shared canvas during the overlap. This is the same kind of
approximation already used for the FOV-based zoom.

## Config

Replaces the existing `WARP` tuning object (`zoomFactor`, `wideFactor`,
`zoomInFrac`, `zoomOutStart`, `fadeStart` are removed; `durationMs` and
`blurPx` are kept but reinterpreted under the new model):

```js
var WARP = {
  durationMs:   1400,   // total transition (spec: 900–2400)
  stretchPhase: 0.6,    // fraction of the timeline spent in stretch+zoom (0–0.95)
  zoomStrength: 0.35,   // max FOV reduction / CSS scale bump (0–0.5)
  blurPx:       8,      // peak blur in px at full stretch (0–30; 0 disables)
  easing:       easeInOutQuad
};
```

`menuCrossfadeMs` stays as-is (unrelated: `switchScene`'s plain crossfade for
scene-list jumps is not a directional walk and is out of scope here). `TURN`
(the pre-turn head-rotation) is also unrelated and untouched.

## Per-frame math (inside `transitionUpdate`)

```js
function easeInOutQuad(t) {
  return t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
}

var stretchRamp = easeInOutQuad(clamp01(val / WARP.stretchPhase));
var blendRamp   = easeInOutQuad(clamp01((val - WARP.stretchPhase) / (1 - WARP.stretchPhase)));
var zoomK       = stretchRamp * (1 - blendRamp);
```

- **FOV** (per-scene, since each scene keeps its own `RectilinearView` here —
  there's no single shared view object to drive): outgoing scene's FOV eases
  down via `oldScene.view().setFov(startFov * (1 - WARP.zoomStrength * stretchRamp))`;
  incoming scene's FOV relaxes from its seated value back to base over
  `blendRamp` using the same easing, landing exactly at `baseFov` at t=1.
  Pan toward the clicked hotspot's yaw/pitch continues to ride `stretchRamp`
  the same way the existing code rides `inP` today.
- **CSS stretch**: `#pano.style.transform = 'scale(' + (1 + WARP.zoomStrength * zoomK) + ')'`,
  with `transform-origin` set once at transition start to the clicked
  hotspot's screen projection (`currentScene.view.coordinatesToScreen({yaw, pitch})`,
  falling back to `50% 50%` if projection returns null/NaN, e.g. hotspot
  off-frustum). Reset to `transform: none` / cleared inline style on
  completion (and in the error-fallback path) so the idle viewer is
  untouched.
- **Blur**: `#pano.style.filter = 'blur(' + (zoomK * WARP.blurPx) + 'px)'` set
  every tick alongside the transform — locked to `zoomK`, not a fixed timer.
  Feature-detected once via `CSS.supports('filter', 'blur(1px)')`; if
  unsupported, the blur assignment is skipped entirely (zoom + stretch +
  blend still run). The existing `tour-warp-blur` CSS class and
  `applyWarpBlur`/`clearWarpBlur`/`blurClearTimer` timer machinery are
  removed, since blur is now driven inline per frame instead of via a
  timed class toggle.
- **Blend**: unchanged from today — `newScene.listLayers().forEach(layer =>
  layer.mergeEffects({ opacity: blendRamp }))` and
  `newScene.hotspotContainer().domElement().style.opacity = blendRamp`,
  just renamed from `fade` to `blendRamp` and driven by the new ramp instead
  of the old `fadeStart`-gated curve.

## Hotspot visibility

Currently only the incoming scene's hotspot container is faded in via
opacity; the outgoing scene's hotspot container is never explicitly hidden
during the dolly. Fixing this: at the start of `startWarp`, set
`currentScene.scene.hotspotContainer().domElement().style.opacity = 0`
(matching how the incoming container is already handled), and restore it to
`''` in the completion callback and in the error-fallback catch block, so a
hotspot never lingers visible mid-warp on the departing scene.

## Reset on completion / error paths

Both the normal completion callback and the existing `catch` block in
`startWarp` must:
- clear `#pano`'s inline `transform` and `filter` styles,
- restore the outgoing scene's hotspot container opacity,
- (already done today) re-seat view parameters, clear controls-disable,
  clear `warping`, restart autorotate.

This guarantees no visual pop at t=0/t=1 and that an interrupted/erroring
transition never leaves the idle viewer stretched, blurred, or with hidden
hotspots.

## Testing

- Manual: load the tour, click an arrow hotspot between two adjacent nodes,
  confirm the stretch-then-blend reads as a forward step, confirm arrival is
  sharp/normal-zoom, confirm hotspots hide during the transition and
  reappear after, confirm rapid double-clicks don't stack transitions
  (existing `warping` guard).
- Manual: test a hotspot near the edge of the frustum (large angle from
  center) to confirm `transform-origin` fallback to center doesn't look
  broken.
- Manual: temporarily stub `CSS.supports` to return `false` to confirm
  graceful degradation (zoom + blend run, no blur, no crash).
- No existing automated test suite covers `kiosk-tour.js`; no new automated
  tests are proposed here (consistent with the file's current state) beyond
  the manual verification above, per the task's own instruction to
  "test with two adjacent nodes."

## Files touched

- `resources/js/kiosk-tour.js` — `WARP` config, `startWarp`'s
  `transitionUpdate`/completion/error paths, removal of
  `applyWarpBlur`/`clearWarpBlur`/`blurClearTimer`.
- `resources/css/kiosk-tour.css` — removal of the now-unused
  `#pano.tour-warp-blur` rule and `--warp-blur` custom property; `#pano`'s
  base rule keeps its existing `opacity`/`transition` but should not
  `transition: filter` anymore since filter/transform are now driven purely
  per-frame via JS (a CSS transition on those properties would fight the
  rAF-driven inline styles).
