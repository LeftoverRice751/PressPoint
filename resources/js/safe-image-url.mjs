/*
 * Allowlist for image URLs the news composer writes into img.src and
 * background-image (news-dashboard.js: previewImage / setFeaturedPreview).
 *
 * The stored path arrives via the library card's data-news-library-image,
 * and getAttribute() returns it with the template's |e escaping already
 * decoded — so a `"` in news.image reached `url("…")` verbatim and could
 * close it and append declarations. Every legitimate value here is either a
 * same-origin path (/storage/…) or a blob: preview of a file the editor just
 * picked; anything else (javascript:, data:, off-site, protocol-relative)
 * is refused rather than repaired.
 *
 * DOM-free on purpose — tests/js/safe-image-url.test.mjs pins it.
 */

// `/x` but not `//host` or `/\host` — browsers treat both of those as
// protocol-relative, i.e. off-site.
var SAME_ORIGIN_PATH = /^\/(?![\/\\])/;
var BLOB_URL = /^blob:/;
// eslint-disable-next-line no-control-regex
var CONTROL_CHARS = /[\u0000-\u001f\u007f]/;

export function safeImageUrl(value) {
  if (typeof value !== 'string' || !value) return '';
  if (CONTROL_CHARS.test(value)) return '';
  if (SAME_ORIGIN_PATH.test(value) || BLOB_URL.test(value)) return value;
  return '';
}

// Quotes a URL that has already passed safeImageUrl() for a CSS url().
// Escaping " and \ keeps a filename containing either inside the string.
export function cssUrl(value) {
  return 'url("' + String(value).replace(/["\\]/g, '\\$&') + '")';
}
