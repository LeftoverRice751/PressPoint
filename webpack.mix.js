/* Mix provides a clean, fluent API for defining some Webpack build steps for your Masonite
applications. By default, we are compiling the CSS file for the application as well as
bundling up all the JS files. */
const mix = require('laravel-mix')
const path = require('path')


mix.js('resources/js/app.js', 'storage/compiled/js')
  .js('resources/js/auth-password-toggle.js', 'storage/compiled/js')
  .js('resources/js/auth-login.js', 'storage/compiled/js')
  .js('resources/js/auth-change-password.js', 'storage/compiled/js')
  .js('resources/js/auth-otp-code.js', 'storage/compiled/js')
  .js('resources/js/rate-limit-modal.js', 'storage/compiled/js')
  .js('resources/js/tab-slot.js', 'storage/compiled/js')
  .js('resources/js/gears-dashboard.js', 'storage/compiled/js')
  .js('resources/js/dashboard-live.js', 'storage/compiled/js')
  .js('resources/js/upload-meter.js', 'storage/compiled/js')
  .js('resources/js/confirm-modal.js', 'storage/compiled/js')
  .js('resources/js/news-dashboard.js', 'storage/compiled/js')
  .js('resources/js/review-queue.js', 'storage/compiled/js')
  .js('resources/js/tour-preview.js', 'storage/compiled/js')
  .js('resources/js/kiosk-archives.js', 'storage/compiled/js')
  .js('resources/js/kiosk-archive-book.js', 'storage/compiled/js')
  .js('resources/js/kiosk-map.js', 'storage/compiled/js')
  .js('resources/js/kiosk-news.js', 'storage/compiled/js')
  .js('resources/js/mobile-route.js', 'storage/compiled/js')
  .js('resources/js/mobile-archives.js', 'storage/compiled/js')
  .js('resources/js/cookie-consent.js', 'storage/compiled/js')
  .js('resources/js/kiosk-tour.js', 'storage/compiled/js')
  .js('resources/js/tour-charter.js', 'storage/compiled/js')
  .js('resources/js/data.js', 'storage/compiled/js')
  .js('resources/js/kiosk-clock.js', 'storage/compiled/js')
  .js('resources/js/kiosk-content.js', 'storage/compiled/js')
  .js('resources/js/welcome-screen.js', 'storage/compiled/js')
  .js('resources/js/welcome-lock.js', 'storage/compiled/js')
  .js('resources/js/about-lspu-kiosk.js', 'storage/compiled/js')
  .js('resources/js/about-lspu-editor.js', 'storage/compiled/js')
  .js('resources/js/org-board.js', 'storage/compiled/js')
  .js('resources/js/org-chart-layout.js', 'storage/compiled/js')
  .js('resources/js/org-board-editor.js', 'storage/compiled/js')
  .postCss('resources/css/app.css', 'storage/compiled/css', [
    //
  ])
  .postCss('resources/css/kiosk-tokens.css', 'storage/compiled/css', [
    //
  ])
  // Kiosk-only seven-colour palette; must load after kiosk-tokens.css and
  // before the per-page sheet. See the header of the file for why it is
  // separate from kiosk-tokens.css.
  .postCss('resources/css/kiosk-palette.css', 'storage/compiled/css', [
    //
  ])
  .postCss('resources/css/kiosk-shell.css', 'storage/compiled/css', [
    //
  ])
  .postCss('resources/css/welcome-screen.css', 'storage/compiled/css', [
    //
  ])
  .postCss('resources/css/auth-shell.css', 'storage/compiled/css', [
    //
  ])
  .postCss('resources/css/auth-admin.css', 'storage/compiled/css', [
    //
  ])
  .postCss('resources/css/gears-dashboard.css', 'storage/compiled/css', [
    //
  ])
  .postCss('resources/css/dropzone.css', 'storage/compiled/css', [
    //
  ])
  .postCss('resources/css/upload-meter.css', 'storage/compiled/css', [
    //
  ])
  .postCss('resources/css/confirm-modal.css', 'storage/compiled/css', [
    //
  ])
  .postCss('resources/css/news-dashboard.css', 'storage/compiled/css', [
    //
  ])
  .postCss('resources/css/review-queue.css', 'storage/compiled/css', [
    //
  ])
  .postCss('resources/css/admin-console.css', 'storage/compiled/css', [
    //
  ])
  .postCss('resources/css/kiosk-archives.css', 'storage/compiled/css', [
    //
  ])
  .postCss('resources/css/kiosk-archive-book.css', 'storage/compiled/css', [
    //
  ])
  // Phone surface for the archives. Sibling to kiosk-archives.css -- both
  // are skins over the same ArchivesController payload; see the file header.
  .postCss('resources/css/mobile-archives.css', 'storage/compiled/css', [
    //
  ])
  .postCss('resources/css/cookie-consent.css', 'storage/compiled/css', [
    //
  ])
  .postCss('resources/css/kiosk-map.css', 'storage/compiled/css', [
    //
  ])
  .postCss('resources/css/kiosk-loading.css', 'storage/compiled/css', [
    //
  ])
  .postCss('resources/css/error-page.css', 'storage/compiled/css', [
    //
  ])
  .postCss('resources/css/rate-limit-modal.css', 'storage/compiled/css', [
    //
  ])
  .postCss('resources/css/kiosk-tour.css', 'storage/compiled/css', [
    //
  ])
  .postCss('resources/css/mobile-route.css', 'storage/compiled/css', [
    //
  ])
  .postCss('resources/css/kiosk-news.css', 'storage/compiled/css', [
    //
  ])
  .postCss('resources/css/newsletter-type.css', 'storage/compiled/css', [
    //
  ])
  .postCss('resources/css/welcome-lock.css', 'storage/compiled/css', [
    //
  ])
  .postCss('resources/css/about-lspu-kiosk.css', 'storage/compiled/css', [
    //
  ])
  .postCss('resources/css/about-lspu-editor.css', 'storage/compiled/css', [
    //
  ])
  .postCss('resources/css/org-board.css', 'storage/compiled/css', [
    //
  ])
  .postCss('resources/css/kiosk-nav.css', 'storage/compiled/css', [
    //
  ])
  .postCss('resources/css/tour-charter.css', 'storage/compiled/css', [
    //
  ])

