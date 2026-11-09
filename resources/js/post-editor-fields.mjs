/*
 * Pure rules for the post editor's text fields and expiry button.
 * DOM-free so they are unit-tested (tests/js/post-editor-fields.test.mjs).
 */

// Posts.KICKER_MAX / HEADLINE_MAX / BODY_MAX. The server truncates too; capping
// here means an editor never sees text on the card that will not be saved.
export const FIELD_MAX = Object.freeze({ kicker: 40, headline: 110, body: 420 });

// NewsController's MAX_PHOTO_BYTES: refused before upload with the server's own
// message, rather than after an 8 MB round trip.
export const PHOTO_MAX_BYTES = 8 * 1024 * 1024;
export const PHOTO_TOO_LARGE = 'Photo is too large (max 8 MB)';

export const CAMPUS_TZ = 'Asia/Manila';

/** The part of `text` that fits, given what the field holds and what is selected. */
export function fitInsert(currentLength, selectedLength, text, max) {
  const room = Math.max(0, max - (currentLength - selectedLength));
  return String(text || '').slice(0, room);
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
  'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/**
 * The expiry button's label. Built from the datetime-local string itself, never
 * through Date: that value is campus wall time already, and parsing it would
 * shift it by the BROWSER's zone.
 */
export function expiryLabel(value) {
  const match = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/.exec(value || '');
  if (!match) return 'Expires 7 days after approval';
  const [, year, month, day, hour, minute] = match;
  const h = Number(hour);
  const twelve = h % 12 === 0 ? 12 : h % 12;
  const meridiem = h < 12 ? 'AM' : 'PM';
  return `Expires ${MONTHS[Number(month) - 1]} ${Number(day)}, ${year}, ${twelve}:${minute} ${meridiem}`;
}

/** Campus wall time now, as a datetime-local value ("YYYY-MM-DDTHH:MM"). */
export function campusInputNow(date = new Date()) {
  const parts = {};
  new Intl.DateTimeFormat('en-CA', {
    timeZone: CAMPUS_TZ,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    // h23, not hour12:false: some ICU builds render midnight as "24" with the latter.
    hourCycle: 'h23',
  }).formatToParts(date).forEach((part) => { parts[part.type] = part.value; });
  return `${parts.year}-${parts.month}-${parts.day}T${parts.hour}:${parts.minute}`;
}

/**
 * A stored expiry that has already passed would make the next save fail with
 * "Pick an expiry in the future", so a lapsed one loads as unset. Same-format
 * strings compare chronologically.
 */
export function usableExpiry(value, nowInput) {
  if (!value) return '';
  return value > nowInput ? value : '';
}
