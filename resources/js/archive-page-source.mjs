/* Where the archive reader gets a page image from.
 *
 * Extracted from kiosk-archive-book.js for the same reason
 * archive-render-scale.mjs was: the reader is one big DOMContentLoaded IIFE
 * and nothing inside it can be tested. This decision is worth testing, because
 * getting it wrong is not a visible error — it is the reader quietly falling
 * back to rasterising a ~100 MB PDF on the terminal's own CPU, which is
 * exactly the bug this module exists to prevent recurring.
 *
 * Three tiers, in order of cost:
 *
 *   1. `pageStorageBase` — a plain nginx URL. The server has told us (via
 *      `directPages`) that the page exists under `pageExtension`, so we can
 *      build the URL ourselves. No Python, no redirect, cacheable, and inside
 *      sw-archives.js's /storage/Archives/ scope.
 *   2. `pageUrlBase` — the on-demand route. Costs a gunicorn round-trip and a
 *      302, and is rate-limited, but it resolves either extension and renders
 *      the page if it is genuinely missing. Used past `directPages`: a
 *      pre-WebP archive, or one still being swept, where we cannot know the
 *      extension.
 *   3. '' — nothing server-side exists for this page; the caller falls back to
 *      pdf.js. Should only happen for an archive whose sweep never ran.
 */

export function hasServerPage(config, pageNumber) {
  const prewarmed = Number(config.prewarmedPages) || 0;
  const hasSource = !!config.pageStorageBase || !!config.pageUrlBase;
  return hasSource && pageNumber >= 1 && pageNumber <= prewarmed;
}

export function serverPageUrl(config, pageNumber) {
  if (!hasServerPage(config, pageNumber)) return '';

  const direct = Number(config.directPages) || 0;
  if (config.pageStorageBase && pageNumber <= direct) {
    const extension = config.pageExtension || '.webp';
    return `${config.pageStorageBase}/page-${pageNumber}${extension}`;
  }

  return config.pageUrlBase ? `${config.pageUrlBase}/${pageNumber}` : '';
}
