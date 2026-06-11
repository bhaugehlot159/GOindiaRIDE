        const BOOKING_OSM_TILE_URL = 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png';
        const BOOKING_OSM_TILE_ATTRIBUTION = '&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">OpenStreetMap contributors</a>';
        const BOOKING_OSM_GEOCODE_ENDPOINT = 'https://nominatim.openstreetmap.org/search';
        const BOOKING_OSM_GEOCODE_MIN_GAP_MS = 1100;
        const BOOKING_OSM_GEOCODE_CACHE_MAX_ENTRIES = 120;
        const BOOKING_EXACT_LOCATION_STORAGE_KEY = 'goindiaride_booking_exact_locations_v1';
        const BOOKING_GOOGLE_MAP_DEFAULT_CENTER = { lat: 24.5854, lng: 73.7125 };
        const BOOKING_GPS_TARGET_ACCURACY_METERS = 35;
        const BOOKING_GPS_WEAK_ACCURACY_METERS = 120;
        const BOOKING_GPS_FIRST_FIX_TIMEOUT_MS = 8000;
        const BOOKING_GPS_REFINE_WINDOW_MS = 6000;
        const BOOKING_GPS_INSTANT_FIX_TIMEOUT_MS = 1800;
        const BOOKING_GPS_INSTANT_MAX_AGE_MS = 180000;
        const BOOKING_GPS_QUICK_FIX_TIMEOUT_MS = 2500;
        const BOOKING_GPS_QUICK_MAX_AGE_MS = 12000;
        const BOOKING_GPS_QUICK_ACCEPT_ACCURACY_METERS = 85;
        const BOOKING_GPS_REFINE_MAX_DRIFT_METERS = 3500;
        const BOOKING_GPS_WARM_CACHE_MAX_AGE_MS = 180000;
        const BOOKING_REVERSE_GEOCODE_CACHE_STORAGE_KEY = 'goindiaride_booking_reverse_geocode_cache_v3';
        const BOOKING_REVERSE_GEOCODE_LEGACY_CACHE_KEYS = [
            'goindiaride_booking_reverse_geocode_cache_v1',
            'goindiaride_booking_reverse_geocode_cache_v2'
        ];
        const BOOKING_REVERSE_GEOCODE_MIN_ACCEPT_SCORE = 6;
        const BOOKING_REVERSE_GEOCODE_PRIMARY_ACCEPT_SCORE = 8;
        const BOOKING_REVERSE_GEOCODE_CACHE_MAX_ENTRIES = 80;
        const BOOKING_REVERSE_GEOCODE_PRIMARY_PRECISION = 5;
        const BOOKING_REVERSE_GEOCODE_FALLBACK_PRECISION = 4;
        const bookingGoogleMapState = {
            activeTarget: 'pickup',
            coords: { pickup: null, dropoff: null, stop: null },
            geocoder: null,
            placesService: null,
            leafletLoadingPromise: null,
            osmGeocodeQueue: Promise.resolve(),
            osmGeocodeLastRequestAt: 0,
            osmGeocodeCache: new Map(),
            osmGeocodePending: new Map(),
            inputTimer: null,
            map: null,
            mapReady: false,
            markers: { pickup: null, dropoff: null, stop: null },
            routeLine: null,
            reverseGeocodeCacheLoaded: false,
            reverseGeocodeCache: new Map(),
            reverseGeocodePending: new Map(),
            warmCurrentLocation: null,
            warmCurrentLocationPromise: null
        };

        function setBookingMapStatus(message, state = 'info') {
            const statusNode = document.getElementById('bookingMapStatus');
            if (!statusNode) return;
            statusNode.textContent = message;
            statusNode.dataset.state = state;
        }

        function setBookingMapActiveTarget(target = 'pickup') {
            bookingGoogleMapState.activeTarget = ['pickup', 'dropoff', 'stop'].includes(target) ? target : 'pickup';
            document.querySelectorAll('[data-map-target]').forEach((button) => {
                button.classList.toggle('is-active', button.dataset.mapTarget === bookingGoogleMapState.activeTarget);
            });
        }

        function queueBookingOsmGeocodeTask(task) {
            const safeTask = typeof task === 'function' ? task : null;
            if (!safeTask) return Promise.resolve(null);
            bookingGoogleMapState.osmGeocodeQueue = bookingGoogleMapState.osmGeocodeQueue
                .catch(() => null)
                .then(async () => {
                    const elapsed = Date.now() - Number(bookingGoogleMapState.osmGeocodeLastRequestAt || 0);
                    if (elapsed < BOOKING_OSM_GEOCODE_MIN_GAP_MS) {
                        await new Promise((resolve) => window.setTimeout(resolve, BOOKING_OSM_GEOCODE_MIN_GAP_MS - elapsed));
                    }
                    bookingGoogleMapState.osmGeocodeLastRequestAt = Date.now();
                    return safeTask();
                });
            return bookingGoogleMapState.osmGeocodeQueue;
        }

        async function ensureBookingLeafletRuntime() {
            if (window.L?.map) return true;
            if (bookingGoogleMapState.leafletLoadingPromise) return bookingGoogleMapState.leafletLoadingPromise;
            bookingGoogleMapState.leafletLoadingPromise = new Promise((resolve) => {
                const done = () => resolve(Boolean(window.L?.map));
                if (!document.querySelector('link[data-booking-leaflet-css="1"]')) {
                    const css = document.createElement('link');
                    css.rel = 'stylesheet';
                    css.href = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css';
                    css.dataset.bookingLeafletCss = '1';
                    document.head.appendChild(css);
                }
                if (window.L?.map) {
                    done();
                    return;
                }
                const existingScript = document.querySelector('script[data-booking-leaflet-js="1"]');
                if (existingScript) {
                    existingScript.addEventListener('load', done, { once: true });
                    existingScript.addEventListener('error', () => resolve(false), { once: true });
                    return;
                }
                const script = document.createElement('script');
                script.src = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.js';
                script.async = true;
                script.dataset.bookingLeafletJs = '1';
                script.onload = done;
                script.onerror = () => resolve(false);
                document.head.appendChild(script);
            });
            return bookingGoogleMapState.leafletLoadingPromise;
        }

        async function ensureBookingGoogleMapReady() {
            const mapNode = document.getElementById('bookingGoogleMap');
            if (bookingGoogleMapState.geocoder && (bookingGoogleMapState.mapReady || !mapNode)) return true;
            bookingGoogleMapState.geocoder = { provider: 'osm_nominatim' };
            bookingGoogleMapState.placesService = null;

            if (!mapNode) {
                updateBookingGoogleMapRouteLink();
                return true;
            }
            try {
                const ready = await ensureBookingLeafletRuntime();
                if (!ready || !window.L?.map) {
                    setBookingMapStatus('Map preview unavailable. Location features are still active.', 'warning');
                    updateBookingGoogleMapRouteLink();
                    return true;
                }

                if (!bookingGoogleMapState.map) {
                    bookingGoogleMapState.map = window.L.map(mapNode, {
                        zoomControl: true,
                        attributionControl: true
                    }).setView([BOOKING_GOOGLE_MAP_DEFAULT_CENTER.lat, BOOKING_GOOGLE_MAP_DEFAULT_CENTER.lng], 11);
                    window.L.tileLayer(BOOKING_OSM_TILE_URL, {
                        attribution: BOOKING_OSM_TILE_ATTRIBUTION,
                        maxZoom: 19
                    }).addTo(bookingGoogleMapState.map);
                    bookingGoogleMapState.map.on('click', (event) => {
                        const latlng = event?.latlng;
                        if (!latlng) return;
                        applyBookingMapCoordinates(bookingGoogleMapState.activeTarget, {
                            lat: latlng.lat,
                            lng: latlng.lng
                        }, { source: 'map' });
                    });
                }
                bookingGoogleMapState.mapReady = true;
                mapNode.classList.add('is-ready');
                window.setTimeout(() => {
                    if (bookingGoogleMapState.map?.invalidateSize) {
                        bookingGoogleMapState.map.invalidateSize();
                    }
                }, 120);
                setBookingMapStatus('OpenStreetMap ready. Tap map to set exact pickup/drop.', 'info');
                syncBookingMapFromInputs();
                return true;
            } catch (_error) {
                setBookingMapStatus('Map preview unavailable. Location features are still active.', 'warning');
                updateBookingGoogleMapRouteLink();
                return true;
            }
        }

        function getBookingMapInputValue(target) {
            if (target === 'stop') {
                return getRouteStopInputs()
                    .map((input) => sanitizeInput(input.value || '').trim())
                    .find(Boolean) || '';
            }
            const inputIds = target === 'dropoff'
                ? ['dropoff', 'cabQuickDropoffInput']
                : ['pickup', 'cabQuickPickupInput'];
            return inputIds
                .map((id) => sanitizeInput(document.getElementById(id)?.value || '').trim())
                .find(Boolean) || '';
        }

        function getBookingMapRouteStops() {
            return typeof readRouteStops === 'function' ? readRouteStops() : [];
        }

        function parseBookingMapLatLngToken(value) {
            const text = sanitizeInput(value || '').trim();
            const match = text.match(/^(-?\d+(?:\.\d+)?)\s*,\s*(-?\d+(?:\.\d+)?)$/);
            if (!match) return null;
            const lat = Number(match[1]);
            const lng = Number(match[2]);
            if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
            if (lat < -90 || lat > 90 || lng < -180 || lng > 180) return null;
            return { lat: Number(lat.toFixed(7)), lng: Number(lng.toFixed(7)) };
        }

        function buildBookingGoogleMapsUrl() {
            const pickup = getBookingMapQueryValue('pickup');
            const dropoff = getBookingMapQueryValue('dropoff');
            const stops = getRouteStopInputs()
                .map((input) => {
                    const point = getBookingMapDatasetCoords(input);
                    return point ? `${point.lat},${point.lng}` : sanitizeInput(input.value || '').trim();
                })
                .filter(Boolean);

            const pickupPoint = parseBookingMapLatLngToken(pickup);
            const dropoffPoint = parseBookingMapLatLngToken(dropoff);
            if (pickupPoint && dropoffPoint) {
                const routePoints = [pickupPoint];
                stops.forEach((stopValue) => {
                    const stopPoint = parseBookingMapLatLngToken(stopValue);
                    if (stopPoint) routePoints.push(stopPoint);
                });
                routePoints.push(dropoffPoint);
                const route = routePoints.map((point) => `${point.lat},${point.lng}`).join(';');
                return `https://www.openstreetmap.org/directions?engine=fossgis_osrm_car&route=${encodeURIComponent(route)}`;
            }

            const searchQuery = pickup || dropoff || stops[0] || '';
            if (!searchQuery) return 'https://www.openstreetmap.org';
            return `https://www.openstreetmap.org/search?query=${encodeURIComponent(searchQuery)}`;
        }

        function updateBookingGoogleMapRouteLink() {
            const linkNode = document.getElementById('routePreviewLink');
            if (!linkNode) return;
            const pickup = getBookingMapInputValue('pickup');
            const dropoff = getBookingMapInputValue('dropoff');
            if (pickup && dropoff) {
                linkNode.href = buildBookingGoogleMapsUrl();
                linkNode.style.display = 'inline-flex';
                return;
            }
            linkNode.style.display = 'none';
        }

        function normalizeBookingMapCoords(raw = {}, defaults = {}) {
            const source = raw && typeof raw === 'object' ? raw : {};
            const lat = Number(source.lat ?? source.latitude);
            const lng = Number(source.lng ?? source.lon ?? source.longitude);
            if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
            if (lat < -90 || lat > 90 || lng < -180 || lng > 180) return null;
            const accuracyValue = Number(source.accuracy ?? source.accuracyMeters ?? source.horizontalAccuracy);
            const altitudeAccuracyValue = Number(source.altitudeAccuracy);
            const capturedAt = sanitizeInput(
                source.capturedAt
                    || defaults.capturedAt
                    || (source.timestamp ? new Date(source.timestamp).toISOString() : '')
                    || new Date().toISOString(),
                60
            );
            const point = {
                lat: Number(lat.toFixed(7)),
                lng: Number(lng.toFixed(7)),
                source: sanitizeInput(source.source || defaults.source || 'map_pin', 80),
                capturedAt,
                googleMapsUrl: ''
            };
            if (Number.isFinite(accuracyValue) && accuracyValue >= 0) {
                point.accuracy = Math.round(accuracyValue);
            }
            if (Number.isFinite(altitudeAccuracyValue) && altitudeAccuracyValue >= 0) {
                point.altitudeAccuracy = Math.round(altitudeAccuracyValue);
            }
            point.googleMapsUrl = buildBookingMapPointUrl(point);
            return point;
        }

        function buildBookingMapPointUrl(coords) {
            const lat = Number(coords?.lat ?? coords?.latitude);
            const lng = Number(coords?.lng ?? coords?.lon ?? coords?.longitude);
            if (!Number.isFinite(lat) || !Number.isFinite(lng)) return '';
            if (lat < -90 || lat > 90 || lng < -180 || lng > 180) return '';
            const safeLat = Number(lat.toFixed(7));
            const safeLng = Number(lng.toFixed(7));
            return `https://www.openstreetmap.org/?mlat=${safeLat}&mlon=${safeLng}#map=17/${safeLat}/${safeLng}`;
        }

        function formatBookingMapAccuracy(coords) {
            const point = normalizeBookingMapCoords(coords);
            if (!point || !Number.isFinite(Number(point.accuracy))) return '';
            return `GPS ±${Math.max(1, Math.round(Number(point.accuracy)))}m`;
        }

        function isBookingPreciseCurrentLocationPoint(coords) {
            const point = normalizeBookingMapCoords(coords);
            if (!point) return false;
            const accuracy = Number(point.accuracy ?? Number.POSITIVE_INFINITY);
            return Number.isFinite(accuracy) && accuracy <= BOOKING_GPS_TARGET_ACCURACY_METERS;
        }

        function formatBookingPreciseLocationRequiredMessage(coords) {
            const accuracy = formatBookingMapAccuracy(coords);
            return `Exact current location nahi mila${accuracy ? ` (${accuracy})` : ''}. Exact pickup ke liye GPS <= ${BOOKING_GPS_TARGET_ACCURACY_METERS}m chahiye. Browser/Windows me Location + Precise location ON karke retry karein, ya pickup manually type karein.`;
        }

        function formatBookingMapCoords(coords) {
            const point = normalizeBookingMapCoords(coords);
            if (!point) return '';
            const accuracy = formatBookingMapAccuracy(point);
            return `${point.lat.toFixed(6)}, ${point.lng.toFixed(6)}${accuracy ? ` (${accuracy})` : ''}`;
        }

        function getBookingDistanceMeters(basePoint, nextPoint) {
            const base = normalizeBookingMapCoords(basePoint);
            const next = normalizeBookingMapCoords(nextPoint);
            if (!base || !next) return Number.POSITIVE_INFINITY;
            const toRadians = (value) => (value * Math.PI) / 180;
            const earthRadiusMeters = 6371000;
            const dLat = toRadians(next.lat - base.lat);
            const dLng = toRadians(next.lng - base.lng);
            const lat1 = toRadians(base.lat);
            const lat2 = toRadians(next.lat);
            const a = (Math.sin(dLat / 2) ** 2)
                + (Math.cos(lat1) * Math.cos(lat2) * (Math.sin(dLng / 2) ** 2));
            const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
            return earthRadiusMeters * c;
        }

        function getBookingMapDatasetCoords(input) {
            if (!input || !input.dataset) return null;
            return normalizeBookingMapCoords({
                lat: input.dataset.googleMapLat,
                lng: input.dataset.googleMapLng,
                accuracy: input.dataset.googleMapAccuracy,
                capturedAt: input.dataset.googleMapCapturedAt,
                source: input.dataset.googleMapSource
            });
        }

        function getBookingMapCoordsForTarget(target) {
            const safeTarget = ['pickup', 'dropoff', 'stop'].includes(target) ? target : 'pickup';
            const statePoint = normalizeBookingMapCoords(bookingGoogleMapState.coords[safeTarget]);
            if (statePoint) return statePoint;

            if (safeTarget === 'stop') {
                const stopInput = getRouteStopInputs().find((input) => getBookingMapDatasetCoords(input));
                return getBookingMapDatasetCoords(stopInput);
            }

            const inputIds = safeTarget === 'dropoff'
                ? ['dropoff', 'cabQuickDropoffInput']
                : ['pickup', 'cabQuickPickupInput'];
            for (const inputId of inputIds) {
                const point = getBookingMapDatasetCoords(document.getElementById(inputId));
                if (point) return point;
            }
            return null;
        }

        function getBookingMapQueryValue(target) {
            const point = getBookingMapCoordsForTarget(target);
            if (point) return `${point.lat},${point.lng}`;
            return getBookingMapInputValue(target);
        }

        function saveBookingExactLocationSnapshot() {
            try {
                const snapshot = buildBookingLocationSnapshot();
                localStorage.setItem(BOOKING_EXACT_LOCATION_STORAGE_KEY, JSON.stringify({
                    ...snapshot,
                    updatedAt: new Date().toISOString()
                }));
            } catch (error) {
                // Storage can be unavailable in private browsing or strict mode.
            }
        }

        function setBookingExactLocationDataset(input, coords, address = '') {
            if (!input || !input.dataset) return;
            const point = normalizeBookingMapCoords(coords);
            if (!point) return;
            input.dataset.googleMapLat = String(point.lat);
            input.dataset.googleMapLng = String(point.lng);
            input.dataset.googleMapAccuracy = Number.isFinite(Number(point.accuracy)) ? String(point.accuracy) : '';
            input.dataset.googleMapCapturedAt = point.capturedAt || '';
            input.dataset.googleMapSource = point.source || '';
            input.dataset.googleMapUrl = point.googleMapsUrl || buildBookingMapPointUrl(point);
            input.dataset.googleMapAddress = sanitizeInput(address || input.value || '', 220);
        }

        function clearBookingExactLocationDataset(input) {
            if (!input || !input.dataset) return;
            delete input.dataset.googleMapLat;
            delete input.dataset.googleMapLng;
            delete input.dataset.googleMapAccuracy;
            delete input.dataset.googleMapCapturedAt;
            delete input.dataset.googleMapSource;
            delete input.dataset.googleMapUrl;
            delete input.dataset.googleMapAddress;
        }

        function clearBookingMapCoordinatesForInput(input) {
            if (!input || !input.matches?.('#pickup, #dropoff, #cabQuickPickupInput, #cabQuickDropoffInput, [data-route-stop-input]')) return;
            const target = input.matches('[data-route-stop-input]')
                ? 'stop'
                : (input.id === 'dropoff' || input.id === 'cabQuickDropoffInput' ? 'dropoff' : 'pickup');
            const previousAddress = sanitizeInput(input.dataset?.googleMapAddress || '').trim();
            const nextValue = sanitizeInput(input.value || '').trim();
            const hasDatasetCoords = Boolean(getBookingMapDatasetCoords(input));
            const hasStateCoords = Boolean(normalizeBookingMapCoords(bookingGoogleMapState.coords[target]));
            if (!hasDatasetCoords && !hasStateCoords) return;
            if (hasDatasetCoords && previousAddress === nextValue) return;

            if (target === 'stop') {
                clearBookingExactLocationDataset(input);
                bookingGoogleMapState.coords[target] = null;
            } else {
                const inputIds = target === 'dropoff'
                    ? ['dropoff', 'cabQuickDropoffInput']
                    : ['pickup', 'cabQuickPickupInput'];
                inputIds.forEach((inputId) => clearBookingExactLocationDataset(document.getElementById(inputId)));
                bookingGoogleMapState.coords[target] = null;
                setBookingMapMarker(target, null);
            }
            updateBookingGoogleMapLine();
            saveBookingExactLocationSnapshot();
        }
