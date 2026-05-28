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

        function buildBookingReverseAddress(address = {}) {
            const parts = [
                address.house_number && address.road ? `${address.house_number}, ${address.road}` : (address.road || address.neighbourhood || address.suburb),
                address.city || address.town || address.village || address.county,
                address.state,
                address.postcode,
                address.country
            ].filter(Boolean);
            return parts.join(', ');
        }

        async function fetchBookingJsonWithTimeout(url, options = {}, timeoutMs = 2200) {
            const controller = typeof AbortController !== 'undefined' ? new AbortController() : null;
            const timer = controller ? window.setTimeout(() => controller.abort(), timeoutMs) : null;
            try {
                const response = await fetch(url, {
                    ...options,
                    signal: controller?.signal || options.signal
                });
                if (!response.ok) return null;
                return await response.json();
            } catch (error) {
                return null;
            } finally {
                if (timer) window.clearTimeout(timer);
            }
        }

        function buildBigDataCloudAddress(data = {}) {
            const parts = [
                data.locality || data.principalSubdivisionCode || data.city,
                data.city || data.localityInfo?.administrative?.[3]?.name,
                data.principalSubdivision,
                data.postcode,
                data.countryName
            ].filter(Boolean);
            return [...new Set(parts)].join(', ');
        }

        function buildBookingReverseGeocodeCacheKey(coords, precision = BOOKING_REVERSE_GEOCODE_PRIMARY_PRECISION) {
            const point = normalizeBookingMapCoords(coords);
            if (!point) return '';
            return `${point.lat.toFixed(precision)},${point.lng.toFixed(precision)}`;
        }

        function isBookingBroadAdministrativeAddress(address) {
            const normalized = normalizeBookingAddressCandidate(address);
            if (!normalized) return true;
            const lower = normalized.toLowerCase();
            const broadHints = ['tehsil', 'district', 'taluka', 'state district', 'subdistrict', 'block', 'county'];
            const hasBroadHint = broadHints.some((hint) => lower.includes(hint));
            if (!hasBroadHint) return false;
            const detailPattern = /\b(\d+[a-z0-9\-\/]*|road|rd|street|st|lane|ln|gali|chowk|circle|sector|colony|nagar|market|shop|mall|gate|hospital|hotel|temple|station|airport|flat|apt|apartment|building|plot|house|society)\b/i;
            return !detailPattern.test(normalized);
        }

        function shouldAcceptBookingReverseAddress(address) {
            const normalized = normalizeBookingAddressCandidate(address);
            if (!normalized) return false;
            if (/^-?\d+\.\d{4,}\s*,\s*-?\d+\.\d{4,}/.test(normalized)) return true;
            const parts = normalized.split(',').map((part) => part.trim()).filter(Boolean);
            const hasStreetLevelHint = /\b(\d+[a-z0-9\-\/]*|road|rd|street|st|lane|ln|gali|chowk|circle|sector|colony|nagar|market|shop|mall|gate|hospital|hotel|temple|station|airport|flat|apt|apartment|building|plot|house|society)\b/i.test(normalized);
            const isLikelyCityOnly = parts.length <= 4 && !hasStreetLevelHint;
            if (isLikelyCityOnly) return false;
            if (isBookingBroadAdministrativeAddress(normalized)) return false;
            return scoreBookingAddressCandidate(normalized) >= BOOKING_REVERSE_GEOCODE_MIN_ACCEPT_SCORE;
        }

        function purgeLegacyBookingReverseGeocodeCacheKeys() {
            const keys = Array.isArray(BOOKING_REVERSE_GEOCODE_LEGACY_CACHE_KEYS)
                ? BOOKING_REVERSE_GEOCODE_LEGACY_CACHE_KEYS
                : [];
            if (!keys.length) return;
            keys.forEach((key) => {
                try {
                    localStorage.removeItem(key);
                } catch (_error) {
                    // Ignore storage errors and continue.
                }
            });
        }

        function loadBookingReverseGeocodeCache() {
            if (bookingGoogleMapState.reverseGeocodeCacheLoaded) return;
            bookingGoogleMapState.reverseGeocodeCacheLoaded = true;
            purgeLegacyBookingReverseGeocodeCacheKeys();
            try {
                const raw = JSON.parse(localStorage.getItem(BOOKING_REVERSE_GEOCODE_CACHE_STORAGE_KEY) || '[]');
                if (!Array.isArray(raw)) return;
                raw.forEach((entry) => {
                    const key = sanitizeInput(entry?.key || '', 120).trim();
                    const address = sanitizeInput(entry?.address || '', 220).trim();
                    if (!key || !address || !shouldAcceptBookingReverseAddress(address)) return;
                    bookingGoogleMapState.reverseGeocodeCache.set(key, {
                        address,
                        updatedAt: sanitizeInput(entry?.updatedAt || '', 60)
                    });
                });
            } catch (error) {
                // Ignore malformed cache entries and continue with a fresh in-memory cache.
            }
        }

        function persistBookingReverseGeocodeCache() {
            try {
                const entries = Array.from(bookingGoogleMapState.reverseGeocodeCache.entries())
                    .slice(-BOOKING_REVERSE_GEOCODE_CACHE_MAX_ENTRIES)
                    .map(([key, value]) => ({
                        key,
                        address: sanitizeInput(value?.address || '', 220).trim(),
                        updatedAt: sanitizeInput(value?.updatedAt || '', 60) || new Date().toISOString()
                    }))
                    .filter((entry) => entry.key && entry.address && shouldAcceptBookingReverseAddress(entry.address));
                localStorage.setItem(BOOKING_REVERSE_GEOCODE_CACHE_STORAGE_KEY, JSON.stringify(entries));
            } catch (error) {
                // Storage can be unavailable in private browsing or strict modes.
            }
        }

        function readBookingReverseGeocodeCache(coords) {
            loadBookingReverseGeocodeCache();
            const primaryKey = buildBookingReverseGeocodeCacheKey(coords, BOOKING_REVERSE_GEOCODE_PRIMARY_PRECISION);
            const fallbackKey = buildBookingReverseGeocodeCacheKey(coords, BOOKING_REVERSE_GEOCODE_FALLBACK_PRECISION);
            const keys = [primaryKey, fallbackKey].filter(Boolean);
            let cacheTouched = false;
            for (const key of keys) {
                const cached = bookingGoogleMapState.reverseGeocodeCache.get(key);
                const address = sanitizeInput(cached?.address || '', 220).trim();
                if (!address) continue;
                if (!shouldAcceptBookingReverseAddress(address)) {
                    bookingGoogleMapState.reverseGeocodeCache.delete(key);
                    cacheTouched = true;
                    continue;
                }
                // Touch entry to keep recent lookups hot.
                bookingGoogleMapState.reverseGeocodeCache.delete(key);
                bookingGoogleMapState.reverseGeocodeCache.set(key, {
                    address,
                    updatedAt: new Date().toISOString()
                });
                persistBookingReverseGeocodeCache();
                return address;
            }
            if (cacheTouched) persistBookingReverseGeocodeCache();
            return '';
        }

        function writeBookingReverseGeocodeCache(coords, address) {
            const normalizedAddress = sanitizeInput(address || '', 220).trim();
            if (!normalizedAddress || !shouldAcceptBookingReverseAddress(normalizedAddress)) return;
            loadBookingReverseGeocodeCache();
            const primaryKey = buildBookingReverseGeocodeCacheKey(coords, BOOKING_REVERSE_GEOCODE_PRIMARY_PRECISION);
            const fallbackKey = buildBookingReverseGeocodeCacheKey(coords, BOOKING_REVERSE_GEOCODE_FALLBACK_PRECISION);
            const keys = [primaryKey, fallbackKey].filter(Boolean);
            if (!keys.length) return;
            const payload = {
                address: normalizedAddress,
                updatedAt: new Date().toISOString()
            };
            keys.forEach((key) => {
                bookingGoogleMapState.reverseGeocodeCache.delete(key);
                bookingGoogleMapState.reverseGeocodeCache.set(key, payload);
            });
            while (bookingGoogleMapState.reverseGeocodeCache.size > BOOKING_REVERSE_GEOCODE_CACHE_MAX_ENTRIES) {
                const oldestKey = bookingGoogleMapState.reverseGeocodeCache.keys().next().value;
                if (!oldestKey) break;
                bookingGoogleMapState.reverseGeocodeCache.delete(oldestKey);
            }
            persistBookingReverseGeocodeCache();
        }

        function normalizeBookingAddressCandidate(value) {
            return sanitizeInput(value || '', 220).replace(/\s+/g, ' ').trim();
        }

        function scoreBookingAddressCandidate(value) {
            const address = normalizeBookingAddressCandidate(value);
            if (!address) return Number.NEGATIVE_INFINITY;
            const lower = address.toLowerCase();
            let score = 0;

            if (/\d/.test(address)) score += 2;
            const commaCount = (address.match(/,/g) || []).length;
            score += Math.min(3, commaCount);

            if (address.length >= 20 && address.length <= 140) score += 2;
            else if (address.length > 140) score -= 2;

            const detailHints = [
                'road', 'rd', 'street', 'st', 'gali', 'nagar', 'colony', 'sector', 'lane',
                'market', 'mall', 'hospital', 'hotel', 'temple', 'chowk', 'circle', 'gate',
                'station', 'airport', 'school', 'shop'
            ];
            const hasDetailHint = detailHints.some((hint) => new RegExp(`\\b${hint}\\b`, 'i').test(address));
            if (hasDetailHint) {
                score += 4;
            } else {
                score -= 2;
            }

            const strongBroadHints = ['tehsil', 'district', 'taluka', 'block'];
            score -= strongBroadHints.reduce((count, hint) => count + (lower.includes(hint) ? 4 : 0), 0);
            if (lower.includes('state')) score -= 2;
            if (lower.includes('india')) score -= 1;

            if (lower.includes('current location')) score -= 2;
            return score;
        }

        function pickBestBookingAddressCandidate(candidates = [], coords = null) {
            const unique = [];
            const seen = new Set();
            (Array.isArray(candidates) ? candidates : []).forEach((candidate) => {
                const normalized = normalizeBookingAddressCandidate(candidate);
                if (!normalized) return;
                const key = normalizeAirportSearchText(normalized);
                if (!key || seen.has(key)) return;
                seen.add(key);
                unique.push(normalized);
            });
            if (!unique.length) return formatBookingMapCoords(coords);
            const ranked = unique.map((address) => ({
                address,
                score: scoreBookingAddressCandidate(address)
            }));
            ranked.sort((left, right) => {
                const scoreDelta = right.score - left.score;
                if (scoreDelta !== 0) return scoreDelta;
                return left.address.length - right.address.length;
            });
            const best = ranked[0] || null;
            if (!best || best.score < BOOKING_REVERSE_GEOCODE_MIN_ACCEPT_SCORE) return formatBookingMapCoords(coords);
            return best.address;
        }

        async function reverseGeocodeBookingCoordsFallback(coords) {
            const lat = Number(coords?.lat);
            const lng = Number(coords?.lng);
            if (!Number.isFinite(lat) || !Number.isFinite(lng)) return '';
            const buildOsmParams = (overrides = {}) => {
                const params = new URLSearchParams({
                    format: 'jsonv2',
                    lat: String(lat),
                    lon: String(lng),
                    zoom: '18',
                    layer: 'address',
                    addressdetails: '1',
                    'accept-language': 'en-IN,en'
                });
                Object.entries(overrides).forEach(([key, value]) => {
                    if (value === undefined || value === null || value === '') return;
                    params.set(key, String(value));
                });
                return params;
            };

            const osmRequestOptions = {
                method: 'GET',
                headers: {
                    Accept: 'application/json',
                    'Accept-Language': 'en-IN,en;q=0.9,hi;q=0.8'
                }
            };

            const cloudParams = new URLSearchParams({
                latitude: String(lat),
                longitude: String(lng),
                localityLanguage: 'en'
            });

            const osmData = await fetchBookingJsonWithTimeout(
                `https://nominatim.openstreetmap.org/reverse?${buildOsmParams().toString()}`,
                osmRequestOptions,
                1800
            );
            const osmAddress = normalizeBookingAddressCandidate(osmData?.display_name);
            const osmStructured = normalizeBookingAddressCandidate(buildBookingReverseAddress(osmData?.address || {}));
            const primaryAddress = pickBestBookingAddressCandidate([osmStructured, osmAddress], coords);
            const primaryScore = primaryAddress ? scoreBookingAddressCandidate(primaryAddress) : Number.NEGATIVE_INFINITY;
            if (primaryAddress
                && shouldAcceptBookingReverseAddress(primaryAddress)
                && primaryScore >= BOOKING_REVERSE_GEOCODE_PRIMARY_ACCEPT_SCORE) {
                return primaryAddress;
            }

            const [osmPoiData, cloudData] = await Promise.all([
                fetchBookingJsonWithTimeout(
                    `https://nominatim.openstreetmap.org/reverse?${buildOsmParams({ layer: 'poi', zoom: '18' }).toString()}`,
                    osmRequestOptions,
                    1600
                ),
                fetchBookingJsonWithTimeout(
                    `https://api.bigdatacloud.net/data/reverse-geocode-client?${cloudParams.toString()}`,
                    {
                        method: 'GET',
                        headers: { Accept: 'application/json' }
                    },
                    1600
                )
            ]);
            const osmPoiAddress = normalizeBookingAddressCandidate(osmPoiData?.display_name);
            const osmPoiStructured = normalizeBookingAddressCandidate(buildBookingReverseAddress(osmPoiData?.address || {}));
            const cloudLabel = normalizeBookingAddressCandidate(
                cloudData?.localityInfo?.informative?.[0]?.name
                    || cloudData?.localityInfo?.administrative?.[2]?.name
                    || buildBigDataCloudAddress(cloudData || {})
            );
            const bestAddress = pickBestBookingAddressCandidate(
                [osmStructured, osmAddress, osmPoiStructured, osmPoiAddress, cloudLabel],
                coords
            );
            if (!bestAddress || !shouldAcceptBookingReverseAddress(bestAddress)) {
                return formatBookingMapCoords(coords);
            }
            return bestAddress;
        }

        function reverseGeocodeBookingCoords(coords) {
            const point = normalizeBookingMapCoords(coords);
            if (!point) return Promise.resolve('');
            const pendingKey = buildBookingReverseGeocodeCacheKey(point, BOOKING_REVERSE_GEOCODE_PRIMARY_PRECISION);
            if (!pendingKey) return Promise.resolve('');

            const cachedAddress = readBookingReverseGeocodeCache(point);
            if (cachedAddress) return Promise.resolve(cachedAddress);

            const pendingRequest = bookingGoogleMapState.reverseGeocodePending.get(pendingKey);
            if (pendingRequest) return pendingRequest;

            const request = (async () => {
                const fallbackAddress = await reverseGeocodeBookingCoordsFallback(point);
                const finalAddress = pickBestBookingAddressCandidate([fallbackAddress], point);
                if (finalAddress) {
                    writeBookingReverseGeocodeCache(point, finalAddress);
                    return finalAddress;
                }
                return formatBookingMapCoords(point);
            })()
                .finally(() => {
                    bookingGoogleMapState.reverseGeocodePending.delete(pendingKey);
                });

            bookingGoogleMapState.reverseGeocodePending.set(pendingKey, request);
            return request;
        }

        function setBookingMapMarker(target, coords) {
            if (!bookingGoogleMapState.map || !window.L) return;
            const marker = bookingGoogleMapState.markers[target];
            if (!coords) {
                if (marker?.remove) marker.remove();
                bookingGoogleMapState.markers[target] = null;
                return;
            }
            const latLng = [coords.lat, coords.lng];
            const markerClass = target === 'dropoff'
                ? 'booking-osm-marker booking-osm-marker-dropoff'
                : target === 'stop'
                    ? 'booking-osm-marker booking-osm-marker-stop'
                    : 'booking-osm-marker booking-osm-marker-pickup';
            const icon = window.L.divIcon({
                className: markerClass,
                html: '<span></span>',
                iconSize: [16, 16],
                iconAnchor: [8, 8]
            });
            if (marker?.setLatLng) {
                marker.setLatLng(latLng);
                marker.setIcon(icon);
            } else {
                bookingGoogleMapState.markers[target] = window.L.marker(latLng, {
                    icon,
                    title: target === 'dropoff' ? 'Drop location' : target === 'stop' ? 'Route stop' : 'Pickup location'
                }).addTo(bookingGoogleMapState.map);
            }
        }

        function updateBookingGoogleMapLine() {
            if (!bookingGoogleMapState.map || !window.L) return;
            const points = [
                bookingGoogleMapState.coords.pickup,
                bookingGoogleMapState.coords.stop,
                bookingGoogleMapState.coords.dropoff
            ].filter(Boolean);

            if (bookingGoogleMapState.routeLine?.remove) {
                bookingGoogleMapState.routeLine.remove();
                bookingGoogleMapState.routeLine = null;
            }
            if (points.length >= 2) {
                bookingGoogleMapState.routeLine = window.L.polyline(
                    points.map((point) => [point.lat, point.lng]),
                    {
                        color: '#1088c9',
                        opacity: 0.9,
                        weight: 4
                    }
                ).addTo(bookingGoogleMapState.map);
            }
            if (points.length) {
                const latLngPoints = points.map((point) => [point.lat, point.lng]);
                const bounds = window.L.latLngBounds(latLngPoints);
                if (points.length === 1) {
                    bookingGoogleMapState.map.setView(latLngPoints[0], 14);
                } else {
                    bookingGoogleMapState.map.fitBounds(bounds, { padding: [48, 48] });
                }
            }
        }

        function updateBookingMapFieldValue(target, value, coords = null, options = {}) {
            const cleanCoords = normalizeBookingMapCoords(coords, {
                source: options.source === 'current' ? 'browser_gps_high_accuracy' : (options.source || 'map_pin')
            });
            const cleanValue = sanitizeInput(value || '').trim() || (cleanCoords ? formatBookingMapCoords(cleanCoords) : '');
            if (!cleanValue) return;

            if (target === 'stop') {
                ensureRouteStopsReady();
                const preferredStopInput = options.stopInput?.matches?.('[data-route-stop-input]') ? options.stopInput : null;
                const stopInput = preferredStopInput || getRouteStopInputs().find((input) => !String(input.value || '').trim()) || getRouteStopInputs()[0] || addRouteStop('', false);
                if (stopInput) {
                    stopInput.value = cleanValue;
                    if (cleanCoords) {
                        setBookingExactLocationDataset(stopInput, cleanCoords, cleanValue);
                    }
                }
                handleRouteStopInputChange();
            } else {
                const inputIds = target === 'dropoff'
                    ? ['dropoff', 'cabQuickDropoffInput']
                    : ['pickup', 'cabQuickPickupInput'];
                inputIds.forEach((inputId) => {
                    const input = document.getElementById(inputId);
                    if (!input) return;
                    input.value = cleanValue;
                    if (cleanCoords) {
                        setBookingExactLocationDataset(input, cleanCoords, cleanValue);
                    }
                });
                handleLocationUpdated();
                updateBookingExperience();
            }

            if (cleanCoords) {
                bookingGoogleMapState.coords[target] = cleanCoords;
                setBookingMapMarker(target, cleanCoords);
                updateBookingGoogleMapLine();
                saveBookingExactLocationSnapshot();
            }
            updateBookingGoogleMapRouteLink();
        }

        async function applyBookingMapCoordinates(target, coords, options = {}) {
            const safeTarget = ['pickup', 'dropoff', 'stop'].includes(target) ? target : 'pickup';
            const cleanCoords = normalizeBookingMapCoords(coords, {
                source: options.source === 'current' ? 'browser_gps_high_accuracy' : (options.source || 'map_pin')
            });
            if (!cleanCoords) {
                showBookingLocationNotice('Location coordinates were not valid. Please try again.', 'error');
                return;
            }
            setBookingMapActiveTarget(safeTarget);
            const targetLabel = safeTarget === 'dropoff' ? 'Drop' : safeTarget === 'stop' ? 'Stop' : 'Pickup';
            const accuracy = formatBookingMapAccuracy(cleanCoords);
            const isWeak = Number(cleanCoords.accuracy || 0) > BOOKING_GPS_WEAK_ACCURACY_METERS;
            const sourceLabel = options.source === 'map' ? 'map pin' : 'exact GPS';
            const actionLabel = options.background === true ? 'refined' : 'updated';
            const weakHint = isWeak
                ? ' Signal weak hai; open area me retry karein aur browser me Precise location permission ON rakhein.'
                : '';
            const shouldFastFill = options.source === 'current' && options.background !== true;
            const preferCoordinatesFirst = shouldFastFill && options.preferCoordinatesFirst !== false;
            const cachedAddress = shouldFastFill && !preferCoordinatesFirst ? readBookingReverseGeocodeCache(cleanCoords) : '';

            if (shouldFastFill) {
                updateBookingMapFieldValue(
                    safeTarget,
                    cachedAddress || formatBookingMapCoords(cleanCoords),
                    cleanCoords,
                    options
                );
                if (!cachedAddress) {
                    setBookingMapStatus(
                        `${targetLabel} GPS lock ho gaya${accuracy ? ` (${accuracy})` : ''}. Exact address load ho raha hai...`,
                        isWeak ? 'warning' : 'info'
                    );
                }
            }

            if (shouldFastFill && !cachedAddress) {
                reverseGeocodeBookingCoords(cleanCoords)
                    .then((resolvedAddress) => {
                        const address = sanitizeInput(resolvedAddress || '', 220).trim();
                        if (!address || !shouldAcceptBookingReverseAddress(address)) return;
                        const currentPoint = getBookingMapCoordsForTarget(safeTarget);
                        const stillRelevant = pointsAreNearEnoughForRefinement(cleanCoords, currentPoint);
                        if (!stillRelevant) return;
                        updateBookingMapFieldValue(safeTarget, address, cleanCoords, options);
                    })
                    .catch(() => null);
            } else {
                const address = sanitizeInput(
                    cachedAddress || await reverseGeocodeBookingCoords(cleanCoords) || '',
                    220
                ).trim();

                if (address) {
                    const currentPoint = getBookingMapCoordsForTarget(safeTarget);
                    const stillRelevant = options.background === true || pointsAreNearEnoughForRefinement(cleanCoords, currentPoint);
                    if (stillRelevant) {
                        updateBookingMapFieldValue(safeTarget, address, cleanCoords, options);
                    }
                } else if (!shouldFastFill) {
                    updateBookingMapFieldValue(safeTarget, formatBookingMapCoords(cleanCoords), cleanCoords, options);
                }
            }

            setBookingMapStatus(
                `${targetLabel} location ${actionLabel} from ${sourceLabel}${accuracy ? ` (${accuracy})` : ''}.${weakHint}`,
                isWeak ? 'warning' : 'info'
            );
        }

        function buildBookingOsmGeocodeCacheKey(value) {
            return normalizeAirportSearchText(value || '').slice(0, 180);
        }

        function readBookingOsmGeocodeCache(value) {
            const key = buildBookingOsmGeocodeCacheKey(value);
            if (!key) return null;
            const cached = bookingGoogleMapState.osmGeocodeCache.get(key) || null;
            if (!cached) return null;
            bookingGoogleMapState.osmGeocodeCache.delete(key);
            bookingGoogleMapState.osmGeocodeCache.set(key, cached);
            return cached;
        }

        function writeBookingOsmGeocodeCache(value, coords) {
            const key = buildBookingOsmGeocodeCacheKey(value);
            if (!key) return;
            const point = normalizeBookingMapCoords(coords);
            if (!point) return;
            bookingGoogleMapState.osmGeocodeCache.delete(key);
            bookingGoogleMapState.osmGeocodeCache.set(key, point);
            while (bookingGoogleMapState.osmGeocodeCache.size > BOOKING_OSM_GEOCODE_CACHE_MAX_ENTRIES) {
                const oldestKey = bookingGoogleMapState.osmGeocodeCache.keys().next().value;
                if (!oldestKey) break;
                bookingGoogleMapState.osmGeocodeCache.delete(oldestKey);
            }
        }

        function geocodeBookingMapInput(target, value) {
            if (!bookingGoogleMapState.geocoder || !value) return;
            const query = sanitizeInput(value || '', 220).trim();
            if (query.length < 3) return;

            const cachedCoords = readBookingOsmGeocodeCache(query);
            if (cachedCoords) {
                bookingGoogleMapState.coords[target] = cachedCoords;
                setBookingMapMarker(target, cachedCoords);
                updateBookingGoogleMapLine();
                return;
            }

            const pendingKey = buildBookingOsmGeocodeCacheKey(query);
            if (!pendingKey) return;
            const pendingRequest = bookingGoogleMapState.osmGeocodePending.get(pendingKey);
            if (pendingRequest) return;

            const request = queueBookingOsmGeocodeTask(async () => {
                const params = new URLSearchParams({
                    q: query,
                    format: 'jsonv2',
                    addressdetails: '1',
                    limit: '1',
                    countrycodes: 'in'
                });
                const response = await fetchBookingJsonWithTimeout(
                    `${BOOKING_OSM_GEOCODE_ENDPOINT}?${params.toString()}`,
                    {
                        method: 'GET',
                        headers: { Accept: 'application/json' }
                    },
                    2600
                );
                return Array.isArray(response) ? response[0] : null;
            })
                .then((result) => {
                    const coords = normalizeBookingMapCoords({
                        lat: result?.lat,
                        lng: result?.lon,
                        source: 'osm_geocode'
                    });
                    if (!coords) return null;
                    writeBookingOsmGeocodeCache(query, coords);
                    return coords;
                })
                .finally(() => {
                    bookingGoogleMapState.osmGeocodePending.delete(pendingKey);
                });

            bookingGoogleMapState.osmGeocodePending.set(pendingKey, request);
            request.then((coords) => {
                if (!coords) return;
                const latestValue = getBookingMapInputValue(target);
                if (normalizeAirportSearchText(latestValue) !== normalizeAirportSearchText(query)) return;
                bookingGoogleMapState.coords[target] = coords;
                setBookingMapMarker(target, coords);
                updateBookingGoogleMapLine();
            }).catch(() => null);
        }

        function syncBookingMapFromInputs() {
            updateBookingGoogleMapRouteLink();
            if (!bookingGoogleMapState.geocoder) return;
            geocodeBookingMapInput('pickup', getBookingMapInputValue('pickup'));
            geocodeBookingMapInput('dropoff', getBookingMapInputValue('dropoff'));
            geocodeBookingMapInput('stop', getBookingMapInputValue('stop'));
        }

        function queueBookingMapSync() {
            window.clearTimeout(bookingGoogleMapState.inputTimer);
            bookingGoogleMapState.inputTimer = window.setTimeout(syncBookingMapFromInputs, 450);
        }

        function setBookingCurrentButtonBusy(button, isBusy) {
            if (!button) return;
            button.classList.toggle('is-locating', Boolean(isBusy));
            button.disabled = Boolean(isBusy);
        }

        function showBookingLocationNotice(message, type = 'info') {
            if (typeof showToast === 'function') {
                showToast(message, type, 3500, type === 'error' ? 'Location' : 'Current location');
            }
        }

        function normalizeBookingGeoPosition(position) {
            const coords = position?.coords || {};
            return normalizeBookingMapCoords({
                lat: coords.latitude,
                lng: coords.longitude,
                accuracy: coords.accuracy,
                altitudeAccuracy: coords.altitudeAccuracy,
                source: 'browser_gps_high_accuracy',
                timestamp: position?.timestamp
            });
        }

        function isBetterBookingGeoPoint(candidate, currentBest) {
            if (!candidate) return false;
            if (!currentBest) return true;
            const nextAccuracy = Number.isFinite(Number(candidate.accuracy)) ? Number(candidate.accuracy) : Number.POSITIVE_INFINITY;
            const bestAccuracy = Number.isFinite(Number(currentBest.accuracy)) ? Number(currentBest.accuracy) : Number.POSITIVE_INFINITY;
            if (nextAccuracy + 3 < bestAccuracy) return true;
            const nextTime = Date.parse(candidate.capturedAt || '');
            const bestTime = Date.parse(currentBest.capturedAt || '');
            return Number.isFinite(nextTime)
                && Number.isFinite(bestTime)
                && nextTime > bestTime + 2500
                && nextAccuracy <= bestAccuracy + 10;
        }

        function getBookingCurrentPositionOnce(timeoutMs = BOOKING_GPS_FIRST_FIX_TIMEOUT_MS) {
            return new Promise((resolve, reject) => {
                navigator.geolocation.getCurrentPosition((position) => {
                    const point = normalizeBookingGeoPosition(position);
                    if (point) resolve(point);
                    else reject(new Error('invalid_position'));
                }, reject, {
                    enableHighAccuracy: true,
                    maximumAge: 0,
                    timeout: timeoutMs
                });
            });
        }

        function getBookingCurrentPositionQuick(timeoutMs = BOOKING_GPS_QUICK_FIX_TIMEOUT_MS, maxAcceptedAccuracy = BOOKING_GPS_QUICK_ACCEPT_ACCURACY_METERS) {
            return new Promise((resolve, reject) => {
                navigator.geolocation.getCurrentPosition((position) => {
                    const point = normalizeBookingGeoPosition(position);
                    if (!point) {
                        reject(new Error('invalid_position'));
                        return;
                    }
                    const accuracy = Number(point.accuracy ?? Number.POSITIVE_INFINITY);
                    if (Number.isFinite(Number(maxAcceptedAccuracy))
                        && (!Number.isFinite(accuracy) || accuracy > Number(maxAcceptedAccuracy))) {
                        reject(new Error('quick_accuracy_too_low'));
                        return;
                    }
                    resolve(point);
                }, reject, {
                    enableHighAccuracy: false,
                    maximumAge: BOOKING_GPS_QUICK_MAX_AGE_MS,
                    timeout: timeoutMs
                });
            });
        }

        function getBookingCurrentPositionInstant(timeoutMs = BOOKING_GPS_INSTANT_FIX_TIMEOUT_MS) {
            return new Promise((resolve, reject) => {
                navigator.geolocation.getCurrentPosition((position) => {
                    const point = normalizeBookingGeoPosition(position);
                    if (!point) {
                        reject(new Error('invalid_position'));
                        return;
                    }
                    resolve(point);
                }, reject, {
                    enableHighAccuracy: false,
                    maximumAge: BOOKING_GPS_INSTANT_MAX_AGE_MS,
                    timeout: timeoutMs
                });
            });
        }

        function refineBookingCurrentPosition(initialPoint, onBetterPoint = null) {
            if (!navigator.geolocation?.watchPosition) {
                return Promise.resolve(initialPoint);
            }
            return new Promise((resolve) => {
                let bestPoint = initialPoint;
                let settled = false;
                let watchId = null;
                const finish = () => {
                    if (settled) return;
                    settled = true;
                    if (watchId !== null) {
                        try {
                            navigator.geolocation.clearWatch(watchId);
                        } catch (error) {
                            // Ignore clearWatch issues; bestPoint is already captured.
                        }
                    }
                    window.clearTimeout(timer);
                    resolve(bestPoint);
                };
                const timer = window.setTimeout(finish, BOOKING_GPS_REFINE_WINDOW_MS);
                try {
                    watchId = navigator.geolocation.watchPosition((position) => {
                        const nextPoint = normalizeBookingGeoPosition(position);
                        if (isBetterBookingGeoPoint(nextPoint, bestPoint)) {
                            bestPoint = nextPoint;
                            if (typeof onBetterPoint === 'function') onBetterPoint(bestPoint);
                        }
                        if (Number(bestPoint?.accuracy ?? Number.POSITIVE_INFINITY) <= BOOKING_GPS_TARGET_ACCURACY_METERS) {
                            finish();
                        }
                    }, () => {
                        finish();
                    }, {
                        enableHighAccuracy: true,
                        maximumAge: 0,
                        timeout: BOOKING_GPS_REFINE_WINDOW_MS
                    });
                } catch (error) {
                    finish();
                }
            });
        }

        async function getBestBookingCurrentLocation() {
            let quickPoint = null;
            try {
                quickPoint = await getBookingCurrentPositionQuick();
                if (Number(quickPoint?.accuracy ?? Number.POSITIVE_INFINITY) <= BOOKING_GPS_TARGET_ACCURACY_METERS) {
                    return quickPoint;
                }
            } catch (_error) {
                quickPoint = null;
            }
            const precisePoint = await getBookingCurrentPositionOnce();
            if (!quickPoint) return precisePoint;
            return isBetterBookingGeoPoint(precisePoint, quickPoint) ? precisePoint : quickPoint;
        }

        function pointsAreNearEnoughForRefinement(basePoint, nextPoint) {
            return getBookingDistanceMeters(basePoint, nextPoint) <= BOOKING_GPS_REFINE_MAX_DRIFT_METERS;
        }

        function isBookingWarmCurrentLocationUsable(point) {
            const normalized = normalizeBookingMapCoords(point);
            if (!normalized) return false;
            const accuracy = Number(normalized.accuracy ?? Number.POSITIVE_INFINITY);
            if (!Number.isFinite(accuracy) || accuracy > BOOKING_GPS_TARGET_ACCURACY_METERS) return false;
            const capturedAt = Date.parse(normalized.capturedAt || '');
            if (!Number.isFinite(capturedAt)) return false;
            return (Date.now() - capturedAt) <= BOOKING_GPS_WARM_CACHE_MAX_AGE_MS;
        }

        async function warmBookingCurrentLocationCache() {
            if (!navigator.geolocation?.getCurrentPosition) return;
            if (bookingGoogleMapState.warmCurrentLocationPromise) return;
            bookingGoogleMapState.warmCurrentLocationPromise = (async () => {
                try {
                    if (navigator.permissions?.query) {
                        const permission = await navigator.permissions.query({ name: 'geolocation' });
                        const state = sanitizeInput(permission?.state || '', 20).toLowerCase();
                        if (state !== 'granted') return;
                    }
                } catch (_error) {
                    // Some browsers block permissions query; continue with non-blocking warm-up attempt.
                }
                try {
                    let bestPoint = null;
                    try {
                        bestPoint = await getBookingCurrentPositionQuick(1800);
                    } catch (_quickError) {
                        bestPoint = null;
                    }
                    const precisePoint = await getBookingCurrentPositionOnce().catch(() => null);
                    if (isBetterBookingGeoPoint(precisePoint, bestPoint)) {
                        bestPoint = precisePoint;
                    }
                    if (!bestPoint) return;
                    bookingGoogleMapState.warmCurrentLocation = bestPoint;
                    await reverseGeocodeBookingCoords(bestPoint).catch(() => '');
                } catch (_error) {
                    // Warm-up is best effort only.
                }
            })().finally(() => {
                bookingGoogleMapState.warmCurrentLocationPromise = null;
            });
        }

        function canApplyBookingBackgroundRefinement(target, basePoint) {
            const currentPoint = getBookingMapCoordsForTarget(target);
            if (!currentPoint) return true;
            if (pointsAreNearEnoughForRefinement(basePoint, currentPoint)) return true;
            return isBetterBookingGeoPoint(basePoint, currentPoint);
        }

        function startBookingCurrentLocationRefinement(target, initialPoint, options = {}) {
            if (!navigator.geolocation?.watchPosition) return;
            if (Number(initialPoint?.accuracy ?? Number.POSITIVE_INFINITY) <= BOOKING_GPS_TARGET_ACCURACY_METERS) return;

            const safeTarget = ['pickup', 'dropoff', 'stop'].includes(target) ? target : 'pickup';
            let lastAppliedPoint = initialPoint;
            refineBookingCurrentPosition(initialPoint, (betterPoint) => {
                if (!isBetterBookingGeoPoint(betterPoint, lastAppliedPoint)) return;
                if (!canApplyBookingBackgroundRefinement(safeTarget, betterPoint)) return;
                lastAppliedPoint = betterPoint;
                applyBookingMapCoordinates(safeTarget, betterPoint, {
                    source: 'current',
                    preferCoordinatesFirst: true,
                    stopInput: options.stopInput || null,
                    background: true
                }).catch(() => null);
            }).then((bestPoint) => {
                if (!isBetterBookingGeoPoint(bestPoint, lastAppliedPoint)) return;
                if (!canApplyBookingBackgroundRefinement(safeTarget, bestPoint)) return;
                applyBookingMapCoordinates(safeTarget, bestPoint, {
                    source: 'current',
                    preferCoordinatesFirst: true,
                    stopInput: options.stopInput || null,
                    background: true
                }).catch(() => null);
            });
        }

        async function requestBookingCurrentLocation(target = 'pickup', options = {}) {
            const safeTarget = ['pickup', 'dropoff', 'stop'].includes(target) ? target : 'pickup';
            const sourceButton = options.sourceButton || null;
            let busyReleased = false;
            const releaseBusy = () => {
                if (busyReleased) return;
                busyReleased = true;
                setBookingCurrentButtonBusy(sourceButton, false);
            };
            setBookingMapActiveTarget(safeTarget);
            if (!navigator.geolocation) {
                showBookingLocationNotice('Current location is not supported in this browser. Type the address manually.', 'error');
                return;
            }
            setBookingCurrentButtonBusy(sourceButton, true);
            setBookingMapStatus('Getting GPS location...', 'info');
            const warmedPoint = isBookingWarmCurrentLocationUsable(bookingGoogleMapState.warmCurrentLocation)
                ? normalizeBookingMapCoords(bookingGoogleMapState.warmCurrentLocation)
                : null;
            if (warmedPoint) {
                updateBookingMapFieldValue(
                    safeTarget,
                    formatBookingMapCoords(warmedPoint),
                    warmedPoint,
                    {
                        source: 'current',
                        preferCoordinatesFirst: true,
                        stopInput: options.stopInput || null
                    }
                );
                releaseBusy();
                const warmAccuracy = formatBookingMapAccuracy(warmedPoint);
                setBookingMapStatus(
                    `Using recent GPS lock${warmAccuracy ? ` (${warmAccuracy})` : ''}. Fresh precise point verify ho raha hai...`,
                    'info'
                );
            }
            try {
                const mapReadyPromise = ensureBookingGoogleMapReady().catch(() => false);
                let lastAppliedPoint = warmedPoint;

                if (!warmedPoint) {
                    const instantPoint = await getBookingCurrentPositionInstant().catch(() => null);
                    if (instantPoint) {
                        await applyBookingMapCoordinates(safeTarget, instantPoint, {
                            source: 'current',
                            preferCoordinatesFirst: true,
                            stopInput: options.stopInput || null
                        });
                        lastAppliedPoint = instantPoint;
                        releaseBusy();
                    }
                }

                const coords = await getBestBookingCurrentLocation();
                const shouldReplaceWarmPoint = !lastAppliedPoint
                    || isBetterBookingGeoPoint(coords, lastAppliedPoint)
                    || getBookingDistanceMeters(coords, lastAppliedPoint) > 20;
                if (shouldReplaceWarmPoint) {
                    await applyBookingMapCoordinates(safeTarget, coords, {
                        source: 'current',
                        preferCoordinatesFirst: true,
                        stopInput: options.stopInput || null
                    });
                    lastAppliedPoint = coords;
                    releaseBusy();
                }
                bookingGoogleMapState.warmCurrentLocation = coords;
                reverseGeocodeBookingCoords(coords).catch(() => '');
                mapReadyPromise.then(() => {
                    const latestPoint = getBookingMapCoordsForTarget(safeTarget)
                        || normalizeBookingMapCoords(lastAppliedPoint || coords);
                    if (!latestPoint) return;
                    bookingGoogleMapState.coords[safeTarget] = latestPoint;
                    setBookingMapMarker(safeTarget, latestPoint);
                    updateBookingGoogleMapLine();
                });
                startBookingCurrentLocationRefinement(safeTarget, coords, {
                    stopInput: options.stopInput || null
                });
            } catch (error) {
                releaseBusy();
                showBookingLocationNotice('Please allow location permission, then tap the location arrow again.', 'error');
                setBookingMapStatus('Location permission needed. Please allow precise location and try again.', 'error');
                return;
            }
            releaseBusy();
        }

        function initGoogleMapBookingUI() {
            if (!document.querySelector('[data-map-current-target]')) return;
            if (document.body.dataset.bookingGoogleMapDelegated !== '1') {
                document.addEventListener('click', (event) => {
                    const currentButton = event.target.closest('[data-map-current-target]');
                    if (currentButton) {
                        event.preventDefault();
                        event.stopPropagation();
                        const stopInput = currentButton.closest('[data-route-stop-row]')?.querySelector('[data-route-stop-input]') || null;
                        requestBookingCurrentLocation(currentButton.dataset.mapCurrentTarget || 'pickup', {
                            sourceButton: currentButton,
                            stopInput
                        });
                        return;
                    }
                    const targetButton = event.target.closest('[data-map-target]');
                    if (targetButton) {
                        event.preventDefault();
                        setBookingMapActiveTarget(targetButton.dataset.mapTarget || 'pickup');
                    }
                });
                document.addEventListener('input', (event) => {
                    if (event.target.matches('#pickup, #dropoff, #cabQuickPickupInput, #cabQuickDropoffInput, [data-route-stop-input]')) {
                        clearBookingMapCoordinatesForInput(event.target);
                        queueBookingMapSync();
                    }
                });
                document.addEventListener('change', (event) => {
                    if (event.target.matches('#pickup, #dropoff, #cabQuickPickupInput, #cabQuickDropoffInput, [data-route-stop-input]')) {
                        clearBookingMapCoordinatesForInput(event.target);
                        queueBookingMapSync();
                    }
                });
                document.body.dataset.bookingGoogleMapDelegated = '1';
            }
            window.GoIndiaRideBookingMap = {
                init: initGoogleMapBookingUI,
                getLocationPins: buildBookingLocationSnapshot,
                refresh: syncBookingMapFromInputs,
                requestCurrentLocation: requestBookingCurrentLocation,
                setTarget: setBookingMapActiveTarget
            };
            setBookingMapActiveTarget(bookingGoogleMapState.activeTarget);
            ensureBookingGoogleMapReady();
            updateBookingGoogleMapRouteLink();
            warmBookingCurrentLocationCache();
        }

        function resolveBookingLocationInputValue(input, options = {}) {
            if (!input) return true;

            if (getActiveCabFlow() === 'airport' && getAirportFieldRole(input.id) === 'airport') {
                return resolveAirportInputValue(input, options);
            }

            const rawValue = sanitizeInput(input.value || '').trim();
            if (rawValue.length < 2) return rawValue.length >= 3;

            const exactPoint = getBookingMapDatasetCoords(input);
            if (exactPoint) {
                const exactAddress = sanitizeInput(input.dataset?.googleMapAddress || '', 220).trim();
                if (exactAddress && normalizeAirportSearchText(exactAddress) !== normalizeAirportSearchText(rawValue)) {
                    input.value = exactAddress;
                    syncAirportPairedInput(input.id, exactAddress);
                    updateBookingExperience();
                }
                return true;
            }

            const visibleSuggestion = options.useVisibleSuggestion === false
                ? ''
                : getAutocompleteDisplayTextFromBox(input);
            const resolvedValue = visibleSuggestion || getResolvableGenericLocation(rawValue);
            if (!resolvedValue || normalizeAirportSearchText(resolvedValue) === normalizeAirportSearchText(rawValue)) {
                return true;
            }

            input.value = resolvedValue;
            syncAirportPairedInput(input.id, resolvedValue);
            closeAllBookingAutocompleteBoxes();
            updateBookingExperience();
            return true;
        }

        function showQuickLocationSuggestions(input, event) {
            if (!input || !input.closest('#cabBookingConsole')) return false;
            if (input.id !== 'cabQuickPickupInput' && input.id !== 'cabQuickDropoffInput') return false;
            if (event?.isComposing) return false;

            if (input.__cabAutoResolveTimer) {
                window.clearTimeout(input.__cabAutoResolveTimer);
                input.__cabAutoResolveTimer = null;
            }
            delete input.dataset.cabAutoResolvedSource;
            delete input.dataset.cabAutoResolvedValue;

            const sourceValue = String(input.value || '');
            const inputType = String(event?.inputType || '').toLowerCase();
            if (inputType.startsWith('delete') && sourceValue.trim().length < 2) {
                closeAllBookingAutocompleteBoxes();
                return true;
            }

            window.setTimeout(() => {
                if (String(input.value || '') !== sourceValue) return;
                if (getActiveCabFlow() === 'airport' && getAirportFieldRole(input.id) === 'airport') {
                    showAirportAutocomplete(input);
                } else {
                    const suggestionsBox = getBookingAutocompleteBox(input);
                    if (suggestionsBox?.style.display === 'block' && suggestionsBox.querySelector('.autocomplete-item')) {
                        positionBookingAutocompleteBox(input, suggestionsBox);
                        return;
                    }
                    showQuickGenericAutocomplete(input);
                }
            }, 0);
            return true;
        }
