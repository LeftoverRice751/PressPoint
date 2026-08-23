/*
 * Status-bar clock, shared by every kiosk screen.
 *
 * Lifted out of welcome-screen.js so pages that show the status bar but not
 * the attract loop (About LSPU, and any screen added later) get the clock
 * without pulling in the Pusher/idle-video machinery.
 *
 * Pinned to campus time: a terminal whose system clock is set to the wrong
 * zone still shows the right hour. No aria-live — a clock that announces
 * itself every minute is noise for screen-reader users.
 */
(function () {
  var CLOCK_TZ = 'Asia/Manila';

  var dateEl = document.querySelector('[data-clock-date]');
  var timeEl = document.querySelector('[data-clock-time]');
  var stampEl = document.querySelector('[data-kiosk-clock]');
  if (!dateEl || !timeEl) return;

  // Matches the mockup's "FRI · 21 AUG" — short, tracked, unambiguous.
  var dateFmt = new Intl.DateTimeFormat('en-GB', {
    timeZone: CLOCK_TZ, weekday: 'short', day: '2-digit', month: 'short',
  });
  var timeFmt = new Intl.DateTimeFormat('en-US', {
    timeZone: CLOCK_TZ, hour: 'numeric', minute: '2-digit', hour12: true,
  });

  var timer = null;

  // Re-arms on the next minute boundary rather than every second: a fixed
  // interval drifts over the multi-week uptime this terminal sees, and ticking
  // per second would repaint 60x more often than the display changes.
  function render() {
    var now = new Date();
    dateFmt.formatToParts(now);
    // en-GB gives "Fri, 21 Aug"; the design separates every field with a dot.
    dateEl.textContent = dateFmt.format(now)
      .replace(/,/g, '')
      .replace(/\s+/g, ' · ')
      .toUpperCase();
    timeEl.textContent = timeFmt.format(now).toUpperCase();
    if (stampEl) stampEl.setAttribute('datetime', now.toISOString());

    if (timer) clearTimeout(timer);
    var msToNextMinute = 60000 - (now.getSeconds() * 1000 + now.getMilliseconds());
    timer = setTimeout(render, msToNextMinute + 50);
  }

  render();

  // Background tabs get their timers throttled, so the first frame after
  // waking would otherwise show a stale minute.
  document.addEventListener('visibilitychange', function () {
    if (!document.hidden) render();
  });
})();
