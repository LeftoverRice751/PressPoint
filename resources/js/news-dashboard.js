(function () {
  var dashboardRoot = document.querySelector('[data-dashboard-shell]');

  if (!dashboardRoot) {
    return;
  }

  var newsModal = dashboardRoot.querySelector('[data-news-modal]');
  var openNewsModalOnLoad = dashboardRoot.getAttribute('data-open-news-modal') === 'true';
  var composer = dashboardRoot.querySelector('[data-news-composer]');

  function toTitleCase(value) {
    if (!value) {
      return '';
    }

    return String(value)
      .replace(/[-_]+/g, ' ')
      .replace(/\s+/g, ' ')
      .trim()
      .replace(/\b\w/g, function (match) {
        return match.toUpperCase();
      });
  }

  function setActiveButton(group, selector, attributeName, value) {
    if (!group) {
      return;
    }

    Array.prototype.slice.call(group.querySelectorAll(selector)).forEach(function (button) {
      var isActive = button.getAttribute(attributeName) === value;
      button.classList.toggle('is-active', isActive);
      button.setAttribute('aria-pressed', String(isActive));
    });
  }

  function setText(node, value, fallback) {
    if (!node) {
      return;
    }

    node.textContent = value && String(value).trim() ? String(value) : (fallback || '');
  }

  function fieldValue(field, fallback) {
    if (!field) {
      return fallback || '';
    }

    return field.value ? String(field.value) : (fallback || '');
  }

  function getComposerFields(root) {
    if (!root) {
      return {};
    }

    var form = root.querySelector('[data-news-form]');

    return {
      form: form,
      title: form ? form.querySelector('[data-news-field="title"]') : null,
      description: form ? form.querySelector('[data-news-field="description"]') : null,
      source: form ? form.querySelector('[data-news-field="source"]') : null,
      location: form ? form.querySelector('[data-news-field="location"]') : null,
      priority: form ? form.querySelector('[data-news-field="priority"]') : null,
      publishedAt: form ? form.querySelector('[data-news-field="published_at"]') : null,
      image: form ? form.querySelector('[data-news-field="image"]') : null,
      layout: form ? form.querySelector('[data-news-layout-field]') : null,
      slotButtons: Array.prototype.slice.call(root.querySelectorAll('[data-news-slot-choice]')),
      previewTitle: root.querySelector('[data-news-preview-title]'),
      previewCopy: root.querySelector('[data-news-preview-copy]'),
      previewSlot: root.querySelector('[data-news-preview-slot]'),
      previewImageWrap: root.querySelector('[data-news-preview-media]'),
      libraryItems: Array.prototype.slice.call(root.querySelectorAll('[data-news-library-item]')),
      loadButtons: Array.prototype.slice.call(root.querySelectorAll('[data-news-load-story]'))
    };
  }

  function applyPreviewImage(fields, source) {
    if (!fields.previewImageWrap) {
      return;
    }

    if (fields.previewObjectUrl) {
      try {
        window.URL.revokeObjectURL(fields.previewObjectUrl);
      } catch (error) {
        // Ignore revocation errors.
      }
      fields.previewObjectUrl = null;
    }

    if (!source) {
      fields.previewImageWrap.innerHTML = '<div class="news-preview__image news-preview__image--fallback" aria-hidden="true"></div>';
      return;
    }

    if (typeof source === 'string') {
      fields.previewImageWrap.innerHTML = '<img class="news-preview__image" src="' + source + '" alt="Story cover preview">';
      return;
    }

    var objectUrl = window.URL.createObjectURL(source);
    fields.previewObjectUrl = objectUrl;
    fields.previewImageWrap.innerHTML = '<img class="news-preview__image" src="' + objectUrl + '" alt="Story cover preview">';
  }

  function syncComposer(fields) {
    if (!fields.form) {
      return;
    }

    var titleValue = fieldValue(fields.title, '').trim();
    var descriptionValue = fieldValue(fields.description, '').trim();
    var layoutValue = fieldValue(fields.layout, 'main');

    if (titleValue) {
      setText(fields.previewTitle, titleValue, 'Your headline here');
    }

    if (descriptionValue) {
      setText(fields.previewCopy, descriptionValue, 'Your story summary appears here. Write something compelling.');
    }

    if (layoutValue) {
      setText(fields.previewSlot, toTitleCase(layoutValue) + ' slot', 'Lead slot');
    }

    setActiveButton(fields.form, '[data-news-slot-choice]', 'data-news-slot-choice', layoutValue || 'main');

    fields.slotButtons.forEach(function (button) {
      button.setAttribute('aria-pressed', String(button.getAttribute('data-news-slot-choice') === fieldValue(fields.layout, 'main')));
    });
  }

  function populateComposerFromCard(fields, card) {
    if (!fields.form || !card) {
      return;
    }

    if (fields.title) {
      fields.title.value = card.getAttribute('data-news-library-title') || '';
    }

    if (fields.description) {
      fields.description.value = card.getAttribute('data-news-library-description') || '';
    }

    if (fields.source) {
      fields.source.value = card.getAttribute('data-news-library-source') || '';
    }

    if (fields.location) {
      fields.location.value = card.getAttribute('data-news-library-location') || '';
    }

    if (fields.layout) {
      fields.layout.value = card.getAttribute('data-news-library-layout') || 'secondary';
    }

    if (fields.status) {
      fields.status.value = card.getAttribute('data-news-library-status') || 'approved';
    }

    if (fields.priority) {
      fields.priority.value = card.getAttribute('data-news-library-priority') || '0';
    }

    var libraryImage = card.getAttribute('data-news-library-image') || '';

    if (fields.publishedAt) {
      fields.publishedAt.value = '';
    }

    syncComposer(fields);
    applyPreviewImage(fields, libraryImage ? '/storage/' + libraryImage.replace(/\\/g, '/') : null);

    [fields.title, fields.description, fields.source, fields.location, fields.priority, fields.publishedAt].forEach(function (field) {
      if (field) {
        field.dispatchEvent(new Event('input', { bubbles: true }));
      }
    });
  }

  function bindComposer() {
    if (!composer) {
      return;
    }

    var fields = getComposerFields(composer);
    var syncing = false;

    if (fields.previewTitle) {
      fields.previewTitle.addEventListener('input', function () {
        if (syncing || !fields.title) {
          return;
        }

        syncing = true;
        fields.title.value = fields.previewTitle.textContent.trim();
        syncComposer(fields);
        syncing = false;
      });
    }

    if (fields.previewCopy) {
      fields.previewCopy.addEventListener('input', function () {
        if (syncing || !fields.description) {
          return;
        }

        syncing = true;
        fields.description.value = fields.previewCopy.textContent.trim();
        syncComposer(fields);
        syncing = false;
      });
    }

    [fields.title, fields.description, fields.source, fields.location, fields.priority, fields.publishedAt].forEach(function (field) {
      if (!field) {
        return;
      }

      field.addEventListener('input', function () {
        if (syncing) {
          return;
        }

        syncing = true;
        syncComposer(fields);
        syncing = false;
      });
    });

    if (fields.image) {
      fields.image.addEventListener('change', function () {
        applyPreviewImage(fields, fields.image.files && fields.image.files[0] ? fields.image.files[0] : null);
      });
    }

    fields.slotButtons.forEach(function (button) {
      button.addEventListener('click', function () {
        if (!fields.layout) {
          return;
        }

        fields.layout.value = button.getAttribute('data-news-slot-choice') || 'secondary';
        syncComposer(fields);
      });
    });

    fields.loadButtons.forEach(function (button) {
      button.addEventListener('click', function () {
        populateComposerFromCard(fields, button.closest('[data-news-library-item]'));
      });
    });

    if (fields.form) {
      fields.form.addEventListener('reset', function () {
        window.setTimeout(function () {
          syncComposer(fields);
          applyPreviewImage(fields, null);
        }, 0);
      });
    }

    syncComposer(fields);
  }

  function openNewsModal() {
    if (!newsModal) {
      return;
    }

    if (typeof newsModal.showModal === 'function') {
      newsModal.showModal();
      return;
    }

    newsModal.hidden = false;
    newsModal.classList.add('is-open');
  }

  function closeNewsModal() {
    if (!newsModal) {
      return;
    }

    if (typeof newsModal.close === 'function') {
      newsModal.close();
      return;
    }

    newsModal.hidden = true;
    newsModal.classList.remove('is-open');
  }

  dashboardRoot.addEventListener('click', function (event) {
    var newsModalTrigger = event.target.closest('[data-news-modal-open]');
    if (newsModalTrigger && dashboardRoot.contains(newsModalTrigger)) {
      event.preventDefault();
      openNewsModal();
      return;
    }

    var newsModalClose = event.target.closest('[data-news-modal-close]');
    if (newsModalClose && dashboardRoot.contains(newsModalClose)) {
      event.preventDefault();
      closeNewsModal();
    }
  });

  if (newsModal) {
    newsModal.addEventListener('click', function (event) {
      if (event.target === newsModal) {
        closeNewsModal();
      }
    });
  }

  if (openNewsModalOnLoad) {
    openNewsModal();
  }

  bindComposer();
})();