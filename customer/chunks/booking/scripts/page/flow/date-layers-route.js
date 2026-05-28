        const BOOKING_MIN_LEAD_MINUTES = 60;

        function padBookingDatePart(value) {
            return String(value).padStart(2, '0');
        }

        function formatLocalDateInputValue(dateValue) {
            const date = dateValue instanceof Date ? dateValue : new Date(dateValue);
            return [
                date.getFullYear(),
                padBookingDatePart(date.getMonth() + 1),
                padBookingDatePart(date.getDate())
            ].join('-');
        }

        function formatLocalTimeInputValue(dateValue) {
            const date = dateValue instanceof Date ? dateValue : new Date(dateValue);
            return [
                padBookingDatePart(date.getHours()),
                padBookingDatePart(date.getMinutes())
            ].join(':');
        }

        function getDefaultBookingStartDateTime() {
            const date = new Date(Date.now() + BOOKING_MIN_LEAD_MINUTES * 60 * 1000);
            const roundedMinutes = Math.ceil(date.getMinutes() / 5) * 5;
            if (roundedMinutes >= 60) {
                date.setHours(date.getHours() + 1, 0, 0, 0);
            } else {
                date.setMinutes(roundedMinutes, 0, 0);
            }
            return date;
        }

        function syncBookingDateTimeLimits() {
            const minimumStart = getDefaultBookingStartDateTime();
            const minimumDate = formatLocalDateInputValue(minimumStart);
            const minimumTime = formatLocalTimeInputValue(minimumStart);
            const rideDateNode = document.getElementById('rideDate');
            const rideTimeNode = document.getElementById('rideTime');
            const quickDateNode = document.getElementById('cabQuickDateInput');
            const quickTimeNode = document.getElementById('cabQuickTimeInput');
            const returnDateNode = document.getElementById('returnDate');
            const returnTimeNode = document.getElementById('returnTime');
            const quickReturnDateNode = document.getElementById('cabQuickReturnDateInput');
            const quickReturnTimeNode = document.getElementById('cabQuickReturnTimeInput');

            [rideDateNode, quickDateNode].forEach((node) => {
                if (node) node.min = minimumDate;
            });

            if (rideDateNode && rideDateNode.value && rideDateNode.value < minimumDate) {
                rideDateNode.value = minimumDate;
            }
            if (quickDateNode && quickDateNode.value && quickDateNode.value < minimumDate) {
                quickDateNode.value = minimumDate;
            }

            const selectedRideDate = rideDateNode?.value || quickDateNode?.value || minimumDate;
            const selectedMinimumTime = selectedRideDate === minimumDate ? minimumTime : '';
            [rideTimeNode, quickTimeNode].forEach((node) => {
                if (!node) return;
                node.min = selectedMinimumTime;
                if (selectedMinimumTime && node.value && node.value < selectedMinimumTime) {
                    node.value = selectedMinimumTime;
                }
            });

            const returnMinimumDate = selectedRideDate || minimumDate;
            [returnDateNode, quickReturnDateNode].forEach((node) => {
                if (!node) return;
                node.min = returnMinimumDate;
                if (node.value && node.value < returnMinimumDate) {
                    node.value = returnMinimumDate;
                }
            });

            const selectedReturnDate = returnDateNode?.value || quickReturnDateNode?.value || '';
            const selectedRideTime = rideTimeNode?.value || quickTimeNode?.value || '';
            const returnMinimumTime = selectedReturnDate && selectedReturnDate === selectedRideDate && selectedRideTime
                ? selectedRideTime
                : '';
            [returnTimeNode, quickReturnTimeNode].forEach((node) => {
                if (!node) return;
                node.min = returnMinimumTime;
                if (returnMinimumTime && node.value && node.value <= returnMinimumTime) {
                    node.value = '';
                }
            });
        }

        function seedDefaultBookingDateTime() {
            const defaultStart = getDefaultBookingStartDateTime();
            const defaultDate = formatLocalDateInputValue(defaultStart);
            const defaultTime = formatLocalTimeInputValue(defaultStart);
            const values = [
                ['rideDate', defaultDate],
                ['cabQuickDateInput', defaultDate],
                ['rideTime', defaultTime],
                ['cabQuickTimeInput', defaultTime]
            ];

            values.forEach(([id, value]) => {
                const node = document.getElementById(id);
                if (node && !node.value) node.value = value;
            });
            syncBookingDateTimeLimits();
        }

        function formatCabStartText(dateValue, timeValue) {
            if (!dateValue && !timeValue) return 'Choose date and time';
            const dateTime = dateValue ? new Date(`${dateValue}T${timeValue || '00:00'}`) : null;
            if (dateTime && !Number.isNaN(dateTime.getTime())) {
                const formattedDate = dateTime.toLocaleDateString('en-IN', {
                    weekday: 'short',
                    day: '2-digit',
                    month: 'short',
                    year: 'numeric'
                });
                const formattedTime = timeValue
                    ? dateTime.toLocaleTimeString('en-IN', { hour: 'numeric', minute: '2-digit', hour12: true })
                    : 'Select time';
                return `${formattedDate}, ${formattedTime}`;
            }
            return `${dateValue || 'Choose date'}, ${timeValue || 'Select time'}`;
        }

        function getCabJourneyMode() {
            return document.querySelector('input[name="journeyMode"]:checked')?.value || 'one_way';
        }

        function isCabRoundTripActive(flow = getActiveCabFlow()) {
            return (flow === 'outstation' && getCabJourneyMode() === 'round_trip')
                || (flow === 'airport' && Boolean(getAirportServiceConfig().requiresReturn));
        }

        function syncCabRoundTripUi(flow = getActiveCabFlow()) {
            const journeyMode = getCabJourneyMode();
            const isOutstation = flow === 'outstation';
            const isAirportRoundTrip = flow === 'airport' && Boolean(getAirportServiceConfig().requiresReturn);
            const isRoundTrip = (isOutstation && journeyMode === 'round_trip') || isAirportRoundTrip;
            const consoleNode = document.getElementById('cabBookingConsole');
            const quickReturnDate = document.getElementById('cabQuickReturnDateInput');
            const quickReturnTime = document.getElementById('cabQuickReturnTimeInput');
            const returnDateNode = document.getElementById('returnDate');
            const returnTimeNode = document.getElementById('returnTime');
            const rideDateNode = document.getElementById('rideDate');

            if (consoleNode) {
                consoleNode.classList.toggle('is-one-way', isOutstation && journeyMode === 'one_way');
                consoleNode.classList.toggle('is-round-trip', isRoundTrip);
                consoleNode.classList.toggle('is-multi-city', isOutstation && journeyMode === 'multi_city');
            }
            if (document.body) {
                document.body.classList.toggle('cab-one-way-active', isOutstation && journeyMode === 'one_way');
                document.body.classList.toggle('cab-round-trip-active', isRoundTrip);
                document.body.classList.toggle('cab-multi-city-active', isOutstation && journeyMode === 'multi_city');
            }

            if (quickReturnDate) {
                quickReturnDate.required = isRoundTrip;
                quickReturnDate.min = isRoundTrip ? (rideDateNode?.value || '') : '';
                setQuickControlValue('cabQuickReturnDateInput', isRoundTrip ? (returnDateNode?.value || '') : '');
            }
            if (quickReturnTime) {
                quickReturnTime.required = isRoundTrip;
                setQuickControlValue('cabQuickReturnTimeInput', isRoundTrip ? (returnTimeNode?.value || '') : '');
            }
        }

        function syncCabQuickFields() {
            const pickup = sanitizeInput(document.getElementById('pickup')?.value || '').trim();
            const dropoff = sanitizeInput(document.getElementById('dropoff')?.value || '').trim();
            const rideDate = document.getElementById('rideDate')?.value || '';
            const rideTime = document.getElementById('rideTime')?.value || '';
            const returnDate = document.getElementById('returnDate')?.value || '';
            const returnTime = document.getElementById('returnTime')?.value || '';
            const activeFlow = getActiveCabFlow();
            const config = getCabFlowConfig(activeFlow);
            const tripLabel = readSelectedOptionText('tripPlan', config.packageLabel);
            const modelLabel = readSelectedOptionText('vehicleModel', 'Hatchback Car');
            const airportPackageActive = activeFlow === 'airport' && isAirportPackageMode();

            setQuickControlValue('cabQuickPickupInput', pickup);
            setQuickControlValue('cabQuickDropoffInput', dropoff);
            setQuickControlValue('cabQuickDateInput', rideDate);
            setQuickControlValue('cabQuickTimeInput', rideTime);
            setQuickControlValue('cabQuickReturnDateInput', returnDate);
            setQuickControlValue('cabQuickReturnTimeInput', returnTime);
            syncPackageSelectOptions(activeFlow);
            setQuickControlValue('cabQuickPackageSelect', resolveCabPackageValue(activeFlow));
            const selectedLocalPackage = readSelectedOptionText('cabQuickPackageSelect', config.packageLabel);
            syncCabRoundTripUi(activeFlow);
            setTextIfPresent('cabQuickPackageLabel', activeFlow === 'day_trips'
                ? 'Day Plan'
                : airportPackageActive ? (getAirportServiceMode() === 'airport_day' ? 'Airport Days' : 'Airport Package') : 'Package');
            setTextIfPresent('cabQuickFrom', pickup || 'Select pickup location');
            setTextIfPresent('cabQuickTo', dropoff || (activeFlow === 'day_trips' ? 'Within city rental area' : 'Select drop location'));
            setTextIfPresent('cabQuickStart', formatCabStartText(rideDate, rideTime));
            setTextIfPresent('cabQuickPackage', activeFlow === 'day_trips' || airportPackageActive ? `${selectedLocalPackage} • ${modelLabel}` : tripLabel);
        }

        function syncCabMiniFare(estimate = {}) {
            const values = estimate && typeof estimate === 'object' ? estimate : {};
            const total = Number(values.totalFare || values.amount || 0);
            const distanceKm = Number(values.distanceKm || 0);
            const vehicleLabel = readSelectedOptionText('vehicleModel', 'Hatchback Car');
            const flowLabel = getCabFlowConfig(getActiveCabFlow()).shortLabel;
            const ready = routeIsReady(values);

            setTextIfPresent('cabMiniTotalFare', formatCurrency(total));
            setTextIfPresent('cabMiniDistance', `${Math.max(0, Math.round(distanceKm))} km`);
            setTextIfPresent('cabMiniVehicle', vehicleLabel);
            setTextIfPresent('cabMiniFareMode', flowLabel);
            setTextIfPresent(
                'cabMiniFareMeta',
                ready
                    ? `${flowLabel} estimate includes route, time, toll, tax and selected extras.`
                    : 'Enter pickup and drop to calculate route-aware fare.'
            );
            setTextIfPresent(
                'cabMiniRouteStatus',
                ready
                    ? 'Route ready for admin approval and driver dispatch.'
                    : 'Admin approval before driver assignment'
            );
        }

        let cabLayerManualIndex = null;
        let cabLayerUnlockedIndex = 0;
        let cabLayerFlowSnapshot = '';

        function resetCabLayerProgress(flow = getActiveCabFlow()) {
            cabLayerManualIndex = null;
            cabLayerUnlockedIndex = 0;
            cabLayerFlowSnapshot = CAB_FLOW_CONFIG[flow] ? flow : 'airport';
        }

        function focusCabLayerInput(layerNode, scroll = false) {
            if (!layerNode) return;
            const inputNode = layerNode.querySelector('input, select, textarea');
            if (!inputNode) return;
            if (scroll) {
                layerNode.scrollIntoView({ behavior: 'smooth', block: 'center' });
            }
            if (typeof inputNode.focus === 'function') {
                window.setTimeout(() => inputNode.focus({ preventScroll: true }), 40);
            }
        }

        function advanceCabLayerIfCurrentComplete(layerKey) {
            const activeFlow = getActiveCabFlow();
            const layers = buildCabQuickLayers(activeFlow);
            if (!layers.length) return;

            if (cabLayerFlowSnapshot !== activeFlow) {
                resetCabLayerProgress(activeFlow);
            }

            const lastLayerIndex = layers.length - 1;
            cabLayerUnlockedIndex = Math.max(0, Math.min(cabLayerUnlockedIndex, lastLayerIndex));
            const activeIndex = Number.isInteger(cabLayerManualIndex) ? cabLayerManualIndex : cabLayerUnlockedIndex;
            const changedIndex = layers.findIndex((layer) => layer.key === layerKey);
            if (changedIndex < 0 || changedIndex !== activeIndex) {
                syncCabLayerFlow(activeFlow);
                return;
            }

            const currentLayer = layers[activeIndex];
            if (!currentLayer || !currentLayer.complete()) {
                syncCabLayerFlow(activeFlow);
                return;
            }

            if (activeIndex < lastLayerIndex) {
                cabLayerManualIndex = null;
                cabLayerUnlockedIndex = Math.min(lastLayerIndex, activeIndex + 1);
                syncCabLayerFlow(activeFlow);
                const nextLayer = layers[cabLayerUnlockedIndex];
                focusCabLayerInput(nextLayer && nextLayer.node, true);
                return;
            }

            syncCabLayerFlow(activeFlow);
        }

        function formatMiniLayerDate(value) {
            if (!value) return 'Select date';
            const dateNode = new Date(`${value}T00:00`);
            if (Number.isNaN(dateNode.getTime())) return value;
            return dateNode.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
        }

        function formatMiniLayerTime(value) {
            if (!value) return 'Select time';
            const dateNode = new Date(`1970-01-01T${value}`);
            if (Number.isNaN(dateNode.getTime())) return value;
            return dateNode.toLocaleTimeString('en-IN', { hour: 'numeric', minute: '2-digit', hour12: true });
        }

        function ensureCabLayerValueNode(layerNode) {
            if (!layerNode) return null;
            let valueNode = layerNode.querySelector('.cab-layer-value');
            if (!valueNode) {
                valueNode = document.createElement('small');
                valueNode.className = 'cab-layer-value';
                layerNode.appendChild(valueNode);
            }
            return valueNode;
        }

        function getRouteStopInputs() {
            return Array.from(document.querySelectorAll('[data-route-stop-input]'));
        }

        function readRouteStops() {
            return getRouteStopInputs()
                .map((input) => sanitizeInput(input.value || '').trim())
                .filter(Boolean);
        }

        function buildBookingRouteStopLocationSnapshot() {
            return getRouteStopInputs()
                .map((input, index) => {
                    const address = sanitizeInput(input.value || '').trim();
                    const point = getBookingMapDatasetCoords(input);
                    if (!address && !point) return null;
                    return {
                        index: index + 1,
                        address,
                        coordinates: point || null,
                        googleMapsUrl: point ? buildBookingMapPointUrl(point) : ''
                    };
                })
                .filter(Boolean);
        }

        function buildBookingLocationSnapshot() {
            const pickupInput = document.getElementById('pickup');
            const dropoffInput = document.getElementById('dropoff');
            const pickupPoint = getBookingMapCoordsForTarget('pickup');
            const dropoffPoint = getBookingMapCoordsForTarget('dropoff');
            const stops = buildBookingRouteStopLocationSnapshot();
            return {
                pickup: {
                    address: sanitizeInput(pickupInput?.value || '').trim(),
                    coordinates: pickupPoint || null,
                    googleMapsUrl: pickupPoint ? buildBookingMapPointUrl(pickupPoint) : ''
                },
                dropoff: {
                    address: sanitizeInput(dropoffInput?.value || '').trim(),
                    coordinates: dropoffPoint || null,
                    googleMapsUrl: dropoffPoint ? buildBookingMapPointUrl(dropoffPoint) : ''
                },
                stops,
                accuracy: {
                    pickup: Number.isFinite(Number(pickupPoint?.accuracy)) ? Number(pickupPoint.accuracy) : null,
                    dropoff: Number.isFinite(Number(dropoffPoint?.accuracy)) ? Number(dropoffPoint.accuracy) : null
                },
                source: 'booking_google_map_exact_location'
            };
        }

        function updateRouteStopLabels() {
            const airportConfig = getActiveCabFlow() === 'airport' ? getAirportServiceConfig() : {};
            const isAirportFullDayStops = Boolean(airportConfig.optionalStops);
            getRouteStopInputs().forEach((input, index) => {
                const routeNumber = index + 1;
                input.id = `stop${routeNumber}`;
                input.name = `stops[]`;
                input.placeholder = isAirportFullDayStops
                    ? (routeNumber === 1 ? 'Add city stop, meeting, hotel or route point' : 'Add another full-day stop')
                    : (routeNumber === 1 ? 'Add intermediate route / stop' : 'Add another route / stop');
                const label = input.closest('[data-route-stop-row]')?.querySelector('label');
                if (label) {
                    label.setAttribute('for', input.id);
                    label.textContent = `${isAirportFullDayStops ? 'Stop' : 'Route'} ${routeNumber} (Optional)`;
                }
                const removeButton = input.closest('[data-route-stop-row]')?.querySelector('[data-route-stop-remove]');
                if (removeButton) {
                    const hasValue = Boolean((input.value || '').trim());
                    removeButton.hidden = getRouteStopInputs().length <= 1 && !hasValue;
                    removeButton.setAttribute('aria-label', `Remove ${isAirportFullDayStops ? 'stop' : 'route'} ${routeNumber}`);
                }
            });
        }

        function createRouteStopField(value = '') {
            const row = document.createElement('div');
            row.className = 'route-stop-field';
            row.setAttribute('data-route-stop-row', '1');
            row.innerHTML = `
                <label></label>
                <div class="route-stop-input-wrap">
                    <input type="text" class="route-stop-input" data-route-stop-input autocomplete="off" oninput="handleRouteStopInputChange()">
                    <button type="button" class="route-stop-current-btn" data-map-current-target="stop" aria-label="Use current location for this stop" title="Use current location for this stop">
                        <i class="fas fa-location-arrow"></i>
                    </button>
                    <button type="button" class="route-stop-remove-btn" data-route-stop-remove aria-label="Remove route" onclick="removeRouteStop(this)">
                        <i class="fas fa-times"></i>
                    </button>
                </div>
            `;
            const input = row.querySelector('input');
            if (input) input.value = value || '';
            return row;
        }

        function addRouteStop(value = '', focusNew = true) {
            const list = document.getElementById('routeStopsList');
            if (!list) return null;
            const row = createRouteStopField(value);
            list.appendChild(row);
            updateRouteStopLabels();
            const input = row.querySelector('[data-route-stop-input]');
            if (input && typeof initializeAutocomplete === 'function') {
                initializeAutocomplete(input.id);
            }
            if (focusNew && input && typeof input.focus === 'function') {
                window.setTimeout(() => input.focus({ preventScroll: true }), 40);
            }
            return input;
        }

        function removeRouteStop(button) {
            const row = button?.closest('[data-route-stop-row]');
            const input = row?.querySelector('[data-route-stop-input]');
            const stops = getRouteStopInputs();
            if (!row || !input) return;

            if (stops.length <= 1) {
                input.value = '';
                input.focus({ preventScroll: true });
            } else {
                row.remove();
            }

            updateRouteStopLabels();
            updateFare();
            updateBookingExperience();
        }

        function ensureRouteStopsReady() {
            const list = document.getElementById('routeStopsList');
            if (!list) return;
            if (!getRouteStopInputs().length) {
                list.appendChild(createRouteStopField());
            }
            updateRouteStopLabels();
        }

        function handleRouteStopInputChange() {
            updateRouteStopLabels();
            updateFare();
            updateBookingExperience();
        }

        function isCabLocationLayerComplete(inputId, inputNode) {
            const value = String(inputNode?.value || '').trim();
            if (value.length < 3) return false;

            if (getActiveCabFlow() === 'airport' && getAirportFieldRole(inputId) === 'airport') {
                return isAirportTextResolvable(value, {
                    contextText: getAirportContextTextForInput(inputNode)
                });
            }

            return true;
        }

        function buildCabQuickLayers(flow = getActiveCabFlow()) {
            const pickupNode = document.getElementById('cabQuickPickupInput');
            const dropoffNode = document.getElementById('cabQuickDropoffInput');
            const dateNode = document.getElementById('cabQuickDateInput');
            const timeNode = document.getElementById('cabQuickTimeInput');
            const returnDateNode = document.getElementById('cabQuickReturnDateInput');
            const returnTimeNode = document.getElementById('cabQuickReturnTimeInput');
            const packageNode = document.getElementById('cabQuickPackageSelect');

            const baseLayers = [
                {
                    key: 'pickup',
                    label: 'Pickup',
                    inputId: 'cabQuickPickupInput',
                    node: pickupNode ? pickupNode.closest('.cab-mini-field') : null,
                    complete: () => isCabLocationLayerComplete('cabQuickPickupInput', pickupNode),
                    valueText: () => sanitizeInput(pickupNode?.value || '').trim(),
                    pendingText: 'Enter pickup location'
                },
                {
                    key: 'dropoff',
                    label: 'Dropoff',
                    inputId: 'cabQuickDropoffInput',
                    node: dropoffNode ? dropoffNode.closest('.cab-mini-field') : null,
                    complete: () => isCabLocationLayerComplete('cabQuickDropoffInput', dropoffNode),
                    valueText: () => sanitizeInput(dropoffNode?.value || '').trim(),
                    pendingText: 'Enter drop location'
                },
                {
                    key: 'date',
                    label: 'Trip date',
                    node: dateNode ? dateNode.closest('.cab-mini-field') : null,
                    complete: () => Boolean(dateNode?.value),
                    valueText: () => formatMiniLayerDate(dateNode?.value || ''),
                    pendingText: 'Select trip date'
                },
                {
                    key: 'time',
                    label: 'Trip time',
                    node: timeNode ? timeNode.closest('.cab-mini-field') : null,
                    complete: () => Boolean(timeNode?.value),
                    valueText: () => formatMiniLayerTime(timeNode?.value || ''),
                    pendingText: 'Select pickup time'
                }
            ];

            if ((flow === 'outstation' && getCabJourneyMode() === 'round_trip')
                || (flow === 'airport' && Boolean(getAirportServiceConfig().requiresReturn))) {
                baseLayers.push(
                    {
                        key: 'returnDate',
                        label: 'Return date',
                        node: returnDateNode ? returnDateNode.closest('.cab-mini-field') : null,
                        complete: () => Boolean(returnDateNode?.value),
                        valueText: () => formatMiniLayerDate(returnDateNode?.value || ''),
                        pendingText: 'Select return date'
                    },
                    {
                        key: 'returnTime',
                        label: 'Return time',
                        node: returnTimeNode ? returnTimeNode.closest('.cab-mini-field') : null,
                        complete: () => Boolean(returnTimeNode?.value),
                        valueText: () => formatMiniLayerTime(returnTimeNode?.value || ''),
                        pendingText: 'Select return time'
                    }
                );
            }

            if (flow === 'day_trips') {
                baseLayers.splice(1, 1);
                baseLayers.push({
                    key: 'package',
                    label: 'Day plan',
                    node: packageNode ? packageNode.closest('.cab-mini-field') : null,
                    complete: () => Boolean(packageNode?.value),
                    valueText: () => packageNode?.options?.[packageNode.selectedIndex]?.text || '',
                    pendingText: 'Select day plan'
                });
            }

            if (flow === 'airport' && Boolean(getAirportServiceConfig().requiresPackage)) {
                const isFullDayAirport = getAirportServiceMode() === 'airport_day';
                baseLayers.push({
                    key: 'package',
                    label: isFullDayAirport ? 'Airport days' : 'Airport package',
                    node: packageNode ? packageNode.closest('.cab-mini-field') : null,
                    complete: () => Boolean(packageNode?.value),
                    valueText: () => packageNode?.options?.[packageNode.selectedIndex]?.text || '',
                    pendingText: isFullDayAirport ? 'Select duty days' : 'Select airport package'
                });
            }

            return baseLayers.filter((layer) => layer.node);
        }

        function syncCabLayerFlow(flow = getActiveCabFlow()) {
            const activeFlow = CAB_FLOW_CONFIG[flow] ? flow : 'airport';
            const layers = buildCabQuickLayers(activeFlow);
            if (!layers.length) return;

            if (cabLayerFlowSnapshot !== activeFlow) {
                resetCabLayerProgress(activeFlow);
            }

            const firstIncompleteIndex = layers.findIndex((layer) => !layer.complete());
            const lastLayerIndex = layers.length - 1;
            if (firstIncompleteIndex !== -1 && firstIncompleteIndex < cabLayerUnlockedIndex) {
                cabLayerUnlockedIndex = firstIncompleteIndex;
            }
            cabLayerUnlockedIndex = Math.max(0, Math.min(cabLayerUnlockedIndex, lastLayerIndex));

            if (Number.isInteger(cabLayerManualIndex)) {
                const manualLayer = layers[cabLayerManualIndex];
                if (!manualLayer || cabLayerManualIndex > cabLayerUnlockedIndex) {
                    cabLayerManualIndex = null;
                }
            }

            const activeIndex = Number.isInteger(cabLayerManualIndex) ? cabLayerManualIndex : cabLayerUnlockedIndex;

            layers.forEach((layer, index) => {
                const node = layer.node;
                const isComplete = layer.complete();
                const isCurrent = index === activeIndex;
                const isHidden = index > activeIndex;
                const isCollapsed = index < activeIndex;

                node.classList.add('cab-layer');
                node.classList.toggle('is-layer-current', isCurrent);
                node.classList.toggle('is-layer-complete', isComplete);
                node.classList.toggle('is-layer-hidden', isHidden);
                node.classList.toggle('is-layer-collapsed', isCollapsed);

                const valueNode = ensureCabLayerValueNode(node);
                if (valueNode) {
                    valueNode.textContent = layer.valueText() || layer.pendingText;
                }

                if (node.dataset.cabLayerBound !== '1') {
                    node.addEventListener('click', (event) => {
                        const host = event.currentTarget;
                        if (!host || !host.classList.contains('is-layer-collapsed')) return;
                        const currentLayers = buildCabQuickLayers(getActiveCabFlow());
                        const clickedIndex = currentLayers.findIndex((item) => item.node === host);
                        if (clickedIndex < 0) return;
                        if (clickedIndex > cabLayerUnlockedIndex) return;
                        cabLayerManualIndex = clickedIndex;
                        syncCabLayerFlow(getActiveCabFlow());
                        focusCabLayerInput(host, false);
                    });
                    node.dataset.cabLayerBound = '1';
                }
            });

            const currentLayer = layers[Math.max(0, activeIndex)] || null;
            const currentLayerReady = Boolean(currentLayer && currentLayer.complete());
            const searchButton = document.getElementById('cabPrimarySearch');
            const helperNode = document.querySelector('#cabModeNotice .cab-layer-helper') || (() => {
                const host = document.getElementById('cabModeNotice');
                if (!host) return null;
                const helper = document.createElement('small');
                helper.className = 'cab-layer-helper';
                host.appendChild(helper);
                return helper;
            })();

            const advancedReady = Boolean(document.body?.classList.contains('booking-advanced-ready'));
            const advancedSections = advancedReady ? getServiceVisibleSections(activeFlow) : [];
            const advancedIndex = advancedReady ? getServiceFolderProgressIndex(activeFlow, advancedSections) : 0;
            const advancedCurrentSection = advancedReady && advancedSections.length
                ? advancedSections[Math.max(0, Math.min(advancedIndex, advancedSections.length - 1))]
                : null;
            const advancedCurrentComplete = advancedCurrentSection
                ? isBookingStepComplete(advancedCurrentSection.dataset.stepKey || '', activeFlow)
                : false;

            if (searchButton) {
                if (advancedReady && advancedSections.length) {
                    const isAdvancedFinal = advancedIndex >= advancedSections.length - 1;
                    searchButton.disabled = !advancedCurrentComplete;
                    searchButton.classList.toggle('is-layer-locked', !advancedCurrentComplete);
                    searchButton.setAttribute('aria-disabled', advancedCurrentComplete ? 'false' : 'true');
                    searchButton.textContent = isAdvancedFinal ? 'FINAL SUBMIT' : 'NEXT';
                } else {
                    searchButton.disabled = !currentLayerReady;
                    searchButton.classList.toggle('is-layer-locked', !currentLayerReady);
                    searchButton.setAttribute('aria-disabled', currentLayerReady ? 'false' : 'true');
                    searchButton.textContent = 'NEXT';
                }
            }

            const backButton = document.getElementById('cabStepBackBtn');
            if (backButton) {
                const actionRow = backButton.closest('.cab-console-actions');
                let showBack = false;
                if (advancedReady && advancedSections.length) {
                    showBack = true;
                    backButton.disabled = false;
                } else {
                    showBack = activeIndex > 0;
                    backButton.disabled = !showBack;
                }
                backButton.style.display = showBack ? 'inline-flex' : 'none';
                if (actionRow) actionRow.classList.toggle('has-step-back', showBack);
            }

            const routeAddons = document.getElementById('cabRouteAddons');
            if (routeAddons) {
                const pickupReady = layers
                    .filter((layer) => layer.key === 'pickup')
                    .every((layer) => layer.complete());
                const dropoffLayers = layers.filter((layer) => layer.key === 'dropoff');
                const dropoffReady = !dropoffLayers.length || dropoffLayers.every((layer) => layer.complete());
                const routeTitle = routeAddons.querySelector('.cab-route-addons-title span');
                const routeHint = routeAddons.querySelector('.cab-route-addons-title small');
                const isLocalRental = activeFlow === 'day_trips';
                const airportConfig = activeFlow === 'airport' ? getAirportServiceConfig() : {};
                const isAirportFullDayStops = Boolean(airportConfig.optionalStops);
                const isAirportMulti = activeFlow === 'airport' && Boolean(airportConfig.routeAddons);
                const isAirportStopAddon = isAirportMulti || isAirportFullDayStops;
                const showRouteAddons = isLocalRental
                    ? pickupReady
                    : isAirportStopAddon
                        ? pickupReady && dropoffReady
                        : activeFlow === 'outstation'
                            && getCabJourneyMode() === 'multi_city'
                            && pickupReady
                            && dropoffReady;
                if (routeTitle) {
                    routeTitle.innerHTML = isLocalRental
                        ? '<i class="fas fa-map-signs"></i> Local Stops'
                        : isAirportStopAddon
                            ? (isAirportFullDayStops ? '<i class="fas fa-map-signs"></i> Full Day Stops' : '<i class="fas fa-map-signs"></i> Airport Stops')
                            : '<i class="fas fa-map-signs"></i> Route Add-ons';
                }
                if (routeHint) {
                    routeHint.textContent = isLocalRental
                        ? 'Shopping, meetings, sightseeing stops'
                        : isAirportStopAddon
                            ? (isAirportFullDayStops ? 'Optional: add meeting, hotel, city or route stops' : 'Add hotel, meeting, terminal or route stops')
                            : 'Add routes/stops as needed';
                }
                routeAddons.classList.toggle('is-visible', showRouteAddons);
                routeAddons.hidden = !showRouteAddons;
                routeAddons.setAttribute('aria-hidden', showRouteAddons ? 'false' : 'true');
            }

            if (helperNode) {
                if (advancedReady && advancedSections.length) {
                    const totalSteps = layers.length + advancedSections.length;
                    const activeStep = layers.length + Math.max(1, advancedIndex + 1);
                    helperNode.textContent = `Step ${activeStep}/${totalSteps}`;
                } else {
                    helperNode.textContent = `Step ${Math.max(1, activeIndex + 1)}/${layers.length}`;
                }
            }
            syncCabStageLayout();
        }
        function syncCabModeUi(flow = getActiveCabFlow()) {
            const activeFlow = CAB_FLOW_CONFIG[flow] ? flow : 'airport';
            const config = getCabFlowConfig(activeFlow);
            const airportConfig = getAirportServiceConfig();
            const consoleNode = document.getElementById('cabBookingConsole');
            if (consoleNode) {
                consoleNode.classList.remove('is-airport', 'is-local', 'is-outstation', 'is-hourly', 'is-airport-package', 'is-airport-multi', 'is-airport-transfer');
                consoleNode.classList.add(activeFlow === 'day_trips' ? 'is-hourly' : `is-${activeFlow}`);
                consoleNode.classList.toggle('is-airport-package', activeFlow === 'airport' && Boolean(airportConfig.requiresPackage));
                consoleNode.classList.toggle('is-airport-multi', activeFlow === 'airport' && Boolean(airportConfig.routeAddons));
                consoleNode.classList.toggle('is-airport-transfer', activeFlow === 'airport' && isMergedAirportTransferMode(getAirportServiceMode()));
            }
            if (document.body) {
                document.body.classList.remove('cab-flow-airport', 'cab-flow-local', 'cab-flow-outstation', 'cab-flow-hourly');
                document.body.classList.add(activeFlow === 'day_trips' ? 'cab-flow-hourly' : `cab-flow-${activeFlow}`);
            }

            document.querySelectorAll('[data-flow-target]').forEach((button) => {
                const isActive = button.dataset.flowTarget === activeFlow;
                button.classList.toggle('is-active', isActive);
                button.setAttribute('aria-selected', isActive ? 'true' : 'false');
            });

            document.querySelectorAll('#tripFlowPills .trip-flow-pill').forEach((button) => {
                button.classList.toggle('is-active', button.dataset.flow === activeFlow);
            });

            const noticeText = document.querySelector('#cabModeNotice span');
            if (noticeText) noticeText.textContent = activeFlow === 'airport' ? airportConfig.notice : config.notice;

            syncAirportServiceChips();
            syncPackageSelectOptions(activeFlow);
            syncAirportOnlyFieldUi(activeFlow);
            syncCabScopedSelectOptions(activeFlow);
            syncCabQuickFields();
            syncCabLayerFlow(activeFlow);
        }

        function setCabJourneyMode(mode, options = {}) {
            const normalized = ['one_way', 'round_trip', 'multi_city'].includes(mode) ? mode : 'one_way';
            document.querySelectorAll('input[name="journeyMode"]').forEach((radio) => {
                radio.checked = radio.value === normalized;
            });
            document.querySelectorAll('[data-journey-target]').forEach((button) => {
                button.classList.toggle('is-active', button.dataset.journeyTarget === normalized);
            });

            const returnToggle = document.getElementById('isReturnTrip');
            if (returnToggle && options.syncReturnTrip !== false) {
                returnToggle.checked = normalized === 'round_trip';
                toggleReturnTrip();
                if (normalized === 'multi_city') {
                    ensureRouteStopsReady();
                    const stopField = getRouteStopInputs()[0];
                    if (stopField && !stopField.value) {
                        stopField.placeholder = 'Add first stop for multi-city journey';
                    }
                }
                if (options.skipFare !== true) updateFare();
            }

            syncCabRoundTripUi(getActiveCabFlow());
            syncCabScopedSelectOptions(getActiveCabFlow());
            syncCabLayerFlow(getActiveCabFlow());
            updateBookingExperience();
        }

        function setCabBookingMode(flow, options = {}) {
            const activeFlow = CAB_FLOW_CONFIG[flow] ? flow : 'airport';
            const config = getCabFlowConfig(activeFlow);
            const hiddenNode = document.getElementById('tripFlow');
            const tripPlanNode = document.getElementById('tripPlan');
            const serviceTypeNode = document.getElementById('tripServiceType');

            if (hiddenNode) hiddenNode.value = activeFlow;
            if (options.syncTripPlan !== false && tripPlanNode && config.tripPlan) {
                tripPlanNode.value = config.tripPlan;
            }
            if (serviceTypeNode && config.serviceType) {
                serviceTypeNode.value = config.serviceType;
            }
            syncCabScopedSelectOptions(activeFlow);

            if (document.body) {
                document.body.classList.remove('booking-advanced-ready');
            }
            resetCabLayerProgress(activeFlow);
            resetServiceFolderProgress(activeFlow);
            syncCabModeUi(activeFlow);
            if (options.skipFare !== true) updateFare();
            else updateBookingExperience();
        }

        function revealFieldFromShortcut(fieldId) {
            if (!fieldId) return;
            revealBookingField(fieldId);
            const field = document.getElementById(fieldId);
            if (field) {
                window.setTimeout(() => field.scrollIntoView({ behavior: 'smooth', block: 'center' }), 80);
            }
        }

        function openNextAdvancedBookingStep() {
            const flow = getActiveCabFlow();
            const drawer = document.getElementById('advancedBookingDrawer');
            if (document.body) {
                document.body.classList.add('booking-advanced-ready');
            }
            if (drawer) drawer.open = true;

            const sections = getServiceVisibleSections(flow);
            if (!sections.length) return;

            const progressIndex = getServiceFolderProgressIndex(flow, sections);
            const targetSection = sections[Math.max(0, Math.min(progressIndex, sections.length - 1))];

            setActiveAccordionSection(sections, targetSection);
            syncServiceFolderVisibility(flow);
            syncCabLayerFlow(flow);
            syncCabStageLayout();

            const focusTarget = targetSection.querySelector('input:not([type="hidden"]), select, textarea');
            if (focusTarget && typeof focusTarget.focus === 'function') {
                window.setTimeout(() => focusTarget.focus({ preventScroll: true }), 60);
            }
            window.setTimeout(() => {
                targetSection.scrollIntoView({ behavior: 'smooth', block: 'start' });
            }, 80);
        }

        function handleCabPrimarySearch() {
            const activeFlow = getActiveCabFlow();
            resolveCabQuickLocationValues({
                showSuggestions: false,
                useVisibleSuggestion: true
            });
            const layers = buildCabQuickLayers(activeFlow);
            if (!layers.length) return;

            if (cabLayerFlowSnapshot !== activeFlow) {
                resetCabLayerProgress(activeFlow);
            }

            const lastLayerIndex = layers.length - 1;
            cabLayerUnlockedIndex = Math.max(0, Math.min(cabLayerUnlockedIndex, lastLayerIndex));
            const activeIndex = Number.isInteger(cabLayerManualIndex) ? cabLayerManualIndex : cabLayerUnlockedIndex;
            const currentLayer = layers[Math.max(0, activeIndex)] || null;
            const currentLayerInput = currentLayer?.inputId ? document.getElementById(currentLayer.inputId) : null;

            if (currentLayerInput && getActiveCabFlow() === 'airport' && getAirportFieldRole(currentLayerInput.id) === 'airport') {
                const resolved = resolveAirportInputValue(currentLayerInput, { showSuggestions: true });
                if (!resolved) {
                    syncCabLayerFlow(activeFlow);
                    focusCabLayerInput(currentLayer && currentLayer.node, true);
                    return;
                }
            }

            if (!currentLayer || !currentLayer.complete()) {
                syncCabLayerFlow(activeFlow);
                focusCabLayerInput(currentLayer && currentLayer.node, true);
                return;
            }

            if (activeIndex < lastLayerIndex) {
                cabLayerManualIndex = null;
                cabLayerUnlockedIndex = Math.min(lastLayerIndex, activeIndex + 1);
                syncCabLayerFlow(activeFlow);
                const nextLayer = layers[cabLayerUnlockedIndex];
                focusCabLayerInput(nextLayer && nextLayer.node, true);
                return;
            }

            const journeyMode = getCabJourneyMode();
            const requiredFieldIds = activeFlow === 'day_trips'
                ? ['pickup', 'rideDate', 'rideTime']
                : ['pickup', 'dropoff', 'rideDate', 'rideTime'];
            if ((activeFlow === 'outstation' && journeyMode === 'round_trip')
                || (activeFlow === 'airport' && Boolean(getAirportServiceConfig().requiresReturn))) {
                requiredFieldIds.push('returnDate', 'returnTime');
            }
            const missingField = requiredFieldIds.find((id) => !String(document.getElementById(id)?.value || '').trim());
            if (missingField) {
                const quickFieldMap = {
                    pickup: 'cabQuickPickupInput',
                    dropoff: 'cabQuickDropoffInput',
                    rideDate: 'cabQuickDateInput',
                    rideTime: 'cabQuickTimeInput',
                    returnDate: 'cabQuickReturnDateInput',
                    returnTime: 'cabQuickReturnTimeInput'
                };
                const quickField = document.getElementById(quickFieldMap[missingField] || '');
                if (quickField) {
                    quickField.scrollIntoView({ behavior: 'smooth', block: 'center' });
                    if (typeof quickField.focus === 'function') {
                        window.setTimeout(() => quickField.focus({ preventScroll: true }), 40);
                    }
                    return;
                }
                revealFieldFromShortcut(missingField);
                return;
            }

            if (activeFlow === 'airport' && isAirportTerminalDetailRequired()) {
                const terminalField = document.getElementById('cabQuickTerminalInput');
                const terminalValue = sanitizeInput(terminalField?.value || '').trim();
                if (!terminalValue) {
                    showError('Please enter airport terminal, gate, pillar or pickup/drop point');
                    if (terminalField) {
                        terminalField.scrollIntoView({ behavior: 'smooth', block: 'center' });
                        window.setTimeout(() => terminalField.focus({ preventScroll: true }), 40);
                    }
                    return;
                }
            }

            if (activeFlow === 'outstation' && journeyMode === 'multi_city' && !readRouteStops().length) {
                ensureRouteStopsReady();
                const firstStop = getRouteStopInputs()[0];
                if (firstStop) {
                    firstStop.scrollIntoView({ behavior: 'smooth', block: 'center' });
                    window.setTimeout(() => firstStop.focus({ preventScroll: true }), 40);
                }
                return;
            }

            if (activeFlow === 'day_trips') {
                const pickupValue = sanitizeInput(document.getElementById('pickup')?.value || '').trim();
                const dropoffNode = document.getElementById('dropoff');
                if (pickupValue && dropoffNode && !String(dropoffNode.value || '').trim()) {
                    dropoffNode.value = `Day plan within ${pickupValue}`;
                }
            }

            updateDistanceEstimate();
            updateFare();
            const sections = getServiceVisibleSections(activeFlow);
            if (!sections.length) return;

            if (!document.body?.classList.contains('booking-advanced-ready')) {
                setServiceFolderProgressIndex(activeFlow, 0, sections);
                openNextAdvancedBookingStep();
                return;
            }

            const currentIndex = getServiceFolderProgressIndex(activeFlow, sections);
            const currentSection = sections[Math.max(0, Math.min(currentIndex, sections.length - 1))];
            const currentComplete = isBookingStepComplete(currentSection?.dataset?.stepKey || '', activeFlow);
            if (!currentComplete) {
                const focusTarget = currentSection?.querySelector('input:not([type="hidden"]), select, textarea');
                if (focusTarget && typeof focusTarget.focus === 'function') {
                    focusTarget.focus({ preventScroll: true });
                }
                return;
            }

            if (currentIndex < sections.length - 1) {
                setServiceFolderProgressIndex(activeFlow, currentIndex + 1, sections);
                openNextAdvancedBookingStep();
                return;
            }

            const form = document.getElementById('bookingForm');
            if (form && typeof form.requestSubmit === 'function') {
                form.requestSubmit();
            } else {
                handleBookingFormSubmit();
            }
        }
