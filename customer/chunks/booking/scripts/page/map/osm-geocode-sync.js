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
