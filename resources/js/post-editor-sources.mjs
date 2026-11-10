/*
 * The source-line rows under the post card (icon <select> + text + remove, up
 * to three) and their live mirror in the card's footer. Split out of
 * post-editor.js by responsibility; the rules are post-sources.mjs.
 *
 * The card's icons are cloned from <template data-post-icon> elements rendered
 * from kiosk/_post_source_icon.html, so no SVG markup lives in this file.
 */

import { cleanRow, SOURCE_ICONS, SOURCE_LINES_MAX, SOURCE_TEXT_MAX } from './post-sources.mjs';

const ICON_LABELS = {
  facebook: 'Facebook', email: 'Email', instagram: 'Instagram', website: 'Website', link: 'Link',
};

export function createSourcesEditor({ panel, card, container, addButton, onChange }) {
  let rows = [];

  function iconNode(icon) {
    const template = panel.querySelector(`template[data-post-icon="${icon}"]`) ||
      panel.querySelector('template[data-post-icon="link"]');
    return template ? template.content.cloneNode(true) : document.createDocumentFragment();
  }

  function renderCard() {
    const list = card.querySelector('.post-card__sources');
    list.innerHTML = '';
    rows.forEach((row) => {
      // The card shows what will be stored: blank rows are dropped, text capped.
      const clean = cleanRow(row);
      if (!clean) return;
      const li = document.createElement('li');
      li.setAttribute('data-icon', clean.icon);
      li.appendChild(iconNode(clean.icon));
      const span = document.createElement('span');
      span.textContent = clean.text;
      li.appendChild(span);
      list.appendChild(li);
    });
  }

  function renderRows() {
    container.innerHTML = '';
    rows.forEach((row, index) => {
      const wrap = document.createElement('div');
      wrap.className = 'post-sources-editor__row';

      const select = document.createElement('select');
      select.setAttribute('aria-label', `Icon for line ${index + 1}`);
      SOURCE_ICONS.forEach((icon) => {
        const option = document.createElement('option');
        option.value = icon;
        option.textContent = ICON_LABELS[icon] || icon;
        option.selected = icon === row.icon;
        select.appendChild(option);
      });
      select.addEventListener('change', () => {
        row.icon = select.value;
        renderCard();
        onChange();
      });

      const input = document.createElement('input');
      input.type = 'text';
      input.maxLength = SOURCE_TEXT_MAX;
      input.value = row.text;
      input.placeholder = 'e.g. /TheGearsOfficial';
      input.setAttribute('aria-label', `Text for line ${index + 1}`);
      input.addEventListener('input', () => {
        row.text = input.value;
        renderCard();
        onChange();
      });

      const remove = document.createElement('button');
      remove.type = 'button';
      remove.className = 'ghost-button';
      remove.textContent = 'Remove';
      remove.addEventListener('click', () => {
        rows.splice(index, 1);
        render();
        onChange();
      });

      wrap.append(select, input, remove);
      container.appendChild(wrap);
    });
    addButton.disabled = rows.length >= SOURCE_LINES_MAX;
  }

  function render() {
    renderRows();
    renderCard();
  }

  addButton.addEventListener('click', () => {
    if (rows.length >= SOURCE_LINES_MAX) return;
    rows.push({ icon: 'link', text: '' });
    render();
    const inputs = container.querySelectorAll('input');
    if (inputs.length) inputs[inputs.length - 1].focus();
  });

  return {
    set(next) {
      rows = (next || []).map((line) => ({ icon: line.icon, text: line.text }));
      render();
    },
    rows: () => rows,
  };
}
