/* ======================================
   LIVE DISTANCE ESTIMATOR
   - Uses OpenStreetMap geocoding when available
   - Falls back to known route table distance
   ====================================== */

(function initLocationDistanceEstimator(global) {
    const GEOCODE_CACHE_KEY = 'goindiaride_geocode_cache_v1';
    const geocodeCache = loadCache();

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

    const STATIC_LOCATION_COORDINATES = {
        Jaipur: { lat: 26.9124, lon: 75.7873 },
        Jodhpur: { lat: 26.2389, lon: 73.0243 },
        Udaipur: { lat: 24.5854, lon: 73.7125 },
        Ajmer: { lat: 26.4499, lon: 74.6399 },
        Kota: { lat: 25.2138, lon: 75.8648 },
        Bikaner: { lat: 28.0229, lon: 73.3119 },
        Jaisalmer: { lat: 26.9157, lon: 70.9083 },
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

    function parseRouteDistanceKm(from, to) {
        if (typeof getRouteSuggestions !== 'function') return null;
        const routeData = getRouteSuggestions(from, to);
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

        const url = `https://nominatim.openstreetmap.org/search?format=jsonv2&limit=1&countrycodes=in&q=${encodeURIComponent(query)}`;
        const response = await fetch(url, {
            method: 'GET',
            headers: {
                Accept: 'application/json'
            }
        });

        if (!response.ok) {
            throw new Error(`Geocode failed (${response.status})`);
        }

        const data = await response.json();
        if (!Array.isArray(data) || data.length === 0) {
            return null;
        }

        const lat = Number(data[0].lat);
        const lon = Number(data[0].lon);
        if (!Number.isFinite(lat) || !Number.isFinite(lon)) {
            return null;
        }

        const point = { lat, lon };
        geocodeCache[cacheKey] = point;
        saveCache();
        return point;
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

        const routeKm = parseRouteDistanceKm(fromText, toText);
        if (routeKm) {
            return {
                km: routeKm,
                source: 'route_table'
            };
        }

        const staticFrom = resolveCoordinate(fromText);
        const staticTo = resolveCoordinate(toText);
        let fromPoint = staticFrom ? { lat: staticFrom.lat, lon: staticFrom.lon } : null;
        let toPoint = staticTo ? { lat: staticTo.lat, lon: staticTo.lon } : null;
        let usedStatic = Boolean(staticFrom || staticTo);
        let usedLive = false;

        try {
            const [geoFrom, geoTo] = await Promise.all([
                fromPoint ? Promise.resolve(null) : geocodeLocation(fromText),
                toPoint ? Promise.resolve(null) : geocodeLocation(toText)
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

        if (fromPoint && toPoint) {
            const straightLineKm = haversineKm(fromPoint, toPoint);
            const roadEstimateKm = Math.max(straightLineKm * estimateRoadMultiplier(straightLineKm, fromText, toText), 1);
            return {
                km: roadEstimateKm,
                source: usedStatic && usedLive
                    ? 'hybrid_geo'
                    : usedStatic
                        ? 'district_geo'
                        : 'live_geo'
            };
        }

        if (staticFrom || staticTo) {
            const partialPoint = staticFrom || staticTo;
            const partialKm = Math.max(12, Math.round((Number(partialPoint.lat) % 10 + Number(partialPoint.lon) % 10) * 6));
            return {
                km: partialKm,
                source: 'district_geo_partial'
            };
        }

        return {
            km: 5,
            source: 'fallback'
        };
    }

    global.LocationDistanceEstimator = {
        estimateDistanceKm
    };
})(typeof window !== 'undefined' ? window : globalThis);
