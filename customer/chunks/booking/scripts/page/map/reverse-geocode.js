        function buildBookingReverseAddress(address = {}) {
            const landmark = address.amenity
                || address.building
                || address.shop
                || address.office
                || address.tourism
                || address.leisure
                || address.hostel
                || address.hotel;
            const street = address.house_number && address.road
                ? `${address.house_number}, ${address.road}`
                : (address.road || address.neighbourhood || address.suburb);
            const parts = [
                landmark,
                street,
                address.city || address.town || address.village || address.county,
                address.state,
                address.postcode,
                address.country
            ].map((part) => normalizeBookingAddressCandidate(part)).filter(Boolean);
            return [...new Set(parts)].join(', ');
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

        function isBookingCoordinateAddress(address) {
            return /^-?\d+\.\d{4,}\s*,\s*-?\d+\.\d{4,}/.test(normalizeBookingAddressCandidate(address));
        }

        function isBookingUsableLocalityAddress(address) {
            const normalized = normalizeBookingAddressCandidate(address);
            if (!normalized || isBookingCoordinateAddress(normalized)) return false;
            const parts = normalized.split(',').map((part) => part.trim()).filter(Boolean);
            if (parts.length < 3 || normalized.length < 16) return false;
            if (!/[a-z]{3,}/i.test(normalized)) return false;
            if (!/\b(india|bharat)\b/i.test(normalized) && parts.length < 4) return false;
            if (isBookingBroadAdministrativeAddress(normalized) && parts.length < 4) return false;
            const lower = normalized.toLowerCase();
            const tooBroad = [
                'india',
                'bharat',
                'rajasthan, india',
                'gujarat, india',
                'maharashtra, india',
                'madhya pradesh, india',
                'uttar pradesh, india',
                'delhi, india'
            ];
            return !tooBroad.includes(lower);
        }

        function shouldAcceptBookingReverseAddress(address) {
            const normalized = normalizeBookingAddressCandidate(address);
            if (!normalized) return false;
            if (isBookingCoordinateAddress(normalized)) return false;
            const parts = normalized.split(',').map((part) => part.trim()).filter(Boolean);
            const hasStreetLevelHint = /\b(\d+[a-z0-9\-\/]*|road|rd|street|st|lane|ln|gali|chowk|circle|sector|colony|nagar|market|shop|mall|gate|hospital|hotel|temple|station|airport|flat|apt|apartment|building|plot|house|society)\b/i.test(normalized);
            const isLikelyCityOnly = parts.length <= 4 && !hasStreetLevelHint;
            if (isLikelyCityOnly) return isBookingUsableLocalityAddress(normalized);
            if (isBookingBroadAdministrativeAddress(normalized) && !isBookingUsableLocalityAddress(normalized)) return false;
            return scoreBookingAddressCandidate(normalized) >= BOOKING_REVERSE_GEOCODE_MIN_ACCEPT_SCORE
                || isBookingUsableLocalityAddress(normalized);
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
                'station', 'airport', 'school', 'shop', 'tower', 'building', 'office'
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
            if (!best) return formatBookingMapCoords(coords);
            if (best.score < BOOKING_REVERSE_GEOCODE_MIN_ACCEPT_SCORE) {
                const localityFallback = ranked.find(({ address }) => isBookingUsableLocalityAddress(address));
                return localityFallback?.address || formatBookingMapCoords(coords);
            }
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
                3500
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
                    3000
                ),
                fetchBookingJsonWithTimeout(
                    `https://api.bigdatacloud.net/data/reverse-geocode-client?${cloudParams.toString()}`,
                    {
                        method: 'GET',
                        headers: { Accept: 'application/json' }
                    },
                    3000
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
