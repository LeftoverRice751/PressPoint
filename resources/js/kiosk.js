const pusherScriptId = 'kiosk-pusher-script';

function loadPusherScript() {
	if (window.Pusher) {
		return Promise.resolve(window.Pusher);
	}

	return new Promise(function (resolve, reject) {
		const script = document.createElement('script');
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

function initKiosk() {
	const cfg = document.getElementById('kiosk-config');
	const stage = document.getElementById('kiosk-stage');

	if (!cfg || !stage) {
		return;
	}

	const loading = document.getElementById('kiosk-loading');
	const overlay = document.getElementById('kiosk-video-overlay');
	const wrap = document.getElementById('kiosk-video-wrap');
	const video = document.getElementById('kiosk-video');
	const statusEl = document.getElementById('kiosk-status');
	const noticeEl = document.getElementById('kiosk-notice');
	const pusherKey = (cfg && cfg.dataset.pusherKey) || '';
	const cluster = (cfg && cfg.dataset.pusherCluster) || 'mt1';
	const idleStatus = 'Waiting for editorial to start a video…';

	function showStage() {
		stage.hidden = false;
	}

	function hideStage() {
		stage.hidden = true;
	}

	function showStatus(text) {
		if (statusEl) {
			statusEl.textContent = text;
		}
	}

	function showNotice(text, tone) {
		if (!noticeEl || !text) {
			return;
		}

		noticeEl.textContent = text;
		noticeEl.setAttribute('data-tone', tone || '');
		noticeEl.classList.add('is-visible');

		window.clearTimeout(showNotice._timer);
		showNotice._timer = window.setTimeout(function () {
			noticeEl.classList.remove('is-visible');
		}, 3200);
	}

	function hideLoading() {
		loading.classList.remove('is-visible');
	}

	function hideOverlay() {
		if (overlay) {
			overlay.classList.remove('is-visible');
			overlay.setAttribute('aria-hidden', 'true');
		}
	}

	function showOverlay() {
		if (overlay) {
			overlay.classList.add('is-visible');
			overlay.setAttribute('aria-hidden', 'false');
		}
	}

	function showLoading(text) {
		if (text) {
			const subtitle = loading.querySelector('.kiosk-loading-subtitle');
			if (subtitle) {
				subtitle.textContent = text;
			}
		}

		loading.classList.add('is-visible');
	}

	function closeVideo() {
		video.pause();
		video.removeAttribute('src');
		video.load();
		video.onloadedmetadata = null;
		video.onerror = null;
		wrap.classList.remove('is-visible');
		hideOverlay();
		hideLoading();
		hideStage();
		stage.classList.remove('is-loading', 'is-playing');
		stage.classList.add('is-idle');
		showStatus(idleStatus);
	}

	function normalizeVideoSrc(raw) {
		if (!raw) {
			return '';
		}

		if (raw.indexOf('http://') === 0 || raw.indexOf('https://') === 0) {
			return raw;
		}

		return raw.indexOf('/storage/') === 0 ? raw : '/storage/' + String(raw).replace(/^\/+/, '');
	}

	// `quiet` suppresses the success banner. An editor pushing a video from the
	// dashboard needs the on-kiosk confirmation that their push landed; the
	// welcome screen's idle attract loop does not — nobody triggered it, so a
	// green "Now playing" toast over the attract video is noise aimed at a
	// visitor who never asked for it. Failure notices still fire either way.
	//
	// `loop` is the idle attract's too. Without it the 'ended' listener below
	// closed the stage when the video finished, but the welcome screen still
	// believed the attract was up — the menu sat there unattended with the
	// first visitor's tap swallowed as a "wake". Native looping never fires
	// 'ended', so the attract simply replays until somebody touches it. An
	// editor's push sets it back to false and still closes when it finishes.
	function playSrc(src, title, quiet, loop) {
		if (!src) {
			return;
		}

		closeLoadingState();
		stage.classList.remove('is-idle');
		stage.classList.add('is-loading');
		showOverlay();
		showLoading('Loading metadata...');
		showStatus('Loading video metadata...');
		if (!quiet) {
			showNotice(title ? ('Now playing: ' + title) : 'Video playback triggered', 'success');
		}

		video.pause();
		video.src = src;
		video.loop = !!loop;
		video.currentTime = 0;
		video.muted = false;
		video.volume = 1;
		video.preload = 'metadata';

		video.onloadedmetadata = function () {
			video.onloadedmetadata = null;
			video.onerror = null;
			hideLoading();
			stage.classList.remove('is-loading');
			stage.classList.add('is-playing');
			wrap.classList.add('is-visible');
			showStatus(title ? ('Playing: ' + title) : 'Playing video…');

			const promise = video.play();
			if (promise && typeof promise.catch === 'function') {
				promise.catch(function () {
					showStatus('Autoplay is blocked by the browser. Allow kiosk autoplay with sound or keep the page in kiosk mode.');
				});
			}
		};

		video.onerror = function () {
			video.onloadedmetadata = null;
			video.onerror = null;
			hideLoading();
			stage.classList.remove('is-loading');
			stage.classList.add('is-idle');
			showStatus('Unable to load the requested video.');
			showNotice('Unable to load the requested video.', 'danger');
		};

		video.load();
	}

	function closeLoadingState() {
		hideLoading();
		stage.classList.remove('is-loading');
	}

	// Seam for the welcome-screen idle scheduler. The idle attract loop
	// reuses this overlay + playback path so we don't duplicate state
	// machines. We also expose showStage so the caller can reveal the
	// stage before kicking off playback.
	window.__kioskPlaySrc = function (src, title, quiet, loop) {
		showStage();
		playSrc(src, title, quiet, loop);
	};
	window.__kioskCloseVideo = closeVideo;

	if (!pusherKey) {
		stage.classList.add('is-idle');
		showStatus('Broadcasting is not configured (.env Pusher keys). Local preview only.');
		return;
	}

	hideStage();
	stage.classList.add('is-idle');

	if (overlay) {
		overlay.addEventListener('click', function (event) {
			if ((wrap.classList.contains('is-visible') || stage.classList.contains('is-loading')) && video.src) {
				event.preventDefault();
				closeVideo();
			}
		});
	}

	video.addEventListener('ended', closeVideo);

	loadPusherScript().then(function (Pusher) {
		if (!Pusher) {
			showStatus('Pusher failed to load.');
			return;
		}

		const pusher = new Pusher(pusherKey, { cluster: cluster });
		const channel = pusher.subscribe('editorial');
		channel.bind('play-video', function (data) {
			const raw = data && (data.src || data.file_path);
			if (!raw) {
				return;
			}

			const built = normalizeVideoSrc(raw);

			showStage();
			playSrc(built, data && data.title);
		});
	}).catch(function () {
		showStatus('Pusher failed to load.');
	});
}

document.addEventListener('DOMContentLoaded', initKiosk);
