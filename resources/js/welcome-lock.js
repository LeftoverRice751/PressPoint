(function () {
  var configEl = document.getElementById('kiosk-config');
  var overlay = document.getElementById('lock-overlay');
  var pusherKey = configEl ? (configEl.getAttribute('data-pusher-key') || '').trim() : '';
  var cluster = configEl ? (configEl.getAttribute('data-pusher-cluster') || 'mt1') : 'mt1';

  if (!overlay || !pusherKey || typeof Pusher === 'undefined') {
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
})();
