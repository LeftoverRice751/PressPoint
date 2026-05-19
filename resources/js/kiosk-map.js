/*
 * Campus map kiosk JS.
 *
 * Sections (in order — each one is independent and self-explanatory):
 *
 *   1. Constants + state
 *   2. DOM references
 *   3. Helpers (escape, CSRF, debounce)
 *   4. Search index (acronyms + initials)
 *   5. Suggestions rendering
 *   6. On-screen keyboard
 *   7. Map setup + marker rendering
 *   8. Building pane (open / close)
 *   9. Show Route flow + QR handoff
 *   10. Idle reset
 *   11. Boot
 *
 * The kiosk reset rule: any tap anywhere bumps the idle timer; if 60
 * seconds pass with no taps, every overlay is closed and the map view
 * is restored. The route session token created on the server stays
 * alive on the user's phone for its full TTL even after a kiosk reset.
 */
document.addEventListener('DOMContentLoaded', () => {
    // ── 1. Constants + state ──────────────────────────────────────

    const KIOSK_IDLE_RESET_MS = 60 * 1000;
    const SEARCH_RESULT_LIMIT = 6;
    const QR_SIZE_PX = 240;

    // Categories drive the chip strip above the search bar. Each chip
    // owns a regex that decides which `type` strings belong to it. The
    // location data has a fairly noisy `type` field ("Building/Entrance",
    // "Department/Academic Building", etc.), so we bucket pragmatically.
    const CATEGORIES = [
        { id: 'all',         label: 'All',         match: () => true },
        { id: 'departments', label: 'Departments', match: (t) => /department|college/i.test(t) },
        { id: 'offices',     label: 'Offices',     match: (t) => /office/i.test(t) },
        { id: 'buildings',   label: 'Buildings',   match: (t) => /building/i.test(t) && !/department|office/i.test(t) },
        { id: 'entrances',   label: 'Entrances',   match: (t) => /entrance|exit|gate/i.test(t) },
        { id: 'places',      label: 'Places',      match: (t) => /library|hotel|center|facility|bakery/i.test(t) },
    ];

    // Bucket a location's `type` into one of the visual categories above.
    // Skips `all` because that's the no-filter chip, not a real bucket.
    // Falls back to `buildings` so every pin has a shape.
    const categoryFor = (type) => {
        const text = String(type || '');
        for (const cat of CATEGORIES) {
            if (cat.id === 'all') continue;
            if (cat.match(text)) return cat.id;
        }
        return 'buildings';
    };

    const state = {
        locations: [],          // raw locations from /api/locations
        searchIndex: [],        // same locations with acronym + initials precomputed
        kioskStart: null,       // [lat, lng] of the start (SSB)
        selected: null,         // currently selected destination location
        activeRoute: null,      // current Leaflet polyline, if any
        idleTimer: null,
        activeCategory: 'all',  // current chip filter
    };

    // ── 2. DOM references ─────────────────────────────────────────

    const dom = {
        page: document.getElementById('campus-map-page'),
        stage: document.getElementById('campus-map-stage'),
        mapEl: document.getElementById('campus-map'),
        suggestions: document.getElementById('suggestions'),
        suggestionsList: document.getElementById('suggestions-list'),
        pane: document.getElementById('building-pane'),
        paneInfo: document.getElementById('building-pane-info'),
        paneQr: document.getElementById('building-pane-qr'),
        paneClose: document.getElementById('building-pane-close'),
        paneType: document.getElementById('building-pane-type'),
        paneName: document.getElementById('building-pane-name'),
        paneLat: document.getElementById('building-pane-lat'),
        paneLng: document.getElementById('building-pane-lng'),
        showRoute: document.getElementById('show-route'),
        qrCanvas: document.getElementById('qr-canvas'),
        coordReadout: document.getElementById('map-coordinate-readout'),
        searchInput: document.getElementById('search-input'),
        searchClear: document.getElementById('search-clear'),
        keyboard: document.getElementById('keyboard'),
        keyboardRows: document.querySelector('.keyboard__rows'),
        chips: document.getElementById('category-chips'),
        zoomIn: document.getElementById('zoom-in'),
        zoomOut: document.getElementById('zoom-out'),
    };

    if (!dom.mapEl || typeof L === 'undefined') {
        return;
    }

    // ── 3. Helpers ────────────────────────────────────────────────

    const escapeHtml = (value) => String(value ?? '').replace(/[&<>'"]/g, (ch) => ({
        '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;',
    }[ch] || ch));

    const csrfToken = () =>
        document.querySelector('meta[name="csrf-token"]')?.content || '';

    // ── 4. Search index ───────────────────────────────────────────

    /**
     * For each location precompute the searchable surfaces. The data
     * shape we get from the server only has `name` and `type`, so we
     * derive:
     *   - acronym  : text inside parens, e.g. "(CCS)" -> "CCS"
     *   - initials : initials of capitalized words, e.g.
     *                "Multi Purpose Building" -> "MPB"
     * Both are matched (with the raw name) when the user types.
     */
    const buildSearchIndex = (locations) =>
        locations.map((location) => {
            const name = location.name || '';
            const acronymMatch = name.match(/\(([^)]+)\)/);
            const acronym = acronymMatch ? acronymMatch[1].trim() : '';
            const initials = name
                .replace(/\(.*?\)/g, '')
                .split(/[\s/.\-]+/)
                .filter((word) => word.length > 0 && /[A-Z]/.test(word[0]))
                .map((word) => word[0])
                .join('');
            return { ...location, acronym, initials };
        });

    /**
     * Score a location against the user's query. Higher score wins.
     * The cascade lets the most specific kind of match (acronym prefix)
     * beat looser ones (substring inside the name).
     */
    const scoreLocation = (location, query) => {
        const q = query.toLowerCase().trim();
        if (!q) return 0;
        const name = (location.name || '').toLowerCase();
        const acronym = (location.acronym || '').toLowerCase();
        const initials = (location.initials || '').toLowerCase();

        if (acronym && acronym.startsWith(q)) return 100;
        if (initials && initials.startsWith(q)) return 80;
        if (name.startsWith(q)) return 60;
        if (name.includes(q)) return 40;
        if (acronym && acronym.includes(q)) return 30;
        return 0;
    };

    const search = (query) => {
        const q = query.toLowerCase().trim();
        const cat = CATEGORIES.find((c) => c.id === state.activeCategory) || CATEGORIES[0];
        const inCategory = state.searchIndex.filter(
            (loc) => loc.is_routable && cat.match(loc.type || ''),
        );

        // No text query: list everything in the category alphabetically
        // so picking a chip alone is a useful action.
        if (!q) {
            return inCategory
                .slice()
                .sort((a, b) => (a.name || '').localeCompare(b.name || ''))
                .slice(0, SEARCH_RESULT_LIMIT);
        }

        return inCategory
            .map((loc) => ({ loc, score: scoreLocation(loc, q) }))
            .filter((entry) => entry.score > 0)
            .sort((a, b) => b.score - a.score)
            .slice(0, SEARCH_RESULT_LIMIT)
            .map((entry) => entry.loc);
    };

    // ── 5. Suggestions rendering ──────────────────────────────────

    const renderSuggestions = (results, query) => {
        // Suggestions are visible whenever the user is typing OR has
        // narrowed the view by category. With both empty we just hide.
        const hasFilter = query || state.activeCategory !== 'all';
        if (!hasFilter) {
            dom.suggestions.classList.add('suggestions--hidden');
            dom.page?.classList.remove('campus-map-page--suggestions-open');
            return;
        }
        if (results.length === 0) {
            const message = query
                ? `No matches for "${escapeHtml(query)}"`
                : 'No locations in this category yet.';
            dom.suggestionsList.innerHTML = `<li class="suggestions__empty">${message}</li>`;
        } else {
            dom.suggestionsList.innerHTML = results.map((loc) => `
                <li class="suggestions__item" data-id="${loc.id}" data-cat="${categoryFor(loc.type)}">
                    <span class="suggestions__item-swatch" aria-hidden="true"></span>
                    <span class="suggestions__item-body">
                        <span class="suggestions__item-name">${escapeHtml(loc.name)}</span>
                        <span class="suggestions__item-type">${escapeHtml(loc.type || 'Building')}</span>
                    </span>
                    <span class="suggestions__item-arrow" aria-hidden="true">→</span>
                </li>
            `).join('');
        }
        dom.suggestions.classList.remove('suggestions--hidden');
        dom.page?.classList.add('campus-map-page--suggestions-open');
    };

    const refreshSuggestions = () => {
        const value = dom.searchInput.value;
        renderSuggestions(search(value), value);
    };

    // Tapping a suggestion picks that building.
    dom.suggestionsList.addEventListener('click', (event) => {
        const item = event.target.closest('.suggestions__item');
        if (!item) return;
        const id = Number(item.dataset.id);
        const location = state.locations.find((loc) => loc.id === id);
        if (location) selectBuilding(location);
    });

    // ── 6. On-screen keyboard ─────────────────────────────────────

    const KEYBOARD_LAYOUT = [
        ['q', 'w', 'e', 'r', 't', 'y', 'u', 'i', 'o', 'p'],
        ['a', 's', 'd', 'f', 'g', 'h', 'j', 'k', 'l'],
        ['z', 'x', 'c', 'v', 'b', 'n', 'm'],
    ];

    const buildKeyboard = () => {
        const rows = KEYBOARD_LAYOUT.map((keys) => `
            <div class="keyboard__row">
                ${keys.map((key) =>
                    `<button class="keyboard__key" data-key="${key}">${key}</button>`
                ).join('')}
            </div>
        `).join('');

        const actionRow = `
            <div class="keyboard__row">
                <button class="keyboard__key keyboard__key--wide" data-key="backspace">⌫</button>
                <button class="keyboard__key keyboard__key--space" data-key="space">space</button>
                <button class="keyboard__key keyboard__key--wide" data-key="clear">clear</button>
                <button class="keyboard__key keyboard__key--wide keyboard__key--done" data-key="done">done</button>
            </div>
        `;

        dom.keyboardRows.innerHTML = rows + actionRow;
    };

    const showKeyboard = () => dom.keyboard.classList.remove('keyboard--collapsed');
    const hideKeyboard = () => dom.keyboard.classList.add('keyboard--collapsed');

    const setSearchValue = (value) => {
        dom.searchInput.value = value;
        dom.searchClear.classList.toggle('search-bar__clear--hidden', value.length === 0);
        renderSuggestions(search(value), value);
    };

    dom.keyboard.addEventListener('click', (event) => {
        const button = event.target.closest('.keyboard__key');
        if (!button) return;
        const key = button.dataset.key;
        const current = dom.searchInput.value;

        if (key === 'backspace') {
            setSearchValue(current.slice(0, -1));
        } else if (key === 'space') {
            setSearchValue(current + ' ');
        } else if (key === 'clear') {
            setSearchValue('');
        } else if (key === 'done') {
            hideKeyboard();
        } else {
            setSearchValue(current + key);
        }
    });

    // Tap the search input (or its area) to open the keyboard. Because
    // the input is `readonly` the OS keyboard never appears.
    dom.searchInput.addEventListener('click', showKeyboard);
    dom.searchClear.addEventListener('click', () => {
        setSearchValue('');
        showKeyboard();
    });

    // ── 7. Map setup + marker rendering ───────────────────────────

    const map = L.map(dom.mapEl, {
        crs: L.CRS.Simple,
        minZoom: -2,
        zoomControl: false,
    });

    // We keep the original image bounds so we can zoom back out later.
    let mapBounds = null;

    // The kiosk start gets a divIcon with two pulse rings + a solid
    // core + a permanent label. Animation is pure CSS (see kiosk-map.css).
    const buildHereIcon = () => L.divIcon({
        className: 'kiosk-here-marker',
        html: `
            <div class="kiosk-here">
                <span class="kiosk-here__pulse"></span>
                <span class="kiosk-here__pulse kiosk-here__pulse--delay"></span>
                <span class="kiosk-here__core"></span>
                <span class="kiosk-here__label">You are here</span>
            </div>
        `,
        iconSize: [0, 0],
        iconAnchor: [0, 0],
    });

    // Routable buildings get a category-tinted divIcon so the visual matches
    // the legend swatches. Non-routable ones keep the default Leaflet pin.
    const buildPinIcon = (categoryId) => L.divIcon({
        className: 'kiosk-pin-marker',
        html: `<div class="kiosk-pin kiosk-pin--${categoryId}"><span class="kiosk-pin__dot"></span></div>`,
        iconSize: [0, 0],
        iconAnchor: [0, 0],
    });

    const addLocationMarker = (location) => {
        const position = [Number(location.latitude), Number(location.longitude)];

        let marker;
        if (location.is_start) {
            marker = L.marker(position, { icon: buildHereIcon() }).addTo(map);
        } else if (location.is_routable) {
            const categoryId = categoryFor(location.type);
            marker = L.marker(position, { icon: buildPinIcon(categoryId) }).addTo(map);
            marker.bindTooltip(location.name, {
                direction: 'top',
                offset: [0, -22],
                className: 'campus-map-label',
            });
        } else {
            marker = L.marker(position).addTo(map);
            marker.bindTooltip(location.name, {
                direction: 'top',
                offset: [0, -10],
                className: 'campus-map-label',
            });
        }

        if (location.is_routable) {
            marker.on('click', () => selectBuilding(location));
        }
    };

    const fetchLocations = () =>
        fetch('/api/locations')
            .then((response) => response.json())
            .then((locations) => {
                if (!Array.isArray(locations)) return;
                state.locations = locations;
                state.searchIndex = buildSearchIndex(locations);

                locations.forEach((location) => {
                    if (location.is_start) {
                        state.kioskStart = [Number(location.latitude), Number(location.longitude)];
                    }
                    addLocationMarker(location);
                });
            })
            .catch((error) => console.error('Failed to load locations:', error));

    // Bootstrap the image overlay first so positioning is right.
    const mapImage = new Image();
    mapImage.onload = () => {
        mapBounds = [[0, 0], [mapImage.height, mapImage.width]];
        L.imageOverlay('/campus-map.png', mapBounds).addTo(map);
        map.fitBounds(mapBounds);
        map.setMaxBounds(mapBounds);
        fetchLocations();
    };
    mapImage.src = '/campus-map.png';

    const updateCoordinateReadout = (latlng) => {
        if (!dom.coordReadout || !latlng) {
            return;
        }

        const lat = Number(latlng.lat);
        const lng = Number(latlng.lng);
        const latText = Number.isFinite(lat) ? lat.toFixed(2) : '—';
        const lngText = Number.isFinite(lng) ? lng.toFixed(2) : '—';

        dom.coordReadout.textContent = `Lat ${latText}, Lng ${lngText}`;
    };

    // Tapping the map (away from a marker) closes any open pane and
    // temporarily exposes the raw coordinates for placement work.
    map.on('click', (event) => {
        updateCoordinateReadout(event.latlng);
        closeBuildingPane();
    });

    // ── 8. Building pane ──────────────────────────────────────────

    const ZOOM_FOR_FOCUS = 0;   // Leaflet CRS.Simple zoom. 0 = native pixels.

    const showInfoView = () => {
        dom.paneInfo.classList.remove('building-pane__view--hidden');
        dom.paneQr.classList.add('building-pane__view--hidden');
    };

    const showQrView = () => {
        dom.paneInfo.classList.add('building-pane__view--hidden');
        dom.paneQr.classList.remove('building-pane__view--hidden');
    };

    const selectBuilding = (location) => {
        state.selected = location;

        // Populate the pane.
        dom.paneType.textContent = location.type || 'Building';
        dom.paneName.textContent = location.name || 'Location';
        dom.paneLat.textContent = Number(location.latitude).toFixed(2);
        dom.paneLng.textContent = Number(location.longitude).toFixed(2);

        // Clear any previous route line and start fresh on the info view.
        if (state.activeRoute) {
            map.removeLayer(state.activeRoute);
            state.activeRoute = null;
        }
        showInfoView();

        // Zoom in on the building.
        map.setView(
            [Number(location.latitude), Number(location.longitude)],
            ZOOM_FOR_FOCUS,
            { animate: true },
        );

        dom.pane.classList.remove('building-pane--hidden');
        dom.pane.setAttribute('aria-hidden', 'false');
        dom.page.classList.remove('campus-map-page--suggestions-open');

        // Picking a building means search is done — clear the bottom dock
        // (chips + search bar) so the pane's action stack is reachable.
        dom.page.classList.add('campus-map-page--pane-open');
        hideKeyboard();
        dom.suggestions.classList.add('suggestions--hidden');
    };

    const closeBuildingPane = () => {
        dom.pane.classList.add('building-pane--hidden');
        dom.pane.setAttribute('aria-hidden', 'true');
        dom.page.classList.remove('campus-map-page--pane-open');
        state.selected = null;

        if (state.activeRoute) {
            map.removeLayer(state.activeRoute);
            state.activeRoute = null;
        }
        if (mapBounds) map.fitBounds(mapBounds);
    };

    dom.paneClose.addEventListener('click', closeBuildingPane);

    // Bottom CLOSE/DONE buttons inside the pane (same size as Show Route).
    dom.pane.querySelectorAll('[data-pane-close]').forEach((btn) => {
        btn.addEventListener('click', closeBuildingPane);
    });

    // ── 9. Show Route flow + QR handoff ───────────────────────────

    const drawRoute = (location) => {
        if (!state.kioskStart) return;
        const destination = [Number(location.latitude), Number(location.longitude)];

        if (state.activeRoute) {
            map.removeLayer(state.activeRoute);
        }
        state.activeRoute = L.polyline([state.kioskStart, destination], {
            color: '#ff5b13',
            weight: 6,
            opacity: 0.95,
            dashArray: '12, 8',
            lineCap: 'square',
            lineJoin: 'miter',
        }).addTo(map);

        // Pull back so the user sees the whole route at once.
        map.fitBounds([state.kioskStart, destination], { padding: [60, 60] });
    };

    const renderQr = (url) => {
        // qrcodejs appends children; clear any prior code first.
        dom.qrCanvas.innerHTML = '';
        new QRCode(dom.qrCanvas, {
            text: url,
            width: QR_SIZE_PX,
            height: QR_SIZE_PX,
            correctLevel: QRCode.CorrectLevel.M,
        });
    };

    const onShowRoute = () => {
        if (!state.selected) return;

        fetch('/api/route-sessions', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'X-CSRF-TOKEN': csrfToken(),
            },
            body: JSON.stringify({ destination_id: state.selected.id }),
        })
            .then((response) => response.json())
            .then((body) => {
                if (!body || !body.qr_url) {
                    console.error('Failed to create route session:', body);
                    return;
                }
                drawRoute(state.selected);
                renderQr(body.qr_url);
                showQrView();
            })
            .catch((error) => console.error('Route session request failed:', error));
    };

    dom.showRoute.addEventListener('click', onShowRoute);

    // ── 10. Category chips ────────────────────────────────────────

    const buildChips = () => {
        dom.chips.innerHTML = CATEGORIES.map((cat) => `
            <button type="button"
                    class="category-chip${cat.id === state.activeCategory ? ' category-chip--active' : ''}"
                    data-cat="${cat.id}">
                <span class="category-chip__swatch" aria-hidden="true"></span>
                <span class="category-chip__label">${escapeHtml(cat.label)}</span>
            </button>
        `).join('');
    };

    const setActiveCategory = (id) => {
        state.activeCategory = id;
        dom.chips.querySelectorAll('.category-chip').forEach((chip) => {
            chip.classList.toggle('category-chip--active', chip.dataset.cat === id);
        });
        refreshSuggestions();
    };

    dom.chips.addEventListener('click', (event) => {
        const chip = event.target.closest('.category-chip');
        if (chip) setActiveCategory(chip.dataset.cat);
    });

    // ── 11. Zoom controls ─────────────────────────────────────────

    dom.zoomIn.addEventListener('click', () => map.zoomIn());
    dom.zoomOut.addEventListener('click', () => map.zoomOut());

    // ── 12. Idle reset ────────────────────────────────────────────

    const resetKiosk = () => {
        closeBuildingPane();
        hideKeyboard();
        setSearchValue('');
        dom.suggestions.classList.add('suggestions--hidden');
        setActiveCategory('all');
    };

    const bumpIdleTimer = () => {
        if (state.idleTimer) clearTimeout(state.idleTimer);
        state.idleTimer = setTimeout(resetKiosk, KIOSK_IDLE_RESET_MS);
    };

    // Any user activity counts: pointer/touch on the page or map.
    ['pointerdown', 'touchstart', 'click'].forEach((eventName) => {
        document.addEventListener(eventName, bumpIdleTimer, { passive: true });
    });
    map.on('movestart zoomstart', bumpIdleTimer);

    // ── 13. Boot ──────────────────────────────────────────────────

    // Hide logo loader once the map and tiles have rendered
    const mapLoader = document.querySelector('[data-map-loader]');
    function hideMapLoader() {
        if (!mapLoader) return;
        mapLoader.classList.remove('is-visible');
        setTimeout(() => { mapLoader.hidden = true; }, 220);
    }
    map.whenReady(hideMapLoader);
    // Fallback: hide after 4s regardless
    setTimeout(hideMapLoader, 4000);

    buildKeyboard();
    buildChips();
    bumpIdleTimer();
});
