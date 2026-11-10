/*
 * The post editor's photo: picking/dropping a file, previewing it, and
 * framing the photo by dragging (pan) and wheel / pinch / slider (zoom).
 *
 * Split out of post-editor.js by responsibility; that file owns the text
 * fields, source lines, expiry and saving. The framing maths is post-crop.mjs.
 *
 * Previews use URL.createObjectURL, so nothing uploads until Save; every URL
 * made here is revoked when replaced, or a long editing session leaks one
 * full-size photo per pick.
 */

import { DEFAULT_CROP, clampCrop, panBy, zoomBy, toStyle } from './post-crop.mjs';
import { PHOTO_MAX_BYTES, PHOTO_TOO_LARGE } from './post-editor-fields.mjs';
import { safeImageUrl } from './safe-image-url.mjs';

const IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/gif', 'image/webp'];
export const INVALID_IMAGE = 'Please upload a valid image file.';

/** The refusal the server would give, or '' when the file may be previewed. */
export function photoProblem(file) {
  if (!file || !IMAGE_TYPES.includes(file.type)) return INVALID_IMAGE;
  if (file.size > PHOTO_MAX_BYTES) return PHOTO_TOO_LARGE;
  return '';
}

/*
 * Every server-supplied src goes through safeImageUrl before it reaches img.src:
 * the row JSON and the save response are data, and a stored value of
 * `javascript:`/`data:`/off-site must render as "no image", never load.
 */

/** A post's stored photo path (e.g. "news/a.large.webp") as a same-origin URL, or ''. */
export function storagePhotoUrl(path) {
  if (typeof path !== 'string' || !path) return '';
  // A relative storage path never carries a scheme, a leading slash or a backslash;
  // refusing them here keeps "/storage/" from laundering one into a same-origin path.
  if (/^[a-z][a-z0-9+.-]*:/i.test(path) || path[0] === '/' || path.indexOf('\\') !== -1) {
    return '';
  }
  return safeImageUrl('/storage/' + path);
}

function firstFile(list) {
  return list && list.length ? list[0] : null;
}

export function createPhotoController({ stage, input, pickButton, zoomInput, hint, onChange, onError }) {
  const frame = stage.querySelector('.post-card__photo');
  let img = frame.querySelector('img');
  let crop = { ...DEFAULT_CROP };
  let file = null;
  let objectUrl = null;

  function revoke() {
    if (objectUrl) URL.revokeObjectURL(objectUrl);
    objectUrl = null;
  }

  function apply() {
    if (img) img.setAttribute('style', toStyle(crop));
    zoomInput.value = String(crop.zoom);
  }

  function show(rawSrc) {
    const src = safeImageUrl(rawSrc);
    if (!src) {
      if (img) img.remove();
      img = null;
      hint.hidden = false;
      zoomInput.disabled = true;
      apply();
      return;
    }
    if (!img) {
      img = document.createElement('img');
      img.alt = '';
      img.draggable = false;
      frame.appendChild(img);
    }
    img.src = src;
    hint.hidden = true;
    zoomInput.disabled = false;
    apply();
  }

  function accept(picked) {
    if (!picked) return;
    const problem = photoProblem(picked);
    if (problem) {
      onError(problem);
      return;
    }
    revoke();
    file = picked;
    objectUrl = URL.createObjectURL(picked);
    // A new photo has its own subject; the old framing means nothing for it.
    crop = { ...DEFAULT_CROP };
    show(objectUrl);
    onChange();
  }

  function setCrop(next) {
    crop = clampCrop(next);
    apply();
    onChange();
  }

  // A real button, so the picker is reachable from the keyboard; the file input
  // itself stays out of the tab order (it is visually hidden).
  if (pickButton) pickButton.addEventListener('click', () => input.click());

  input.addEventListener('change', () => {
    accept(firstFile(input.files));
    // Cleared so picking the SAME file again still fires `change`.
    input.value = '';
  });

  // ── Drop anywhere on the card ───────────────────────────────────────
  stage.addEventListener('dragover', (event) => {
    if (!event.dataTransfer || !Array.from(event.dataTransfer.types).includes('Files')) return;
    event.preventDefault();
    stage.classList.add('is-drop-target');
  });
  stage.addEventListener('dragleave', (event) => {
    if (!stage.contains(event.relatedTarget)) stage.classList.remove('is-drop-target');
  });
  stage.addEventListener('drop', (event) => {
    if (!event.dataTransfer || !event.dataTransfer.files.length) return;
    event.preventDefault();
    stage.classList.remove('is-drop-target');
    accept(firstFile(event.dataTransfer.files));
  });

  // ── Pan (one pointer) and pinch (two) ───────────────────────────────
  const pointers = new Map();
  let pinchDistance = 0;

  function distance() {
    const [a, b] = Array.from(pointers.values());
    return Math.hypot(a.x - b.x, a.y - b.y);
  }

  frame.addEventListener('pointerdown', (event) => {
    if (!img || event.button > 0) return;
    event.preventDefault();
    // Captured so a drag that leaves the photo keeps panning instead of
    // sticking the moment the pointer crosses into the text panel.
    frame.setPointerCapture(event.pointerId);
    pointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
    if (pointers.size === 2) pinchDistance = distance();
    frame.classList.add('is-dragging');
  });

  frame.addEventListener('pointermove', (event) => {
    const last = pointers.get(event.pointerId);
    if (!last || !img) return;
    const dx = event.clientX - last.x;
    const dy = event.clientY - last.y;
    pointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
    if (pointers.size === 1) {
      // Separate axes, separate frame sizes: the photo area is not square.
      setCrop(panBy(panBy(crop, dx, 0, frame.clientWidth), 0, dy, frame.clientHeight));
    } else if (pointers.size === 2) {
      const next = distance();
      if (pinchDistance > 0) setCrop(zoomBy(crop, next / pinchDistance));
      pinchDistance = next;
    }
  });

  function release(event) {
    pointers.delete(event.pointerId);
    if (pointers.size < 2) pinchDistance = 0;
    if (!pointers.size) frame.classList.remove('is-dragging');
  }
  frame.addEventListener('pointerup', release);
  frame.addEventListener('pointercancel', release);

  // Not passive: the wheel zooms the photo instead of scrolling the dashboard.
  frame.addEventListener('wheel', (event) => {
    if (!img) return;
    event.preventDefault();
    setCrop(zoomBy(crop, Math.exp(-event.deltaY * 0.0015)));
  }, { passive: false });

  zoomInput.addEventListener('input', () => {
    setCrop({ ...crop, zoom: Number(zoomInput.value) });
  });

  return {
    /** Show a saved post's photo (or none) with its stored framing. `src` is a URL. */
    load(src, savedCrop) {
      revoke();
      file = null;
      crop = clampCrop(savedCrop);
      show(src);
    },
    /** After a save the server copy replaces the local preview. */
    saved(src) {
      if (!file) return;
      file = null;
      if (src) {
        show(src);
        revoke();
      }
    },
    file: () => file,
    crop: () => ({ ...crop }),
  };
}
