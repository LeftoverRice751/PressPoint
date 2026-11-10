/*
 * The post card's three text regions (kicker, headline, body) in editor mode.
 *
 * contenteditable="plaintext-only" already refuses markup; this adds the *_MAX
 * caps (post-editor-fields.mjs) and keeps kicker/headline to one line, for
 * typing AND paste. Split out of post-editor.js by responsibility.
 */

import { FIELD_MAX, fitInsert } from './post-editor-fields.mjs';

function selectedLength(el) {
  const selection = window.getSelection();
  if (!selection || !selection.rangeCount) return 0;
  const range = selection.getRangeAt(0);
  return el.contains(range.commonAncestorContainer) ? range.toString().length : 0;
}

function insertPlain(text) {
  // execCommand is deprecated but is still the only call that inserts at the
  // caret AND keeps the browser's undo stack; plaintext-only keeps it plain.
  if (text) document.execCommand('insertText', false, text);
}

function placeCaretAtEnd(el) {
  const range = document.createRange();
  range.selectNodeContents(el);
  range.collapse(false);
  const selection = window.getSelection();
  selection.removeAllRanges();
  selection.addRange(range);
}

export function wireTextFields({ card, counters, onInput }) {
  const fields = {};
  card.querySelectorAll('[data-field]').forEach((el) => {
    fields[el.getAttribute('data-field')] = el;
  });

  function read(name) {
    const el = fields[name];
    if (!el) return '';
    // innerText keeps the body's line breaks; the one-line fields never have any.
    return name === 'body' ? el.innerText.replace(/\n$/, '') : el.textContent;
  }

  function updateCounter(name) {
    const counter = counters.querySelector(`[data-post-counter="${name}"]`);
    if (!counter) return;
    const length = read(name).length;
    counter.textContent = `${length} / ${FIELD_MAX[name]}`;
    counter.classList.toggle('is-full', length >= FIELD_MAX[name]);
  }

  Object.keys(fields).forEach((name) => {
    const el = fields[name];
    const max = FIELD_MAX[name];
    const oneLine = name !== 'body';

    el.addEventListener('keydown', (event) => {
      if (oneLine && event.key === 'Enter') event.preventDefault();
    });

    el.addEventListener('beforeinput', (event) => {
      const type = event.inputType || '';
      if (type === 'insertFromPaste' || type.indexOf('insert') !== 0) return;
      const data = type === 'insertParagraph' || type === 'insertLineBreak' ? '\n' : event.data;
      if (data == null) return;
      if (oneLine && data === '\n') {
        event.preventDefault();
        return;
      }
      const fit = fitInsert(read(name).length, selectedLength(el), data, max);
      if (fit.length < data.length) {
        event.preventDefault();
        insertPlain(fit);
      }
    });

    el.addEventListener('paste', (event) => {
      event.preventDefault();
      let text = (event.clipboardData && event.clipboardData.getData('text/plain')) || '';
      if (oneLine) text = text.replace(/\s*\n\s*/g, ' ');
      insertPlain(fitInsert(read(name).length, selectedLength(el), text, max));
    });

    el.addEventListener('input', () => {
      // Backstop for anything beforeinput could not size (drag-and-drop text,
      // IME composition): cut to the cap rather than let it save truncated.
      if (read(name).length > max) {
        el.textContent = read(name).slice(0, max);
        placeCaretAtEnd(el);
      }
      updateCounter(name);
      onInput();
    });
  });

  return {
    read,
    set(name, value) {
      if (fields[name]) fields[name].textContent = value || '';
      updateCounter(name);
    },
  };
}
