/* Mix provides a clean, fluent API for defining some Webpack build steps for your Masonite
applications. By default, we are compiling the CSS file for the application as well as
bundling up all the JS files. */
const mix = require('laravel-mix')
const path = require('path')


mix.js('resources/js/app.js', 'storage/compiled/js')
  .js('resources/js/auth-login.js', 'storage/compiled/js')
  .js('resources/js/auth-change-password.js', 'storage/compiled/js')
  .js('resources/js/auth-otp-code.js', 'storage/compiled/js')
  .js('resources/js/gears-dashboard.js', 'storage/compiled/js')
  .js('resources/js/dashboard-live.js', 'storage/compiled/js')
  .js('resources/js/upload-meter.js', 'storage/compiled/js')
  .js('resources/js/confirm-modal.js', 'storage/compiled/js')
  .js('resources/js/news-dashboard.js', 'storage/compiled/js')
  .js('resources/js/kiosk-archives.js', 'storage/compiled/js')
  .js('resources/js/kiosk-archive-book.js', 'storage/compiled/js')
  .js('resources/js/kiosk-map.js', 'storage/compiled/js')
  .js('resources/js/kiosk-news.js', 'storage/compiled/js')
  .js('resources/js/mobile-route.js', 'storage/compiled/js')
  .js('resources/js/kiosk-tour.js', 'storage/compiled/js')
  .js('resources/js/data.js', 'storage/compiled/js')
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
  .postCss('resources/css/welcome-screen.css', 'storage/compiled/css', [
    //
  ])
  .postCss('resources/css/auth-shell.css', 'storage/compiled/css', [
    //
  ])
  .postCss('resources/css/auth-login.css', 'storage/compiled/css', [
    //
  ])
  .postCss('resources/css/auth-change-password.css', 'storage/compiled/css', [
    //
  ])
  .postCss('resources/css/auth-otp-code.css', 'storage/compiled/css', [
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
  .postCss('resources/css/kiosk-archives.css', 'storage/compiled/css', [
    //
  ])
  .postCss('resources/css/kiosk-archive-book.css', 'storage/compiled/css', [
    //
  ])
  .postCss('resources/css/kiosk-map.css', 'storage/compiled/css', [
    //
  ])
  .postCss('resources/css/kiosk-loading.css', 'storage/compiled/css', [
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
mix.copy(
  "resources/js/sw-archives.js",
  "storage/compiled/js/sw-archives.js",
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
// Brand fonts — drop files into resources/fonts/{Columna,Gilroy,Gotham}/
// before deploying. The copy is a no-op if the directory is empty.
if (require('fs').existsSync('resources/fonts')) {
  mix.copy('resources/fonts', 'storage/compiled/fonts');
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
