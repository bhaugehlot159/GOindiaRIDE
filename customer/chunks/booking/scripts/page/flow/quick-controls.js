        function resolveCabQuickLocationValues(options = {}) {
            ['cabQuickPickupInput', 'cabQuickDropoffInput'].forEach((inputId) => {
                const input = document.getElementById(inputId);
                if (input && String(input.value || '').trim()) {
                    resolveBookingLocationInputValue(input, options);
                }
            });
        }

        function commitAndCloseBookingAutocompleteBoxes() {
            resolveCabQuickLocationValues({
                showSuggestions: false,
                useVisibleSuggestion: true
            });
            closeAllBookingAutocompleteBoxes();
        }

        function highlightAirportSuggestionText(text, query) {
            const safeText = escapeBookingHtml(text);
            const normalizedQuery = String(query || '').trim();
            if (!normalizedQuery) return safeText;
            const regex = new RegExp(`(${escapeBookingRegex(normalizedQuery)})`, 'ig');
            return safeText.replace(regex, '<strong>$1</strong>');
        }

        function selectAirportSuggestion(input, airport) {
            const value = formatAirportSuggestion(airport);
            if (!input || !value) return;

            input.value = value;
            input.dataset.cabCommittedSelection = '1';
            delete input.dataset.cabAutoResolvedSource;
            delete input.dataset.cabAutoResolvedValue;
            syncAirportPairedInput(input.id, value);
            closeAirportAutocompleteBoxes();
            input.dispatchEvent(new Event('change', { bubbles: true }));
            updateBookingExperience();
        }

        function getVisibleAirportSuggestion(input) {
            if (!input || !input.id) return null;
            const box = document.getElementById(`${input.id}Autocomplete`);
            const firstItem = box?.querySelector?.('.airport-autocomplete-item');
            const display = sanitizeInput(firstItem?.dataset?.airportDisplay || '').trim();
            if (!display) return null;
            return findExactAirportMatch(display);
        }

        function resolveAirportInputValue(input, options = {}) {
            if (!input || getActiveCabFlow() !== 'airport' || getAirportFieldRole(input.id) !== 'airport') {
                return true;
            }

            const rawValue = String(input.value || '').trim();
            if (!rawValue) return false;

            const contextText = getAirportContextTextForInput(input);
            const visibleAirport = options.useVisibleSuggestion !== false && (contextText || !isBroadAirportQuery(rawValue))
                ? getVisibleAirportSuggestion(input)
                : null;
            const airport = visibleAirport || getResolvableAirport(rawValue, { contextText });
            if (airport) {
                const formatted = formatAirportSuggestion(airport);
                if (formatted && input.value !== formatted) {
                    input.value = formatted;
                    syncAirportPairedInput(input.id, formatted);
                    input.dispatchEvent(new Event('change', { bubbles: true }));
                }
                closeAirportAutocompleteBoxes();
                updateBookingExperience();
                return true;
            }

            if (options.showSuggestions !== false) {
                showAirportAutocomplete(input);
            }
            return false;
        }

        function showAirportAutocomplete(input, queryOverride = '') {
            if (!input || getActiveCabFlow() !== 'airport' || getAirportFieldRole(input.id) !== 'airport') return false;

            const suggestionsBox = getBookingAutocompleteBox(input);
            if (!suggestionsBox) return false;
            suggestionsBox.dataset.airportScoped = '1';
            suggestionsBox.innerHTML = '';

            const query = String(queryOverride || input.value || '').trim();
            if (query.length < 2) {
                suggestionsBox.style.display = 'none';
                return true;
            }

            const matches = searchIndianAirports(query, {
                contextText: getAirportContextTextForInput(input)
            });
            suggestionsBox.style.display = 'block';
            positionBookingAutocompleteBox(input, suggestionsBox);

            const header = document.createElement('div');
            header.className = 'autocomplete-category airport-autocomplete-category';
            header.textContent = 'Indian Airports';
            suggestionsBox.appendChild(header);

            if (!matches.length) {
                const empty = document.createElement('div');
                empty.className = 'autocomplete-no-results';
                empty.textContent = 'No Indian airport found';
                suggestionsBox.appendChild(empty);
                return true;
            }

            matches.forEach((airport, index) => {
                const item = document.createElement('div');
                item.className = 'autocomplete-item airport-autocomplete-item';
                item.dataset.index = String(index);
                item.dataset.airportDisplay = formatAirportSuggestion(airport);
                item.innerHTML = `
                    <span>${highlightAirportSuggestionText(formatAirportSuggestion(airport), query)}</span>
                    <small>${escapeBookingHtml([airport.code, airport.city, airport.state].filter(Boolean).join(' - '))}</small>
                `;
                let selectionHandled = false;
                const selectAirport = (event) => {
                    if (event) event.preventDefault();
                    if (selectionHandled) return;
                    selectionHandled = true;
                    selectAirportSuggestion(input, airport);
                };
                item.addEventListener('pointerdown', selectAirport);
                item.addEventListener('click', selectAirport);
                suggestionsBox.appendChild(item);
            });

            positionBookingAutocompleteBox(input, suggestionsBox);
            return true;
        }

        function bindAirportOnlyAutocomplete(inputId) {
            const input = document.getElementById(inputId);
            if (!input || input.dataset.airportOnlyAutocompleteBound === '1') return;

            input.addEventListener('input', () => {
                if (getActiveCabFlow() === 'airport') {
                    showAirportAutocomplete(input);
                }
            });
            input.addEventListener('focus', () => {
                if (getActiveCabFlow() === 'airport') {
                    showAirportAutocomplete(input);
                }
            });
            input.addEventListener('keydown', (event) => {
                if (getActiveCabFlow() === 'airport' && event.key === 'Escape') {
                    closeAirportAutocompleteBoxes();
                }
            });
            window.addEventListener('resize', () => {
                if (getActiveCabFlow() === 'airport' && document.activeElement === input) {
                    showAirportAutocomplete(input);
                }
            });
            document.addEventListener('scroll', (event) => {
                if (isBookingAutocompleteInternalScroll(event)) return;
                if (getActiveCabFlow() === 'airport' && document.activeElement === input) {
                    const box = document.getElementById(`${input.id}Autocomplete`);
                    if (box?.style.display === 'block') {
                        positionBookingAutocompleteBox(input, box);
                    }
                }
            }, true);

            input.dataset.airportOnlyAutocompleteBound = '1';
        }

        function syncAirportOnlyFieldUi(flow = getActiveCabFlow()) {
            const isAirportFlow = flow === 'airport';
            if (isAirportFlow) closeAirportAutocompleteBoxes();
            const airportConfig = getAirportServiceConfig();
            const terminalRequirement = getAirportTerminalRequirementState();
            const terminalOptionalHint = isAirportFlow && terminalRequirement.hasAirportSelection && !terminalRequirement.required
                ? ' (optional)'
                : '';
            const placeholderMap = {
                cabQuickPickupInput: isAirportFlow ? airportConfig.pickupPlaceholder : 'Pickup city / airport',
                cabQuickDropoffInput: isAirportFlow ? airportConfig.dropPlaceholder : 'Drop city / airport',
                cabQuickTerminalInput: isAirportFlow && terminalRequirement.hasAirportSelection && !terminalRequirement.required
                    ? 'Optional for single-terminal airports'
                    : (isAirportFlow ? airportConfig.terminalPlaceholder : 'Terminal, gate, pillar or pickup point'),
                pickup: isAirportFlow ? airportConfig.pickupPlaceholder : 'Where are you? (Enter address or landmark)',
                dropoff: isAirportFlow ? airportConfig.dropPlaceholder : 'Where to? (Enter address or landmark)'
            };

            Object.keys(placeholderMap).forEach((inputId) => {
                const input = document.getElementById(inputId);
                if (input) input.placeholder = placeholderMap[inputId];
            });

            const quickPickupLabel = document.getElementById('cabQuickPickupInput')?.closest('.cab-mini-field')?.querySelector('span');
            const quickDropoffLabel = document.getElementById('cabQuickDropoffInput')?.closest('.cab-mini-field')?.querySelector('span');
            const quickTerminalLabel = document.getElementById('cabQuickTerminalInput')?.closest('.cab-mini-field')?.querySelector('span');
            if (quickPickupLabel) quickPickupLabel.textContent = isAirportFlow ? airportConfig.pickupLabel : 'From';
            if (quickDropoffLabel) quickDropoffLabel.textContent = isAirportFlow ? airportConfig.dropLabel : 'To';
            if (quickTerminalLabel) quickTerminalLabel.textContent = isAirportFlow ? `${airportConfig.terminalLabel}${terminalOptionalHint}` : 'Terminal / Gate';
            const terminalInput = document.getElementById('cabQuickTerminalInput');
            if (terminalInput) {
                const terminalIsRequired = isAirportFlow && terminalRequirement.required;
                terminalInput.required = false;
                terminalInput.dataset.cabTerminalRequired = terminalIsRequired ? '1' : '0';
                terminalInput.setAttribute('aria-required', terminalIsRequired ? 'true' : 'false');
            }

            const pickupLabel = document.querySelector('label[for="pickup"]');
            const dropLabel = document.querySelector('label[for="dropoff"]');
            if (pickupLabel) pickupLabel.textContent = isAirportFlow ? `${airportConfig.pickupLabel} *` : 'Pickup Location *';
            if (dropLabel) dropLabel.textContent = isAirportFlow ? `${airportConfig.dropLabel} *` : 'Dropoff Location *';

            const airportScopeNote = document.getElementById('cabAirportScopeNote');
            if (airportScopeNote && isAirportFlow) {
                const chipIcons = ['fa-plane-arrival', 'fa-clock', 'fa-id-card', 'fa-suitcase-rolling'];
                airportScopeNote.innerHTML = (airportConfig.chips || ['Airport transfer', 'Flight ready', 'Driver details', 'Luggage fit'])
                    .slice(0, 4)
                    .map((chip, index) => `<span><i class="fas ${chipIcons[index] || 'fa-circle-check'}"></i> ${escapeBookingHtml(chip)}</span>`)
                    .join('');
            }

            const notesNode = document.getElementById('notes');
            if (notesNode) {
                notesNode.placeholder = isAirportFlow
                    ? `${airportConfig.label}: flight number, terminal, gate, pickup signboard, waiting or delay note`
                    : 'E.g., Driver will wait for 5 mins, etc.';
            }

            if (!isAirportFlow) closeAirportAutocompleteBoxes();
        }

        function resolveScopedSelectLabel(selectId, option, flow = getActiveCabFlow()) {
            if (!option) return '';
            if (!option.dataset.baseLabel) {
                option.dataset.baseLabel = String(option.textContent || '').trim();
            }

            const baseLabel = option.dataset.baseLabel || '';
            const value = String(option.value || '');
            if (selectId !== 'tripServiceType') return baseLabel;

            if (flow === 'outstation' && value === 'round_trip_service') return 'Outstation Intercity';
            if (flow === 'day_trips' && value === 'city_local_trip') return 'Day Plan Service';
            if (flow === 'airport' && value === 'airport_transfer') return 'Airport Transfer';
            if (flow === 'airport' && value === 'railway_station_transfer') return 'Railway Station Transfer';
            return baseLabel;
        }

        function applyScopedSelectVisibility(selectNode, allowedValues = [], preferredValue = '', flow = getActiveCabFlow()) {
            if (!selectNode) return;
            const allowList = Array.isArray(allowedValues) ? allowedValues.filter(Boolean).map((value) => String(value)) : [];
            const options = Array.from(selectNode.options);
            if (!options.length) return;

            const safeAllowList = allowList.length ? allowList : [String(preferredValue || options[0].value || '')];
            const allowSet = new Set(safeAllowList);

            options.forEach((option) => {
                option.textContent = resolveScopedSelectLabel(selectNode.id, option, flow);
                const visible = allowSet.has(String(option.value));
                option.hidden = !visible;
                option.disabled = !visible;
            });

            const fallbackValue = safeAllowList.find((value) => options.some((option) => String(option.value) === String(value))) || String(options[0].value || '');
            if (!allowSet.has(String(selectNode.value || ''))) {
                selectNode.value = fallbackValue;
            }

            const isSingle = allowSet.size <= 1;
            selectNode.disabled = isSingle;
            selectNode.classList.toggle('is-flow-scoped-single', isSingle);
            return {
                isSingle,
                visibleCount: allowSet.size
            };
        }

        function syncInlineFieldRow(selectNode, visibleCount) {
            if (!selectNode) return;
            const formGroup = selectNode.closest('.form-group');
            const row = formGroup?.parentElement;
            if (!formGroup || !row) return;

            const shouldHide = formGroup.classList.contains('booking-internal-field') || Number(visibleCount || 0) <= 1;
            formGroup.style.display = shouldHide ? 'none' : '';
            formGroup.hidden = shouldHide;
            formGroup.setAttribute('aria-hidden', shouldHide ? 'true' : 'false');

            const siblingGroups = Array.from(row.children).filter((node) => node.classList && node.classList.contains('form-group'));
            const visibleGroups = siblingGroups.filter((node) => node.style.display !== 'none' && !node.hidden);
            row.style.gridTemplateColumns = visibleGroups.length <= 1 ? '1fr' : '';
        }

        function syncCabScopedSelectOptions(flow = getActiveCabFlow()) {
            const activeFlow = CAB_FLOW_CONFIG[flow] ? flow : 'airport';
            const config = getCabFlowConfig(activeFlow);
            const tripPlanNode = document.getElementById('tripPlan');
            const serviceTypeNode = document.getElementById('tripServiceType');

            const tripPlanScopedState = applyScopedSelectVisibility(
                tripPlanNode,
                CAB_FLOW_TRIP_PLAN_OPTIONS[activeFlow] || CAB_FLOW_TRIP_PLAN_OPTIONS.airport,
                config.tripPlan,
                activeFlow
            );
            const serviceTypeScopedState = applyScopedSelectVisibility(
                serviceTypeNode,
                CAB_FLOW_SERVICE_TYPE_OPTIONS[activeFlow] || CAB_FLOW_SERVICE_TYPE_OPTIONS.airport,
                config.serviceType,
                activeFlow
            );
            syncInlineFieldRow(tripPlanNode, tripPlanScopedState?.visibleCount || 0);
            syncInlineFieldRow(serviceTypeNode, serviceTypeScopedState?.visibleCount || 0);
        }

        function mountAdvancedDrawerInline() {
            const drawer = document.getElementById('advancedBookingDrawer');
            const main = document.querySelector('#cabBookingConsole .cab-console-main');
            const actions = main?.querySelector(':scope > .cab-console-actions');
            if (!drawer || !main || drawer.dataset.inlineMounted === '1') return;

            drawer.classList.add('is-inline-flow');
            if (actions && actions.parentNode === main) {
                actions.insertAdjacentElement('afterend', drawer);
            } else {
                main.appendChild(drawer);
            }
            drawer.dataset.inlineMounted = '1';
        }

        function syncCabStageLayout() {
            const main = document.querySelector('#cabBookingConsole .cab-console-main');
            const drawer = document.getElementById('advancedBookingDrawer');
            const actions = main?.querySelector(':scope > .cab-console-actions');
            const quickForm = main?.querySelector(':scope > .cab-mini-form');
            const routeAddons = main?.querySelector(':scope > .cab-route-addons');
            if (!main || !drawer || !actions || !quickForm) return;

            const advancedReady = Boolean(document.body?.classList.contains('booking-advanced-ready'));
            if (advancedReady) {
                if (actions.previousElementSibling !== drawer) {
                    drawer.insertAdjacentElement('afterend', actions);
                }
            } else {
                const quickFlowAnchor = routeAddons || quickForm;
                if (actions.previousElementSibling !== quickFlowAnchor) {
                    quickFlowAnchor.insertAdjacentElement('afterend', actions);
                }
            }
        }

        function handleCabStepBack() {
            const activeFlow = getActiveCabFlow();
            const advancedReady = Boolean(document.body?.classList.contains('booking-advanced-ready'));

            if (advancedReady) {
                const sections = getServiceVisibleSections(activeFlow);
                if (!sections.length) return false;
                const currentIndex = getServiceFolderProgressIndex(activeFlow, sections);
                if (currentIndex > 0) {
                    setServiceFolderProgressIndex(activeFlow, currentIndex - 1, sections);
                    openNextAdvancedBookingStep();
                    return true;
                }

                if (document.body) {
                    document.body.classList.remove('booking-advanced-ready');
                }
                const layers = buildCabQuickLayers(activeFlow);
                if (layers.length) {
                    cabLayerManualIndex = layers.length - 1;
                    cabLayerUnlockedIndex = layers.length - 1;
                }
                syncCabLayerFlow(activeFlow);
                syncCabStageLayout();
                return true;
            }

            const layers = buildCabQuickLayers(activeFlow);
            if (!layers.length) return false;
            if (cabLayerFlowSnapshot !== activeFlow) {
                resetCabLayerProgress(activeFlow);
            }

            const currentIndex = Number.isInteger(cabLayerManualIndex) ? cabLayerManualIndex : cabLayerUnlockedIndex;
            if (currentIndex <= 0) return false;
            cabLayerManualIndex = currentIndex - 1;
            cabLayerUnlockedIndex = Math.max(cabLayerUnlockedIndex, currentIndex);
            syncCabLayerFlow(activeFlow);
            const previousLayer = layers[cabLayerManualIndex];
            focusCabLayerInput(previousLayer && previousLayer.node, true);
            return true;
        }

        function readSelectedOptionText(selectId, fallback = '') {
            const node = document.getElementById(selectId);
            if (!node) return fallback;
            return node.options[node.selectedIndex]?.text || fallback;
        }

        function setQuickControlValue(id, value) {
            const node = document.getElementById(id);
            if (!node || document.activeElement === node) return;
            node.value = value || '';
        }

        function resolveCabPackageValue(flow = getActiveCabFlow()) {
            const journeyMode = document.querySelector('input[name="journeyMode"]:checked')?.value || 'one_way';
            if (flow === 'day_trips') {
                const currentPackage = document.getElementById('cabQuickPackageSelect')?.value || '';
                return CAB_DAY_PLAN_PACKAGE_VALUES.includes(currentPackage)
                    ? currentPackage
                    : (CAB_DAY_PLAN_PACKAGE_OPTIONS[0]?.value || '');
            }
            if (flow === 'outstation') return journeyMode === 'round_trip' ? 'outstation_round' : 'outstation_one_way';
            if (flow === 'airport' && isAirportPackageMode()) {
                const currentPackage = document.getElementById('cabQuickPackageSelect')?.value || '';
                const airportPackageOptions = getAirportPackageOptions();
                const airportPackageValues = airportPackageOptions.map((option) => option.value);
                return airportPackageValues.includes(currentPackage)
                    ? currentPackage
                    : (getAirportServiceConfig().defaultPackage || airportPackageOptions[0]?.value || 'airport');
            }
            return 'airport';
        }

        function applyCabPackageValue(value, options = {}) {
            const packageValue = String(value || 'airport');
            if (getActiveCabFlow() === 'airport' && packageValue.startsWith('airport_')) {
                syncPackageSelectOptions('airport');
                syncCabLayerFlow('airport');
                if (options.skipFare !== true) updateFare();
                else updateBookingExperience();
                return;
            }
            if (CAB_DAY_PLAN_PACKAGE_VALUES.includes(packageValue)) {
                if (getActiveCabFlow() !== 'day_trips') {
                    setCabBookingMode('day_trips', { skipFare: true });
                } else {
                    syncCabScopedSelectOptions('day_trips');
                    syncCabLayerFlow('day_trips');
                }
            } else if (packageValue === 'outstation_round') {
                setCabBookingMode('outstation', { skipFare: true });
                setCabJourneyMode('round_trip', { skipFare: true });
            } else if (packageValue === 'outstation_one_way') {
                setCabBookingMode('outstation', { skipFare: true });
                setCabJourneyMode('one_way', { skipFare: true });
            } else {
                setCabBookingMode('airport', { skipFare: true });
            }

            if (options.skipFare !== true) {
                updateFare();
            } else {
                updateBookingExperience();
            }
        }
