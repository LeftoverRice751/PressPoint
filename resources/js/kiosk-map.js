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
    // Sized to fit the bottom dock's content height alongside its border and
    // padding; still comfortably scannable at kiosk reading distance.
    const QR_SIZE_PX = 190;

    // Categories drive the dropdown above the search bar. Each entry
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
        selected: null,         // currently selected destination location
        idleTimer: null,
        activeCategory: 'all',  // current category filter
        // id -> L.marker, and id -> { categoryId, isStart, name }. The markers
        // used to be created and dropped on the floor, which is why the
        // category filter could only ever narrow the suggestions list: there
        // was no handle left to take a pin off the map with.
        markers: new Map(),
        markerMeta: new Map(),
        labelledId: null,       // the one pin currently showing its name plate
        layer: null,            // the L.campus25d() layer instance
        routeLayer: null,       // active route polyline overlay
        baseZoom: null,         // zoom the map settles at after the initial fit
        baseCenter: null,       // center the map settles at after the initial fit
        droneActive: false,     // true while a drone descent animation is in flight
        currentAnimation: 0,    // token so a newer drone call can cancel an older one
        suppressNextMapClick: false, // set by featureclick; see the map click handler
    };

    // 2.5D drone baseline knobs. Match the layer's option defaults so a reset
    // returns to the same look the layer draws when nothing is selected.
    const DRONE_BASE_CAMERA_DISTANCE = 1.7;
    const DRONE_BASE_HEIGHT_SCALE = 1;
    const DRONE_FOCUS_CAMERA_DISTANCE = 2.6;
    const DRONE_FOCUS_HEIGHT_SCALE = 1.5;
    const DRONE_FOCUS_ZOOM_BUMP = 1.8;
    const DRONE_DESCENT_MS = 1200;
    const DRONE_RESET_MS = 900;

    // ── 2. DOM references ─────────────────────────────────────────

    const dom = {
        page: document.getElementById('campus-map-page'),
        stage: document.getElementById('campus-map-stage'),
        mapEl: document.getElementById('campus-map'),
        stage: document.getElementById('campus-map-stage'),
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
        searchInput: document.getElementById('search-input'),
        searchClear: document.getElementById('search-clear'),
        keyboard: document.getElementById('keyboard'),
        keyboardRows: document.querySelector('.keyboard__rows'),
        dropdown: document.getElementById('category-dropdown'),
        dropdownTrigger: document.getElementById('category-trigger'),
        dropdownLabel: document.getElementById('category-trigger-label'),
        dropdownMenu: document.getElementById('category-menu'),
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

    // ── 7. Map setup + 2.5D layer + marker rendering ──────────────

    const map = L.map(dom.mapEl, {
        crs: L.CRS.Simple,
        minZoom: -3,
        maxZoom: 3,
        // The 2.5D layer's usage docs call for a 0.25 snap so its parallax
        // stays crisp during flyTo tweens; anything smaller and Leaflet keeps
        // rerendering the canvas at odd fractional zooms.
        zoomSnap: 0.25,
        zoomControl: false,
        doubleClickZoom: false,
    });

    const routeStyle = {
        color: '#ff5b13',
        weight: 6,
        opacity: 0.95,
        dashArray: '12, 8',
        lineCap: 'square',
        lineJoin: 'miter',
    };

    const clearRouteLayer = () => {
        if (state.routeLayer) {
            map.removeLayer(state.routeLayer);
            state.routeLayer = null;
        }
    };

    // Every position drawn on this map comes from map_y/map_x — the 2.5D
    // layer's own pixel space, which the server converts to (see
    // app/services/Campus25dMapping.py). `latitude`/`longitude` are the raw
    // stored columns in the older y-up space and belong only in the pane
    // readout; drawing with them puts the feature a full image height off
    // the campus, which is exactly the bug this replaced.
    const layerLatLng = (location) => {
        // Number(null) is 0, which passes Number.isFinite -- so an explicit
        // null check has to come first, or a location the server reports as
        // having no coordinates lands at the CRS origin instead of being
        // skipped.
        if (location == null || location.map_y == null || location.map_x == null) return null;
        const y = Number(location?.map_y);
        const x = Number(location?.map_x);
        if (!Number.isFinite(y) || !Number.isFinite(x)) return null;
        return L.latLng(y, x);
    };

    const buildRoutePath = (location) => {
        const route = Array.isArray(location?.route) && location.route.length >= 2
            ? location.route.map(([y, x]) => [Number(y), Number(x)])
            : null;
        if (route) return route;

        const start = state.locations.find((loc) => loc.is_start);
        if (!start) return null;

        const from = layerLatLng(start);
        const to = layerLatLng(location);
        if (!from || !to) return null;

        return [from, to];
    };

    const showRouteLine = (location) => {
        clearRouteLayer();

        const path = buildRoutePath(location);
        if (!path || path.length < 2) return;

        state.routeLayer = L.polyline(path, routeStyle).addTo(map);
        map.fitBounds(state.routeLayer.getBounds(), { padding: [48, 48] });
    };

    // "You are here" divIcon — pulses to anchor the user's mental map at the
    // start location (SSB). Placement lives on top of the 2.5D building.
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

    // Category-tinted marker for a routable building. The 2.5D layer already
    // draws the building shape; the pin adds a colour-coded dot on top so the
    // user still sees the category legend match at a glance.
    //
    // Passing `name` adds the name plate under the dot and marks the pin
    // selected. Only ever done for ONE pin — the one the user tapped. Every
    // pin carrying its own permanent name would collide: the campus buildings
    // sit close enough together that the plates overlap at the default zoom.
    // The plate lives in the divIcon rather than in a Leaflet tooltip because
    // bindTooltip is hover-driven, and the kiosk is a touchscreen with no
    // hover — which is why the names this replaces never appeared at all.
    const buildPinIcon = (categoryId, name) => L.divIcon({
        className: 'kiosk-pin-marker',
        html: `
            <div class="kiosk-pin kiosk-pin--${categoryId}${name ? ' kiosk-pin--selected' : ''}">
                <span class="kiosk-pin__dot"></span>
                ${name ? `<span class="kiosk-pin__name">${escapeHtml(name)}</span>` : ''}
            </div>
        `,
        iconSize: [0, 0],
        iconAnchor: [0, 0],
    });

    // Cache of feature-id -> Leaflet L.latLng centroid. The 2.5D data lives
    // in L.CAMPUS_25D_DATA (pixel CRS: lng = x, lat = -y — the layer stores
    // that as-written, so we just average the polygon vertices and hand back
    // an L.latLng with the y sign already baked in).
    const featureCenterCache = new Map();
    const featureCenter = (featureId) => {
        if (!featureId) return null;
        const key = String(featureId);
        if (featureCenterCache.has(key)) return featureCenterCache.get(key);

        const data = (window.L && L.CAMPUS_25D_DATA) || null;
        if (!data || !Array.isArray(data.features)) return null;

        const idProp = 'id';
        const feature = data.features.find(
            (f) => f.properties && String(f.properties[idProp]) === key,
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
        const cx = sumX / ring.length;
        const cy = sumY / ring.length;

        const latLng = L.latLng(cy, cx);
        featureCenterCache.set(key, latLng);
        return latLng;
    };

    const addLocationMarker = (location) => {
        // Prefer the mapped 2.5D footprint's centroid so the pin sits on the
        // building the layer actually drew. A location that isn't in
        // campus_25d_mapping.json yet still gets a pin from its own
        // coordinates — same space, just less precise than the footprint.
        const center = featureCenter(location.feature_id) || layerLatLng(location);
        if (!center) return;

        // Tooltips used to be bound here for the name. They were hover-only on
        // a touchscreen, so they never showed; the name plate is now part of
        // the selected pin's icon instead (see buildPinIcon).
        let marker;
        let categoryId = null;
        if (location.is_start) {
            marker = L.marker(center, { icon: buildHereIcon() }).addTo(map);
        } else if (location.is_routable) {
            categoryId = categoryFor(location.type);
            marker = L.marker(center, { icon: buildPinIcon(categoryId) }).addTo(map);
        } else {
            marker = L.marker(center).addTo(map);
        }

        if (location.is_routable) {
            marker.on('click', () => selectBuilding(location));
        }

        state.markers.set(location.id, marker);
        state.markerMeta.set(location.id, {
            categoryId,
            isStart: Boolean(location.is_start),
            name: location.name,
        });
    };

    // Show only the pins in the active category. The "You are here" marker is
    // exempt on purpose — it is the user's anchor on the map and the origin of
    // every route, so hiding it under a filter would leave them with no fixed
    // point. Non-routable pins carry no category, so they show under "All".
    const applyCategoryFilter = () => {
        const showAll = state.activeCategory === 'all';
        state.markers.forEach((marker, id) => {
            const meta = state.markerMeta.get(id);
            if (!meta) return;
            const visible = meta.isStart
                || showAll
                || meta.categoryId === state.activeCategory;
            if (visible && !map.hasLayer(marker)) map.addLayer(marker);
            else if (!visible && map.hasLayer(marker)) map.removeLayer(marker);
        });
    };

    const fetchLocations = () =>
        fetch('/api/locations')
            .then((response) => response.json())
            .then((locations) => {
                if (!Array.isArray(locations)) return;
                state.locations = locations;
                state.searchIndex = buildSearchIndex(locations);

                locations.forEach(addLocationMarker);
                // Honour a category picked while this request was in flight.
                applyCategoryFilter();
            })
            .catch((error) => console.error('Failed to load locations:', error));

    // Bootstrap the 2.5D layer and route featureclick through selectBuilding.
    // The layer handles its own sizing against the map viewport — no image
    // aspect trick needed like the old flat picture required.
    state.layer = L.campus25d({
        cameraDistance: DRONE_BASE_CAMERA_DISTANCE,
        heightScale: DRONE_BASE_HEIGHT_SCALE,
    }).addTo(map);

    const layerBounds = state.layer.getBounds();
    map.fitBounds(layerBounds, { padding: [48, 48] });
    map.setMaxBounds(layerBounds.pad(0.5));
    state.baseZoom = map.getZoom();
    state.baseCenter = map.getCenter();

    state.layer.on('featureclick', (event) => {
        const featureId = event.feature && event.feature.id;
        if (!featureId) return;
        // Fast lookup: match the location whose feature_id === this feature.id.
        const location = state.locations.find(
            (loc) => loc.feature_id && String(loc.feature_id) === String(featureId),
        );
        if (!location) return;
        if (!location.is_routable) return;
        // The layer registers its own map click handler in onAdd — i.e. above,
        // at .addTo(map) — so it fires before the "tap the background to
        // dismiss" handler further down. Without this flag that handler would
        // close the pane on the very click that just opened it.
        state.suppressNextMapClick = true;
        selectBuilding(location);
    });

    fetchLocations();

    let resizeTimer = null;
    window.addEventListener('resize', () => {
        if (resizeTimer) clearTimeout(resizeTimer);
        resizeTimer = setTimeout(() => {
            map.invalidateSize({ animate: false });
            if (!state.droneActive && !state.selected) {
                map.fitBounds(layerBounds, { padding: [48, 48] });
                state.baseZoom = map.getZoom();
                state.baseCenter = map.getCenter();
            }
        }, 150);
    });

    // ── 7b. Drone descent + reset ─────────────────────────────────

    // Cubic ease-out feels like a soft settle — matches the "drone slowing
    // to hover" cue we want; ease-in would look like acceleration into the
    // building, which reads as impact.
    const easeOutCubic = (t) => 1 - Math.pow(1 - t, 3);

    // A single tween runner drives both the descent and the reset: they only
    // differ in the target values and the duration. `currentAnimation` acts
    // as a fence — if a new call starts while an old one is mid-flight, the
    // old one stops writing to the layer and the new one takes over.
    const animateDrone = (fromDistance, toDistance, fromScale, toScale, durationMs) => {
        state.currentAnimation += 1;
        const token = state.currentAnimation;
        const start = performance.now();

        return new Promise((resolve) => {
            const tick = (now) => {
                if (token !== state.currentAnimation) return resolve();
                const t = Math.min(1, (now - start) / durationMs);
                const eased = easeOutCubic(t);
                state.layer.setCameraDistance(fromDistance + (toDistance - fromDistance) * eased);
                state.layer.setHeightScale(fromScale + (toScale - fromScale) * eased);
                if (t < 1) {
                    requestAnimationFrame(tick);
                } else {
                    resolve();
                }
            };
            requestAnimationFrame(tick);
        });
    };

    const flyToWithDroneIn = (location) => {
        const target = featureCenter(location.feature_id) || layerLatLng(location);
        if (!target) return;
        state.droneActive = true;
        map.flyTo(target, state.baseZoom + DRONE_FOCUS_ZOOM_BUMP, {
            duration: DRONE_DESCENT_MS / 1000,
        });
        animateDrone(
            state.layer.options.cameraDistance,
            DRONE_FOCUS_CAMERA_DISTANCE,
            state.layer.options.heightScale,
            DRONE_FOCUS_HEIGHT_SCALE,
            DRONE_DESCENT_MS,
        ).then(() => { state.droneActive = false; });
    };

    const resetDroneCamera = () => {
        state.droneActive = true;
        map.flyToBounds(layerBounds, {
            duration: DRONE_RESET_MS / 1000,
            padding: [48, 48],
        });
        animateDrone(
            state.layer.options.cameraDistance,
            DRONE_BASE_CAMERA_DISTANCE,
            state.layer.options.heightScale,
            DRONE_BASE_HEIGHT_SCALE,
            DRONE_RESET_MS,
        ).then(() => {
            state.droneActive = false;
            state.baseZoom = map.getZoom();
            state.baseCenter = map.getCenter();
        });
    };

    // Tapping the map away from a marker closes any open pane. A tap that
    // landed on a building already ran the layer's featureclick handler on
    // this same click, so honour the flag it set instead of undoing it.
    map.on('click', () => {
        if (state.suppressNextMapClick) {
            state.suppressNextMapClick = false;
            return;
        }
        closeBuildingPane();
    });

    // ── 8. Building pane ──────────────────────────────────────────

    const showInfoView = () => {
        dom.paneInfo.classList.remove('building-pane__view--hidden');
        dom.paneQr.classList.add('building-pane__view--hidden');
    };

    const showQrView = () => {
        dom.paneInfo.classList.add('building-pane__view--hidden');
        dom.paneQr.classList.remove('building-pane__view--hidden');
    };

    // Move the single name plate onto `id`, or clear it entirely with null.
    // Only one pin is ever labelled, so nothing can collide with anything.
    const setLabelledMarker = (id) => {
        if (state.labelledId === id) return;

        const restore = (targetId) => {
            const marker = state.markers.get(targetId);
            const meta = state.markerMeta.get(targetId);
            if (!marker || !meta || meta.isStart || !meta.categoryId) return;
            marker.setIcon(buildPinIcon(meta.categoryId));
            marker.setZIndexOffset(0);
        };

        if (state.labelledId !== null) restore(state.labelledId);
        state.labelledId = null;

        if (id === null || id === undefined) return;

        const marker = state.markers.get(id);
        const meta = state.markerMeta.get(id);
        // The start pin has its own permanent "You are here" plate, and a
        // non-routable pin is a plain Leaflet marker with no divIcon to swap.
        if (!marker || !meta || meta.isStart || !meta.categoryId) return;

        marker.setIcon(buildPinIcon(meta.categoryId, meta.name));
        // Markers are separate stacking contexts, so a z-index inside the icon
        // cannot lift the plate over a neighbouring pin — Leaflet's own
        // per-marker offset is what does it.
        marker.setZIndexOffset(1000);
        state.labelledId = id;
    };

    const selectBuilding = (location) => {
        state.selected = location;
        clearRouteLayer();
        setLabelledMarker(location.id);

        // Populate the pane.
        dom.paneType.textContent = location.type || 'Building';
        dom.paneName.textContent = location.name || 'Location';
        dom.paneLat.textContent = Number(location.latitude).toFixed(2);
        dom.paneLng.textContent = Number(location.longitude).toFixed(2);

        showInfoView();

        // The drone descent is the wayfinding cue: fly the camera to the
        // building, tilt the 2.5D scene, taller extrusion — reads as the
        // camera dropping in from above so users see the target AND what
        // surrounds it.
        flyToWithDroneIn(location);

        dom.pane.classList.remove('building-pane--hidden');
        dom.pane.setAttribute('aria-hidden', 'false');
        dom.page.classList.remove('campus-map-page--suggestions-open');

        // Picking a building means search is done — clear the bottom dock
        // (category + search bar) so the pane's action stack is reachable.
        dom.page.classList.add('campus-map-page--pane-open');
        hideKeyboard();
        setDropdownOpen(false);
        dom.suggestions.classList.add('suggestions--hidden');
    };

    const closeBuildingPane = () => {
        dom.pane.classList.add('building-pane--hidden');
        dom.pane.setAttribute('aria-hidden', 'true');
        dom.page.classList.remove('campus-map-page--pane-open');
        state.selected = null;
        setLabelledMarker(null);
        resetDroneCamera();
    };

    // The floating × was removed from the dock — both views carry a full-size
    // CLOSE/DONE button instead. Guarded so the ref staying absent is fine.
    if (dom.paneClose) dom.paneClose.addEventListener('click', closeBuildingPane);

    // Bottom CLOSE/DONE buttons inside the pane (same size as Show Route).
    dom.pane.querySelectorAll('[data-pane-close]').forEach((btn) => {
        btn.addEventListener('click', closeBuildingPane);
    });

    // ── 9. QR handoff ─────────────────────────────────────────────

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
                // The walkway is already on screen from selectBuilding; the
                // QR flow only needs to issue the token and swap the view.
                renderQr(body.qr_url);
                showQrView();
                showRouteLine(state.selected);
            })
            .catch((error) => console.error('Route session request failed:', error));
    };

    dom.showRoute.addEventListener('click', onShowRoute);

    // ── 10. Category dropdown ─────────────────────────────────────

    const buildCategoryMenu = () => {
        dom.dropdownMenu.innerHTML = CATEGORIES.map((cat) => `
            <button type="button"
                    role="option"
                    aria-selected="${cat.id === state.activeCategory}"
                    class="category-chip${cat.id === state.activeCategory ? ' category-chip--active' : ''}"
                    data-cat="${cat.id}">
                <span class="category-chip__swatch" aria-hidden="true"></span>
                <span class="category-chip__label">${escapeHtml(cat.label)}</span>
            </button>
        `).join('');
    };

    const setDropdownOpen = (open) => {
        dom.dropdown.dataset.open = open ? 'true' : 'false';
        dom.dropdownTrigger.setAttribute('aria-expanded', open ? 'true' : 'false');
    };

    const setActiveCategory = (id) => {
        state.activeCategory = id;

        dom.dropdownMenu.querySelectorAll('.category-chip').forEach((chip) => {
            const isActive = chip.dataset.cat === id;
            chip.classList.toggle('category-chip--active', isActive);
            chip.setAttribute('aria-selected', String(isActive));
        });

        // The collapsed trigger is the only readout of the active filter, so
        // it carries both the label and the category's swatch shape.
        const cat = CATEGORIES.find((c) => c.id === id) || CATEGORIES[0];
        dom.dropdownLabel.textContent = cat.label;
        dom.dropdownTrigger.dataset.cat = cat.id;

        setDropdownOpen(false);
        applyCategoryFilter();
        refreshSuggestions();
    };

    dom.dropdownTrigger.addEventListener('click', () => {
        setDropdownOpen(dom.dropdown.dataset.open !== 'true');
    });

    dom.dropdownMenu.addEventListener('click', (event) => {
        const chip = event.target.closest('.category-chip');
        if (chip) setActiveCategory(chip.dataset.cat);
    });

    // Tapping anywhere else — the map included — folds the menu back down.
    document.addEventListener('pointerdown', (event) => {
        if (dom.dropdown.dataset.open !== 'true') return;
        if (!dom.dropdown.contains(event.target)) setDropdownOpen(false);
    });

    // ── 11. Idle reset ────────────────────────────────────────────

    const resetKiosk = () => {
        closeBuildingPane();
        hideKeyboard();
        setSearchValue('');
        dom.suggestions.classList.add('suggestions--hidden');
        setActiveCategory('all');
        clearRouteLayer();
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

    // ── 12. Boot ──────────────────────────────────────────────────

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
    buildCategoryMenu();
    bumpIdleTimer();
});
