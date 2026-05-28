        function initInternationalCabBookingUI() {
            document.querySelectorAll('[data-flow-target]').forEach((button) => {
                if (button.dataset.cabBound === '1') return;
                button.addEventListener('click', () => {
                    setCabBookingMode(button.dataset.flowTarget || 'airport');
                });
                button.dataset.cabBound = '1';
            });

            document.querySelectorAll('[data-journey-target]').forEach((button) => {
                if (button.dataset.cabBound === '1') return;
                button.addEventListener('click', () => {
                    setCabJourneyMode(button.dataset.journeyTarget || 'one_way');
                });
                button.dataset.cabBound = '1';
            });

            document.querySelectorAll('[data-airport-service]').forEach((button) => {
                if (button.dataset.airportServiceBound === '1') return;
                button.addEventListener('click', () => {
                    setAirportServiceMode(button.dataset.airportService || 'airport_drop');
                });
                button.dataset.airportServiceBound = '1';
            });

            document.querySelectorAll('[data-airport-transfer-variant]').forEach((button) => {
                if (button.dataset.airportTransferBound === '1') return;
                button.addEventListener('click', () => {
                    setAirportServiceMode(button.dataset.airportTransferVariant || 'airport_to_airport');
                });
                button.dataset.airportTransferBound = '1';
            });

            document.querySelectorAll('[data-reveal-field]').forEach((button) => {
                if (button.dataset.revealBound === '1') return;
                button.addEventListener('click', () => revealFieldFromShortcut(button.dataset.revealField));
                button.dataset.revealBound = '1';
            });

            ensureRouteStopsReady();
            const addRouteStopButton = document.getElementById('addRouteStopBtn');
            if (addRouteStopButton && addRouteStopButton.dataset.routeStopBound !== '1') {
                addRouteStopButton.addEventListener('click', () => {
                    addRouteStop('', true);
                    updateFare();
                });
                addRouteStopButton.dataset.routeStopBound = '1';
            }

            document.querySelectorAll('[data-mode-shortcut]').forEach((button) => {
                if (button.dataset.modeBound === '1') return;
                button.addEventListener('click', () => {
                    setCabBookingMode(button.dataset.modeShortcut || 'airport');
                    document.getElementById('cabBookingConsole')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
                });
                button.dataset.modeBound = '1';
            });

            document.querySelectorAll('input[name="journeyMode"]').forEach((radio) => {
                if (radio.dataset.journeyBound === '1') return;
                radio.addEventListener('change', () => {
                    if (radio.checked) setCabJourneyMode(radio.value, { syncReturnTrip: radio.value !== 'one_way' });
                });
                radio.dataset.journeyBound = '1';
            });

            const tripPlanNode = document.getElementById('tripPlan');
            if (tripPlanNode && tripPlanNode.dataset.cabModeBound !== '1') {
                tripPlanNode.addEventListener('change', () => {
                    setCabBookingMode(inferCabFlowFromTripPlan(tripPlanNode.value), {
                        syncTripPlan: false,
                        skipFare: true
                    });
                });
                tripPlanNode.dataset.cabModeBound = '1';
            }

            const searchButton = document.getElementById('cabPrimarySearch');
            if (searchButton && searchButton.dataset.cabBound !== '1') {
                searchButton.addEventListener('pointerdown', (event) => {
                    if (event.button && event.button !== 0) return;
                    searchButton.dataset.cabPointerHandled = '1';
                    window.setTimeout(() => {
                        delete searchButton.dataset.cabPointerHandled;
                    }, 350);
                    event.preventDefault();
                    handleCabPrimarySearch();
                }, true);
                searchButton.addEventListener('click', (event) => {
                    if (searchButton.dataset.cabPointerHandled === '1') {
                        delete searchButton.dataset.cabPointerHandled;
                        event.preventDefault();
                        return;
                    }
                    handleCabPrimarySearch();
                });
                searchButton.dataset.cabBound = '1';
            }

            const backButton = document.getElementById('cabStepBackBtn');
            if (backButton && backButton.dataset.cabBound !== '1') {
                const handleBackButtonAction = () => {
                    closeAllBookingAutocompleteBoxes();
                    handleCabStepBack();
                };
                backButton.addEventListener('pointerdown', (event) => {
                    if (event.button && event.button !== 0) return;
                    backButton.dataset.cabPointerHandled = '1';
                    window.setTimeout(() => {
                        delete backButton.dataset.cabPointerHandled;
                    }, 350);
                    event.preventDefault();
                    handleBackButtonAction();
                }, true);
                backButton.addEventListener('click', (event) => {
                    if (backButton.dataset.cabPointerHandled === '1') {
                        delete backButton.dataset.cabPointerHandled;
                        event.preventDefault();
                        return;
                    }
                    handleBackButtonAction();
                });
                backButton.dataset.cabBound = '1';
            }

            const pickupMini = document.getElementById('cabQuickPickupInput');
            const dropoffMini = document.getElementById('cabQuickDropoffInput');
            const terminalMini = document.getElementById('cabQuickTerminalInput');
            const dateMini = document.getElementById('cabQuickDateInput');
            const timeMini = document.getElementById('cabQuickTimeInput');
            const returnDateMini = document.getElementById('cabQuickReturnDateInput');
            const returnTimeMini = document.getElementById('cabQuickReturnTimeInput');
            const packageMini = document.getElementById('cabQuickPackageSelect');

            const bindMiniLocation = (miniNode, targetId, layerKey) => {
                if (!miniNode || miniNode.dataset.cabMiniBound === '1') return;
                miniNode.addEventListener('input', (event) => {
                    const target = document.getElementById(targetId);
                    if (target) target.value = miniNode.value;
                    showQuickLocationSuggestions(miniNode, event);
                    if (target) target.value = miniNode.value;
                    updateBookingExperience();
                });
                ['change', 'blur'].forEach((eventName) => {
                    miniNode.addEventListener(eventName, () => {
                        const committedSelection = miniNode.dataset.cabCommittedSelection === '1';
                        delete miniNode.dataset.cabCommittedSelection;
                        const target = document.getElementById(targetId);
                        if (target) target.value = miniNode.value;
                        handleLocationUpdated();
                        if (eventName === 'change' && committedSelection && layerKey) {
                            advanceCabLayerIfCurrentComplete(layerKey);
                        }
                    });
                });
                miniNode.dataset.cabMiniBound = '1';
            };

            bindMiniLocation(pickupMini, 'pickup', 'pickup');
            bindMiniLocation(dropoffMini, 'dropoff', 'dropoff');

            if (terminalMini && terminalMini.dataset.cabMiniBound !== '1') {
                terminalMini.addEventListener('input', () => {
                    updateBookingExperience();
                });
                terminalMini.addEventListener('change', () => {
                    updateBookingExperience();
                    advanceCabLayerIfCurrentComplete('terminal');
                });
                terminalMini.dataset.cabMiniBound = '1';
            }

            const bindQuickAutocomplete = (attempt = 0) => {
                if (typeof initializeAutocomplete === 'function') {
                    patchBookingLocationAutocompletePositioner();
                    initializeAutocomplete('pickup');
                    initializeAutocomplete('dropoff');
                    initializeAutocomplete('cabQuickPickupInput');
                    initializeAutocomplete('cabQuickDropoffInput');
                    getRouteStopInputs().forEach((input) => initializeAutocomplete(input.id));
                    ['pickup', 'dropoff', 'cabQuickPickupInput', 'cabQuickDropoffInput'].forEach(bindAirportOnlyAutocomplete);
                    return true;
                }
                if (attempt < 80) {
                    window.setTimeout(() => bindQuickAutocomplete(attempt + 1), 250);
                }
                return false;
            };
            bindQuickAutocomplete();
            window.addEventListener('load', () => bindQuickAutocomplete(0), { once: true });

            if (dateMini && dateMini.dataset.cabMiniBound !== '1') {
                dateMini.addEventListener('change', () => {
                    const rideDateNode = document.getElementById('rideDate');
                    if (rideDateNode) rideDateNode.value = dateMini.value;
                    syncBookingDateTimeLimits();
                    toggleReturnTrip();
                    syncCabRoundTripUi(getActiveCabFlow());
                    updateFare();
                    updateBookingExperience();
                    advanceCabLayerIfCurrentComplete('date');
                });
                dateMini.dataset.cabMiniBound = '1';
            }

            if (timeMini && timeMini.dataset.cabMiniBound !== '1') {
                timeMini.addEventListener('change', () => {
                    const rideTimeNode = document.getElementById('rideTime');
                    if (rideTimeNode) rideTimeNode.value = timeMini.value;
                    syncBookingDateTimeLimits();
                    toggleReturnTrip();
                    syncCabRoundTripUi(getActiveCabFlow());
                    updateFare();
                    updateBookingExperience();
                    advanceCabLayerIfCurrentComplete('time');
                });
                timeMini.dataset.cabMiniBound = '1';
            }

            if (returnDateMini && returnDateMini.dataset.cabMiniBound !== '1') {
                returnDateMini.addEventListener('change', () => {
                    const returnDateNode = document.getElementById('returnDate');
                    if (returnDateNode) returnDateNode.value = returnDateMini.value;
                    syncBookingDateTimeLimits();
                    syncCabRoundTripUi(getActiveCabFlow());
                    updateFare();
                    updateBookingExperience();
                    advanceCabLayerIfCurrentComplete('returnDate');
                });
                returnDateMini.dataset.cabMiniBound = '1';
            }

            if (returnTimeMini && returnTimeMini.dataset.cabMiniBound !== '1') {
                returnTimeMini.addEventListener('change', () => {
                    const returnTimeNode = document.getElementById('returnTime');
                    if (returnTimeNode) returnTimeNode.value = returnTimeMini.value;
                    syncBookingDateTimeLimits();
                    syncCabRoundTripUi(getActiveCabFlow());
                    updateFare();
                    updateBookingExperience();
                    advanceCabLayerIfCurrentComplete('returnTime');
                });
                returnTimeMini.dataset.cabMiniBound = '1';
            }

            if (packageMini && packageMini.dataset.cabMiniBound !== '1') {
                packageMini.addEventListener('change', () => {
                    if (getActiveCabFlow() === 'airport' && isAirportPackageMode()) {
                        syncPackageSelectOptions('airport');
                        updateFare();
                        updateBookingExperience();
                    } else {
                        applyCabPackageValue(packageMini.value);
                    }
                    advanceCabLayerIfCurrentComplete('package');
                });
                packageMini.dataset.cabMiniBound = '1';
            }

            setCabBookingMode(getActiveCabFlow(), { syncTripPlan: false, skipFare: true });
            if (getActiveCabFlow() === 'airport') {
                setAirportServiceMode(getAirportServiceMode(), { skipFare: true });
            } else {
                setCabJourneyMode(document.querySelector('input[name="journeyMode"]:checked')?.value || 'one_way', {
                    syncReturnTrip: false,
                    skipFare: true
                });
            }
            syncCabMiniFare(latestFareEstimate || createAwaitingFareEstimate(readFareEstimateInputs()));
        }

        function formatCurrency(amount) {
            return `₹${Math.max(0, Math.round(Number(amount) || 0))}`;
        }

        function parseCurrencyValue(value) {
            const numeric = Number(String(value || '').replace(/[^0-9.-]/g, ''));
            return Number.isFinite(numeric) ? Math.round(numeric) : 0;
        }

        function setPromoStatus(message, type = '') {
            const statusNode = document.getElementById('promoStatus');
            if (!statusNode) return;

            statusNode.textContent = message || '';
            statusNode.classList.remove('success', 'error');
            if (type) {
                statusNode.classList.add(type);
            }
        }

        function applyPromoCode() {
            const promoInput = document.getElementById('promoCode');
            if (!promoInput) return;

            const code = sanitizeInput(promoInput.value).trim().toUpperCase();
            if (!code) {
                appliedPromo = null;
                setPromoStatus('Promo cleared');
                updateFare();
                return;
            }

            const promo = PROMO_OFFERS[code];
            if (!promo) {
                appliedPromo = null;
                setPromoStatus('Invalid promo code. Try RIDE50, SAVE10, AIRPORT100 or GLOBAL15', 'error');
                updateFare();
                return;
            }

            appliedPromo = { code, ...promo };
            setPromoStatus(`Applied ${code}: ${promo.description}`, 'success');
            updateFare();
        }

        function toggleReturnTrip() {
            const toggleNode = document.getElementById('isReturnTrip');
            const fieldsNode = document.getElementById('returnTripFields');
            const returnDateNode = document.getElementById('returnDate');
            const returnTimeNode = document.getElementById('returnTime');
            const rideDateNode = document.getElementById('rideDate');
            const rideTimeNode = document.getElementById('rideTime');

            if (!toggleNode || !fieldsNode || !returnDateNode || !returnTimeNode) return;

            if (toggleNode.checked) {
                fieldsNode.style.display = 'grid';
                returnDateNode.required = true;
                returnTimeNode.required = true;
                const rideDateValue = rideDateNode?.value || '';
                if (rideDateValue) {
                    returnDateNode.min = rideDateValue;
                }
                if (rideDateValue && returnDateNode.value && returnDateNode.value < rideDateValue) {
                    returnDateNode.value = '';
                }
            } else {
                fieldsNode.style.display = 'none';
                returnDateNode.required = false;
                returnTimeNode.required = false;
                returnDateNode.value = '';
                returnTimeNode.value = '';
                returnDateNode.min = '';
            }
            syncCabRoundTripUi(getActiveCabFlow());
        }

        function calculatePromoDiscount(grossTotal, tripPlan, paymentMethod) {
            if (!appliedPromo) return 0;

            if (appliedPromo.tripPlan && appliedPromo.tripPlan !== tripPlan) {
                return 0;
            }

            if (Array.isArray(appliedPromo.paymentMethods) && !appliedPromo.paymentMethods.includes(paymentMethod)) {
                return 0;
            }

            let discount = 0;
            if (appliedPromo.type === 'flat') {
                discount = appliedPromo.value;
            } else if (appliedPromo.type === 'percent') {
                discount = Math.round(grossTotal * (appliedPromo.value / 100));
            }

            if (appliedPromo.max) {
                discount = Math.min(discount, appliedPromo.max);
            }

            return Math.max(0, Math.min(discount, grossTotal));
        }

        const BOOKING_STEP_SHORT_LABELS = {
            'location': 'Location',
            'when': 'When',
            'trip plan & payment': 'Trip & Pay',
            'travel assurance': 'Assurance',
            'ride type *': 'Ride Type',
            'passenger details': 'Passengers',
            'special requests': 'Requests',
            'route add-ons': 'Route',
            'safety & accessibility': 'Safety',
            'additional notes': 'Notes'
        };

        const BOOKING_STEP_KEY_BY_LABEL = {
            'location': 'location',
            'when': 'when',
            'trip plan & payment': 'trip',
            'travel assurance': 'assurance',
            'ride type *': 'ride',
            'passenger details': 'passengers',
            'special requests': 'requests',
            'route add-ons': 'route',
            'safety & accessibility': 'safety',
            'additional notes': 'notes'
        };

        const SERVICE_FOLDER_STEPS = {
            airport: ['assurance', 'trip', 'ride', 'passengers', 'requests', 'safety', 'notes'],
            local: ['assurance', 'trip', 'ride', 'passengers', 'requests', 'safety', 'notes'],
            outstation: ['assurance', 'trip', 'ride', 'passengers', 'requests', 'safety', 'notes'],
            day_trips: ['assurance', 'trip', 'ride', 'passengers', 'requests', 'safety', 'notes']
        };

        const SERVICE_FOLDER_NOTES = {
            airport: {
                location: 'Airport booking ke liye pickup aur airport/drop location fill karein.',
                when: 'Flight ya pickup schedule ke hisaab se future date and time choose karein.',
                trip: 'Airport transfer, payment mode, coupon and required contact number yahin manage hota hai.',
                assurance: 'Flight number, meet-and-greet, wait buffer, GST invoice and cancellation/reschedule preference yahin save hota hai.',
                ride: 'Airport luggage aur comfort ke hisaab se vehicle segment select karein.',
                passengers: 'Passenger and luggage details se fare estimate accurate hota hai.',
                requests: 'Meet and greet, AC, charger, WiFi jaise airport comfort options yahin select karein.',
                safety: 'Live sharing, masked calling, child seat and accessibility options add karein.',
                notes: 'Flight number, terminal, gate, or pickup instruction yahan likh sakte hain.'
            },
            local: {
                location: 'Local cab ke liye pickup aur drop location fill karein.',
                when: 'City ride pickup ke liye future date and time choose karein.',
                trip: 'Local cab service, payment mode, coupon and required contact number yahin manage hota hai.',
                assurance: 'City pickup ke liye driver call, wait buffer, invoice and reschedule/cancel preference set karein.',
                ride: 'City ride ke liye hatchback, sedan, SUV ya premium vehicle choose karein.',
                passengers: 'Passenger and luggage details local cab ke liye set karein.',
                requests: 'City travel comfort options choose karein.',
                safety: 'Live sharing, masked calling and safety preferences add karein.',
                notes: 'Pickup note, waiting instruction ya local route detail yahan likhein.'
            },
            outstation: {
                location: 'Outstation ke liye pickup city aur destination city/location fill karein.',
                when: 'Outstation journey start time future me hona chahiye.',
                trip: 'One way, round trip, budget, payment, coupon and required contact number yahin set hota hai.',
                assurance: 'Outstation trip ke liye wait buffer, invoice, roof carrier, driver call and reschedule/cancel preference set karein.',
                ride: 'Long-route comfort ke liye sedan, SUV, traveller, coach ya premium segment select karein.',
                passengers: 'Passenger count and luggage route planning ke liye important hai.',
                route: 'Outstation me add stops, return route and intermediate city planning yahin rahega.',
                requests: 'Long drive comfort options choose karein.',
                safety: 'Verified driver, live trip share and accessibility options yahin choose karein.',
                notes: 'Highway stop, hotel pickup, waiting, toll preference ya driver instruction yahan likhein.'
            },
            day_trips: {
                location: 'Day plan ke liye pickup city/location fill karein. Drop city optional package flow me handle hota hai.',
                when: 'Day plan start date and time choose karein.',
                trip: 'Day package, city service, payment, coupon and required contact number yahin set hota hai.',
                assurance: 'Day plan me waiting buffer, driver call, GST invoice and reschedule/cancel preference yahin save hota hai.',
                ride: 'City rental ke liye hatchback, sedan, SUV ya premium vehicle choose karein.',
                passengers: 'Passenger and luggage details city package ke liye set karein.',
                route: 'Day plan me multi-stop city route yahin add karein.',
                requests: 'City travel comfort options select karein.',
                safety: 'Live sharing, masked calling and safety preferences add karein.',
                notes: 'Meeting stops, waiting instruction, office route or local sightseeing notes yahan likhein.'
            }
        };

        const SERVICE_FOLDER_PROGRESS = {
            airport: 0,
            local: 0,
            outstation: 0,
            day_trips: 0
        };

        function resetServiceFolderProgress(flow = getActiveCabFlow()) {
            const safeFlow = SERVICE_FOLDER_PROGRESS[flow] === undefined ? 'airport' : flow;
            SERVICE_FOLDER_PROGRESS[safeFlow] = 0;
        }

        function getServiceFolderProgressIndex(flow = getActiveCabFlow(), sections = getServiceVisibleSections(flow)) {
            const safeFlow = SERVICE_FOLDER_PROGRESS[flow] === undefined ? 'airport' : flow;
            const maxIndex = Math.max(0, (Array.isArray(sections) ? sections.length : 0) - 1);
            const current = Number(SERVICE_FOLDER_PROGRESS[safeFlow] || 0);
            return Math.max(0, Math.min(current, maxIndex));
        }

        function setServiceFolderProgressIndex(flow = getActiveCabFlow(), index = 0, sections = getServiceVisibleSections(flow)) {
            const safeFlow = SERVICE_FOLDER_PROGRESS[flow] === undefined ? 'airport' : flow;
            const maxIndex = Math.max(0, (Array.isArray(sections) ? sections.length : 0) - 1);
            SERVICE_FOLDER_PROGRESS[safeFlow] = Math.max(0, Math.min(Number(index || 0), maxIndex));
            return SERVICE_FOLDER_PROGRESS[safeFlow];
        }

        function getCompactAccordionLabel(label) {
            const key = normalizeAccordionLabel(label)
                .toLowerCase()
                .replace(/\s+/g, ' ')
                .trim();
            return BOOKING_STEP_SHORT_LABELS[key] || label;
        }

        function getSectionStepKey(section) {
            const title = normalizeAccordionLabel(section?.dataset?.sectionTitle || '', '')
                .toLowerCase()
                .replace(/\s+/g, ' ')
                .trim();
            return BOOKING_STEP_KEY_BY_LABEL[title] || section?.dataset?.stepKey || '';
        }

        function getServiceStepKeys(flow = getActiveCabFlow()) {
            return SERVICE_FOLDER_STEPS[flow] || SERVICE_FOLDER_STEPS.airport;
        }

        function getAllAccordionSections() {
            return Array.from(document.querySelectorAll('#bookingForm > .form-section.pro-collapsible'));
        }

        function getServiceVisibleSections(flow = getActiveCabFlow()) {
            const stepKeys = getServiceStepKeys(flow);
            const allowed = new Set(stepKeys);
            const stepOrder = new Map(stepKeys.map((key, index) => [key, index]));
            return getAllAccordionSections()
                .filter((section) => allowed.has(section.dataset.stepKey || getSectionStepKey(section)))
                .sort((a, b) => {
                    const aKey = a.dataset.stepKey || getSectionStepKey(a);
                    const bKey = b.dataset.stepKey || getSectionStepKey(b);
                    return (stepOrder.get(aKey) ?? 999) - (stepOrder.get(bKey) ?? 999);
                });
        }

        function isBookingStepComplete(stepKey, flow = getActiveCabFlow()) {
            const hasValue = (id) => String(document.getElementById(id)?.value || '').trim().length > 0;
            if (stepKey === 'location') {
                if (flow === 'day_trips') return hasValue('pickup');
                return hasValue('pickup') && hasValue('dropoff');
            }
            if (stepKey === 'when') return hasValue('rideDate') && hasValue('rideTime');
            if (stepKey === 'trip') return hasValue('tripPlan') && hasValue('paymentMethod');
            if (stepKey === 'ride') return Boolean(document.querySelector('input[name="rideType"]:checked')) && hasValue('vehicleModel');
            if (stepKey === 'passengers') return hasValue('passengers') && hasValue('luggage');
            return true;
        }

        function getUnlockedServiceStepIndex(sections, flow = getActiveCabFlow()) {
            if (!sections.length) return -1;
            const firstIncomplete = sections.findIndex((section) => !isBookingStepComplete(section.dataset.stepKey, flow));
            if (firstIncomplete === -1) return sections.length - 1;
            return Math.min(sections.length - 1, firstIncomplete);
        }

        function ensureServiceFolderNote(section, flow = getActiveCabFlow()) {
            if (!section) return;
            const body = section.querySelector(':scope > .form-section-body');
            if (!body) return;
            let note = body.querySelector(':scope > .service-folder-note');
            if (!note) {
                note = document.createElement('div');
                note.className = 'service-folder-note';
                note.innerHTML = '<i class="fas fa-folder-open"></i><span></span>';
                body.insertBefore(note, body.firstChild);
            }
            const noteText = SERVICE_FOLDER_NOTES[flow]?.[section.dataset.stepKey] || 'Is folder ko complete karke next step par jaayein.';
            const textNode = note.querySelector('span');
            if (textNode) textNode.textContent = noteText;
        }

        function ensureServiceFolderActions(section) {
            if (!section) return;
            const body = section.querySelector(':scope > .form-section-body');
            if (!body || body.querySelector(':scope > .service-folder-actions')) return;
            const actions = document.createElement('div');
            actions.className = 'service-folder-actions';
            actions.innerHTML = `
                <button type="button" class="service-folder-prev"><i class="fas fa-arrow-left"></i> Back</button>
                <button type="button" class="service-folder-next">Continue <i class="fas fa-arrow-right"></i></button>
            `;
            body.appendChild(actions);
            actions.querySelector('.service-folder-prev')?.addEventListener('click', () => moveServiceFolder(section, -1));
            actions.querySelector('.service-folder-next')?.addEventListener('click', () => moveServiceFolder(section, 1));
        }

        function moveServiceFolder(currentSection, direction) {
            const flow = getActiveCabFlow();
            const sections = getServiceVisibleSections(flow);
            const currentIndex = sections.indexOf(currentSection);
            if (currentIndex === -1) return;

            const nextIndex = currentIndex + direction;
            if (nextIndex < 0) return;
            if (nextIndex >= sections.length) {
                document.querySelector('.summary-section')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
                return;
            }

            const currentProgress = getServiceFolderProgressIndex(flow, sections);
            if (direction > 0 && nextIndex > currentProgress) {
                setServiceFolderProgressIndex(flow, nextIndex, sections);
            }

            const targetIndex = direction > 0
                ? Math.max(nextIndex, getServiceFolderProgressIndex(flow, sections))
                : nextIndex;
            setActiveAccordionSection(sections, sections[Math.max(0, Math.min(targetIndex, sections.length - 1))]);
            syncServiceFolderVisibility(flow);
        }

        function setSectionExpanded(section, expanded) {
            if (!section) return;
            section.classList.toggle('is-collapsed', !expanded);
            const trigger = section.querySelector(':scope > .section-toggle-btn');
            if (trigger) {
                trigger.setAttribute('aria-expanded', expanded ? 'true' : 'false');
            }
        }

        function normalizeAccordionLabel(value, fallback = 'Section') {
            const text = String(value || '').replace(/\s+/g, ' ').trim();
            return text || fallback;
        }

        function syncAccordionSelectorState(activeSection) {
            return;
        }

        function setActiveAccordionSection(sections, activeSection) {
            if (!Array.isArray(sections) || !sections.length || !activeSection) return;
            sections.forEach((section) => {
                const isVisible = !section.classList.contains('is-service-hidden');
                setSectionExpanded(section, isVisible && section === activeSection);
            });
            syncAccordionSelectorState(activeSection);
        }

        function revealBookingField(fieldId) {
            const field = document.getElementById(fieldId);
            if (!field) return;

            const drawer = document.getElementById('advancedBookingDrawer');
            if (document.body) {
                document.body.classList.add('booking-advanced-ready');
            }
            if (drawer) drawer.open = true;

            const section = field.closest('.form-section.pro-collapsible');
            if (section) {
                const flow = getActiveCabFlow();
                const sections = getServiceVisibleSections(flow);
                const sectionIndex = sections.indexOf(section);
                if (sectionIndex >= 0) {
                    setServiceFolderProgressIndex(flow, sectionIndex, sections);
                }
                if (!section.classList.contains('is-service-hidden')) {
                    setActiveAccordionSection(sections, section);
                }
            }

            window.setTimeout(() => {
                if (typeof field.focus === 'function') {
                    field.focus({ preventScroll: true });
                }
            }, 60);
        }

        function ensureAccordionSelector(sections) {
            const selector = document.getElementById('bookingSectionSelector');
            if (selector) selector.remove();
        }

        function syncServiceFolderVisibility(flow = getActiveCabFlow()) {
            const allSections = getAllAccordionSections();
            if (!allSections.length) return;

            const allowedSteps = new Set(getServiceStepKeys(flow));
            allSections.forEach((section) => {
                const stepKey = section.dataset.stepKey || getSectionStepKey(section);
                const isAllowed = allowedSteps.has(stepKey);
                section.classList.toggle('is-service-hidden', !isAllowed);
                if (!isAllowed) {
                    setSectionExpanded(section, false);
                }
            });

            const visibleSections = getServiceVisibleSections(flow);
            if (!visibleSections.length) return;
            ensureAccordionSelector(visibleSections);

            const unlockedIndex = getServiceFolderProgressIndex(flow, visibleSections);
            let activeSection = visibleSections.find((section) => !section.classList.contains('is-collapsed'));
            const activeIndex = visibleSections.indexOf(activeSection);
            if (!activeSection || activeIndex === -1 || activeIndex > unlockedIndex) {
                activeSection = visibleSections[Math.min(unlockedIndex, visibleSections.length - 1)];
            }

            visibleSections.forEach((section) => {
                section.classList.toggle('is-step-hidden', section !== activeSection);
            });

            visibleSections.forEach((section, index) => {
                const stepComplete = isBookingStepComplete(section.dataset.stepKey, flow);
                const isLocked = index > unlockedIndex;
                section.classList.toggle('is-step-locked', isLocked);
                section.dataset.serviceUnlocked = isLocked ? '0' : '1';
                section.dataset.serviceComplete = stepComplete ? '1' : '0';
                ensureServiceFolderNote(section, flow);
                ensureServiceFolderActions(section);

                const prevButton = section.querySelector('.service-folder-prev');
                const nextButton = section.querySelector('.service-folder-next');
                if (prevButton) prevButton.disabled = index === 0;
                if (nextButton) {
                    nextButton.disabled = isLocked;
                    nextButton.innerHTML = index === visibleSections.length - 1
                        ? 'Review Fare <i class="fas fa-receipt"></i>'
                        : 'Continue <i class="fas fa-arrow-right"></i>';
                }
            });

            setActiveAccordionSection(visibleSections, activeSection);
        }

        function initFormAccordion() {
            const sections = Array.from(document.querySelectorAll('#bookingForm > .form-section'));
            if (!sections.length) return;
            sections.forEach((section, index) => {
                const sectionId = section.id || `booking-step-${index + 1}`;
                if (!section.id) section.id = sectionId;
                section.dataset.sectionId = section.id;

                if (section.dataset.proAccordionInit === '1') {
                    if (!section.dataset.sectionTitle) {
                        const existingLabel = section.querySelector(':scope > .section-toggle-btn span');
                        section.dataset.sectionTitle = normalizeAccordionLabel(existingLabel?.textContent, `Step ${index + 1}`);
                        section.dataset.stepKey = getSectionStepKey(section);
                    }
                    return;
                }

                const heading = section.querySelector(':scope > h3');
                if (!heading) return;
                section.dataset.sectionTitle = normalizeAccordionLabel(heading.textContent, `Step ${index + 1}`);
                section.dataset.stepKey = getSectionStepKey(section);

                const body = document.createElement('div');
                body.className = 'form-section-body';

                const children = Array.from(section.children);
                let move = false;
                children.forEach((node) => {
                    if (node === heading) {
                        move = true;
                        return;
                    }
                    if (move) {
                        body.appendChild(node);
                    }
                });

                const trigger = document.createElement('button');
                trigger.type = 'button';
                trigger.className = 'section-toggle-btn';
                trigger.innerHTML = `<span>${heading.innerHTML}</span><i class="fas fa-chevron-down"></i>`;

                section.classList.add('pro-collapsible');
                section.insertBefore(trigger, section.firstChild);
                section.appendChild(body);
                heading.remove();

                const shouldOpen = index === 0;
                setSectionExpanded(section, shouldOpen);

                trigger.addEventListener('click', () => {
                    if (section.classList.contains('is-step-locked')) return;
                    setActiveAccordionSection(getServiceVisibleSections(), section);
                    syncServiceFolderVisibility(getActiveCabFlow());
                });

                section.dataset.proAccordionInit = '1';
            });

            syncServiceFolderVisibility(getActiveCabFlow());

            const form = document.getElementById('bookingForm');
            if (form && !form.dataset.proFocusBound) {
                form.addEventListener('focusin', (event) => {
                    const isToggleTrigger = event.target && event.target.closest && event.target.closest('.section-toggle-btn');
                    if (isToggleTrigger) return;
                    const hostSection = event.target.closest('.form-section.pro-collapsible');
                    if (hostSection && !hostSection.classList.contains('is-service-hidden') && !hostSection.classList.contains('is-step-locked') && hostSection.classList.contains('is-collapsed')) {
                        setActiveAccordionSection(getServiceVisibleSections(), hostSection);
                    } else if (hostSection) {
                        syncAccordionSelectorState(hostSection);
                    }
                });
                form.dataset.proFocusBound = '1';
            }
        }

        function initTripFlowControls() {
            const pillHost = document.getElementById('tripFlowPills');
            const hiddenNode = document.getElementById('tripFlow');
            if (!pillHost || !hiddenNode || pillHost.dataset.bound === '1') return;

            pillHost.addEventListener('click', (event) => {
                const target = event.target.closest('.trip-flow-pill');
                if (!target) return;

                setCabBookingMode(target.dataset.flow || 'airport');
            });

            pillHost.dataset.bound = '1';
        }

        function updateFormProgress() {
            const trackers = [
                () => String(document.getElementById('pickup')?.value || '').trim().length > 2,
                () => String(document.getElementById('dropoff')?.value || '').trim().length > 2,
                () => Boolean(document.getElementById('rideDate')?.value),
                () => Boolean(document.getElementById('rideTime')?.value),
                () => Boolean(document.querySelector('input[name=\"rideType\"]:checked')),
                () => Boolean(document.getElementById('vehicleModel')?.value),
                () => Boolean(document.getElementById('tripPlan')?.value),
                () => Boolean(document.getElementById('paymentMethod')?.value),
                () => Boolean(document.getElementById('passengers')?.value),
                () => Boolean(document.getElementById('luggage')?.value)
            ];

            const completed = trackers.reduce((acc, test) => acc + (test() ? 1 : 0), 0);
            const percent = Math.max(8, Math.round((completed / trackers.length) * 100));

            const fillNode = document.getElementById('bookingProgressFill');
            const textNode = document.getElementById('bookingProgressText');
            if (fillNode) fillNode.style.width = `${percent}%`;
            if (textNode) textNode.textContent = `${percent}% complete`;
        }

        function updateBookingExperience() {
            const currentFlow = getActiveCabFlow();
            const flowConfig = getCabFlowConfig(currentFlow);
            const chipsNode = document.getElementById('bookingContextChips');
            if (chipsNode) {
                const journeyMode = String(document.querySelector('input[name=\"journeyMode\"]:checked')?.value || 'one_way')
                    .replace(/_/g, ' ')
                    .replace(/\b\w/g, (char) => char.toUpperCase());
                const modelNode = document.getElementById('vehicleModel');
                const selectedModel = modelNode ? modelNode.options[modelNode.selectedIndex]?.text : '';
                const fuelNode = document.getElementById('vehicleFuelPreference');
                const selectedFuel = fuelNode ? fuelNode.options[fuelNode.selectedIndex]?.text : '';
                const budget = Number.parseFloat(document.getElementById('budgetAmount')?.value || 0);

                const items = [
                    `<span class=\"context-chip\"><i class=\"fas fa-route\"></i> ${flowConfig.shortLabel}</span>`,
                    `<span class=\"context-chip\"><i class=\"fas fa-map-signs\"></i> ${journeyMode}</span>`
                ];

                if (selectedModel) {
                    items.push(`<span class=\"context-chip\"><i class=\"fas fa-car-side\"></i> ${selectedModel}</span>`);
                }

                if (selectedFuel && fuelNode?.value && fuelNode.value !== 'no_preference') {
                    items.push(`<span class=\"context-chip\"><i class=\"fas fa-gas-pump\"></i> ${selectedFuel}</span>`);
                }

                if (budget > 0) {
                    items.push(`<span class=\"context-chip\"><i class=\"fas fa-wallet\"></i> Budget ${formatCurrency(budget)}</span>`);
                }

                chipsNode.innerHTML = items.join('');
            }

            syncCabModeUi(currentFlow);
            updateFormProgress();
            syncServiceFolderVisibility(currentFlow);
            updateRoutePreview();
        }

        function bindProfessionalInputs() {
            const watchIds = [
                'pickup', 'dropoff', 'rideDate', 'rideTime', 'returnDate', 'returnTime',
                'tripPlan', 'paymentMethod', 'tripServiceType', 'budgetAmount',
                'vehicleModel', 'preferredDriverType', 'vehicleFuelPreference', 'passengers', 'luggage',
                'isReturnTrip', 'promoCode'
            ];

            watchIds.forEach((id) => {
                const node = document.getElementById(id);
                if (!node || node.dataset.proBound === '1') return;

                const eventName = (node.tagName === 'INPUT' && String(node.type).toLowerCase() === 'text') || node.tagName === 'TEXTAREA'
                    ? 'input'
                    : 'change';

                node.addEventListener(eventName, updateBookingExperience);
                if (eventName !== 'change') {
                    node.addEventListener('change', updateBookingExperience);
                }
                node.dataset.proBound = '1';
            });

            document.querySelectorAll('input[name="rideType"], input[name="journeyMode"]').forEach((node) => {
                if (node.dataset.proBound === '1') return;
                node.addEventListener('change', updateBookingExperience);
                node.dataset.proBound = '1';
            });
        }

        function initProfessionalBookingUI() {
            initFormAccordion();
            mountAdvancedDrawerInline();
            initTripFlowControls();
            bindProfessionalInputs();
            initInternationalCabBookingUI();
            updateBookingExperience();
            initBookingBackGuard();
            initGoogleMapBookingUI();
        }

        window.addEventListener('load', function() {
            currentUser = checkAuth();
            if (!currentUser) return;
            resolveCurrentCustomerEmail();
            resolveCurrentCustomerPhoneMeta();
            hydrateBookingPhoneVerificationUI();

            seedDefaultBookingDateTime();

            const promoInput = document.getElementById('promoCode');
            if (promoInput) {
                promoInput.addEventListener('keydown', (event) => {
                    if (event.key === 'Enter') {
                        event.preventDefault();
                        applyPromoCode();
                    }
                });
            }

            toggleReturnTrip();
            document.getElementById('rideDate').addEventListener('change', () => {
                syncBookingDateTimeLimits();
                toggleReturnTrip();
                updateFare();
            });
            document.getElementById('rideTime').addEventListener('change', () => {
                syncBookingDateTimeLimits();
                toggleReturnTrip();
                updateFare();
            });
            document.getElementById('returnDate').addEventListener('change', () => {
                syncBookingDateTimeLimits();
                updateFare();
            });
            document.getElementById('returnTime').addEventListener('change', () => {
                syncBookingDateTimeLimits();
                updateFare();
            });
            const bookingForm = document.getElementById('bookingForm');
            if (bookingForm && bookingForm.dataset.submitGuardBound !== '1') {
                const hasInlineSubmitHandler = typeof bookingForm.onsubmit === 'function' || !!bookingForm.getAttribute('onsubmit');
                if (!hasInlineSubmitHandler) {
                    bookingForm.addEventListener('submit', handleBookingFormSubmit);
                }
                bookingForm.dataset.submitGuardBound = '1';
            }

            updateFare();
            updateDistanceEstimate();
            initProfessionalBookingUI();
            warmBookingBackendConnections();
            setTimeout(() => {
                flushAdminEmailRetryQueue({ silent: true });
                if (!adminEmailRetryIntervalRef) {
                    adminEmailRetryIntervalRef = setInterval(() => {
                        flushAdminEmailRetryQueue({ silent: true });
                    }, 25000);
                }
            }, 2500);

            window.addEventListener('online', () => {
                clearAdminEmailCooldown();
                flushAdminEmailRetryQueue({ silent: true });
            });

            document.addEventListener('visibilitychange', () => {
                if (document.visibilityState === 'visible') {
                    flushAdminEmailRetryQueue({ silent: true });
                }
            });
        });
