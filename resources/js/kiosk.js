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
	const pusherKey = (cfg && cfg.dataset.pusherKey) || '';
	const cluster = (cfg && cfg.dataset.pusherCluster) || 'mt1';
	const idleStatus = 'Waiting for editorial to start a video…';

	function showStatus(text) {
		if (statusEl) {
			statusEl.textContent = text;
		}
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
		stage.classList.remove('is-loading', 'is-playing');
		stage.classList.add('is-idle');
		showStatus(idleStatus);
	}

	function playSrc(src, title) {
		if (!src) {
			return;
		}

		closeLoadingState();
		stage.classList.remove('is-idle');
		stage.classList.add('is-loading');
		showOverlay();
		showLoading('Loading metadata...');
		showStatus('Loading video metadata...');

		video.pause();
		video.src = src;
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
		};

		video.load();
	}

	function closeLoadingState() {
		hideLoading();
		stage.classList.remove('is-loading');
	}

	if (!pusherKey) {
		stage.classList.add('is-idle');
		showStatus('Broadcasting is not configured (.env Pusher keys). Local preview only.');
		return;
	}

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

			let built = raw;
			if (!raw.startsWith('http')) {
				built = raw.startsWith('/storage/')
					? raw
					: '/storage/' + String(raw).replace(/^\/+/, '');
			}

			playSrc(built, data && data.title);
		});
	}).catch(function () {
		showStatus('Pusher failed to load.');
	});
}

document.addEventListener('DOMContentLoaded', initKiosk);
