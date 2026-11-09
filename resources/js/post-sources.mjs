/*
 * The "source lines" footer of a post card: up to three icon + text rows.
 *
 * Mirrors Posts.SOURCE_ICONS / SOURCE_TEXT_MAX / SOURCE_LINES_MAX /
 * DEFAULT_SOURCE_LINES. The server re-validates every save with
 * Posts.parse_source_lines; this only keeps the editor's preview honest about
 * what will be stored. DOM-free (tests/js/post-sources.test.mjs).
 */

export const SOURCE_ICONS = Object.freeze(['facebook', 'email', 'instagram', 'website', 'link']);
export const SOURCE_TEXT_MAX = 60;
export const SOURCE_LINES_MAX = 3;

const DEFAULTS = [
  { icon: 'facebook', text: '/TheGearsOfficial' },
  { icon: 'email', text: '/thegearspublication@gmail.com' },
];

/** A fresh copy each call: the editor mutates its rows in place. */
export function defaults() {
  return DEFAULTS.map((row) => ({ ...row }));
}

/** One row as the server will keep it, or null when it would be dropped. */
export function cleanRow(row) {
  const text = String((row && row.text) || '').trim().slice(0, SOURCE_TEXT_MAX);
  if (!text) return null;
  const icon = SOURCE_ICONS.includes(row.icon) ? row.icon : 'link';
  return { icon, text };
}

/**
 * JSON for the `source_lines` field. "[]" (not the defaults) for no rows: the
 * server reads an empty list as "this post shows no sources".
 */
export function serialize(rows) {
  const kept = [];
  for (const row of rows || []) {
    const clean = cleanRow(row);
    if (clean) kept.push(clean);
    if (kept.length === SOURCE_LINES_MAX) break;
  }
  return JSON.stringify(kept);
}
