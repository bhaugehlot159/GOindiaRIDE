/* ======================================
   LIVE DISTANCE ESTIMATOR
   - Uses OpenStreetMap geocoding when available
   - Falls back to known route table distance
   ====================================== */

(function initLocationDistanceEstimator(global) {
    const GEOCODE_CACHE_KEY = 'goindiaride_geocode_cache_v2';
    const LIVE_ROUTE_ENDPOINT = 'https://router.project-osrm.org/route/v1/driving';
    const LIVE_ROUTE_TIMEOUT_MS = 6000;
    const geocodeCache = loadCache();
    const INDIA_STATE_NAMES = [
        'Andaman & Nicobar Island',
        'Andhra Pradesh',
        'Arunachal Pradesh',
        'Assam',
        'Bihar',
        'Chandigarh',
        'Chhattisgarh',
        'Delhi',
        'Goa',
        'Gujarat',
        'Haryana',
        'Himachal Pradesh',
        'Jammu & Kashmir',
        'Jharkhand',
        'Karnataka',
        'Kerala',
        'Ladakh',
        'Lakshadweep',
        'Madhya Pradesh',
        'Maharashtra',
        'Manipur',
        'Meghalaya',
        'Mizoram',
        'Nagaland',
        'Odisha',
        'Puducherry',
        'Punjab',
        'Rajasthan',
        'Sikkim',
        'Tamil Nadu',
        'Telangana',
        'Tripura',
        'UT of DNH and DD',
        'Uttarakhand',
        'Uttar Pradesh',
        'West Bengal'
    ];
    const STATE_NORMALIZATION_ALIASES = {
        andamanandnicobarislands: 'Andaman & Nicobar Island',
        andamanandnicobarisland: 'Andaman & Nicobar Island',
        dadraandnagarhavelianddamananddiu: 'UT of DNH and DD',
        dadraandnagarhaveli: 'UT of DNH and DD',
        damananddiu: 'UT of DNH and DD',
        jammuandkashmir: 'Jammu & Kashmir',
        nctdelhi: 'Delhi',
        nationalcapitalterritoryofdelhi: 'Delhi',
        orissa: 'Odisha'
    };

    function loadCache() {
        try {
            const raw = localStorage.getItem(GEOCODE_CACHE_KEY);
            const parsed = raw ? JSON.parse(raw) : {};
            return parsed && typeof parsed === 'object' ? parsed : {};
        } catch (error) {
            return {};
        }
    }

    function saveCache() {
        try {
            localStorage.setItem(GEOCODE_CACHE_KEY, JSON.stringify(geocodeCache));
        } catch (error) {
            // Ignore cache write failures.
        }
    }

    function normalizeQuery(value) {
        return String(value || '')
            .replace(/\s+/g, ' ')
            .trim();
    }

    function buildSearchQuery(value) {
        const cleaned = normalizeQuery(value);
        if (!cleaned) return '';
        if (/india/i.test(cleaned)) return cleaned;
        return `${cleaned}, India`;
    }

    function normalizeLookupKey(value) {
        return String(value || '')
            .toLowerCase()
            .replace(/[^a-z0-9]/g, '');
    }

    function normalizeIndiaStateName(value) {
        const clean = normalizeQuery(value);
        if (!clean) return '';
        const key = normalizeLookupKey(clean);
        if (!key) return '';
        if (STATE_NORMALIZATION_ALIASES[key]) return STATE_NORMALIZATION_ALIASES[key];
        return INDIA_STATE_NAMES.find((stateName) => normalizeLookupKey(stateName) === key) || clean;
    }

    function pickGeocodeState(address = {}) {
        if (!address || typeof address !== 'object') return '';
        return normalizeIndiaStateName(
            address.state ||
            address.region ||
            address.state_district ||
            address.county ||
            address.territory ||
            ''
        );
    }

    function uniqueStates(...states) {
        const seen = new Set();
        return states
            .map(normalizeIndiaStateName)
            .filter((stateName) => {
                const key = normalizeLookupKey(stateName);
                if (!key || seen.has(key)) return false;
                seen.add(key);
                return true;
            });
    }

    function parseCoordinatePoint(value) {
        if (!value) return null;
        if (Array.isArray(value) && value.length >= 2) {
            const lat = Number(value[0]);
            const lon = Number(value[1]);
            return Number.isFinite(lat) && Number.isFinite(lon) && Math.abs(lat) <= 90 && Math.abs(lon) <= 180
                ? { lat, lon, source: 'browser_coordinate' }
                : null;
        }
        if (typeof value === 'object') {
            const lat = Number(value.lat ?? value.latitude);
            const lon = Number(value.lon ?? value.lng ?? value.longitude);
            return Number.isFinite(lat) && Number.isFinite(lon) && Math.abs(lat) <= 90 && Math.abs(lon) <= 180
                ? { lat, lon, source: value.source || 'browser_coordinate' }
                : null;
        }
        const text = normalizeQuery(value);
        const match = text.match(/(-?\d{1,2}(?:\.\d+)?)\s*,\s*(-?\d{1,3}(?:\.\d+)?)/);
        if (!match) return null;
        const lat = Number(match[1]);
        const lon = Number(match[2]);
        if (!Number.isFinite(lat) || !Number.isFinite(lon) || Math.abs(lat) > 90 || Math.abs(lon) > 180) return null;
        return { lat, lon, source: 'browser_coordinate' };
    }

    function hasFetchSupport() {
        return typeof fetch === 'function';
    }

    async function fetchJsonWithTimeout(url, options = {}, timeoutMs = LIVE_ROUTE_TIMEOUT_MS) {
        if (!hasFetchSupport()) return null;
        const controller = typeof AbortController !== 'undefined' ? new AbortController() : null;
        const timer = controller ? setTimeout(() => controller.abort(), timeoutMs) : null;
        try {
            const response = await fetch(url, {
                ...options,
                signal: controller ? controller.signal : options.signal
            });
            if (!response.ok) return null;
            return await response.json();
        } catch (error) {
            return null;
        } finally {
            if (timer) clearTimeout(timer);
        }
    }

    const STATIC_LOCATION_COORDINATES = {
        Jaipur: { lat: 26.9124, lon: 75.7873 },
        Jodhpur: { lat: 26.2389, lon: 73.0243 },
        Udaipur: { lat: 24.5854, lon: 73.7125 },
        'Udaipur Airport': { lat: 24.6177, lon: 73.8961 },
        'Maharana Pratap Airport': { lat: 24.6177, lon: 73.8961 },
        'Udaipur Railway Station': { lat: 24.5681, lon: 73.7089 },
        Ajmer: { lat: 26.4499, lon: 74.6399 },
        Kota: { lat: 25.2138, lon: 75.8648 },
        Bikaner: { lat: 28.0229, lon: 73.3119 },
        Jaisalmer: { lat: 26.9157, lon: 70.9083 },
        'Jaisalmer Railway Station': { lat: 26.9150, lon: 70.9147 },
        'Jaipur Airport': { lat: 26.8242, lon: 75.8122 },
        'Delhi Airport': { lat: 28.5562, lon: 77.1000 },
        'Ahmedabad Airport': { lat: 23.0734, lon: 72.6266 },
        'Mumbai Airport': { lat: 19.0896, lon: 72.8656 },
        'Agra Taj Mahal': { lat: 27.1751, lon: 78.0421 },
        Alwar: { lat: 27.5530, lon: 76.6346 },
        Bharatpur: { lat: 27.2173, lon: 77.4900 },
        Bhilwara: { lat: 25.3471, lon: 74.6408 },
        Chittorgarh: { lat: 24.8887, lon: 74.6269 },
        Churu: { lat: 28.2921, lon: 74.9672 },
        Dausa: { lat: 26.8930, lon: 76.3330 },
        Dholpur: { lat: 26.7020, lon: 77.8934 },
        Dungarpur: { lat: 23.8430, lon: 73.7147 },
        Hanumangarh: { lat: 29.5818, lon: 74.3294 },
        Jalore: { lat: 25.3450, lon: 72.6150 },
        Jhalawar: { lat: 24.5963, lon: 76.1630 },
        Jhunjhunu: { lat: 28.1289, lon: 75.3991 },
        Karauli: { lat: 26.4924, lon: 77.0276 },
        Nagaur: { lat: 27.2020, lon: 73.7330 },
        Pali: { lat: 25.7711, lon: 73.3234 },
        Pratapgarh: { lat: 23.8604, lon: 74.6273 },
        Rajsamand: { lat: 25.0713, lon: 73.8798 },
        'Sawai Madhopur': { lat: 26.0173, lon: 76.3569 },
        Sikar: { lat: 27.6094, lon: 75.1399 },
        Khatoo: { lat: 27.363954, lon: 75.402557 },
        Khatu: { lat: 27.363954, lon: 75.402557 },
        'Khatu Shyam Ji Temple': { lat: 27.363954, lon: 75.402557 },
        Sirohi: { lat: 24.8823, lon: 72.8577 },
        'Sri Ganganagar': { lat: 29.9038, lon: 73.8772 },
        Tonk: { lat: 26.1660, lon: 75.7880 },
        Banswara: { lat: 23.5410, lon: 74.4420 },
        Baran: { lat: 25.1015, lon: 76.5130 },
        Barmer: { lat: 25.7447, lon: 71.3921 },
        Bundi: { lat: 25.4410, lon: 75.6370 },
        Deeg: { lat: 27.4720, lon: 77.3270 },
        Balotra: { lat: 25.8370, lon: 72.2470 },
        Beawar: { lat: 26.1013, lon: 74.3210 },
        'Didwana-Kuchaman': { lat: 27.1490, lon: 74.8540 },
        'Gangapur City': { lat: 26.4730, lon: 76.7160 },
        'Jaipur Rural': { lat: 26.9124, lon: 75.7873 },
        'Jodhpur Rural': { lat: 26.2389, lon: 73.0243 },
        Kekri: { lat: 25.9690, lon: 75.1490 },
        'Khairthal-Tijara': { lat: 27.9390, lon: 76.8450 },
        'Kotputli-Behror': { lat: 27.7060, lon: 76.2000 },
        'Neem Ka Thana': { lat: 27.7370, lon: 75.8040 },
        Phalodi: { lat: 27.1330, lon: 72.3660 },
        Salumbar: { lat: 23.9450, lon: 74.0690 },
        Sanchore: { lat: 24.7520, lon: 71.7720 },
        Shahpura: { lat: 27.3820, lon: 75.9500 },
        'Mount Abu': { lat: 24.5937, lon: 72.7156 },
        'Abu Road': { lat: 24.4800, lon: 72.7800 },
        Nathdwara: { lat: 24.9300, lon: 73.8230 },
        Kumbhalgarh: { lat: 25.1470, lon: 73.5860 },
        Ranakpur: { lat: 25.1160, lon: 73.4660 },
        Pushkar: { lat: 26.4900, lon: 74.5511 },
        Kishangarh: { lat: 26.5900, lon: 74.8530 },
        'Merta City': { lat: 26.6470, lon: 74.0320 },
        Kankroli: { lat: 25.0570, lon: 73.8820 },
        Tijara: { lat: 27.9380, lon: 76.8440 },
        Kotputli: { lat: 27.7060, lon: 76.2000 },
        Behror: { lat: 27.8830, lon: 76.2850 },
        'Kuchaman City': { lat: 27.1520, lon: 74.8560 },
        Didwana: { lat: 27.4000, lon: 74.5750 },
        'Ranthambore': { lat: 26.0173, lon: 76.3569 }
    };

    let runtimeCoordinateIndex = null;

    if (typeof global.addEventListener === 'function') {
        global.addEventListener('goindiaride:rajasthan-live-ready', () => {
            runtimeCoordinateIndex = null;
        });
    }

    function addCoordinate(index, name, rawPoint, source = 'static') {
        if (!index || !name || !rawPoint) return;
        const lat = Number(rawPoint.lat ?? rawPoint.latitude);
        const lon = Number(rawPoint.lon ?? rawPoint.lng ?? rawPoint.longitude);
        const key = normalizeLookupKey(name);
        if (!key || !Number.isFinite(lat) || !Number.isFinite(lon)) return;
        index.set(key, { lat, lon, source, name });
    }

    function buildRuntimeCoordinateIndex() {
        if (runtimeCoordinateIndex) {
            return runtimeCoordinateIndex;
        }

        const index = new Map();
        Object.entries(STATIC_LOCATION_COORDINATES).forEach(([name, point]) => {
            addCoordinate(index, name, point, 'static');
        });

        const locationsData = global.locationsData && typeof global.locationsData === 'object'
            ? global.locationsData
            : null;

        const districtSource = locationsData && locationsData.rajasthan && typeof locationsData.rajasthan === 'object'
            ? locationsData.rajasthan
            : null;

        if (districtSource) {
            Object.entries(districtSource).forEach(([districtName, districtData]) => {
                const districtKey = normalizeLookupKey(districtName);
                if (districtKey && index.has(districtKey)) {
                    return;
                }

                if (districtData && typeof districtData === 'object' && !Array.isArray(districtData)) {
                    const stack = [districtData];
                    while (stack.length) {
                        const node = stack.pop();
                        if (!node || typeof node !== 'object') continue;

                        if (Array.isArray(node.coordinates) && node.coordinates.length >= 2) {
                            const [lon, lat] = node.coordinates;
                            addCoordinate(index, districtName, { lat, lon }, 'runtime');
                        }

                        const lat = node.lat ?? node.latitude;
                        const lon = node.lon ?? node.lng ?? node.longitude;
                        if (Number.isFinite(Number(lat)) && Number.isFinite(Number(lon))) {
                            addCoordinate(index, districtName, { lat, lon }, 'runtime');
                        }

                        Object.values(node).forEach((value) => {
                            if (value && typeof value === 'object') {
                                stack.push(value);
                            }
                        });
                    }
                }
            });
        }

        const stateSource = locationsData && locationsData.states && typeof locationsData.states === 'object'
            ? locationsData.states
            : null;
        if (stateSource) {
            Object.values(stateSource).forEach((cities) => {
                if (!Array.isArray(cities)) return;
                cities.forEach((cityName) => {
                    const point = STATIC_LOCATION_COORDINATES[cityName];
                    if (point) {
                        addCoordinate(index, cityName, point, 'static');
                    }
                });
            });
        }

        runtimeCoordinateIndex = index;
        return runtimeCoordinateIndex;
    }

    function resolveCoordinate(value) {
        const normalized = normalizeLookupKey(value);
        if (!normalized) return null;

        const index = buildRuntimeCoordinateIndex();
        if (index.has(normalized)) {
            return index.get(normalized);
        }

        const keys = Array.from(index.keys()).sort((a, b) => b.length - a.length);
        for (const key of keys) {
            if (normalized.includes(key) || key.includes(normalized)) {
                return index.get(key);
            }
        }

        return null;
    }

    function isSpecificLocationText(value, staticMatch) {
        const normalized = normalizeLookupKey(value);
        const staticName = normalizeLookupKey(staticMatch && staticMatch.name);
        if (!normalized || !staticName) return false;
        return normalized !== staticName && normalized.includes(staticName);
    }

    function getRequiredGeocodeKeys(query) {
        const normalized = normalizeLookupKey(query);
        if (!normalized) return [];
        return Object.keys(STATIC_LOCATION_COORDINATES)
            .map((name) => normalizeLookupKey(name))
            .filter((key) => key.length >= 4 && normalized.includes(key))
            .sort((a, b) => b.length - a.length)
            .slice(0, 4);
    }

    function getRequiredStateHints(query) {
        const normalized = normalizeLookupKey(query);
        if (!normalized) return [];
        return INDIA_STATE_NAMES
            .map((stateName) => normalizeLookupKey(stateName))
            .filter((key) => key.length >= 4 && normalized.includes(key));
    }

    function isCompatibleGeocodeCandidate(query, candidateText) {
        const requiredKeys = getRequiredGeocodeKeys(query);
        const candidate = normalizeLookupKey(candidateText);
        if (!candidate) return false;

        const stateHints = getRequiredStateHints(query);
        if (stateHints.length && !stateHints.some((key) => candidate.includes(key))) {
            return false;
        }
        if (!requiredKeys.length) return true;

        const longestPlaceKey = requiredKeys[0];
        const contextKeys = requiredKeys.filter((key) => (
            key !== longestPlaceKey &&
            !longestPlaceKey.includes(key) &&
            !key.includes(longestPlaceKey)
        ));
        if (longestPlaceKey && candidate.includes(longestPlaceKey)) {
            return !contextKeys.length || contextKeys.some((key) => candidate.includes(key));
        }

        const matchingKeys = requiredKeys.filter((key) => candidate.includes(key));
        return matchingKeys.length >= Math.min(2, requiredKeys.length);
    }

    function estimateRoadMultiplier(straightLineKm, fromText, toText) {
        const combined = `${normalizeQuery(fromText)} ${normalizeQuery(toText)}`.toLowerCase();
        if (!Number.isFinite(straightLineKm) || straightLineKm <= 0) {
            return 1.25;
        }

        if (/airport|station|railway|bus stand|terminal/.test(combined)) {
            return straightLineKm < 25 ? 1.15 : 1.2;
        }
        if (/temple|fort|palace|museum|lake|market|tourist|dargah|garden|safari/.test(combined)) {
            return straightLineKm < 50 ? 1.2 : 1.26;
        }
        if (/rural/.test(combined)) {
            return straightLineKm < 50 ? 1.24 : 1.3;
        }
        if (straightLineKm < 20) {
            return 1.12;
        }
        if (straightLineKm < 75) {
            return 1.2;
        }
        return 1.28;
    }

    let routeSuggestionGetter = null;

    function getRouteSuggestionGetter() {
        if (typeof getRouteSuggestions === 'function') return getRouteSuggestions;
        if (routeSuggestionGetter) return routeSuggestionGetter;
        if (typeof module === 'object' && module.exports && typeof require === 'function') {
            try {
                const routeModule = require('./route-suggestions');
                if (routeModule && typeof routeModule.getRouteSuggestions === 'function') {
                    routeSuggestionGetter = routeModule.getRouteSuggestions;
                    return routeSuggestionGetter;
                }
            } catch (_error) {
                // Browser builds use the global route-suggestions script.
            }
        }
        return null;
    }

    function parseRouteDistanceKm(from, to) {
        const routeGetter = getRouteSuggestionGetter();
        if (!routeGetter) return null;
        const routeData = routeGetter(from, to);
        if (!routeData || !routeData.distance) return null;

        const match = String(routeData.distance).match(/([\d.]+)/);
        if (!match) return null;

        const km = Number(match[1]);
        return Number.isFinite(km) && km > 0 ? km : null;
    }

    async function geocodeLocation(value) {
        const query = buildSearchQuery(value);
        if (!query) return null;

        const cacheKey = query.toLowerCase();
        if (geocodeCache[cacheKey]) {
            return geocodeCache[cacheKey];
        }

        let point = null;
        try {
            point = await geocodeLocationWithNominatim(query);
        } catch (_error) {
            point = null;
        }
        if (!point) {
            try {
                point = await geocodeLocationWithPhoton(query);
            } catch (_error) {
                point = null;
            }
        }
        if (!point) return null;

        geocodeCache[cacheKey] = point;
        saveCache();
        return point;
    }

    async function geocodeLocationWithNominatim(query) {
        const url = `https://nominatim.openstreetmap.org/search?format=jsonv2&addressdetails=1&limit=5&countrycodes=in&q=${encodeURIComponent(query)}`;
        const data = await fetchJsonWithTimeout(url, {
            method: 'GET',
            headers: {
                Accept: 'application/json'
            }
        });
        if (!Array.isArray(data) || data.length === 0) {
            return null;
        }

        const item = data.find((entry) => isCompatibleGeocodeCandidate(
            query,
            [entry.display_name, entry.name, entry.type, entry.category].filter(Boolean).join(', ')
        ));
        if (!item) return null;

        const lat = Number(item.lat);
        const lon = Number(item.lon);
        if (!Number.isFinite(lat) || !Number.isFinite(lon)) {
            return null;
        }

        return {
            lat,
            lon,
            state: pickGeocodeState(item.address),
            displayName: normalizeQuery(item.display_name),
            source: 'nominatim'
        };
    }

    async function geocodeLocationWithPhoton(query) {
        const url = `https://photon.komoot.io/api/?q=${encodeURIComponent(query)}&limit=5&lang=en`;
        const data = await fetchJsonWithTimeout(url, {
            method: 'GET',
            headers: {
                Accept: 'application/json'
            }
        });
        const features = Array.isArray(data && data.features) ? data.features : [];
        const item = features.find((feature) => {
                const properties = feature.properties || {};
                const candidateText = [
                    properties.name,
                    properties.city,
                    properties.county,
                    properties.state,
                    properties.country
                ].filter(Boolean).join(', ');
                return isCompatibleGeocodeCandidate(query, candidateText);
            })
            || (!getRequiredStateHints(query).length && !getRequiredGeocodeKeys(query).length ? features[0] : null);
        const coordinates = item && item.geometry
            ? item.geometry.coordinates
            : null;
        if (!Array.isArray(coordinates) || coordinates.length < 2) return null;

        const properties = item.properties || {};
        const lon = Number(coordinates[0]);
        const lat = Number(coordinates[1]);
        if (!Number.isFinite(lat) || !Number.isFinite(lon)) return null;
        return {
            lat,
            lon,
            state: normalizeIndiaStateName(properties.state),
            displayName: [properties.name, properties.city, properties.county, properties.state, properties.country].filter(Boolean).join(', '),
            source: 'photon'
        };
    }

    function getCoordinateLon(point) {
        return Number(point && (point.lon ?? point.lng ?? point.longitude));
    }

    async function estimateLiveRouteDistanceKm(fromPoint, toPoint) {
        const fromLat = Number(fromPoint && fromPoint.lat);
        const fromLon = getCoordinateLon(fromPoint);
        const toLat = Number(toPoint && toPoint.lat);
        const toLon = getCoordinateLon(toPoint);
        if (![fromLat, fromLon, toLat, toLon].every(Number.isFinite)) return null;

        const coordinates = `${fromLon.toFixed(6)},${fromLat.toFixed(6)};${toLon.toFixed(6)},${toLat.toFixed(6)}`;
        const url = `${LIVE_ROUTE_ENDPOINT}/${coordinates}?overview=full&geometries=geojson&alternatives=false&steps=false`;
        const data = await fetchJsonWithTimeout(url, { headers: { Accept: 'application/json' } });
        const route = data && data.routes && data.routes[0];
        const meters = Number(route && route.distance);
        if (!Number.isFinite(meters) || meters <= 0) return null;
        return {
            km: Math.max(1, meters / 1000),
            durationMinutes: Math.max(0, Math.round((Number(route.duration) || 0) / 60)),
            coordinates: route && route.geometry && Array.isArray(route.geometry.coordinates)
                ? route.geometry.coordinates
                : []
        };
    }

    function liveRouteSourceName({ usedDirectCoordinate, usedStatic, usedLive }) {
        if (usedDirectCoordinate && usedLive) return 'live_route_hybrid_browser';
        if (usedDirectCoordinate) return 'live_route_browser_coordinate';
        if (usedStatic && usedLive) return 'live_route_hybrid_geo';
        if (usedStatic) return 'live_route_district_geo';
        return 'live_route_geo';
    }

    function toRad(value) {
        return (value * Math.PI) / 180;
    }

    function haversineKm(a, b) {
        const earthRadiusKm = 6371;
        const dLat = toRad(b.lat - a.lat);
        const dLon = toRad(b.lon - a.lon);
        const lat1 = toRad(a.lat);
        const lat2 = toRad(b.lat);

        const sinLat = Math.sin(dLat / 2);
        const sinLon = Math.sin(dLon / 2);
        const aa = sinLat * sinLat + Math.cos(lat1) * Math.cos(lat2) * sinLon * sinLon;
        const c = 2 * Math.atan2(Math.sqrt(aa), Math.sqrt(1 - aa));

        return earthRadiusKm * c;
    }

    async function estimateDistanceKm(from, to) {
        const fromText = normalizeQuery(from);
        const toText = normalizeQuery(to);

        if (!fromText || !toText) {
            return {
                km: 0,
                source: 'none'
            };
        }

        const directFromPoint = parseCoordinatePoint(from);
        const directToPoint = parseCoordinatePoint(to);
        if (directFromPoint && directToPoint) {
            const straightLineKm = haversineKm(directFromPoint, directToPoint);
            return {
                km: Math.max(straightLineKm * estimateRoadMultiplier(straightLineKm, fromText, toText), 1),
                source: 'browser_coordinate',
                pickupState: '',
                dropState: '',
                routeStates: []
            };
        }

        const routeKm = parseRouteDistanceKm(fromText, toText);

        const staticFrom = resolveCoordinate(fromText);
        const staticTo = resolveCoordinate(toText);
        const shouldLiveGeocodeFrom = !directFromPoint && (!staticFrom || isSpecificLocationText(fromText, staticFrom));
        const shouldLiveGeocodeTo = !directToPoint && (!staticTo || isSpecificLocationText(toText, staticTo));
        let fromPoint = directFromPoint || (!shouldLiveGeocodeFrom && staticFrom ? { lat: staticFrom.lat, lon: staticFrom.lon } : null);
        let toPoint = directToPoint || (!shouldLiveGeocodeTo && staticTo ? { lat: staticTo.lat, lon: staticTo.lon } : null);
        let usedStatic = Boolean((staticFrom && fromPoint) || (staticTo && toPoint));
        let usedDirectCoordinate = Boolean(directFromPoint || directToPoint);
        let usedLive = false;

        try {
            const [geoFrom, geoTo] = await Promise.all([
                fromPoint || !shouldLiveGeocodeFrom ? Promise.resolve(null) : geocodeLocation(fromText),
                toPoint || !shouldLiveGeocodeTo ? Promise.resolve(null) : geocodeLocation(toText)
            ]);

            if (!fromPoint && geoFrom) {
                fromPoint = geoFrom;
                usedLive = true;
            }
            if (!toPoint && geoTo) {
                toPoint = geoTo;
                usedLive = true;
            }
        } catch (error) {
            // Network/geocode failure falls through to the coordinate-based or last-resort fallback below.
        }

        if (!fromPoint && staticFrom) {
            fromPoint = { lat: staticFrom.lat, lon: staticFrom.lon };
            usedStatic = true;
        }
        if (!toPoint && staticTo) {
            toPoint = { lat: staticTo.lat, lon: staticTo.lon };
            usedStatic = true;
        }

        if (fromPoint && toPoint) {
            const liveRoute = await estimateLiveRouteDistanceKm(fromPoint, toPoint);
            const pickupState = normalizeIndiaStateName(fromPoint.state);
            const dropState = normalizeIndiaStateName(toPoint.state);
            const routeStates = uniqueStates(pickupState, dropState);
            if (liveRoute && liveRoute.km) {
                return {
                    km: liveRoute.km,
                    durationMinutes: liveRoute.durationMinutes,
                    source: liveRouteSourceName({ usedDirectCoordinate, usedStatic, usedLive }),
                    pickupState,
                    dropState,
                    routeStates
                };
            }

            if (routeKm) {
                return {
                    km: routeKm,
                    source: 'route_table',
                    pickupState,
                    dropState,
                    routeStates
                };
            }

            const straightLineKm = haversineKm(fromPoint, toPoint);
            const roadEstimateKm = Math.max(straightLineKm * estimateRoadMultiplier(straightLineKm, fromText, toText), 1);
            return {
                km: roadEstimateKm,
                source: usedDirectCoordinate
                    ? (directFromPoint && directToPoint ? 'browser_coordinate' : 'hybrid_browser_coordinate')
                    : usedStatic && usedLive
                    ? 'hybrid_geo'
                    : usedStatic
                        ? 'district_geo'
                        : 'live_geo',
                pickupState,
                dropState,
                routeStates
            };
        }

        if (routeKm) {
            return {
                km: routeKm,
                source: 'route_table',
                pickupState: '',
                dropState: '',
                routeStates: []
            };
        }

        return {
            km: 0,
            source: 'unresolved',
            pickupState: '',
            dropState: '',
            routeStates: []
        };
    }

    global.LocationDistanceEstimator = {
        estimateDistanceKm
    };
})(typeof window !== 'undefined' ? window : globalThis);
