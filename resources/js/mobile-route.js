/*
 * Mobile route page.
 *
 * Lifecycle:
 *   1. Read the token + expired flag the server stamped onto the root element.
 *   2. If expired, show the notice and bail — no map, no fetch.
 *   3. Otherwise fetch /api/route-sessions/<token> for start + destination,
 *      which now also carries `geo_transform` (WGS84->layer-pixel matrix)
 *      and `destination.wgs84` (real lat/lng, for the arrival check only).
 *   4. Draw the 2.5D campus (L.campus25d — same self-contained plugin the
 *      kiosk uses; see resources/js/campus-2.5d.layer.js) and overlay the
 *      selected route polyline from the serialized location coordinates.
 *   5. Ask for the phone's location (navigator.geolocation.watchPosition).
 *      Each reading is pushed through the same projective transform
 *      app/services/CampusGeoTransform.py derives server-side, landing it in
 *      the route polyline's own pixel space, then projected onto the
 *      polyline to trim off the walked portion — the line "decreasing" is
 *      this trim, redrawn on every reading. Arrival is judged separately, in
 *      real meters (haversine against `destination.wgs84`), because the
 *      trim above is cosmetic and only as good as a 4-point homography plus
 *      phone GPS noise — good enough to watch a line shrink, not to place a
 *      person to the pixel.
 *   6. Wire the Finish button -> POST /api/route-sessions/<token>/finish as
 *      a manual fallback for denied/unavailable/inaccurate GPS; arrival
 *      detected live calls the same endpoint automatically.
 */
