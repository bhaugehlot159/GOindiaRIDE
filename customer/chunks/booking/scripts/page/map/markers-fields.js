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

        function getBookingMapTargetInputIds(target) {
            if (target === 'dropoff') return ['dropoff', 'cabQuickDropoffInput'];
            if (target === 'pickup') return ['pickup', 'cabQuickPickupInput'];
            return [];
        }

        function shouldApplyBookingReverseAddressToTarget(target, baseCoords) {
            const currentPoint = getBookingMapCoordsForTarget(target);
            if (currentPoint && pointsAreNearEnoughForRefinement(baseCoords, currentPoint)) return true;

            const formattedCoords = formatBookingMapCoords(baseCoords);
            return getBookingMapTargetInputIds(target).some((inputId) => {
                const input = document.getElementById(inputId);
                if (!input) return false;
                const datasetPoint = getBookingMapDatasetCoords(input);
                if (datasetPoint && pointsAreNearEnoughForRefinement(baseCoords, datasetPoint)) return true;
                return formattedCoords && sanitizeInput(input.value || '').trim() === formattedCoords;
            });
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
                const inputIds = getBookingMapTargetInputIds(target);
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
                if (typeof advanceCabLayerIfCurrentComplete === 'function') {
                    const layerKey = target === 'dropoff' ? 'dropoff' : 'pickup';
                    window.setTimeout(() => advanceCabLayerIfCurrentComplete(layerKey), 0);
                }
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
            if (options.source === 'current' && !isBookingPreciseCurrentLocationPoint(cleanCoords)) {
                const preciseMessage = formatBookingPreciseLocationRequiredMessage(cleanCoords);
                showBookingLocationNotice(preciseMessage, 'error');
                setBookingMapStatus(preciseMessage, 'error');
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
                        const stillRelevant = shouldApplyBookingReverseAddressToTarget(safeTarget, cleanCoords);
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
                    const stillRelevant = options.background === true
                        || shouldApplyBookingReverseAddressToTarget(safeTarget, cleanCoords);
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
