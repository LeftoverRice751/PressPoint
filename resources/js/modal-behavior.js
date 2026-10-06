/*
 * Shared <dialog> behaviour for the GEARS dashboard.
 *
 * Every modal on the dashboard is a native <dialog>, but each one wired its own
 * open/close and they disagreed: the events dialogs closed on a backdrop click
 * but had no `cancel` handler, so Escape dropped focus to <body>; tour-preview
 * and review-preview handled Escape but not a backdrop click; only the two
 * org-board dialogs did all of it and returned focus to the trigger. An editor
 * pressing Escape therefore landed somewhere different depending on which panel
 * they were in.
 *
 * This is the org-board wiring (org-board-editor.js, wireOrganizationsDialog)
 * lifted out verbatim rather than re-derived, so the one that was already
 * correct is the one everything now shares.
 *
 * Deliberately no showModal() fallback. Nothing here styles a dialog that is
 * merely `open`: there is no backdrop, no focus trap and no top-layer placement,
 * so an editor would get an unpositioned box floating in the page. See the note
 * in news-dashboard.js above the Story Library drawer -- not opening is the
 * honest failure.
 */
(function () {
  'use strict';

  function supported(dialog) {
    return !!dialog && typeof dialog.showModal === 'function';
  }

  /* The trigger is parked on the dialog node itself rather than in a module-level
     map so a dialog removed from the DOM takes its reference with it. */
  function open(dialog, trigger) {
    if (!supported(dialog) || dialog.open) {
      return false;
    }

    dialog._gearsTrigger = trigger || null;
    dialog.showModal();
    return true;
  }

  function close(dialog) {
    if (dialog && dialog.open && typeof dialog.close === 'function') {
      dialog.close();
    }
  }

  /*
   * options.onClose runs on every exit -- Escape, backdrop, a close button --
   * which is why `cancel` is cancelled and turned into a close() call: it gives
   * the dialog exactly one exit path to hang teardown on. tour-preview.js
   * disposes its Marzipano scene there, and had to listen on both events to
   * cover it before.
   */
  function wire(dialog, options) {
    if (!supported(dialog)) {
      return false;
    }

    var opts = options || {};

    dialog.addEventListener('cancel', function (event) {
      event.preventDefault();
      close(dialog);
    });

    // Only a click on the dialog element itself is the backdrop; a click that
    // lands on the panel bubbles up with the panel as its target.
    dialog.addEventListener('click', function (event) {
      if (event.target === dialog) {
        close(dialog);
      }
    });

    dialog.addEventListener('close', function () {
      var trigger = dialog._gearsTrigger;
      dialog._gearsTrigger = null;

      // Focus BEFORE onClose, not after: onClose is where a panel re-renders
      // (the org board redraws every card), and a re-render detaches the very
      // node we are trying to hand focus back to.
      //
      // isConnected guards the live-fragment panels for the same reason: a 20s
      // refresh can swap the row that opened the dialog while it is still on
      // screen, and focusing a detached node silently sends focus to <body>.
      if (trigger && trigger.isConnected && typeof trigger.focus === 'function') {
        trigger.focus();
      } else if (opts.fallbackFocus && opts.fallbackFocus.isConnected) {
        opts.fallbackFocus.focus();
      }

      if (typeof opts.onClose === 'function') {
        opts.onClose();
      }
    });

    return true;
  }

  window.GearsModal = {
    supported: supported,
    open: open,
    close: close,
    wire: wire
  };
})();
