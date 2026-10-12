/*
 * Story Library print view: ?autoprint=1 opens the print dialog once the
 * page is actually ready. window.print() snapshots the page as it stands, so
 * firing on `load` alone can still capture fallback fonts or blank image
 * boxes -- the PDF would differ from the kiosk.
 */
(function () {
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

  Promise.all([fonts].concat(images)).then(function () {
    window.print();
  });
})();
