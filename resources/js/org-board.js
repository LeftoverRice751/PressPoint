document.addEventListener('DOMContentLoaded', () => {
  const root = document.querySelector('[data-org-board]');
  if (!root) {
    return;
  }

  const tabs = Array.from(root.querySelectorAll('[data-org-board-tab]'));
  const panels = Array.from(root.querySelectorAll('[data-org-board-panel]'));
  const defaultSection = root.getAttribute('data-default-section') || 'departments';

  const activateSection = (sectionName) => {
    tabs.forEach((tab) => {
      const isActive = tab.getAttribute('data-org-board-tab') === sectionName;
      tab.classList.toggle('is-active', isActive);
      tab.setAttribute('aria-pressed', isActive ? 'true' : 'false');
    });

    panels.forEach((panel) => {
      const isActive = panel.getAttribute('data-org-board-panel') === sectionName;
      panel.classList.toggle('is-active', isActive);
      panel.hidden = !isActive;
    });
  };

  tabs.forEach((tab) => {
    tab.addEventListener('click', () => {
      activateSection(tab.getAttribute('data-org-board-tab') || 'departments');
    });
  });

  activateSection(defaultSection);
});
