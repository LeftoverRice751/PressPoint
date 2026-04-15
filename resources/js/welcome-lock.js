(function () {
  var pusherScriptId = 'welcome-lock-pusher-script';

  function loadPusherScript() {
    if (window.Pusher) {
      return Promise.resolve(window.Pusher);
    }

    return new Promise(function (resolve, reject) {
      var script = document.createElement('script');
      script.id = pusherScriptId;
      script.src = 'https://js.pusher.com/8.2.0/pusher.min.js';
      script.async = true;
      script.onload = function () {
        resolve(window.Pusher);
      };
      script.onerror = reject;
      document.head.appendChild(script);
    });
  }

  function initLockOverlay() {
    var configEl = document.getElementById('kiosk-config');
    var overlay = document.getElementById('lock-overlay');
    var pusherKey = configEl ? (configEl.getAttribute('data-pusher-key') || '').trim() : '';
    var cluster = configEl ? (configEl.getAttribute('data-pusher-cluster') || 'mt1') : 'mt1';

    if (!overlay || !pusherKey) {
      return;
    }

    loadPusherScript().then(function (Pusher) {
      if (!Pusher) {
        return;
      }

      var pusher = new Pusher(pusherKey, { cluster: cluster });
      var channel = pusher.subscribe('kiosk-channel');

      channel.bind('app.events.LockKioskEvent', function (data) {
        if (data && data.status === 'lock') {
          overlay.style.display = 'block';
          console.log('Kiosk Locked');
        } else {
          overlay.style.display = 'none';
          console.log('Kiosk Unlocked');
        }
      });
    }).catch(function () {
      return;
    });
  }

  document.addEventListener('DOMContentLoaded', initLockOverlay);
})();