document.addEventListener('DOMContentLoaded', () => {
    const root = document.querySelector('.mobile-route');
    if (!root || typeof L === 'undefined') {
        return;
    }

    const token = root.dataset.token;
    const startedExpired = root.dataset.expired === 'true';
    const subtitle = document.getElementById('mobile-route-subtitle');
    const statusPill = document.getElementById('mobile-route-status');
    const finishButton = document.getElementById('mobile-route-finish');
    const expiredNotice = document.getElementById('mobile-route-expired');
    const modal = document.getElementById('mobile-route-modal');

    // Meters from the destination's real WGS84 point within which the walk
    // counts as "arrived." Wider than a building's footprint on purpose:
    // phone GPS is typically 5-15m accurate outdoors, worse near buildings,
    // and the transform itself is a 4-point fit -- a tight radius would
    // just make arrival never fire.
    const ARRIVAL_RADIUS_METERS = 15;

    // Skip redrawing the trimmed route line for GPS jitter under this many
    // pixels of movement in layer space -- otherwise a stationary phone's
    // GPS noise redraws the polyline on every reading for no visible change.
    const TRACK_MIN_PIXEL_DELTA = 3;

    const DRONE_BASE_CAMERA_DISTANCE = 1.7;
    const DRONE_BASE_HEIGHT_SCALE = 1;
    const DRONE_FOCUS_CAMERA_DISTANCE = 2.6;
    const DRONE_FOCUS_HEIGHT_SCALE = 1.5;
    const DRONE_FOCUS_ZOOM_BUMP = 1.8;
    const DRONE_DESCENT_MS = 1400;
    const ROUTE_STYLE = {
        color: '#ff5b13',
        weight: 6,
        opacity: 0.95,
        dashArray: '12, 8',
        lineCap: 'square',
        lineJoin: 'miter',
    };

    // Declared ahead of showExpired() below: the expired-on-load path calls
    // it immediately, before the rest of the tracking machinery is set up.
    let watchId = null;
    const stopTracking = () => {
        if (watchId !== null && navigator.geolocation) {
            navigator.geolocation.clearWatch(watchId);
        }
        watchId = null;
    };

    const showExpired = (message) => {
        stopTracking();
        if (message) {
            expiredNotice.textContent = message;
        }
        expiredNotice.classList.remove('mobile-route__notice--hidden');
        finishButton.style.display = 'none';
        subtitle.textContent = '';
        if (statusPill) statusPill.classList.add('mobile-route__status--hidden');
    };

    if (startedExpired) {
        showExpired();
        return;
    }

    const map = L.map('mobile-route-map', {
        crs: L.CRS.Simple,
        minZoom: -3,
        maxZoom: 3,
        zoomSnap: 0.25,
        zoomControl: false,
        attributionControl: false,
    });

    let layer = null;
    let layerBounds = null;
    let routeLayer = null;
    let animationToken = 0;

    // Same centroid helper as the kiosk: average the outer ring of a
    // 2.5D feature's first polygon and hand back an L.latLng. See
    // resources/js/kiosk-map.js for the shared implementation notes.
    const featureCenter = (featureId) => {
        if (!featureId) return null;
        const data = (window.L && L.CAMPUS_25D_DATA) || null;
        if (!data || !Array.isArray(data.features)) return null;
        const feature = data.features.find(
            (f) => f.properties && String(f.properties.id) === String(featureId),
        );
        if (!feature || !feature.geometry) return null;
        const polys = feature.geometry.type === 'Polygon'
            ? [feature.geometry.coordinates]
            : feature.geometry.type === 'MultiPolygon'
                ? feature.geometry.coordinates
                : null;
        if (!polys || !polys[0] || !polys[0][0]) return null;
        const ring = polys[0][0];
        let sumX = 0;
        let sumY = 0;
        for (const [x, y] of ring) { sumX += x; sumY += y; }
        return L.latLng(sumY / ring.length, sumX / ring.length);
    };

    const easeOutCubic = (t) => 1 - Math.pow(1 - t, 3);

    const animateDrone = (fromDistance, toDistance, fromScale, toScale, durationMs) => {
        animationToken += 1;
        const token = animationToken;
        const start = performance.now();
        return new Promise((resolve) => {
            const tick = (now) => {
                if (token !== animationToken) return resolve();
                const t = Math.min(1, (now - start) / durationMs);
                const eased = easeOutCubic(t);
                layer.setCameraDistance(fromDistance + (toDistance - fromDistance) * eased);
                layer.setHeightScale(fromScale + (toScale - fromScale) * eased);
                if (t < 1) requestAnimationFrame(tick);
                else resolve();
            };
            requestAnimationFrame(tick);
        });
    };

    const flyToWithDroneIn = (destination) => {
        const target = featureCenter(destination.feature_id);
        if (!target) return;
        const targetZoom = map.getZoom() + DRONE_FOCUS_ZOOM_BUMP;
        map.flyTo(target, targetZoom, { duration: DRONE_DESCENT_MS / 1000 });
        animateDrone(
            layer.options.cameraDistance,
            DRONE_FOCUS_CAMERA_DISTANCE,
            layer.options.heightScale,
            DRONE_FOCUS_HEIGHT_SCALE,
            DRONE_DESCENT_MS,
        );
    };

    // map_y/map_x are the 2.5D layer's pixel space — the only coordinates
    // safe to draw with. See the note in resources/js/kiosk-map.js.
    const layerLatLng = (location) => {
        const y = Number(location && location.map_y);
        const x = Number(location && location.map_x);
        if (!Number.isFinite(y) || !Number.isFinite(x)) return null;
        return L.latLng(y, x);
    };

    const routePathFor = (start, destination) => {
        const route = Array.isArray(destination && destination.route) && destination.route.length >= 2
            ? destination.route.map(([y, x]) => [Number(y), Number(x)])
            : null;
        if (route) return route;

        const from = layerLatLng(start);
        const to = layerLatLng(destination);
        if (!from || !to) return null;

        // Plain [y, x] pairs, not L.latLng objects, so this shape matches the
        // `route` branch above -- projectOntoPath() below reads both the
        // same way.
        return [[from.lat, from.lng], [to.lat, to.lng]];
    };

    // The full, un-trimmed route -- what live tracking below trims against.
    // Set once per session by drawRouteLine(); untouched by updateRoutePath().
    let fullRoutePath = null;

    const drawRouteLine = (start, destination) => {
        if (routeLayer) {
            map.removeLayer(routeLayer);
            routeLayer = null;
        }

        fullRoutePath = routePathFor(start, destination);
        if (!fullRoutePath || fullRoutePath.length < 2) return;

        routeLayer = L.polyline(fullRoutePath, ROUTE_STYLE).addTo(map);
        map.fitBounds(routeLayer.getBounds(), { padding: [32, 32] });
    };

    // Redraws the route with just the remaining path -- no fitBounds, so
    // walking doesn't fight the user's own pan/zoom every GPS reading.
    const updateRoutePath = (path) => {
        if (!routeLayer || !path || path.length < 2) return;
        routeLayer.setLatLngs(path);
    };

    const renderMap = (data) => {
        layer = L.campus25d({
            cameraDistance: DRONE_BASE_CAMERA_DISTANCE,
            heightScale: DRONE_BASE_HEIGHT_SCALE,
            interactive: false,
        }).addTo(map);
        layerBounds = layer.getBounds();
        // Frame the campus before the route does its own tighter fit. Without
        // this the map's only view ever comes from the route bounds, so a
        // session that has no route to draw leaves the phone on a blank
        // canvas at the CRS origin.
        map.fitBounds(layerBounds, { padding: [32, 32] });
        map.setMaxBounds(layerBounds.pad(0.5));
        drawRouteLine(data.start, data.destination);
    };

    // --- live GPS tracking ------------------------------------------------
    //
    // Ports app/services/CampusGeoTransform.py's `_apply()` to JS: pushes a
    // (lng, lat) pair through the 3x3 projective matrix the server sends as
    // `geo_transform`, landing it in the same layer-pixel space as the route.
    // Deriving the matrix stays server-side (offline-adjacent, a one-time
    // solve against 4 ground control points); this only ever applies it.
    const applyProjectiveMatrix = (matrix, x, y) => {
        const denominator = matrix[2][0] * x + matrix[2][1] * y + matrix[2][2];
        if (!denominator) return null;
        return [
            (matrix[0][0] * x + matrix[0][1] * y + matrix[0][2]) / denominator,
            (matrix[1][0] * x + matrix[1][1] * y + matrix[1][2]) / denominator,
        ];
    };

    // -> [x, y] in layer-pixel space, matching Campus25dMapping.layer_point().
    const wgs84ToLayerPoint = (matrix, lat, lng) => applyProjectiveMatrix(matrix, lng, lat);

    // Real-world great-circle distance in meters. This is the arrival
    // authority -- independent of the pixel transform's approximation,
    // because it never leaves WGS84.
    const haversineMeters = (lat1, lng1, lat2, lng2) => {
        const radius = 6371000;
        const toRad = (deg) => (deg * Math.PI) / 180;
        const dPhi = toRad(lat2 - lat1);
        const dLambda = toRad(lng2 - lng1);
        const a = Math.sin(dPhi / 2) ** 2
            + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLambda / 2) ** 2;
        return 2 * radius * Math.asin(Math.sqrt(a));
    };

    // Closest point on a [y, x]-pair polyline to a [y, x] point, as
    // { segmentIndex, point }. Used to trim the drawn route down to wherever
    // the phone currently projects onto it.
    const projectOntoPath = (point, path) => {
        const [py, px] = point;
        let best = null;
        for (let i = 0; i < path.length - 1; i += 1) {
            const [ay, ax] = path[i];
            const [by, bx] = path[i + 1];
            const dx = bx - ax;
            const dy = by - ay;
            const lengthSq = dx * dx + dy * dy;
            let t = lengthSq > 0 ? ((px - ax) * dx + (py - ay) * dy) / lengthSq : 0;
            t = Math.max(0, Math.min(1, t));
            const cx = ax + t * dx;
            const cy = ay + t * dy;
            const distSq = (px - cx) ** 2 + (py - cy) ** 2;
            if (!best || distSq < best.distSq) {
                best = { segmentIndex: i, point: [cy, cx], distSq };
            }
        }
        return best;
    };

    const trimPathFromProjection = (path, projection) => (
        projection ? [projection.point, ...path.slice(projection.segmentIndex + 1)] : path
    );

    const STATUS_TEXT = {
        waiting: 'Waiting for GPS…',
        tracking: 'Tracking your walk',
        unavailable: 'Location unavailable — tap Finish when you arrive.',
    };

    const setTrackingStatus = (state) => {
        if (!statusPill) return;
        statusPill.dataset.state = state;
        statusPill.textContent = STATUS_TEXT[state] || '';
    };

    // Short two-note chime, synthesized rather than shipped as an audio
    // asset -- there's no audio pipeline in this repo yet and this avoids
    // starting one for a two-tone beep. Needs a user gesture to unlock on
    // some browsers, so a first tap/touch anywhere primes the AudioContext;
    // if that never happens, the arrival modal still shows either way.
    let audioCtx = null;
    const ensureAudioContext = () => {
        if (audioCtx) return audioCtx;
        const AudioContextClass = window.AudioContext || window.webkitAudioContext;
        if (!AudioContextClass) return null;
        audioCtx = new AudioContextClass();
        return audioCtx;
    };
    const unlockAudioContext = () => {
        const ctx = ensureAudioContext();
        if (ctx && ctx.state === 'suspended') ctx.resume();
    };
    document.addEventListener('touchstart', unlockAudioContext, { once: true, passive: true });
    document.addEventListener('click', unlockAudioContext, { once: true });

    const playArrivalChime = () => {
        const ctx = ensureAudioContext();
        if (!ctx) return;
        if (ctx.state === 'suspended') ctx.resume();
        const now = ctx.currentTime;
        [880, 1174.66].forEach((frequency, index) => {
            const oscillator = ctx.createOscillator();
            const gain = ctx.createGain();
            oscillator.type = 'sine';
            oscillator.frequency.value = frequency;
            const start = now + index * 0.14;
            gain.gain.setValueAtTime(0, start);
            gain.gain.linearRampToValueAtTime(0.35, start + 0.02);
            gain.gain.exponentialRampToValueAtTime(0.0001, start + 0.5);
            oscillator.connect(gain).connect(ctx.destination);
            oscillator.start(start);
            oscillator.stop(start + 0.55);
        });
    };

    let lastTrackedPoint = null;
    let arrived = false;
    let sessionData = null;

    const handlePosition = (position) => {
        if (arrived || !sessionData) return;
        const { latitude, longitude } = position.coords;
        setTrackingStatus('tracking');

        const matrix = sessionData.geo_transform;
        if (matrix && fullRoutePath && fullRoutePath.length >= 2) {
            const layerPoint = wgs84ToLayerPoint(matrix, latitude, longitude);
            if (layerPoint) {
                const [x, y] = layerPoint;
                const point = [y, x];
                const moved = !lastTrackedPoint || Math.hypot(
                    point[0] - lastTrackedPoint[0],
                    point[1] - lastTrackedPoint[1],
                ) >= TRACK_MIN_PIXEL_DELTA;
                if (moved) {
                    lastTrackedPoint = point;
                    updateRoutePath(trimPathFromProjection(fullRoutePath, projectOntoPath(point, fullRoutePath)));
                }
            }
        }

        const destinationWgs84 = sessionData.destination && sessionData.destination.wgs84;
        if (Array.isArray(destinationWgs84) && destinationWgs84.length === 2) {
            const [destLat, destLng] = destinationWgs84;
            if (haversineMeters(latitude, longitude, destLat, destLng) <= ARRIVAL_RADIUS_METERS) {
                completeRoute({ auto: true });
            }
        }
    };

    const handlePositionError = (error) => {
        if (error && error.code === error.PERMISSION_DENIED) {
            setTrackingStatus('unavailable');
            stopTracking();
        }
    };

    const startTracking = () => {
        if (!navigator.geolocation) {
            setTrackingStatus('unavailable');
            return;
        }
        setTrackingStatus('waiting');
        watchId = navigator.geolocation.watchPosition(handlePosition, handlePositionError, {
            enableHighAccuracy: true,
            maximumAge: 5000,
            timeout: 20000,
        });
    };

    // --- finishing ----------------------------------------------------

    // Shared by automatic GPS arrival and the manual Finish button -- both
    // just mean "the visit is over," so both get the same sound + modal.
    const completeRoute = ({ auto = false } = {}) => {
        if (arrived) return;
        arrived = true;
        stopTracking();
        finishButton.disabled = true;

        fetch(`/api/route-sessions/${encodeURIComponent(token)}/finish`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
        })
            .then((response) => response.json())
            .then(() => {
                playArrivalChime();
                modal.classList.remove('mobile-route__modal--hidden');
                // After the user has seen the modal for a moment, swap to the
                // expired/ended state. The token will reject re-finishes from
                // the server side too, so a refresh will land cleanly here.
                setTimeout(() => {
                    modal.classList.add('mobile-route__modal--hidden');
                    showExpired('This route has ended. Safe travels!');
                }, 3500);
            })
            .catch(() => {
                arrived = false;
                finishButton.disabled = false;
                if (auto) startTracking();
            });
    };

    const fetchSession = () => {
        fetch(`/api/route-sessions/${encodeURIComponent(token)}`)
            .then((response) => response.json().then((body) => ({ ok: response.ok, body })))
            .then(({ ok, body }) => {
                if (!ok || body.status !== 'active') {
                    const messages = {
                        finished: 'This route has already been completed.',
                        expired: 'This route has expired. Head back to the kiosk to start a new one.',
                    };
                    showExpired(messages[body.status] || messages.expired);
                    return;
                }
                sessionData = body;
                subtitle.textContent = `Heading to ${body.destination.name}`;
                finishButton.disabled = false;
                renderMap(body);
                startTracking();
            })
            .catch(() => {
                showExpired('Could not load your route. Check your connection and try again.');
            });
    };

    finishButton.addEventListener('click', () => completeRoute({ auto: false }));
    window.addEventListener('pagehide', stopTracking);
    fetchSession();
});
