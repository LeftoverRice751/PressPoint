/*
 * Story Library print view.
 *
 * Every image is forced to loading="eager" first, autoprint or not. The kiosk
 * partial marks side-story and photo-essay images loading="lazy", and on a
 * tabloid-tall page most of them sit below the fold: the browser never starts
 * fetching them, so a manual print would show blank photos and the wait below
 * would never end. The kiosk keeps its lazy loading; only this page overrides.
 *
 * ?autoprint=1 then opens the print dialog once the page is actually ready.
 * window.print() snapshots the page as it stands, so firing on `load` alone
 * can still capture fallback fonts or blank image boxes -- the PDF would
 * differ from the kiosk. A 10 s ceiling keeps one broken image URL (which may
 * neither load nor error promptly) from blocking the dialog forever.
 */
(function () {
  var PRINT_TIMEOUT_MS = 10000;

  Array.prototype.forEach.call(document.images, function (img) {
    img.loading = 'eager';
  });

  if (document.body.getAttribute('data-autoprint') !== '1') return;

  function settled(img) {
    if (img.complete) return Promise.resolve();
    return new Promise(function (resolve) {
      img.addEventListener('load', resolve, { once: true });
      img.addEventListener('error', resolve, { once: true });
    });
  }

  var fonts = document.fonts && document.fonts.ready ? document.fonts.ready : Promise.resolve();
  var images = Array.prototype.map.call(document.images, settled);

  var printed = false;
  function printOnce() {
    if (printed) return;
    printed = true;
    window.print();
  }

  Promise.all([fonts].concat(images)).then(printOnce);
  setTimeout(printOnce, PRINT_TIMEOUT_MS);
})();
