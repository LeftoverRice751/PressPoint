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

// A tap is a reaction to hearing a line start, so it lands after the onset —
// typically a quarter-second for someone listening and tapping along. Stored
// raw, every line lit late on the kiosk. Pull each tap back by that much.
export var TAP_LEAD = 0.25;

export function tapTime(t) {
  return Math.max(0, t - TAP_LEAD);
}

// Move the whole recording by `delta` seconds — the Earlier/Later nudge, so a
// recording that is consistently off can be fixed without re-tapping every
// line. Clamped at 0; an end that collapses onto its start opens instead,
// the same rule AboutContent.sanitize_lyric_timings applies on save.
export function shift(timings, delta) {
  function move(v) { return Math.max(0, Math.round((v + delta) * 1000) / 1000); }
  return timings.map(function (t) {
    var start = move(t.start);
    var end = typeof t.end === 'number' ? move(t.end) : null;
    if (end !== null && end <= start) end = null;
    return { start: start, end: end };
  });
}

// Index of the line sung at `t`, or -1. Same windows as the kiosk's
// windowFor() in about-lspu-kiosk.js (which cannot import this: its test
// evaluates it as a plain script), so the editor's preview matches the glass.
export function activeLine(timings, lineCount, t, duration) {
  var timed = timings.length === lineCount;
  for (var i = 0; i < lineCount; i++) {
    var start, end;
    if (timed && typeof timings[i].start === 'number') {
      start = timings[i].start;
      end = typeof timings[i].end === 'number' ? timings[i].end : duration;
    } else {
      var span = duration / lineCount;
      start = span * i;
      end = span * (i + 1);
    }
    if (t >= start && t < end) return i;
  }
  return -1;
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
