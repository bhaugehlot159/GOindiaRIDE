/* ======================================
   LIVE DISTANCE ESTIMATOR
   - Uses OpenStreetMap geocoding when available
   - Falls back to known route table distance
   ====================================== */

(function initLocationDistanceEstimator() {
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

        try {
            const [fromPoint, toPoint] = await Promise.all([
                geocodeLocation(fromText),
                geocodeLocation(toText)
            ]);

            if (fromPoint && toPoint) {
                const straightLineKm = haversineKm(fromPoint, toPoint);
                // Road distance is usually longer than straight line.
                const roadEstimateKm = Math.max(straightLineKm * 1.3, 1);
                return {
                    km: roadEstimateKm,
                    source: 'live_geo'
                };
            }
        } catch (error) {
            // Network/geocode failure falls back to default estimate below.
        }

        return {
            km: 5,
            source: 'fallback'
        };
    }

    window.LocationDistanceEstimator = {
        estimateDistanceKm
    };
})();
