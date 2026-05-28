        function getCabFlowConfig(flow) {
            return CAB_FLOW_CONFIG[flow] || CAB_FLOW_CONFIG.airport;
        }

        function inferCabFlowFromTripPlan(tripPlan) {
            if (tripPlan === 'outstation') return 'outstation';
            if (tripPlan === 'rental') return 'day_trips';
            if (tripPlan === 'city') return 'local';
            return 'airport';
        }

        function getActiveCabFlow() {
            const hiddenValue = document.getElementById('tripFlow')?.value;
            if (hiddenValue && CAB_FLOW_CONFIG[hiddenValue]) return hiddenValue;
            return inferCabFlowFromTripPlan(document.getElementById('tripPlan')?.value || 'airport');
        }

        function setTextIfPresent(id, value) {
            const node = document.getElementById(id);
            if (node) node.textContent = value;
        }

        function getAirportServiceMode() {
            const hiddenNode = document.getElementById('airportServiceMode');
            const hiddenValue = hiddenNode?.value;
            if (hiddenValue && AIRPORT_SERVICE_CONFIG[hiddenValue]) {
                activeAirportServiceMode = hiddenValue;
            }
            return AIRPORT_SERVICE_CONFIG[activeAirportServiceMode] ? activeAirportServiceMode : 'airport_drop';
        }

        function getAirportServiceConfig(mode = getAirportServiceMode()) {
            return AIRPORT_SERVICE_CONFIG[mode] || AIRPORT_SERVICE_CONFIG.airport_drop;
        }

        function isAirportPackageMode(mode = getAirportServiceMode()) {
            return Boolean(getAirportServiceConfig(mode).requiresPackage);
        }

        function isMergedAirportTransferMode(mode = getAirportServiceMode()) {
            return mode === 'airport_to_airport' || mode === 'airport_round';
        }

        function getAirportPackageOptions(mode = getAirportServiceMode()) {
            return mode === 'airport_day' ? AIRPORT_FULL_DAY_PACKAGE_OPTIONS : AIRPORT_HOURLY_PACKAGE_OPTIONS;
        }

        function getAirportFieldRole(inputId, mode = getAirportServiceMode()) {
            const config = getAirportServiceConfig(mode);
            if (inputId === 'pickup' || inputId === 'cabQuickPickupInput') return config.pickupRole || 'place';
            if (inputId === 'dropoff' || inputId === 'cabQuickDropoffInput') return config.dropRole || 'place';
            return 'place';
        }

        const AIRPORT_TERMINAL_REQUIRED_CODES = new Set(['DEL', 'BOM', 'BLR', 'MAA', 'COK']);

        function getAirportSelectionInputIdsForTerminal() {
            return [
                ['cabQuickPickupInput', 'pickup'],
                ['cabQuickDropoffInput', 'dropoff']
            ].flatMap(([quickInputId, formInputId]) => (
                getAirportFieldRole(quickInputId) === 'airport' ? [quickInputId, formInputId] : []
            ));
        }

        function getResolvedAirportFromInput(inputId) {
            const input = document.getElementById(inputId);
            const value = sanitizeInput(input?.value || '').trim();
            if (!input || !value) return null;
            return getResolvableAirport(value, {
                contextText: getAirportContextTextForInput(input)
            });
        }

        function getAirportTerminalRequirementState() {
            if (getActiveCabFlow() !== 'airport') {
                return { required: false, hasAirportSelection: false, airports: [], requiredAirports: [] };
            }

            const seenAirportKeys = new Set();
            const airports = getAirportSelectionInputIdsForTerminal()
                .map(getResolvedAirportFromInput)
                .filter(Boolean)
                .filter((airport) => {
                    const key = String(airport.code || airport.name || '').toUpperCase();
                    if (!key || seenAirportKeys.has(key)) return false;
                    seenAirportKeys.add(key);
                    return true;
                });
            const requiredAirports = airports.filter((airport) => {
                const code = String(airport.code || '').toUpperCase();
                return AIRPORT_TERMINAL_REQUIRED_CODES.has(code);
            });

            return {
                required: requiredAirports.length > 0,
                hasAirportSelection: airports.length > 0,
                airports,
                requiredAirports
            };
        }

        function isAirportTerminalDetailRequired() {
            return getAirportTerminalRequirementState().required;
        }

        function syncPackageSelectOptions(flow = getActiveCabFlow()) {
            const selectNode = document.getElementById('cabQuickPackageSelect');
            if (!selectNode) return;

            const airportMode = getAirportServiceMode();
            const useAirportPackages = flow === 'airport' && isAirportPackageMode(airportMode);
            const sourceOptions = useAirportPackages ? getAirportPackageOptions(airportMode) : CAB_DAY_PLAN_PACKAGE_OPTIONS;
            const desiredKey = useAirportPackages ? `airport:${airportMode}` : 'local';

            if (selectNode.dataset.packageOptionScope !== desiredKey) {
                selectNode.innerHTML = sourceOptions
                    .map((option) => `<option value="${option.value}">${option.label}</option>`)
                    .join('');
                selectNode.dataset.packageOptionScope = desiredKey;
            }

            if (useAirportPackages) {
                const config = getAirportServiceConfig(airportMode);
                const allowed = new Set(sourceOptions.map((option) => option.value));
                if (!allowed.has(selectNode.value)) {
                    selectNode.value = config.defaultPackage || sourceOptions[0]?.value || '';
                }
                return;
            }

            const allowedDayPlan = new Set(CAB_DAY_PLAN_PACKAGE_VALUES);
            if (!allowedDayPlan.has(selectNode.value)) {
                selectNode.value = CAB_DAY_PLAN_PACKAGE_OPTIONS[0]?.value || '';
            }
        }

        function syncAirportServiceChips(mode = getAirportServiceMode()) {
            document.querySelectorAll('[data-airport-service]').forEach((button) => {
                const isTransferGroup = button.dataset.airportServiceGroup === 'airport_transfer';
                const isActive = button.dataset.airportService === mode
                    || (isTransferGroup && isMergedAirportTransferMode(mode));
                button.classList.toggle('is-active', isActive);
                button.setAttribute('aria-pressed', isActive ? 'true' : 'false');
            });
            document.querySelectorAll('[data-airport-transfer-variant]').forEach((button) => {
                const isActive = button.dataset.airportTransferVariant === mode;
                button.classList.toggle('is-active', isActive);
                button.setAttribute('aria-pressed', isActive ? 'true' : 'false');
            });
        }

        function setAirportServiceMode(mode, options = {}) {
            const previousMode = getAirportServiceMode();
            const safeMode = AIRPORT_SERVICE_CONFIG[mode] ? mode : 'airport_drop';
            const config = getAirportServiceConfig(safeMode);
            const modeChanged = previousMode !== safeMode;
            activeAirportServiceMode = safeMode;
            const hiddenNode = document.getElementById('airportServiceMode');
            if (hiddenNode) hiddenNode.value = safeMode;

            syncAirportServiceChips(safeMode);
            const isAirportFlow = getActiveCabFlow() === 'airport';
            document.getElementById('cabBookingConsole')?.classList.toggle('is-airport-transfer', isAirportFlow && isMergedAirportTransferMode(safeMode));
            if (!isAirportFlow) return;

            if (modeChanged && options.preserveFields !== true) {
                ['pickup', 'dropoff', 'cabQuickPickupInput', 'cabQuickDropoffInput', 'cabQuickTerminalInput', 'returnDate', 'returnTime', 'cabQuickReturnDateInput', 'cabQuickReturnTimeInput']
                    .forEach((inputId) => {
                        const input = document.getElementById(inputId);
                        if (input) input.value = '';
                    });
                getRouteStopInputs().forEach((input) => {
                    input.value = '';
                });
                updateRouteStopLabels();
            }

            setCabJourneyMode(config.journeyMode || 'one_way', {
                syncReturnTrip: true,
                skipFare: true
            });
            syncPackageSelectOptions('airport');
            if (modeChanged && config.requiresPackage && config.defaultPackage) {
                const packageSelect = document.getElementById('cabQuickPackageSelect');
                if (packageSelect) packageSelect.value = config.defaultPackage;
            }
            syncAirportOnlyFieldUi('airport');
            resetCabLayerProgress('airport');
            syncCabRoundTripUi('airport');
            syncCabLayerFlow('airport');
            if (options.skipFare !== true) updateFare();
            else updateBookingExperience();
        }

        function normalizeAirportSearchText(value) {
            return String(value || '')
                .toLowerCase()
                .replace(/[^a-z0-9]+/g, ' ')
                .replace(/\s+/g, ' ')
                .trim();
        }

        function escapeBookingHtml(value) {
            return String(value || '').replace(/[&<>"']/g, (character) => ({
                '&': '&amp;',
                '<': '&lt;',
                '>': '&gt;',
                '"': '&quot;',
                "'": '&#39;'
            }[character]));
        }

        function escapeBookingRegex(value) {
            return String(value || '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        }

        function formatAirportSuggestion(airport) {
            if (!airport) return '';
            const code = airport.code ? ` (${airport.code})` : '';
            return `${airport.name}${code}, ${airport.city}, ${airport.state}`;
        }

        function getAirportSearchScore(airport, normalizedQuery) {
            const code = normalizeAirportSearchText(airport.code);
            const name = normalizeAirportSearchText(airport.name);
            const city = normalizeAirportSearchText(airport.city);
            const state = normalizeAirportSearchText(airport.state);
            const formatted = normalizeAirportSearchText(formatAirportSuggestion(airport));
            const aliases = Array.isArray(airport.aliases)
                ? airport.aliases.map(normalizeAirportSearchText)
                : [];
            const haystack = [formatted, code, name, city, state, ...aliases].filter(Boolean).join(' ');

            if (!normalizedQuery) return null;
            if (code && code === normalizedQuery) return 0;
            if (formatted.startsWith(normalizedQuery)) return 1;
            if (city.startsWith(normalizedQuery)) return 1;
            if (name.startsWith(normalizedQuery)) return 2;
            if (aliases.some((alias) => alias.startsWith(normalizedQuery))) return 3;
            if (state.startsWith(normalizedQuery)) return 4;
            if (haystack.includes(normalizedQuery)) return 5;
            const queryTokens = normalizedQuery.split(' ').filter(Boolean);
            const haystackTokens = haystack.split(' ').filter(Boolean);
            const allTokensResolvable = queryTokens.every((token, index) => {
                if (index === queryTokens.length - 1) {
                    return haystackTokens.some((part) => part.startsWith(token));
                }
                return haystackTokens.includes(token);
            });
            if (allTokensResolvable) return 6;
            return null;
        }

        function getAirportInputPairId(inputId) {
            return {
                pickup: 'dropoff',
                dropoff: 'pickup',
                cabQuickPickupInput: 'cabQuickDropoffInput',
                cabQuickDropoffInput: 'cabQuickPickupInput'
            }[inputId] || '';
        }

        function getAirportContextTextForInput(input) {
            if (!input || !input.id) return '';
            const pairedInputId = getAirportInputPairId(input.id);
            const pairedInput = pairedInputId ? document.getElementById(pairedInputId) : null;
            if (!pairedInput || getAirportFieldRole(pairedInputId) === 'airport') return '';
            return sanitizeInput(pairedInput.value || '').trim();
        }

        function getMeaningfulAirportTokens(value) {
            const ignoredTokens = new Set(['a', 'an', 'and', 'at', 'by', 'for', 'from', 'in', 'india', 'indian', 'of', 'the', 'to']);
            return normalizeAirportSearchText(value)
                .split(' ')
                .filter((token) => token.length > 1 && !ignoredTokens.has(token));
        }

        function getAirportContextScore(airport, contextText) {
            const normalizedContext = normalizeAirportSearchText(contextText);
            if (!normalizedContext) return 0;

            const city = normalizeAirportSearchText(airport.city);
            const state = normalizeAirportSearchText(airport.state);
            const name = normalizeAirportSearchText(airport.name);
            const aliases = Array.isArray(airport.aliases)
                ? airport.aliases.map(normalizeAirportSearchText)
                : [];
            const airportTokens = getMeaningfulAirportTokens([
                city,
                state,
                name,
                airport.code,
                ...aliases
            ].join(' '));
            const contextTokens = getMeaningfulAirportTokens(normalizedContext);
            const contextHasCity = Boolean(city && (normalizedContext.includes(city) || city.includes(normalizedContext)));
            const contextHasState = Boolean(state && normalizedContext.includes(state));
            const cityTokenOverlap = getMeaningfulAirportTokens(city).some((token) => contextTokens.includes(token));
            const aliasTokenOverlap = aliases.some((alias) => {
                const aliasTokens = getMeaningfulAirportTokens(alias);
                return aliasTokens.some((token) => contextTokens.includes(token));
            });
            const nameTokenOverlap = getMeaningfulAirportTokens(name).some((token) => contextTokens.includes(token));
            const airportTokenOverlap = airportTokens.some((token) => contextTokens.includes(token));

            if (contextHasCity) return 100;
            if (cityTokenOverlap) return 90;
            if (aliasTokenOverlap) return 80;
            if (nameTokenOverlap) return 70;
            if (airportTokenOverlap && contextTokens.length > 1) return 40;
            if (contextHasState) return 10;
            return 0;
        }

        function isBroadAirportQuery(value) {
            const tokens = getMeaningfulAirportTokens(value);
            if (tokens.length !== 1) return false;
            return new Set(['airport', 'airports', 'domestic', 'international', 'rajasthan', 'terminal']).has(tokens[0]);
        }

        function getRankedAirportMatches(query, options = {}) {
            const normalizedQuery = normalizeAirportSearchText(query);
            if (normalizedQuery.length < 2) return [];

            const contextText = sanitizeInput(options.contextText || '').trim();
            return INDIA_AIRPORT_SUGGESTIONS
                .map((airport) => ({
                    airport,
                    score: getAirportSearchScore(airport, normalizedQuery),
                    contextScore: getAirportContextScore(airport, contextText)
                }))
                .filter((entry) => entry.score !== null)
                .sort((a, b) => {
                    if (a.contextScore !== b.contextScore) return b.contextScore - a.contextScore;
                    if (a.score !== b.score) return a.score - b.score;
                    return formatAirportSuggestion(a.airport).localeCompare(formatAirportSuggestion(b.airport));
                })
                .slice(0, 18);
        }

        function searchIndianAirports(query, options = {}) {
            return getRankedAirportMatches(query, options).map((entry) => entry.airport);
        }

        function findExactAirportMatch(value) {
            const normalizedValue = normalizeAirportSearchText(value);
            if (!normalizedValue) return null;

            return INDIA_AIRPORT_SUGGESTIONS.find((airport) => {
                const candidates = [
                    formatAirportSuggestion(airport),
                    airport.name,
                    airport.city,
                    airport.code,
                    ...((Array.isArray(airport.aliases) && airport.aliases) || [])
                ].map(normalizeAirportSearchText).filter(Boolean);

                return candidates.includes(normalizedValue);
            }) || null;
        }

        function getResolvableAirport(value, options = {}) {
            const exactMatch = findExactAirportMatch(value);
            if (exactMatch) return exactMatch;
            const matches = getRankedAirportMatches(value, options);
            if (!matches.length) return null;
            const [bestMatch, secondMatch] = matches;
            if (bestMatch.contextScore > 0 && (!secondMatch || bestMatch.contextScore > secondMatch.contextScore)) {
                return bestMatch.airport;
            }
            if (bestMatch.score <= 3 && (!secondMatch || bestMatch.score < secondMatch.score)) {
                return bestMatch.airport;
            }
            return matches.length === 1 ? matches[0].airport : null;
        }

        function isAirportTextResolvable(value, options = {}) {
            return Boolean(getResolvableAirport(value, options));
        }

        function getBookingAutocompleteBox(input) {
            if (!input || !input.id) return null;
            const existing = document.getElementById(`${input.id}Autocomplete`);
            if (existing) return existing;

            const suggestions = document.createElement('div');
            suggestions.id = `${input.id}Autocomplete`;
            suggestions.className = 'autocomplete-suggestions';
            document.body.appendChild(suggestions);
            return suggestions;
        }

        function getBookingConsoleActionRow(input) {
            const consoleNode = input?.closest?.('#cabBookingConsole') || document.getElementById('cabBookingConsole');
            return consoleNode?.querySelector?.('.cab-console-actions') || null;
        }

        function resetBookingAutocompleteActionGap() {
            document.querySelectorAll('#cabBookingConsole .cab-console-actions').forEach((actions) => {
                if (actions.dataset.bookingAutocompleteGap === '1') {
                    actions.style.removeProperty('margin-top');
                    delete actions.dataset.bookingAutocompleteGap;
                    delete actions.dataset.bookingAutocompleteGapKey;
                }
            });
        }

        function reserveBookingAutocompleteActionGap(input, suggestionsBox) {
            if (!input || !suggestionsBox || !input.closest('#cabBookingConsole')) return;
            const actions = getBookingConsoleActionRow(input);
            if (!actions) return;

            if (!actions.dataset.bookingBaseMarginTop) {
                actions.dataset.bookingBaseMarginTop = window.getComputedStyle(actions).marginTop || '0px';
            }

            const desiredHeight = Math.min(260, suggestionsBox.scrollHeight || 180);
            const gapKey = `${input.id || 'input'}:${Math.round(desiredHeight)}`;
            if (actions.dataset.bookingAutocompleteGap === '1'
                && actions.dataset.bookingAutocompleteGapKey === gapKey) {
                return;
            }

            actions.style.removeProperty('margin-top');
            delete actions.dataset.bookingAutocompleteGap;
            delete actions.dataset.bookingAutocompleteGapKey;

            const inputRect = input.getBoundingClientRect();
            const actionTop = actions.getBoundingClientRect().top;
            const requiredBottom = inputRect.bottom + desiredHeight + 12;
            const extraGap = Math.max(0, requiredBottom - actionTop);
            if (!extraGap) return;

            const baseGap = Number.parseFloat(actions.dataset.bookingBaseMarginTop || '0') || 0;
            actions.style.setProperty('margin-top', `${baseGap + extraGap}px`, 'important');
            actions.dataset.bookingAutocompleteGap = '1';
            actions.dataset.bookingAutocompleteGapKey = gapKey;
        }

        function positionBookingAutocompleteBox(input, suggestionsBox) {
            if (!input || !suggestionsBox) return;
            reserveBookingAutocompleteActionGap(input, suggestionsBox);

            const rect = input.getBoundingClientRect();
            const viewportWidth = window.innerWidth || document.documentElement.clientWidth || 0;
            const viewportHeight = window.innerHeight || document.documentElement.clientHeight || 0;
            if (!viewportWidth || !viewportHeight || rect.width <= 0 || rect.height <= 0) return;

            const margin = 8;
            const width = Math.min(Math.max(260, rect.width), Math.max(260, viewportWidth - margin * 2));
            const left = Math.max(margin, Math.min(rect.left, viewportWidth - width - margin));
            const spaceBelow = viewportHeight - rect.bottom - margin;
            const actionRow = document.querySelector('#cabBookingConsole .cab-console-actions');
            const actionTop = actionRow?.getBoundingClientRect?.().top || 0;
            const actionSpace = actionTop > rect.bottom ? actionTop - rect.bottom - 10 : spaceBelow;
            const desiredHeight = suggestionsBox.scrollHeight || 260;
            const maxHeight = Math.max(80, Math.min(260, desiredHeight, spaceBelow - 4, actionSpace));

            suggestionsBox.style.position = 'fixed';
            suggestionsBox.style.left = `${left}px`;
            suggestionsBox.style.width = `${width}px`;
            suggestionsBox.style.maxHeight = `${maxHeight}px`;
            suggestionsBox.style.marginTop = '0';
            suggestionsBox.style.zIndex = '9999';
            suggestionsBox.style.top = `${Math.min(viewportHeight - margin - 40, rect.bottom - 1)}px`;
            suggestionsBox.style.borderTop = 'none';
            suggestionsBox.style.borderBottom = '2px solid #1689bf';
            suggestionsBox.style.borderRadius = '0 0 8px 8px';
        }

        function closeAirportAutocompleteBoxes() {
            ['pickup', 'dropoff', 'cabQuickPickupInput', 'cabQuickDropoffInput'].forEach((inputId) => {
                const box = document.getElementById(`${inputId}Autocomplete`);
                if (!box) return;
                box.innerHTML = '';
                box.style.display = 'none';
            });
            resetBookingAutocompleteActionGap();
        }

        function closeAllBookingAutocompleteBoxes() {
            document.querySelectorAll('.autocomplete-suggestions').forEach((box) => {
                box.innerHTML = '';
                box.style.display = 'none';
            });
            resetBookingAutocompleteActionGap();
        }

        function capBookingAutocompleteBox(input, suggestionsBox) {
            if (!input || !suggestionsBox || !input.closest('#cabBookingConsole')) return;
            reserveBookingAutocompleteActionGap(input, suggestionsBox);

            const inputRect = input.getBoundingClientRect();
            const viewportHeight = window.innerHeight || document.documentElement.clientHeight || 0;
            const margin = 8;
            const actionRow = document.querySelector('#cabBookingConsole .cab-console-actions');
            const actionTop = actionRow?.getBoundingClientRect?.().top || 0;
            const actionSpace = actionTop > inputRect.bottom ? actionTop - inputRect.bottom - 10 : viewportHeight - inputRect.bottom - margin;
            const desiredHeight = suggestionsBox.scrollHeight || 260;
            const maxHeight = Math.max(80, Math.min(260, desiredHeight, viewportHeight - inputRect.bottom - margin - 4, actionSpace));

            suggestionsBox.style.maxHeight = `${maxHeight}px`;
            suggestionsBox.style.top = `${Math.min(viewportHeight - margin - 40, inputRect.bottom - 1)}px`;
            suggestionsBox.style.borderTop = 'none';
            suggestionsBox.style.borderBottom = '2px solid #667eea';
            suggestionsBox.style.borderRadius = '0 0 8px 8px';
        }

        function isBookingAutocompleteInternalScroll(event) {
            const target = event?.target;
            return Boolean(target?.closest?.('.autocomplete-suggestions'));
        }

        function patchBookingLocationAutocompletePositioner() {
            const Ctor = window.LocationAutocomplete;
            if (!Ctor || !Ctor.prototype || typeof Ctor.prototype.positionSuggestions !== 'function') return false;
            if (Ctor.prototype.__goiBookingActionCapPatched) return true;

            const bindBookingSuggestionSelection = (instance) => {
                const input = instance?.input;
                const suggestionsBox = instance?.suggestionsBox;
                if (!input?.closest?.('#cabBookingConsole') || !suggestionsBox) return;
                if (input.id !== 'cabQuickPickupInput' && input.id !== 'cabQuickDropoffInput') return;

                suggestionsBox.querySelectorAll('.autocomplete-item').forEach((item) => {
                    if (item.dataset.bookingPointerSelect === '1') return;
                    item.dataset.bookingPointerSelect = '1';
                    let selectionHandled = false;
                    const selectVisibleItem = (event) => {
                        if (event) {
                            event.preventDefault();
                            event.stopPropagation();
                        }
                        if (selectionHandled) return;
                        const value = sanitizeInput(item.textContent || '').trim();
                        if (!value) return;
                        selectionHandled = true;
                        instance.selectItem(value);
                    };
                    item.addEventListener('pointerdown', selectVisibleItem);
                    item.addEventListener('click', selectVisibleItem);
                });
            };

            const originalPosition = Ctor.prototype.positionSuggestions;
            Ctor.prototype.positionSuggestions = function bookingActionCappedPositionSuggestions() {
                if (this.input?.closest?.('#cabBookingConsole') && !this.__goiDownwardBound) {
                    this.__goiDownwardBound = true;
                }
                originalPosition.call(this);
                capBookingAutocompleteBox(this.input, this.suggestionsBox);
            };
            if (typeof Ctor.prototype.init === 'function') {
                const originalInit = Ctor.prototype.init;
                Ctor.prototype.init = function bookingStableAutocompleteInit() {
                    originalInit.call(this);
                    if (!this.input?.closest?.('#cabBookingConsole') || this.__goiBookingStableScrollBound) return;
                    document.removeEventListener('scroll', this.boundReposition, true);

                    let scrollFrame = null;
                    this.boundBookingReposition = (event) => {
                        if (isBookingAutocompleteInternalScroll(event)) return;
                        if (!this.suggestionsBox || this.suggestionsBox.style.display !== 'block') return;
                        if (scrollFrame) return;

                        scrollFrame = window.requestAnimationFrame(() => {
                            scrollFrame = null;
                            if (this.suggestionsBox && this.suggestionsBox.style.display === 'block') {
                                this.positionSuggestions();
                            }
                        });
                    };
                    document.addEventListener('scroll', this.boundBookingReposition, true);
                    this.__goiBookingStableScrollBound = true;
                };
            }
            if (typeof Ctor.prototype.displaySuggestions === 'function') {
                const originalDisplaySuggestions = Ctor.prototype.displaySuggestions;
                Ctor.prototype.displaySuggestions = function bookingSelectableDisplaySuggestions(suggestions) {
                    originalDisplaySuggestions.call(this, suggestions);
                    bindBookingSuggestionSelection(this);
                };
            }
            if (typeof Ctor.prototype.selectItem === 'function') {
                const originalSelectItem = Ctor.prototype.selectItem;
                Ctor.prototype.selectItem = function bookingTrackedSelectItem(value) {
                    if (this.input?.closest?.('#cabBookingConsole')) {
                        this.input.dataset.cabCommittedSelection = '1';
                    }
                    originalSelectItem.call(this, value);
                };
            }
            if (typeof Ctor.prototype.closeSuggestions === 'function') {
                const originalCloseSuggestions = Ctor.prototype.closeSuggestions;
                Ctor.prototype.closeSuggestions = function bookingTrackedCloseSuggestions() {
                    originalCloseSuggestions.call(this);
                    if (this.input?.closest?.('#cabBookingConsole')) {
                        resetBookingAutocompleteActionGap();
                    }
                };
            }
            Ctor.prototype.__goiBookingActionCapPatched = true;
            return true;
        }

        function getAutocompleteDisplayTextFromBox(input) {
            if (!input || !input.id) return '';
            const box = document.getElementById(`${input.id}Autocomplete`);
            const firstItem = box?.querySelector('.autocomplete-item');
            return sanitizeInput(firstItem?.textContent || '').trim();
        }

        function getGenericLocationAutocompleteMatches(value) {
            const query = normalizeAirportSearchText(value);
            if (query.length < 2 || typeof window.LocationAutocomplete !== 'function') return [];

            try {
                const resolver = Object.create(window.LocationAutocomplete.prototype);
                resolver.data = window.locationsData || { states: {}, rajasthan: {} };
                resolver.maxResults = 12;
                resolver.minSearchLength = 2;
                return resolver.searchLocations(query)
                    .filter((item) => item && !item.isCategory && item.display)
                    .map((item) => sanitizeInput(item.display).trim())
                    .filter(Boolean);
            } catch (_error) {
                return [];
            }
        }

        function getResolvableGenericLocation(value) {
            const rawValue = sanitizeInput(value || '').trim();
            const normalizedValue = normalizeAirportSearchText(rawValue);
            if (normalizedValue.length < 2) return '';

            const matches = getGenericLocationAutocompleteMatches(rawValue);
            if (!matches.length) return '';

            const exactMatch = matches.find((match) => normalizeAirportSearchText(match) === normalizedValue);
            if (exactMatch) return exactMatch;

            const startsWithMatch = matches.find((match) => normalizeAirportSearchText(match).startsWith(normalizedValue));
            return startsWithMatch || matches[0] || '';
        }

        function showQuickGenericAutocomplete(input, queryOverride = '') {
            if (!input || !input.id || !input.closest('#cabBookingConsole')) return false;
            if (getActiveCabFlow() === 'airport' && getAirportFieldRole(input.id) === 'airport') return false;

            const query = String(queryOverride || input.value || '').trim();
            const suggestionsBox = getBookingAutocompleteBox(input);
            if (!suggestionsBox) return false;

            suggestionsBox.dataset.airportScoped = '0';
            suggestionsBox.innerHTML = '';

            if (query.length < 2) {
                suggestionsBox.style.display = 'none';
                return true;
            }

            const matches = getGenericLocationAutocompleteMatches(query);
            suggestionsBox.style.display = 'block';

            const header = document.createElement('div');
            header.className = 'autocomplete-category';
            header.textContent = 'Locations';
            suggestionsBox.appendChild(header);

            if (!matches.length) {
                const empty = document.createElement('div');
                empty.className = 'autocomplete-no-results';
                empty.textContent = 'No location found';
                suggestionsBox.appendChild(empty);
                positionBookingAutocompleteBox(input, suggestionsBox);
                return true;
            }

            matches.forEach((match, index) => {
                const item = document.createElement('div');
                item.className = 'autocomplete-item';
                item.dataset.index = String(index);
                item.innerHTML = `<span>${highlightAirportSuggestionText(match, query)}</span>`;
                let selectionHandled = false;
                const selectMatch = (event) => {
                    if (event) event.preventDefault();
                    if (selectionHandled) return;
                    selectionHandled = true;
                    input.value = match;
                    input.dataset.cabCommittedSelection = '1';
                    delete input.dataset.cabAutoResolvedSource;
                    delete input.dataset.cabAutoResolvedValue;
                    syncAirportPairedInput(input.id, match);
                    closeAllBookingAutocompleteBoxes();
                    input.dispatchEvent(new Event('change', { bubbles: true }));
                    updateBookingExperience();
                };
                item.addEventListener('pointerdown', selectMatch);
                item.addEventListener('click', selectMatch);
                suggestionsBox.appendChild(item);
            });

            positionBookingAutocompleteBox(input, suggestionsBox);
            return true;
        }

        function syncAirportPairedInput(inputId, value) {
            const pairedInputId = {
                pickup: 'cabQuickPickupInput',
                cabQuickPickupInput: 'pickup',
                dropoff: 'cabQuickDropoffInput',
                cabQuickDropoffInput: 'dropoff'
            }[inputId];
            const pairedInput = pairedInputId ? document.getElementById(pairedInputId) : null;
            if (pairedInput && pairedInput.value !== value) {
                pairedInput.value = value;
            }
        }
