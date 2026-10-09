import {
    accuracyVerdict,
    exceedsWalkingSpeed,
    isOffRoute,
    canCountAsArrival,
    arrivalTargetWgs84,
    arrivalDistance,
    AUTO_ARRIVAL_RADIUS_M,
} from './route-gating.mjs';
import {
    buildManeuvers,
    bannerFor,
    nextAnnouncement,
    cumulativeFromWgs84,
    cumulativeFromPixels,
} from './route-maneuvers.mjs';
import { createRouteVoice } from './route-voice.mjs';

document.addEventListener('DOMContentLoaded', () => {
    const root = document.querySelector('.mobile-route');
    if (!root || typeof L === 'undefined') {
        return;
    }

    const token = root.dataset.token;
    const startedExpired = root.dataset.expired === 'true';

    const els = {
        clock: document.getElementById('mobile-route-clock'),
        battery: document.getElementById('mobile-route-battery'),
        eyebrow: document.getElementById('mobile-route-eyebrow'),
        subtitle: document.getElementById('mobile-route-subtitle'),
        statusPill: document.getElementById('mobile-route-status'),
        instruction: document.getElementById('mobile-route-instruction'),
        recenter: document.getElementById('mobile-route-recenter'),
        voice: document.getElementById('mobile-route-voice'),
        finishButton: document.getElementById('mobile-route-finish'),
        expiredNotice: document.getElementById('mobile-route-expired'),
        modal: document.getElementById('mobile-route-modal'),
        modalStats: document.getElementById('mobile-route-modal-stats'),
        modalDone: document.getElementById('mobile-route-modal-done'),
        distance: document.getElementById('mobile-route-distance'),
        distanceUnit: document.getElementById('mobile-route-distance-unit'),
        eta: document.getElementById('mobile-route-eta'),
        arriveAt: document.getElementById('mobile-route-arrive-at'),
        progressFill: document.getElementById('mobile-route-progress-fill'),
        originLabel: document.getElementById('mobile-route-origin-label'),
        destinationLabel: document.getElementById('mobile-route-destination-label'),
    };

    // The arrival radius and the accuracy a reading needs to count toward it
    // live in ./route-gating.mjs (AUTO_ARRIVAL_RADIUS_M), measured to the
    // walkway's door rather than the map pin -- see arrivalTargetWgs84().
    // Require this many consecutive close readings before auto-finishing,
    // so one noisy GPS fix near the destination doesn't end the walk early.
    const AUTO_ARRIVAL_STREAK = 3;

    // Skip redrawing the trimmed route line / recomputing metrics for GPS
    // jitter under this many pixels of movement in layer space -- otherwise
    // a stationary phone's GPS noise redraws everything on every reading
    // for no visible change.
    const TRACK_MIN_PIXEL_DELTA = 3;

    // Accuracy gating, the off-route threshold and the speed gate all live in
    // ./route-gating.mjs so they can be unit-tested without a DOM. See that
    // file for why each threshold is where it is.

    // No reading for this long flips the status pill to "searching" and
    // fades the puck -- tells the user tracking hasn't died, just stalled.
    const SEARCHING_TIMEOUT_MS = 10000;

    // Campus walking pace in meters/minute (~4.5 km/h), used for the ETA
    // readout. Deliberately unhurried: this is indoor/campus foot traffic,
    // not open-road walking speed.
    const WALK_SPEED_M_PER_MIN = 75;

    // Buildings within this many pixels of the route polyline count as
    // "on the corridor" and stay at full brightness; everything else dims.
    // There's no corridor->building mapping in the data model, so this is a
    // proximity heuristic, not a computed relationship -- tune by eye
    // against the campus's actual scale if buildings that obviously flank
    // the path end up dimmed (or the reverse).
    const FOCUS_RADIUS_PX = 90;

    const STARTED_AT_KEY = 'presspoint.route.startedAt';

    const DRONE_BASE_CAMERA_DISTANCE = 1.7;
    const DRONE_BASE_HEIGHT_SCALE = 1;
    const DRONE_FOCUS_CAMERA_DISTANCE = 2.6;
    const DRONE_FOCUS_HEIGHT_SCALE = 1.5;
    const DRONE_FOCUS_ZOOM_BUMP = 1.8;
    const DRONE_DESCENT_MS = 1400;

    const ROUTE_CASING_STYLE = { color: '#24110D', weight: 11, opacity: 0.18, lineCap: 'round', lineJoin: 'round' };
    const ROUTE_FILL_STYLE = { color: '#FF6A00', weight: 6, opacity: 1, lineCap: 'round', lineJoin: 'round' };
    const ROUTE_DASH_STYLE = { color: '#FFF3E6', weight: 2.5, opacity: 0.85, dashArray: '3 9', lineCap: 'round' };

    // Declared ahead of showExpired() below: the expired-on-load path calls
    // it immediately, before the rest of the tracking machinery is set up.
    let watchId = null;
    const stopTracking = () => {
        if (watchId !== null && navigator.geolocation) {
            navigator.geolocation.clearWatch(watchId);
        }
        watchId = null;
    };

    // Off until the walker taps the speaker button; see ./route-voice.mjs.
    // Created this early because showExpired() below releases its wake lock.
    const voice = createRouteVoice();

    const showExpired = (message) => {
        stopTracking();
        voice.release();
        if (message) {
            els.expiredNotice.textContent = message;
        }
        els.expiredNotice.classList.remove('mobile-route__notice--hidden');
        document.getElementById('mobile-route-sheet').style.display = 'none';
        document.getElementById('mobile-route-card').style.display = 'none';
        els.instruction.classList.add('mobile-route__instruction--hidden');
        if (els.statusPill) els.statusPill.classList.add('mobile-route__status--hidden');
    };

    if (startedExpired) {
        showExpired();
        return;
    }

    // --- status-bar clock -------------------------------------------------
    // Aligned to the minute boundary rather than a 1s interval: a HUD clock
    // that's only ever accurate to the minute doesn't need per-second ticks.
    const formatClock = (date) => {
        const hh = String(date.getHours()).padStart(2, '0');
        const mm = String(date.getMinutes()).padStart(2, '0');
        return `${hh}:${mm}`;
    };
    const scheduleClockTick = () => {
        const now = new Date();
        els.clock.textContent = formatClock(now);
        const msToNextMinute = 60000 - (now.getSeconds() * 1000 + now.getMilliseconds());
        setTimeout(() => {
            scheduleClockTick();
        }, msToNextMinute);
    };
    scheduleClockTick();

    // --- battery ------------------------------------------------------
    if (navigator.getBattery) {
        navigator.getBattery().then((battery) => {
            const render = () => {
                els.battery.textContent = `${Math.round(battery.level * 100)}%`;
            };
            render();
            battery.addEventListener('levelchange', render);
        }).catch(() => { els.battery.style.display = 'none'; });
    } else {
        els.battery.style.display = 'none';
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
    let routeCasing = null;
    let routeFill = null;
    let routeDash = null;
    let puckMarker = null;
    let pinMarker = null;
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
        // Number(null) is 0, which passes Number.isFinite -- so an explicit
        // null check has to come first, or a location the server reports as
        // having no coordinates lands at the CRS origin instead of being
        // skipped.
        if (location == null || location.map_y == null || location.map_x == null) return null;
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
    // Parallel WGS84 [lat, lng] pairs, same length/order as fullRoutePath,
    // when the server had a walkway-routed polyline to convert. Null for the
    // straight-line fallback, in which case metrics fall back to a plain
    // haversine-to-destination estimate.
    let fullRouteWgs84 = null;
    let totalRouteMetres = null;
    // Metres from the start to each vertex of fullRoutePath, and the turns
    // read off it (./route-maneuvers.mjs). The banner and the voice both
    // read `maneuvers`, so the screen never says something the voice didn't.
    let routeCumMetres = null;
    let maneuvers = [];

    // Sum of haversine segment lengths over a WGS84 polyline.
    const routeLengthMeters = (wgs84Path) => {
        let total = 0;
        for (let i = 0; i < wgs84Path.length - 1; i += 1) {
            const [lat1, lng1] = wgs84Path[i];
            const [lat2, lng2] = wgs84Path[i + 1];
            total += haversineMeters(lat1, lng1, lat2, lng2);
        }
        return total;
    };

    // Places dots along the route at 1/6th intervals — a light visual
    // waypoint cue, not tied to the actual graph nodes (which aren't part
    // of this payload).
    let waypointMarkers = [];
    const drawWaypoints = (path) => {
        waypointMarkers.forEach((m) => map.removeLayer(m));
        waypointMarkers = [];
        if (!path || path.length < 2) return;
        const steps = 6;
        for (let i = 1; i < steps; i += 1) {
            const idx = Math.round((i / steps) * (path.length - 1));
            const [y, x] = path[idx];
            waypointMarkers.push(
                L.circleMarker([y, x], {
                    radius: 3.5,
                    color: '#FF6A00',
                    weight: 0,
                    fillOpacity: 0.55,
                    interactive: false,
                }).addTo(map),
            );
        }
    };

    const puckIcon = () => L.divIcon({
        className: 'mobile-route__puck',
        html: '<span class="mobile-route__puck-ring"></span><span class="mobile-route__puck-dot"></span>',
        iconSize: [0, 0],
    });

    const pinIcon = () => L.divIcon({
        className: 'mobile-route__pin',
        html: '<span class="mobile-route__pin-body"><span class="mobile-route__pin-dot"></span></span>',
        iconSize: [0, 0],
    });

    const drawRouteLine = (start, destination) => {
        [routeCasing, routeFill, routeDash].forEach((l) => { if (l) map.removeLayer(l); });
        routeCasing = routeFill = routeDash = null;

        fullRoutePath = routePathFor(start, destination);
        fullRouteWgs84 = Array.isArray(destination.route_wgs84) && destination.route_wgs84.length === (fullRoutePath || []).length
            ? destination.route_wgs84
            : null;
        totalRouteMetres = fullRouteWgs84 ? routeLengthMeters(fullRouteWgs84) : null;

        if (!fullRoutePath || fullRoutePath.length < 2) return;

        routeCumMetres = fullRouteWgs84
            ? cumulativeFromWgs84(fullRouteWgs84)
            : cumulativeFromPixels(fullRoutePath);
        maneuvers = buildManeuvers(fullRoutePath, routeCumMetres);
        setBanner(0);

        routeCasing = L.polyline(fullRoutePath, ROUTE_CASING_STYLE).addTo(map);
        routeFill = L.polyline(fullRoutePath, ROUTE_FILL_STYLE).addTo(map);
        routeDash = L.polyline(fullRoutePath, ROUTE_DASH_STYLE).addTo(map);
        markDashAnimated();
        drawWaypoints(fullRoutePath);

        puckMarker = L.marker(fullRoutePath[0], { icon: puckIcon(), interactive: false, zIndexOffset: 500 }).addTo(map);
        pinMarker = L.marker(fullRoutePath[fullRoutePath.length - 1], { icon: pinIcon(), interactive: false, zIndexOffset: 400 }).addTo(map);

        els.originLabel.textContent = (start && start.name) || '';
        els.destinationLabel.textContent = (destination && destination.name) || '';

        map.fitBounds(routeFill.getBounds(), { padding: [32, 120] });
        applyCorridorFocus(fullRoutePath, destination.feature_id);
    };

    // CSS drives the marching-ants look via stroke-dashoffset; Leaflet only
    // owns stroke-dasharray (from the `dashArray` option). Re-applying the
    // class after every setLatLngs() is cheap and idempotent — classList.add
    // is a no-op if it's already there.
    const markDashAnimated = () => {
        const el = routeDash && routeDash.getElement && routeDash.getElement();
        if (el) el.classList.add('mobile-route__route-dash-anim');
    };

    // Redraws the route with just the remaining path -- no fitBounds, so
    // walking doesn't fight the user's own pan/zoom every GPS reading.
    const updateRoutePath = (path) => {
        if (!routeCasing || !path || path.length < 2) return;
        routeCasing.setLatLngs(path);
        routeFill.setLatLngs(path);
        routeDash.setLatLngs(path);
        markDashAnimated();
        if (puckMarker) puckMarker.setLatLng(path[0]);
    };

    // --- building focus / dim ------------------------------------------
    //
    // Which buildings count as "on the route" isn't data the app has (the
    // wayfinding graph's nodes are walkway vertices, not buildings) — this
    // approximates it by distance from each feature's centroid to the drawn
    // polyline, using the same point-to-polyline projection the live
    // tracking below uses for trimming.
    const applyCorridorFocus = (path, destinationFeatureId) => {
        if (!layer || typeof layer.setFocusFeatures !== 'function') return;
        const data = L.CAMPUS_25D_DATA;
        if (!data || !Array.isArray(data.features)) return;

        const ids = new Set();
        if (destinationFeatureId) ids.add(String(destinationFeatureId));

        data.features.forEach((feature) => {
            const props = feature.properties || {};
            if (!props.id || props.kind === 'ground') return;
            const center = featureCenter(props.id);
            if (!center) return;
            const projection = projectOntoPath([center.lat, center.lng], path);
            if (projection && Math.sqrt(projection.distSq) <= FOCUS_RADIUS_PX) {
                ids.add(String(props.id));
            }
        });

        layer.setFocusFeatures(ids);
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
    function haversineMeters(lat1, lng1, lat2, lng2) {
        const radius = 6371000;
        const toRad = (deg) => (deg * Math.PI) / 180;
        const dPhi = toRad(lat2 - lat1);
        const dLambda = toRad(lng2 - lng1);
        const a = Math.sin(dPhi / 2) ** 2
            + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLambda / 2) ** 2;
        return 2 * radius * Math.asin(Math.sqrt(a));
    }

    // Closest point on a [y, x]-pair polyline to a [y, x] point, as
    // { segmentIndex, t, point, distSq }. `t` (0..1, how far along the
    // segment) lets callers interpolate a parallel array (e.g. the WGS84
    // route) at the same position. Used to trim the drawn route, focus-dim
    // buildings, and compute real remaining distance.
    function projectOntoPath(point, path) {
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
                best = { segmentIndex: i, t, point: [cy, cx], distSq };
            }
        }
        return best;
    }

    const trimPathFromProjection = (path, projection) => (
        projection ? [projection.point, ...path.slice(projection.segmentIndex + 1)] : path
    );

    // --- turn-by-turn ---------------------------------------------------
    //
    // There's no turn-by-turn data anywhere in the app -- MapWayfinderService
    // only returns a shortest-path polyline -- so ./route-maneuvers.mjs reads
    // the turns off the geometry. This used to be done here per raw segment
    // and recomputed on every fix, which was fine for a banner and useless
    // for speech: it would have said "turn" at every digitising kink.

    // Metres walked along the route at a projectOntoPath() result.
    const metresAlongProjection = (projection) => {
        const { segmentIndex, t } = projection;
        const from = routeCumMetres[segmentIndex];
        return from + (routeCumMetres[segmentIndex + 1] - from) * t;
    };

    const setBanner = (metresAlong) => {
        const { text, arrow } = bannerFor(maneuvers, metresAlong);
        els.instruction.textContent = `${arrow}  ${text}`;
    };

    const spokenKeys = new Set();
    const announceUpcoming = (metresAlong) => {
        const said = nextAnnouncement(maneuvers, metresAlong, spokenKeys);
        if (!said) return;
        // Marked spoken even with the voice off: switching it on mid-walk
        // should start from the next turn, not replay one already behind.
        spokenKeys.add(said.key);
        said.alsoKeys.forEach((key) => spokenKeys.add(key));
        voice.speak(said.text, { interrupt: said.key.endsWith(':now') });
    };

    // --- live metrics: distance / ETA / arrival clock ------------------
    const median = (values) => {
        const sorted = [...values].sort((a, b) => a - b);
        const mid = Math.floor(sorted.length / 2);
        return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
    };

    const lerp = (a, b, t) => a + (b - a) * t;

    // Remaining real-world distance from the phone's projected position to
    // the destination, walking the WGS84-converted route rather than a
    // straight line -- falls back to a plain haversine-to-destination if the
    // session has no walkway-routed polyline (the straight-line fallback
    // case noted on `route` in MapController._serialize_location).
    const remainingMetersAlongRoute = (projection, destinationWgs84) => {
        if (!fullRouteWgs84 || !projection) {
            return null;
        }
        const { segmentIndex, t } = projection;
        const [lat1, lng1] = fullRouteWgs84[segmentIndex];
        const [lat2, lng2] = fullRouteWgs84[segmentIndex + 1];
        const here = [lerp(lat1, lat2, t), lerp(lng1, lng2, t)];
        let total = haversineMeters(here[0], here[1], lat2, lng2);
        for (let i = segmentIndex + 1; i < fullRouteWgs84.length - 1; i += 1) {
            const [a1, a2] = fullRouteWgs84[i];
            const [b1, b2] = fullRouteWgs84[i + 1];
            total += haversineMeters(a1, a2, b1, b2);
        }
        return total;
    };

    let distanceReadings = [];
    let lastRenderedEtaMinutes = null;

    const updateMetrics = (metres) => {
        if (metres === null || !Number.isFinite(metres)) return;

        distanceReadings.push(metres);
        if (distanceReadings.length > 5) distanceReadings.shift();

        if (metres <= AUTO_ARRIVAL_RADIUS_M) {
            els.distance.textContent = '0';
            els.distanceUnit.textContent = 'Arriving';
        } else {
            els.distance.textContent = String(Math.round(metres));
            els.distanceUnit.textContent = 'm left';
        }

        const smoothed = median(distanceReadings);
        const etaMinutes = Math.max(1, Math.ceil(smoothed / WALK_SPEED_M_PER_MIN));
        if (etaMinutes !== lastRenderedEtaMinutes) {
            lastRenderedEtaMinutes = etaMinutes;
            els.eta.textContent = `${etaMinutes} min`;
            const arriveAt = new Date(Date.now() + etaMinutes * 60000);
            els.arriveAt.textContent = `arrive ${formatClock(arriveAt)}`;
        }

        if (totalRouteMetres && totalRouteMetres > 0) {
            const progress = Math.max(0, Math.min(1, 1 - metres / totalRouteMetres));
            els.progressFill.style.width = `${(progress * 100).toFixed(1)}%`;
        }
    };

    const STATUS_TEXT = {
        waiting: 'Waiting for GPS…',
        tracking: 'Tracking your walk',
        searching: 'Searching for GPS…',
        imprecise: 'Weak GPS — position approximate',
        'off-route': 'You look off the path — head back to the orange line.',
        unavailable: 'Location unavailable — tap Finish when you arrive.',
    };

    const setTrackingStatus = (state) => {
        if (!els.statusPill) return;
        els.statusPill.dataset.state = state;
        els.statusPill.textContent = STATUS_TEXT[state] || '';
        if (puckMarker) {
            const el = puckMarker.getElement();
            if (el) {
                el.classList.toggle(
                    'mobile-route__puck--stale',
                    state === 'searching' || state === 'imprecise',
                );
                el.classList.toggle('mobile-route__puck--off-route', state === 'off-route');
            }
        }
    };

    let lastReadingAt = 0;
    let searchingTimer = null;
    const armSearchingWatch = () => {
        if (searchingTimer) clearInterval(searchingTimer);
        searchingTimer = setInterval(() => {
            if (lastReadingAt && Date.now() - lastReadingAt > SEARCHING_TIMEOUT_MS && !arrived) {
                setTrackingStatus('searching');
            }
        }, 3000);
    };

    // Short two-note chime, synthesized rather than shipped as an audio
    // asset -- there's no audio pipeline in this repo yet and this avoids
    // starting one for a two-tone beep. Needs a user gesture to unlock on
    // some browsers, so a first tap/touch anywhere primes the AudioContext;
    // if that never happens, the arrival overlay still shows either way.
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
    // Whether the last fix that moved landed off the route; see handlePosition.
    let offRoute = false;
    let arrived = false;
    let sessionData = null;
    let closeReadingStreak = 0;
    // Last fix we actually believed, for the speed gate.
    let lastAcceptedFix = null;
    // Timestamp of the fix that last incremented the arrival streak, so one
    // cached fix redelivered N times can't satisfy AUTO_ARRIVAL_STREAK.
    let lastArrivalFixAt = null;

    // True when two consecutive fixes are further apart than a person could
    // have walked in the elapsed time -- so at least one of them is wrong.
    const isImplausibleJump = (lat, lng, at) => {
        if (!lastAcceptedFix) return false;
        const metres = haversineMeters(lastAcceptedFix.lat, lastAcceptedFix.lng, lat, lng);
        return exceedsWalkingSpeed(metres, (at - lastAcceptedFix.at) / 1000);
    };

    const handlePosition = (position) => {
        if (arrived || !sessionData) return;
        const { latitude, longitude, accuracy } = position.coords;

        // Use the fix's own timestamp, not Date.now(): the browser is allowed
        // to redeliver a single cached fix, and counting those as distinct
        // readings is what made AUTO_ARRIVAL_STREAK toothless.
        const fixAt = Number.isFinite(position.timestamp) ? position.timestamp : Date.now();
        // An absent accuracy is treated as unusable, not as perfect.
        const precision = Number.isFinite(accuracy) ? accuracy : Infinity;

        const verdict = accuracyVerdict(precision);
        if (verdict === 'reject' || isImplausibleJump(latitude, longitude, fixAt)) {
            // Deliberately does NOT stamp lastReadingAt: a stream of rejected
            // fixes is a stall from the user's point of view, and the
            // searching watch should keep saying so rather than showing a
            // confidently wrong position.
            setTrackingStatus('searching');
            return;
        }

        lastReadingAt = Date.now();
        lastAcceptedFix = { lat: latitude, lng: longitude, at: fixAt };
        const imprecise = verdict === 'imprecise';

        const matrix = sessionData.geo_transform;
        let projection = null;
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
                    const candidate = projectOntoPath(point, fullRoutePath);
                    // distSq was computed and thrown away here. It is the only
                    // thing that says whether the snap means anything:
                    // projectOntoPath() always returns *some* nearest point, so
                    // a fix right off the campus still trimmed the route.
                    const nowOffRoute = !!candidate && isOffRoute(candidate.distSq);
                    if (nowOffRoute && !offRoute) {
                        voice.speak("You're off the path. Head back to the orange line.");
                    }
                    // Only a fix that moved may change this. It used to be
                    // reset on every reading, so someone standing still off
                    // the path flickered back to "tracking" -- harmless on
                    // the pill, a repeated warning once it is spoken.
                    offRoute = nowOffRoute;
                    if (candidate && !offRoute) {
                        projection = candidate;
                        updateRoutePath(trimPathFromProjection(fullRoutePath, projection));
                        const metresAlong = metresAlongProjection(projection);
                        setBanner(metresAlong);
                        announceUpcoming(metresAlong);
                    }
                }
            }
        }

        if (offRoute) {
            setTrackingStatus('off-route');
        } else {
            setTrackingStatus(imprecise ? 'imprecise' : 'tracking');
        }

        const destination = sessionData.destination || {};
        // The door the route ends at, not the map pin: measuring to the pin
        // is why auto-arrival never fired. See arrivalTargetWgs84().
        const target = arrivalTargetWgs84(destination.route_wgs84, destination.wgs84);
        if (target) {
            const [destLat, destLng] = target;
            const straightLineDistance = haversineMeters(latitude, longitude, destLat, destLng);
            const alongRoute = remainingMetersAlongRoute(projection, target);
            updateMetrics(alongRoute ?? straightLineDistance);

            // "Within 15m" reported by a fix that is itself only accurate to
            // +/-30m is not evidence of anything. Requiring the reading's own
            // error bar to be tight enough is what stops the walk ending short
            // of the building; the manual "I've Arrived" button covers the
            // case where GPS never gets this good.
            const distance = arrivalDistance(alongRoute, straightLineDistance);
            if (canCountAsArrival(precision, distance, AUTO_ARRIVAL_RADIUS_M)) {
                if (fixAt !== lastArrivalFixAt) {
                    lastArrivalFixAt = fixAt;
                    closeReadingStreak += 1;
                }
                if (closeReadingStreak >= AUTO_ARRIVAL_STREAK) {
                    completeRoute();
                }
            } else {
                closeReadingStreak = 0;
            }
        }
    };

    const handlePositionError = (error) => {
        if (!error) return;
        if (error.code === error.PERMISSION_DENIED) {
            setTrackingStatus('unavailable');
            stopTracking();
            return;
        }
        // POSITION_UNAVAILABLE and TIMEOUT used to be swallowed entirely, so a
        // phone that had quietly lost its fix looked identical to one that was
        // tracking fine. watchPosition keeps retrying after both, so this is a
        // status change, not a teardown.
        setTrackingStatus('searching');
    };

    const startTracking = () => {
        if (!navigator.geolocation) {
            setTrackingStatus('unavailable');
            return;
        }
        setTrackingStatus('waiting');
        armSearchingWatch();
        watchId = navigator.geolocation.watchPosition(handlePosition, handlePositionError, {
            enableHighAccuracy: true,
            // 0, not 5000: a cached fix redelivered as though it were new is
            // exactly what defeated the arrival streak guard.
            maximumAge: 0,
            timeout: 20000,
        });
    };

    // --- finishing ----------------------------------------------------

    const formatElapsed = (ms) => {
        const totalSeconds = Math.max(0, Math.round(ms / 1000));
        const minutes = Math.floor(totalSeconds / 60);
        const seconds = totalSeconds % 60;
        return `${minutes} min ${String(seconds).padStart(2, '0')} s`;
    };

    // --- offline: finish retry queue -----------------------------------
    //
    // The final "I've Arrived" confirmation can't reach the server while the
    // phone is genuinely offline. Rather than block the on-screen arrival on
    // that, completeRoute() below fires the celebration unconditionally and
    // treats the server notification as best-effort: sent now if possible,
    // queued here for silent background retry otherwise. No visible "not
    // synced yet" state -- the user already saw they arrived.
    const PENDING_FINISH_KEY = 'presspoint.route.pendingFinish';

    const sendFinish = (tok) => fetch(`/api/route-sessions/${encodeURIComponent(tok)}/finish`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
    }).then((response) => {
        if (!response.ok) throw new Error('finish request failed');
        return response.json();
    });

    const flushPendingFinish = () => {
        const pending = localStorage.getItem(PENDING_FINISH_KEY);
        if (!pending) return;
        sendFinish(pending)
            .then(() => localStorage.removeItem(PENDING_FINISH_KEY))
            .catch(() => {});
    };

    // Covers three cases: the phone reconnects mid-walk (`online` event), a
    // stalled connection that never fires `online` cleanly (the interval),
    // and a previous visit's tab closing before its finish ever synced (the
    // flush on load, called unconditionally below).
    window.addEventListener('online', flushPendingFinish);
    setInterval(flushPendingFinish, 30000);

    // Shared by automatic GPS arrival and the manual Finish button -- both
    // just mean "the visit is over," so both get the same sound + overlay.
    const completeRoute = () => {
        if (arrived) return;
        arrived = true;
        stopTracking();
        if (searchingTimer) clearInterval(searchingTimer);
        els.finishButton.disabled = true;

        playArrivalChime();
        // After the chime rather than over it. Interrupting, so a turn prompt
        // still queued from the last few metres can't talk over the arrival.
        setTimeout(() => {
            voice.speak(`You have arrived at ${sessionData.destination.name}.`, { interrupt: true });
            voice.release();
        }, 600);
        const arrivedAt = new Date();
        const startedAtRaw = localStorage.getItem(STARTED_AT_KEY);
        const startedAt = startedAtRaw ? Number(startedAtRaw) : null;
        document.getElementById('mobile-route-modal-eyebrow').textContent = `ARRIVED · ${formatClock(arrivedAt)}`;
        document.getElementById('mobile-route-modal-title').textContent = sessionData.destination.name;
        const elapsedText = startedAt ? `${formatElapsed(Date.now() - startedAt)} · ` : '';
        const distanceText = totalRouteMetres ? `${Math.round(totalRouteMetres)} m walked` : '';
        els.modalStats.textContent = `${elapsedText}${distanceText}`;
        localStorage.removeItem(STARTED_AT_KEY);

        if (pinMarker) {
            const pinEl = pinMarker.getElement();
            if (pinEl) pinEl.classList.add('mobile-route__pin--arrived');
        }

        els.modal.classList.remove('mobile-route__modal--hidden');

        sendFinish(token).catch(() => localStorage.setItem(PENDING_FINISH_KEY, token));
    };

    els.modalDone.addEventListener('click', () => {
        els.modal.classList.add('mobile-route__modal--hidden');
        showExpired('This route has ended. Safe travels!');
    });

    // --- offline: asset + session precache -----------------------------
    //
    // Registers resources/js/sw-mobile-route.js and hands it the exact,
    // already version-stamped URLs this load actually used -- collected from
    // the DOM rather than guessed, since asset_url() bakes a cache-busting
    // ?v=<mtime> into every href/src that would go stale if hardcoded here.
    // Font files aren't discoverable that way (they're referenced inside a
    // CSS @font-face rule, not a DOM node), so those two are listed by hand;
    // their paths are stable (no query string) because mobile-route.css
    // links them directly rather than through asset_url(). Explicit
    // messaging rather than relying on interception: the very first visit's
    // own resource fetches happen before this worker can be controlling that
    // navigation, so waiting for interception alone would miss them.
    const registerOfflineCache = (sessionUrl) => {
        if (!('serviceWorker' in navigator)) return;

        const urls = new Set([
            window.location.href,
            sessionUrl,
            '/assets/fonts/SpaceGrotesk/space-grotesk-variable.woff2',
            '/assets/fonts/JetBrainsMono/jetbrains-mono-variable.woff2',
            // kiosk-tokens.css (loaded by base.html on every page) @imports
            // this on top of the self-hosted JetBrains Mono above -- listed
            // here too so that @import's own fetch doesn't fail offline.
            'https://fonts.googleapis.com/css2?family=JetBrains+Mono:wght@500;700&display=swap',
        ]);
        document.querySelectorAll('link[rel="stylesheet"][href]').forEach((el) => urls.add(el.href));
        document.querySelectorAll('script[src]').forEach((el) => urls.add(el.src));

        navigator.serviceWorker.register('/sw-mobile-route.js', { scope: '/' })
            .then((reg) => {
                const sw = reg.installing || reg.waiting || reg.active;
                if (!sw) return;
                const sendPrecache = (worker) => worker.postMessage({ type: 'PRECACHE', urls: Array.from(urls) });
                if (reg.installing) {
                    reg.installing.addEventListener('statechange', (e) => {
                        if (e.target.state === 'activated') sendPrecache(e.target);
                    });
                } else {
                    sendPrecache(sw);
                }
            })
            .catch(() => {});
    };

    const fetchSession = () => {
        const sessionUrl = `/api/route-sessions/${encodeURIComponent(token)}`;
        fetch(sessionUrl)
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

                // A service worker can serve this exact response back from
                // cache indefinitely once the phone is offline, so the
                // "active" status above can't be trusted past its own
                // expiry -- check locally rather than assuming the network
                // will ever confirm it's stale.
                const expiresAtMs = Date.parse(body.expires_at);
                if (Number.isFinite(expiresAtMs)) {
                    const msRemaining = expiresAtMs - Date.now();
                    if (msRemaining <= 0) {
                        showExpired('This route has expired. Head back to the kiosk to start a new one.');
                        return;
                    }
                    setTimeout(() => {
                        if (!arrived) showExpired('This route has expired. Head back to the kiosk to start a new one.');
                    }, msRemaining);
                }

                sessionData = body;
                els.eyebrow.textContent = 'DESTINATION';
                els.subtitle.textContent = `Heading to ${body.destination.name}`;
                els.finishButton.disabled = false;
                if (!localStorage.getItem(STARTED_AT_KEY)) {
                    localStorage.setItem(STARTED_AT_KEY, String(Date.now()));
                }
                renderMap(body);
                startTracking();
                registerOfflineCache(sessionUrl);
            })
            .catch(() => {
                showExpired('Could not load your route. Check your connection and try again.');
            });
    };

    // --- voice toggle --------------------------------------------------
    const greeting = () => (sessionData
        ? `Voice guidance on. Head toward ${sessionData.destination.name}.`
        : 'Voice guidance on.');

    const renderVoiceButton = () => {
        const on = voice.isEnabled();
        els.voice.setAttribute('aria-pressed', on ? 'true' : 'false');
        els.voice.setAttribute('aria-label', on ? 'Turn voice guidance off' : 'Turn voice guidance on');
    };

    if (els.voice) {
        if (voice.supported) {
            renderVoiceButton();
            els.voice.addEventListener('click', () => {
                // Spoken inside the tap: that gesture is what lets iOS and
                // Chrome speak at all.
                voice.toggle(greeting());
                renderVoiceButton();
            });
            // A preference remembered from an earlier visit can't speak until
            // the page has had a gesture; the first tap anywhere unlocks it.
            // Except the voice button itself: its own toggle() is that
            // gesture, and priming first would greet and then mute at once.
            document.addEventListener('pointerdown', (event) => {
                if (!els.voice.contains(event.target)) voice.prime(greeting());
            }, { once: true, capture: true });
        } else {
            els.voice.style.display = 'none';
        }
    }

    els.finishButton.addEventListener('click', () => completeRoute());
    els.recenter.addEventListener('click', () => {
        if (puckMarker) {
            map.flyTo(puckMarker.getLatLng(), Math.max(map.getZoom(), 1));
        } else if (routeFill) {
            map.fitBounds(routeFill.getBounds(), { padding: [32, 120] });
        }
    });
    window.addEventListener('pagehide', stopTracking);
    flushPendingFinish();
    fetchSession();
});
