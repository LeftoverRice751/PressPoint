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
  .js('resources/js/welcome-lock.js', 'storage/compiled/js')
  .postCss('resources/css/app.css', 'storage/compiled/css', [
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
  .postCss('resources/css/welcome-lock.css', 'storage/compiled/css', [
    //
  ])

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
