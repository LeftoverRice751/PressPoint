/*
 * Flash ticker pace.
 *
 * The keyframes in welcome-screen.css move .news-ticker__track by -50%, i.e.
 * exactly one of its two identical content copies, so the animation's
 * duration IS the speed: duration = copy width / pixels-per-second. That
 * duration used to be a fixed 50s in the stylesheet, which made the speed a
 * property of how much was published that day — two bulletins crawled, the
 * real 24h payload (a dozen stories, bodies included, ~26,000 px) went past
 * at ~500 px/s and could not be read on the terminal. welcome-screen.js
 * measures the first copy after every render and sets the duration from it.
 *
 * DOM-free so tests/js/ticker-pace.test.mjs can pin the arithmetic.
 */

/** Reading pace for a portrait kiosk viewed from arm's length. */
export const TICKER_PX_PER_SECOND = 70;

/** A lone short headline must still stay on screen long enough to be read. */
export const TICKER_MIN_SECONDS = 8;

/**
 * Seconds for one full pass of the content given the width of ONE copy.
 * Width may be missing or zero when the track has not been laid out yet
 * (display: none, first paint); fall back to the floor rather than a 0s
 * animation that would spin the compositor.
 */
export function tickerDurationSeconds(copyWidthPx) {
  const width = Number(copyWidthPx);
  if (!Number.isFinite(width) || width <= 0) {
    return TICKER_MIN_SECONDS;
  }
  return Math.max(TICKER_MIN_SECONDS, width / TICKER_PX_PER_SECOND);
}
