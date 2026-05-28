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
