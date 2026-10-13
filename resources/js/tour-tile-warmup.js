// Entry for tour-tile-warmup.mjs, published on window for kiosk-tour.js.
//
// kiosk-tour.js cannot `import` it: tests/js/tour-start-gate.test.mjs runs that
// file's source through new Function(), where a top-level import is a syntax
// error. Same window-bridge idea as data.js -> window.APP_DATA.
import { captureQuery, tileUrlsForScenes, warmTourTiles } from './tour-tile-warmup.mjs';

window.TourTileWarmup = { captureQuery, tileUrlsForScenes, warmTourTiles };
