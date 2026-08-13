/*
 * Mobile route page.
 *
 * Lifecycle:
 *   1. Read the token + expired flag the server stamped onto the root element.
 *   2. If expired, show the notice and bail — no map, no fetch.
 *   3. Otherwise fetch /api/route-sessions/<token> for start + destination.
 *   4. Draw the map (campus-map.png with CRS.Simple, same as the kiosk).
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
        minZoom: -2,
        zoomControl: false,
        attributionControl: false,
    });

    const drawRoute = (start, destination) => {
        // Pixel positions on campus-map.png, y first — see the note in
        // kiosk-map.js. The real WGS84 sits on `latitude`/`longitude`, unused
        // here because this map is a picture rather than a geographic one.
        const startPos = [Number(start.map_y), Number(start.map_x)];
        const destPos = [Number(destination.map_y), Number(destination.map_x)];

        L.circleMarker(startPos, {
            radius: 9,
            color: '#16a34a',
            weight: 3,
            fillColor: '#22c55e',
            fillOpacity: 0.95,
        }).addTo(map).bindTooltip('Start', { permanent: true, direction: 'top', offset: [0, -10] });

        L.circleMarker(destPos, {
            radius: 11,
            color: '#dc2626',
            weight: 3,
            fillColor: '#ef4444',
            fillOpacity: 0.95,
        }).addTo(map).bindTooltip(destination.name || 'Destination', {
            permanent: true,
            direction: 'top',
            offset: [0, -12],
        });

        L.polyline([startPos, destPos], {
            color: '#2563eb',
            weight: 5,
            opacity: 0.9,
        }).addTo(map);

        // Frame the view so both points are visible with a margin.
        map.fitBounds([startPos, destPos], { padding: [40, 40] });
    };

    const loadCampusImage = () => new Promise((resolve, reject) => {
        const image = new Image();
        image.onload = () => resolve(image);
        image.onerror = reject;
        image.src = '/campus-map.png';
    });

    const renderMap = (data) => {
        loadCampusImage()
            .then((image) => {
                const bounds = [[0, 0], [image.height, image.width]];
                L.imageOverlay('/campus-map.png', bounds).addTo(map);
                map.setMaxBounds(bounds);
                drawRoute(data.start, data.destination);
            })
            .catch(() => {
                showExpired('Could not load the campus map. Please try again later.');
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
