// Tap-to-sync model for the hymn editor.
//
// Pure functions over the `lyric_timings` list the kiosk reads: one
// `{start, end}` per sung line, matched to the lyrics by index. Nothing here
// reorders — a tap appends, Back pops — because the kiosk trusts position,
// not content. The DOM wiring lives in about-lspu-editor.js; this file has
// no DOM so tests/js/hymn-sync.test.mjs can pin the arithmetic.

function last(timings) {
  return timings.length ? timings[timings.length - 1] : null;
}

function isOpen(entry) {
  return entry && (entry.end === null || entry.end === undefined);
}

// Start the next line at `t`. Closes the previous line if it is still open
// (a Gap may already have closed it). A tap that is not after the open line's
// start is a double-tap or a backwards scrub and is ignored — Back is the
// way to redo a line.
export function mark(timings, t) {
  var prev = last(timings);
  if (prev && t <= prev.start) return timings;
  var out = timings.slice();
  if (isOpen(prev)) out[out.length - 1] = { start: prev.start, end: t };
  out.push({ start: t, end: null });
  return out;
}

// Close the open line at `t` without opening the next one — for the
// instrumental intro and the breaks between verses.
export function gap(timings, t) {
  var prev = last(timings);
  if (!isOpen(prev) || t <= prev.start) return timings;
  var out = timings.slice();
  out[out.length - 1] = { start: prev.start, end: t };
  return out;
}

// Drop the last line and reopen the one before it so the next tap closes it
// again. Returns where the player should seek to so the editor re-hears the
// line they are about to re-mark.
export function back(timings) {
  if (!timings.length) return { timings: [], seekTo: 0 };
  var out = timings.slice(0, -1);
  if (out.length) {
    var prev = out[out.length - 1];
    out[out.length - 1] = { start: prev.start, end: null };
    return { timings: out, seekTo: prev.start };
  }
  return { timings: out, seekTo: 0 };
}

// A recording only describes the lyrics it was made against. The kiosk
// falls back to the even split when the counts differ, so tell the editor.
export function isStale(timings, lineCount) {
  return timings.length > 0 && timings.length !== lineCount;
}

// Which message the widget should show. `partial` covers both a recording
// still in progress and lyrics that gained lines afterwards — the fix is the
// same (mark the rest); `mismatch` means lines were removed since, which
// only a fresh recording can repair.
export function syncStatus(timings, lineCount) {
  if (!timings.length) return 'empty';
  if (timings.length === lineCount) return 'complete';
  return timings.length < lineCount ? 'partial' : 'mismatch';
}

// Mirror of AboutValues.hymn_lines: <br> becomes a line break, then one entry
// per block, tags stripped, blanks dropped. The widget numbers lines with
// this; the kiosk numbers them with the Python — they must agree.
export function splitLyricLines(html) {
  if (!html) return [];
  var normalised = html.replace(/<br\s*\/?>/gi, '</p><p>');
  return normalised
    .split(/<\/(?:p|li|h[1-6])>/i)
    .map(function (part) {
      return part
        .replace(/<[^>]+>/g, '')
        .replace(/&nbsp;/g, ' ')
        .replace(/&amp;/g, '&')
        .replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>')
        .replace(/\s+/g, ' ')
        .trim();
    })
    .filter(Boolean);
}