// Vendor pdf.js (used by the archive book reader). Copy the minified ESM
// build + worker straight into the compiled assets so they ship with the
// rest of the kiosk JS and can be loaded as modules from /assets/js/pdfjs/.
mix.copy(
  "node_modules/pdfjs-dist/legacy/build/pdf.min.mjs",
  "storage/compiled/js/pdfjs/pdf.min.mjs",
)
mix.copy(
  "node_modules/pdfjs-dist/legacy/build/pdf.worker.min.mjs",
  "storage/compiled/js/pdfjs/pdf.worker.min.mjs",
)
// pdf.js 5's image decoders, which live outside the worker bundle and are
// fetched at runtime from the `wasmUrl` directory (set in
// resources/js/kiosk-archive-book.js). Without them the worker warns and the
// page renders with those images missing:
//
//   openjpeg  — JPEG2000. Print-workflow PDFs use it constantly, so this is
//               the one that actually bites a scanned newspaper archive.
//   jbig2     — JBIG2, the bilevel codec scanners emit for text pages.
//   qcms_bg   — ICC colour spaces. Its absence is the explicit
//               "No ICC color space support due to missing `wasmUrl` API
//               option" warning, and it costs colour fidelity on the folios.
//
// The *_nowasm_fallback.js files are the pure-JS decoders pdf.js dynamic
// imports only when instantiating the matching .wasm fails. They are dead
// weight on disk and never fetched in the normal path, but they mean a
// tightened CSP (one that drops 'wasm-unsafe-eval') degrades to slow images
// rather than no images.
//
// Listed file by file rather than copying node_modules/pdfjs-dist/wasm
// wholesale, and this is deliberate: that directory also contains
// quickjs-eval.wasm, which is the QuickJS interpreter pdf.js uses to execute
// a *document's own JavaScript* in its viewer sandbox. This reader never
// builds that sandbox (see the getDocument comment in kiosk-archive-book.js),
// and an unattended public kiosk should not be serving the engine that would
// run a hostile PDF's code even in principle. Do not swap this for a
// directory copy.
;[
  "openjpeg.wasm",
  "openjpeg_nowasm_fallback.js",
  "jbig2.wasm",
  "jbig2_nowasm_fallback.js",
  "qcms_bg.wasm",
].forEach((file) => {
  mix.copy(
    `node_modules/pdfjs-dist/wasm/${file}`,
    `storage/compiled/js/pdfjs/wasm/${file}`,
  )
})
// <model-viewer> for the virtual tour's 3D citizen's charter. Vendored, not
// pulled from a CDN: the kiosk is a fixed terminal and every other third-party
// runtime here (Marzipano, pdf.js, Leaflet) is self-hosted for the same reason.
// mix.copy rather than an import — it is a self-registering custom element
// loaded as a module <script>, and bundling it would drag ~1 MB of WebGL into
// a page that may never show the model.
mix.copy(
  "node_modules/@google/model-viewer/dist/model-viewer.min.js",
  "storage/compiled/js/model-viewer/model-viewer.min.js",
)
mix.copy(
  "resources/js/sw-archives.js",
  "storage/compiled/js/sw-archives.js",
)
// Kiosk offline shell. mix.copy, not mix.js: webpack's module wrapper
// breaks a service worker. Served from / by WelcomeController.serve_sw.
mix.copy(
  "resources/js/sw-kiosk.js",
  "storage/compiled/js/sw-kiosk.js",
)
// Self-contained Leaflet plugin (IIFE) — vendored as-is. It ships with its
// own embedded GeoJSON and needs no bundling; both kiosk-map and mobile-route
// load it directly via a <script> tag before their own bundles.
mix.copy(
  "resources/js/campus-2.5d.layer.js",
  "storage/compiled/js/campus-2.5d.layer.js",
)
// Leaflet itself, self-hosted rather than pulled from unpkg.com — required
// for the mobile-route page to work fully offline (a service worker can't
// precache a CDN it doesn't control the caching headers of as reliably as
// this), and swapped in everywhere else Leaflet loads for consistency. Whole
// directory, not just leaflet.js/css: the stylesheet's `url(images/...)`
// references are relative and need the sibling images/ folder alongside it.
mix.copy(
  "node_modules/leaflet/dist",
  "storage/compiled/vendor/leaflet",
)
mix.copy(
  "resources/js/sw-mobile-route.js",
  "storage/compiled/js/sw-mobile-route.js",
)
// Vendor Swiper's stylesheet the same way as pdf.js rather than
// `import 'swiper/css'` in a JS entry: Mix extracts JS-imported CSS to
// storage/compiled/js/<entry>.css — an unlinked path that shadows the
// real /assets/css/ stylesheet. A verbatim copy is deterministic.
mix.copy(
  "node_modules/swiper/swiper-bundle.min.css",
  "storage/compiled/css/swiper-bundle.min.css",
)
// Quill's snow theme stylesheet — vendored (not JS-imported) for the same
// reason as Swiper above; linked from the dashboard where the news editor lives.
mix.copy(
  "node_modules/quill/dist/quill.snow.css",
  "storage/compiled/css/quill.snow.css",
)
// Brand fonts — resources/fonts/{Moderniz,Gilroy}/ → /assets/fonts/, which is
// what the @font-face urls in resources/css/kiosk-tokens.css point at.
//
// This copy used to sit behind `if (fs.existsSync('resources/fonts'))`. The
// directory didn't exist, so the copy silently never registered and every page
// fired seven font 404s that nobody saw — nginx has `access_log off` on
// /assets/. The guard is gone on purpose: a missing directory must now fail the
// build loudly. resources/fonts/ is committed (README + .gitkeep); the licensed
// binaries are not, so a fresh clone builds but renders fallback faces until
// they're dropped in. `npm run prod` prints the warning below when that's the case.
mix.copy("resources/fonts", "storage/compiled/fonts")

const brandFontCount = require("fs")
  .readdirSync("resources/fonts", { withFileTypes: true })
  .filter((e) => e.isDirectory())
  .reduce(
    (n, dir) =>
      n +
      require("fs")
        .readdirSync(`resources/fonts/${dir.name}`)
        .filter((f) => /\.(woff2?|otf|ttf)$/i.test(f)).length,
    0,
  )
if (brandFontCount === 0) {
  console.warn(
    "\n  ⚠  No brand font binaries in resources/fonts/ — Moderniz and Gilroy\n" +
      "     will render as fallback faces. See resources/fonts/README.md.\n",
  )
}

// ensure root directory of mix is project root
mix.setPublicPath(".")

// add an alias to js code
mix.alias({
  "@": path.resolve("resources/js/"),
})

// add version hash in production
if (mix.inProduction()) {
  mix.version()
}
// Disable compilation success notification
mix.disableSuccessNotifications()
