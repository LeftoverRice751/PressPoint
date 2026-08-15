/*
 * Mobile route page.
 *
 * Lifecycle:
 *   1. Read the token + expired flag the server stamped onto the root element.
 *   2. If expired, show the notice and bail — no map, no fetch.
 *   3. Otherwise fetch /api/route-sessions/<token> for start + destination.
 *   4. Draw the 2.5D campus (L.campus25d — same self-contained plugin the
 *      kiosk uses; see resources/js/campus-2.5d.layer.js) and overlay the
 *      selected route polyline from the serialized location coordinates.
 *   5. Wire the Finish button -> POST /api/route-sessions/<token>/finish
 *      and on success, show the congrats modal.
 */
document.addEventListener('DOMContentLoaded', () => {
    const root = document.querySelector('.mobile-route');
    if (!root || typeof L === 'undefined') {
        return;
    }

    const token = root.dataset.token;
    const startedExpired = root.dataset.expired === 'true';
    const subtitle = document.getElementById('mobile-route-subtitle');
    const finishButton = document.getElementById('mobile-route-finish');
    const expiredNotice = document.getElementById('mobile-route-expired');
    const modal = document.getElementById('mobile-route-modal');

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

    const showExpired = (message) => {
        if (message) {
            expiredNotice.textContent = message;
        }
        expiredNotice.classList.remove('mobile-route__notice--hidden');
        finishButton.style.display = 'none';
        subtitle.textContent = '';
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

        return [from, to];
    };

    const drawRouteLine = (start, destination) => {
        if (routeLayer) {
            map.removeLayer(routeLayer);
            routeLayer = null;
        }

        const path = routePathFor(start, destination);
        if (!path || path.length < 2) return;

        routeLayer = L.polyline(path, ROUTE_STYLE).addTo(map);
        map.fitBounds(routeLayer.getBounds(), { padding: [32, 32] });
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
                subtitle.textContent = `Heading to ${body.destination.name}`;
                finishButton.disabled = false;
                renderMap(body);
            })
            .catch(() => {
                showExpired('Could not load your route. Check your connection and try again.');
            });
    };

    const onFinish = () => {
        finishButton.disabled = true;
        fetch(`/api/route-sessions/${encodeURIComponent(token)}/finish`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
        })
            .then((response) => response.json())
            .then(() => {
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
                finishButton.disabled = false;
            });
    };

    finishButton.addEventListener('click', onFinish);
    fetchSession();
});
