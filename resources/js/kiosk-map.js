document.addEventListener('DOMContentLoaded', () => {
    const mapElement = document.getElementById('campus-map');

    if (!mapElement || typeof L === 'undefined') {
        return;
    }

    const imageUrl = '/campus-map.png';
    const map = L.map(mapElement, {
        crs: L.CRS.Simple,
        minZoom: -2,
        zoomControl: true,
    });
    const defaultKioskStart = [194.00, 566.00];
    let kioskStart = defaultKioskStart;
    let activeRoute = null;

    const escapeHtml = (value) => String(value ?? '').replace(/[&<>'"]/g, (character) => {
        const replacements = {
            '&': '&amp;',
            '<': '&lt;',
            '>': '&gt;',
            "'": '&#39;',
            '"': '&quot;',
        };

        return replacements[character] || character;
    });

    const renderLocations = () => {
        fetch('/api/locations')
            .then((response) => {
                if (!response.ok) {
                    throw new Error(`Location request failed with status ${response.status}`);
                }

                return response.json();
            })
            .then((locations) => {
                if (!Array.isArray(locations)) {
                    return;
                }

                locations.forEach((location) => {
                    const latitude = Number(location.latitude);
                    const longitude = Number(location.longitude);

                    if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) {
                        return;
                    }

                    const position = [latitude, longitude];
                    const isRoutable = Boolean(location.is_routable);
                    const isStart = Boolean(location.is_start);
                    const displayName = location.name || 'Location';

                    if (isStart) {
                        kioskStart = position;
                    }

                    const marker = isRoutable
                        ? L.circleMarker(position, {
                            radius: 10,
                            color: '#1d4ed8',
                            weight: 3,
                            fillColor: '#3b82f6',
                            fillOpacity: 0.95,
                        }).addTo(map)
                        : L.marker(position).addTo(map);

                    marker.bindPopup(
                        `<b>${escapeHtml(displayName)}</b><br>${escapeHtml(location.type || 'Building')}`
                    );

                    marker.bindTooltip(isStart ? 'You are here' : displayName, {
                        permanent: isStart,
                        direction: 'top',
                        offset: [0, -10],
                        className: isStart ? 'campus-map-label campus-map-label--start' : 'campus-map-label',
                    });

                    if (isRoutable) {
                        marker.on('click', () => {
                            if (activeRoute) {
                                map.removeLayer(activeRoute);
                            }

                            activeRoute = L.polyline([kioskStart, position], {
                                color: '#1d4ed8',
                                weight: 4,
                                opacity: 0.9,
                            }).addTo(map);
                        });
                    }
                });
            })
            .catch((error) => {
                console.error('Unable to load campus locations:', error);
            });
    };

    const showCoordinates = (latlng) => {
        const latitude = Number(latlng.lat).toFixed(2);
        const longitude = Number(latlng.lng).toFixed(2);

        L.popup()
            .setLatLng(latlng)
            .setContent(`Latitude: ${latitude}<br>Longitude: ${longitude}`)
            .openOn(map);

        console.log(`Latitude: ${latitude}, Longitude: ${longitude}`);
    };

    const mapImage = new Image();

    mapImage.onload = () => {
        const bounds = [[0, 0], [mapImage.height, mapImage.width]];

        L.imageOverlay(imageUrl, bounds).addTo(map);
        map.fitBounds(bounds);
        map.setMaxBounds(bounds);
        renderLocations();
    };

    mapImage.onerror = () => {
        console.error(`Unable to load campus map image from ${imageUrl}`);
    };

    map.on('click', (event) => {
        showCoordinates(event.latlng);
    });

    mapImage.src = imageUrl;
});