        function safeDashboardText(value, maxLen = 200) {
            return String(value || '')
                .replace(/[<>]/g, '')
                .replace(/\s+/g, ' ')
                .trim()
                .slice(0, maxLen);
        }

        function escapeHtmlAttr(value) {
            return String(value || '')
                .replace(/&/g, '&amp;')
                .replace(/"/g, '&quot;')
                .replace(/'/g, '&#39;')
                .replace(/</g, '&lt;')
                .replace(/>/g, '&gt;');
        }

        function toFiniteNumber(value, fallback = 0) {
            const parsed = Number(value);
            return Number.isFinite(parsed) ? parsed : fallback;
        }

        function parseRideStartDateTime(ride) {
            if (!ride || typeof ride !== 'object') return null;

            const outbound = String(ride.outboundDateTime || '').trim();
            if (outbound) {
                const outboundDate = new Date(outbound);
                if (!Number.isNaN(outboundDate.getTime())) return outboundDate;
            }

            const rideDate = safeDashboardText(ride.rideDate || '', 40);
            if (!rideDate) return null;
            const rideTimeRaw = safeDashboardText(ride.rideTime || '', 10);
            const normalizedRideTime = /^\d{1,2}:\d{2}$/.test(rideTimeRaw) ? rideTimeRaw : '00:00';
            const parsed = new Date(`${rideDate}T${normalizedRideTime}:00`);
            if (!Number.isNaN(parsed.getTime())) return parsed;
            return null;
        }

        function toIsoFromDateTime(dateValue, timeValue, fallbackValue = null) {
            const safeDate = safeDashboardText(dateValue || '', 40);
            if (!safeDate) return fallbackValue;
            const safeTime = safeDashboardText(timeValue || '', 10);
            const normalizedTime = /^\d{1,2}:\d{2}$/.test(safeTime) ? safeTime : '00:00';
            const parsed = new Date(`${safeDate}T${normalizedTime}:00`);
            if (Number.isNaN(parsed.getTime())) return fallbackValue;
            return parsed.toISOString();
        }

        function getRideEditCount(ride) {
            const directCount = Number(ride && ride.editCount);
            if (Number.isFinite(directCount)) return Math.max(0, directCount);
            const historyLength = Array.isArray(ride && ride.editHistory) ? ride.editHistory.length : 0;
            return Math.max(0, historyLength);
        }

        function normalizeRideStatus(ride) {
            return String((ride && ride.status) || '').trim().toLowerCase();
        }

        function getRideReferenceId(ride) {
            return safeDashboardText((ride && (ride.bookingId || ride.id || ride.referenceId || ride._id)) || '', 120);
        }

        function matchesRideReference(ride, rideRef) {
            const target = safeDashboardText(rideRef || '', 120);
            if (!target) return false;
            const id = safeDashboardText(ride && ride.id, 120);
            const bookingId = safeDashboardText(ride && ride.bookingId, 120);
            const referenceId = safeDashboardText(ride && ride.referenceId, 120);
            const mongoId = safeDashboardText(ride && ride._id, 120);
            return target === id || target === bookingId || target === referenceId || target === mongoId;
        }

        function getRideEditWindowsSummaryText() {
            return '72+ hours premium flexibility, 48-72 hours standard flexibility, 24-48 hours planned updates, 12-24 hours limited changes, 6-12 hours essential updates, final 6 hours locked';
        }

        function resolveRideEditWindowByHours(hoursUntilRide) {
            if (!Number.isFinite(hoursUntilRide)) {
                return CUSTOMER_BOOKING_EDIT_WINDOWS[0];
            }
            for (const windowRule of CUSTOMER_BOOKING_EDIT_WINDOWS) {
                if (hoursUntilRide >= Number(windowRule.minHours || 0)) {
                    return windowRule;
                }
            }
            return CUSTOMER_BOOKING_EDIT_WINDOWS[CUSTOMER_BOOKING_EDIT_WINDOWS.length - 1];
        }

        function getRideEditTierLabel(tier) {
            if (tier === 'full_plus') return '72h+ Premium Edit';
            if (tier === 'full') return '48-72h Flexible Edit';
            if (tier === 'standard') return '24-48h Smart Edit';
            if (tier === 'limited') return '12-24h Priority Edit';
            if (tier === 'minimal') return '6-12h Fast Edit';
            return 'Edit Locked';
        }

        function getRideEditPolicy(ride) {
            const now = Date.now();
            const editCount = getRideEditCount(ride);
            const rideStatus = normalizeRideStatus(ride);
            const rideStart = parseRideStartDateTime(ride);
            const hoursUntilRide = rideStart ? ((rideStart.getTime() - now) / (60 * 60 * 1000)) : null;

            if (rideStatus === 'completed' || rideStatus === 'cancelled') {
                return {
                    allowed: false,
                    buttonEnabled: false,
                    windowTier: 'locked',
                    badgeClass: 'locked',
                    hoursUntilRide,
                    reason: 'Completed or cancelled bookings can no longer be edited.',
                    maxEdits: CUSTOMER_BOOKING_EDIT_MAX_COUNT,
                    usedEdits: editCount,
                    remainingEdits: Math.max(0, CUSTOMER_BOOKING_EDIT_MAX_COUNT - editCount),
                    allowedFields: []
                };
            }

            if (editCount >= CUSTOMER_BOOKING_EDIT_MAX_COUNT) {
                return {
                    allowed: false,
                    buttonEnabled: false,
                    windowTier: 'locked',
                    badgeClass: 'locked',
                    hoursUntilRide,
                    reason: `The edit limit has already been reached (${CUSTOMER_BOOKING_EDIT_MAX_COUNT}/${CUSTOMER_BOOKING_EDIT_MAX_COUNT}).`,
                    maxEdits: CUSTOMER_BOOKING_EDIT_MAX_COUNT,
                    usedEdits: editCount,
                    remainingEdits: 0,
                    allowedFields: []
                };
            }

            if (Number.isFinite(hoursUntilRide) && hoursUntilRide < CUSTOMER_BOOKING_EDIT_LOCK_HOURS) {
                return {
                    allowed: false,
                    buttonEnabled: false,
                    windowTier: 'locked',
                    badgeClass: 'locked',
                    hoursUntilRide,
                    reason: `Booking updates are unavailable within ${CUSTOMER_BOOKING_EDIT_LOCK_HOURS} hours of departure.`,
                    maxEdits: CUSTOMER_BOOKING_EDIT_MAX_COUNT,
                    usedEdits: editCount,
                    remainingEdits: Math.max(0, CUSTOMER_BOOKING_EDIT_MAX_COUNT - editCount),
                    allowedFields: []
                };
            }

            const activeWindow = resolveRideEditWindowByHours(hoursUntilRide);
            const allowedFields = Array.isArray(activeWindow?.allowedFields)
                ? activeWindow.allowedFields
                : [];
            const tier = safeDashboardText(activeWindow?.tier || 'full_plus', 30) || 'full_plus';
            const label = safeDashboardText(activeWindow?.label || getRideEditTierLabel(tier), 80) || getRideEditTierLabel(tier);
            const hoursMessage = Number.isFinite(hoursUntilRide)
                ? `${Math.max(0, hoursUntilRide).toFixed(1)} hours remain before departure.`
                : 'The departure time is currently unavailable.';

            return {
                allowed: true,
                buttonEnabled: true,
                windowTier: tier,
                badgeClass: tier === 'full_plus' || tier === 'full' ? 'full' : tier,
                hoursUntilRide,
                reason: `${hoursMessage} ${label} is currently active.`,
                maxEdits: CUSTOMER_BOOKING_EDIT_MAX_COUNT,
                usedEdits: editCount,
                remainingEdits: Math.max(0, CUSTOMER_BOOKING_EDIT_MAX_COUNT - editCount),
                allowedFields,
                windowLabel: label
            };
        }

        function getRideEditPolicyBadge(policy) {
            if (!policy || typeof policy !== 'object') return '';
            const tier = safeDashboardText(policy.windowTier || '', 30);
            if (tier === 'full_plus') {
                return '<span class="ride-policy-badge full"><i class="fas fa-layer-group"></i> Premium Edit (72h+)</span>';
            }
            if (tier === 'full') {
                return '<span class="ride-policy-badge full"><i class="fas fa-pen"></i> Flexible Edit (48-72h)</span>';
            }
            if (tier === 'standard') {
                return '<span class="ride-policy-badge standard"><i class="fas fa-calendar-check"></i> Smart Edit (24-48h)</span>';
            }
            if (tier === 'limited') {
                return '<span class="ride-policy-badge limited"><i class="fas fa-bolt"></i> Priority Edit (12-24h)</span>';
            }
            if (tier === 'minimal') {
                return '<span class="ride-policy-badge minimal"><i class="fas fa-stopwatch"></i> Fast Edit (6-12h)</span>';
            }
            return '<span class="ride-policy-badge locked"><i class="fas fa-lock"></i> Edit Locked</span>';
        }

        function getRidePolicyInlineText(policy) {
            if (!policy || typeof policy !== 'object') {
                return `Update policy: up to ${CUSTOMER_BOOKING_EDIT_MAX_COUNT} edits allowed. Windows: ${getRideEditWindowsSummaryText()}.`;
            }
            return `Update policy: ${policy.usedEdits}/${policy.maxEdits} edits used. ${policy.reason}`;
        }

        function getRideEditButtonLabel(policy) {
            return policy?.buttonEnabled ? 'Edit Booking' : 'Edit Locked';
        }

        function getRideEditFieldLabel(fieldKey) {
            const labels = {
                pickup: 'Pickup',
                dropoff: 'Dropoff',
                rideDate: 'Ride Date',
                rideTime: 'Ride Time',
                returnDate: 'Return Date',
                returnTime: 'Return Time',
                tripPlan: 'Trip Category',
                paymentMethod: 'Payment Method',
                vehicleType: 'Vehicle Type',
                passengers: 'Passengers',
                luggage: 'Luggage',
                stop1: 'Stop 1',
                stop2: 'Stop 2',
                notes: 'Notes',
                specialRequests: 'Special Requests',
                safetyAccessibility: 'Safety & Accessibility'
            };
            return labels[fieldKey] || fieldKey;
        }

        function getRideEditCheckboxId(groupKey, itemKey) {
            const specialRequestMap = {
                airCondition: 'rideEditRequestAirCondition',
                wifi: 'rideEditRequestWifi',
                charger: 'rideEditRequestCharger',
                music: 'rideEditRequestMusic'
            };
            const safetyMap = {
                womenDriverPref: 'rideEditSafetyWomenDriverPref',
                childSeat: 'rideEditSafetyChildSeat',
                wheelchairAssist: 'rideEditSafetyWheelchairAssist',
                petFriendly: 'rideEditSafetyPetFriendly',
                liveTripShare: 'rideEditSafetyLiveTripShare',
                maskedCall: 'rideEditSafetyMaskedCall'
            };
            const map = groupKey === 'specialRequests' ? specialRequestMap : safetyMap;
            return map[itemKey] || '';
        }

        function setRideEditCheckboxValues(groupKey, values = {}) {
            const keys = groupKey === 'specialRequests' ? RIDE_EDIT_SPECIAL_REQUEST_KEYS : RIDE_EDIT_SAFETY_KEYS;
            keys.forEach((itemKey) => {
                const node = document.getElementById(getRideEditCheckboxId(groupKey, itemKey));
                if (node) node.checked = Boolean(values && values[itemKey]);
            });
        }

        function collectRideEditCheckboxValues(groupKey) {
            const keys = groupKey === 'specialRequests' ? RIDE_EDIT_SPECIAL_REQUEST_KEYS : RIDE_EDIT_SAFETY_KEYS;
            return keys.reduce((acc, itemKey) => {
                const node = document.getElementById(getRideEditCheckboxId(groupKey, itemKey));
                acc[itemKey] = Boolean(node && node.checked);
                return acc;
            }, {});
        }

        function toggleRideEditReturnFields(forceState = null) {
            const toggle = document.getElementById('rideEditIsReturnTrip');
            const row = document.getElementById('rideEditReturnFieldsRow');
            const isActive = typeof forceState === 'boolean' ? forceState : Boolean(toggle && toggle.checked);
            if (toggle) toggle.checked = isActive;
            if (row) row.style.display = isActive ? 'grid' : 'none';
            if (!isActive) {
                const returnDate = document.getElementById('rideEditReturnDate');
                const returnTime = document.getElementById('rideEditReturnTime');
                if (returnDate) returnDate.value = '';
                if (returnTime) returnTime.value = '';
            }
        }

        function showRideEditFeedback(message, type = 'info', title = 'Booking Edit') {
            const safeMessage = safeDashboardText(message, 280) || 'Booking edit update.';
            if (type === 'error' && typeof showErrorToast === 'function') {
                showErrorToast(safeMessage, title);
                return;
            }
            if (type === 'success' && typeof showSuccessToast === 'function') {
                showSuccessToast(safeMessage, title);
                return;
            }
            if (typeof showWarningToast === 'function') {
                showWarningToast(safeMessage, title);
                return;
            }
            alert(safeMessage);
        }

        function hydrateRideEditForm(ride) {
            document.getElementById('rideEditPickup').value = safeDashboardText(ride.pickup || ride.pickupLocation || '', 180);
            document.getElementById('rideEditDropoff').value = safeDashboardText(ride.dropoff || ride.dropLocation || '', 180);
            document.getElementById('rideEditDate').value = safeDashboardText(ride.rideDate || '', 40);
            document.getElementById('rideEditTime').value = safeDashboardText(ride.rideTime || '', 10);
            document.getElementById('rideEditTripPlan').value = safeDashboardText(ride.tripPlan || 'city', 40) || 'city';
            document.getElementById('rideEditPaymentMethod').value = safeDashboardText(ride.paymentMethod || 'cash', 40) || 'cash';
            document.getElementById('rideEditVehicleType').value = safeDashboardText(ride.vehicleType || ride.rideType || 'economy', 40) || 'economy';

            const passengers = Math.max(1, Math.min(5, Number.parseInt(ride.passengers || 1, 10) || 1));
            document.getElementById('rideEditPassengers').value = String(passengers >= 5 ? 5 : passengers);
            document.getElementById('rideEditLuggage').value = safeDashboardText(ride.luggage || 'none', 30) || 'none';

            const stops = Array.isArray(ride.stops) ? ride.stops : [];
            document.getElementById('rideEditStop1').value = safeDashboardText(stops[0] || '', 160);
            document.getElementById('rideEditStop2').value = safeDashboardText(stops[1] || '', 160);
            document.getElementById('rideEditNotes').value = safeDashboardText(ride.notes || '', 600);

            const returnDate = safeDashboardText(ride.returnDate || ride.returnTrip?.returnDate || '', 40);
            const returnTime = safeDashboardText(ride.returnTime || ride.returnTrip?.returnTime || '', 10);
            document.getElementById('rideEditReturnDate').value = returnDate;
            document.getElementById('rideEditReturnTime').value = returnTime;
            toggleRideEditReturnFields(Boolean(returnDate || returnTime));

            setRideEditCheckboxValues('specialRequests', ride.specialRequests || ride.customerFeatures?.specialRequests || {});
            setRideEditCheckboxValues('safetyAccessibility', ride.safetyAccessibility || ride.customerFeatures?.safetyAccessibility || {});
        }

        function applyRideEditFieldPolicy(policy) {
            const allowedSet = new Set(Array.isArray(policy?.allowedFields) ? policy.allowedFields : []);
            const fieldMap = {
                pickup: 'rideEditPickup',
                dropoff: 'rideEditDropoff',
                rideDate: 'rideEditDate',
                rideTime: 'rideEditTime',
                returnDate: 'rideEditReturnDate',
                returnTime: 'rideEditReturnTime',
                tripPlan: 'rideEditTripPlan',
                paymentMethod: 'rideEditPaymentMethod',
                vehicleType: 'rideEditVehicleType',
                passengers: 'rideEditPassengers',
                luggage: 'rideEditLuggage',
                stop1: 'rideEditStop1',
                stop2: 'rideEditStop2',
                notes: 'rideEditNotes'
            };
            const groupMap = {
                specialRequests: {
                    hostId: 'rideEditSpecialRequestsGroup',
                    keys: RIDE_EDIT_SPECIAL_REQUEST_KEYS
                },
                safetyAccessibility: {
                    hostId: 'rideEditSafetyAccessibilityGroup',
                    keys: RIDE_EDIT_SAFETY_KEYS
                }
            };

            Object.entries(fieldMap).forEach(([fieldKey, fieldId]) => {
                const input = document.getElementById(fieldId);
                if (!input) return;
                const host = input.closest('.ride-edit-field');
                const enabled = allowedSet.has(fieldKey);
                input.disabled = !enabled;
                if (host) host.classList.toggle('is-disabled', !enabled);
            });

            Object.entries(groupMap).forEach(([fieldKey, groupConfig]) => {
                const host = document.getElementById(groupConfig.hostId);
                const enabled = allowedSet.has(fieldKey);
                if (host) host.classList.toggle('is-disabled', !enabled);
                groupConfig.keys.forEach((itemKey) => {
                    const input = document.getElementById(getRideEditCheckboxId(fieldKey, itemKey));
                    if (input) input.disabled = !enabled;
                });
            });
        }

        function updateRideEditRuleStatus(policy) {
            const node = document.getElementById('rideEditRuleStatus');
            if (!node) return;
            const hoursText = Number.isFinite(policy?.hoursUntilRide)
                ? `${Math.max(0, policy.hoursUntilRide).toFixed(1)}h left`
                : 'time unknown';
            const allowedFields = Array.isArray(policy?.allowedFields) ? policy.allowedFields : [];
            const scopeText = allowedFields.length >= CUSTOMER_BOOKING_EDITABLE_FIELDS.length
                ? 'Complete booking details'
                : allowedFields.map((fieldKey) => getRideEditFieldLabel(fieldKey)).join(', ');
            const remainingEdits = Math.max(0, Number(policy?.remainingEdits || 0));
            const windowLabel = safeDashboardText(policy?.windowLabel || getRideEditTierLabel(policy?.windowTier || ''), 80) || 'Active edit window';
            const remainingLabel = remainingEdits === 1 ? '1 update remaining.' : `${remainingEdits} updates remaining.`;
            node.innerHTML = `
                <div class="ride-edit-rule-stats">
                    <div class="ride-edit-stat">
                        <div class="ride-edit-stat-label">Edit Window</div>
                        <div class="ride-edit-stat-value">${escapeHtml(windowLabel)}</div>
                    </div>
                    <div class="ride-edit-stat">
                        <div class="ride-edit-stat-label">Time Left</div>
                        <div class="ride-edit-stat-value">${escapeHtml(hoursText)}</div>
                    </div>
                    <div class="ride-edit-stat">
                        <div class="ride-edit-stat-label">Used Edits</div>
                        <div class="ride-edit-stat-value">${escapeHtml(`${policy.usedEdits}/${policy.maxEdits}`)}</div>
                    </div>
                    <div class="ride-edit-stat">
                        <div class="ride-edit-stat-label">Editable Scope</div>
                        <div class="ride-edit-stat-value">${escapeHtml(scopeText)}</div>
                    </div>
                </div>
                <div class="ride-edit-rule-note">
                    ${escapeHtml(policy.reason)} ${escapeHtml(remainingLabel)} Bookings lock automatically during the final ${escapeHtml(String(CUSTOMER_BOOKING_EDIT_LOCK_HOURS))} hours before departure.
                </div>
            `;
        }

        function getStoredCustomerBookings() {
            const rawBookings = JSON.parse(localStorage.getItem('bookings')) || [];
            return Array.isArray(rawBookings) ? rawBookings : [];
        }

        function resolveCustomerRideRecord(rideRef) {
            const normalizedRef = safeDashboardText(rideRef || '', 120);
            const rides = getStoredCustomerBookings();
            const storedIndex = rides.findIndex((item) => customerOwnsStoredRecord(item) && matchesRideReference(item, normalizedRef));
            if (storedIndex >= 0) {
                return {
                    rides,
                    ride: rides[storedIndex],
                    index: storedIndex,
                    source: 'local_store'
                };
            }

            const runtimeRides = Array.isArray(window.__GOINDIARIDE_CUSTOMER_DASHBOARD_BOOKINGS__)
                ? window.__GOINDIARIDE_CUSTOMER_DASHBOARD_BOOKINGS__
                : [];
            const runtimeRide = runtimeRides.find((item) => matchesRideReference(item, normalizedRef));
            if (!runtimeRide) {
                return { rides, ride: null, index: -1, source: 'missing' };
            }

            const seededRide = {
                ...runtimeRide,
                id: safeDashboardText(runtimeRide.id || runtimeRide.bookingId || normalizedRef, 120),
                bookingId: safeDashboardText(runtimeRide.bookingId || runtimeRide.id || normalizedRef, 120),
                customerId: getCustomerWalletOwnerId(),
                backendUserId: currentUser?.backendUserId || runtimeRide.backendUserId || '',
                customerEmail: normalizeDashboardEmailValue(currentUser?.email || runtimeRide.customerEmail || runtimeRide.email || ''),
                customerPhone: normalizeDashboardPhoneValue(currentUser?.phone || runtimeRide.customerPhone || runtimeRide.phone || runtimeRide.mobile || '')
            };
            rides.push(seededRide);
            localStorage.setItem('bookings', JSON.stringify(rides));
            return {
                rides,
                ride: seededRide,
                index: rides.length - 1,
                source: 'runtime_seed'
            };
        }

        function openRideEditModal(rideId) {
            const { ride } = resolveCustomerRideRecord(rideId);
            if (!ride) {
                showRideEditFeedback('We could not locate this booking record. Please refresh the dashboard and try again.', 'error');
                return;
            }

            const policy = getRideEditPolicy(ride);
            if (!policy.allowed) {
                showRideEditFeedback(policy.reason, 'error');
                return;
            }

            currentRideForEdit = getRideReferenceId(ride);
            currentRideEditPolicy = policy;
            hydrateRideEditForm(ride);
            applyRideEditFieldPolicy(policy);
            updateRideEditRuleStatus(policy);

            const modal = document.getElementById('rideEditModal');
            if (modal) {
                modal.classList.add('active');
                modal.scrollTop = 0;
            }
        }

        function closeRideEditModal() {
            const modal = document.getElementById('rideEditModal');
            if (modal) modal.classList.remove('active');
            currentRideForEdit = null;
            currentRideEditPolicy = null;
        }

        function collectRideEditPayload() {
            const pickup = safeDashboardText(document.getElementById('rideEditPickup')?.value || '', 180);
            const dropoff = safeDashboardText(document.getElementById('rideEditDropoff')?.value || '', 180);
            const rideDate = safeDashboardText(document.getElementById('rideEditDate')?.value || '', 40);
            const rideTime = safeDashboardText(document.getElementById('rideEditTime')?.value || '', 10);
            const isReturnTrip = Boolean(document.getElementById('rideEditIsReturnTrip')?.checked);
            const returnDate = isReturnTrip ? safeDashboardText(document.getElementById('rideEditReturnDate')?.value || '', 40) : '';
            const returnTime = isReturnTrip ? safeDashboardText(document.getElementById('rideEditReturnTime')?.value || '', 10) : '';
            const tripPlan = safeDashboardText(document.getElementById('rideEditTripPlan')?.value || 'city', 40) || 'city';
            const paymentMethod = safeDashboardText(document.getElementById('rideEditPaymentMethod')?.value || 'cash', 40) || 'cash';
            const vehicleType = safeDashboardText(document.getElementById('rideEditVehicleType')?.value || 'economy', 40) || 'economy';
            const passengers = Math.max(1, Math.min(5, Number.parseInt(document.getElementById('rideEditPassengers')?.value || '1', 10) || 1));
            const luggage = safeDashboardText(document.getElementById('rideEditLuggage')?.value || 'none', 30) || 'none';
            const stop1 = safeDashboardText(document.getElementById('rideEditStop1')?.value || '', 160);
            const stop2 = safeDashboardText(document.getElementById('rideEditStop2')?.value || '', 160);
            const notes = safeDashboardText(document.getElementById('rideEditNotes')?.value || '', 600);
            const stops = [stop1, stop2].filter(Boolean);
            return {
                pickup,
                dropoff,
                rideDate,
                rideTime,
                isReturnTrip,
                returnDate,
                returnTime,
                tripPlan,
                paymentMethod,
                vehicleType,
                passengers,
                luggage,
                notes,
                stops,
                specialRequests: collectRideEditCheckboxValues('specialRequests'),
                safetyAccessibility: collectRideEditCheckboxValues('safetyAccessibility')
            };
        }

        function applyRideEditToLocalRecord(ride, payload, policy) {
            const nowIso = new Date().toISOString();
            const allowedSet = new Set(Array.isArray(policy?.allowedFields) ? policy.allowedFields : []);
            const next = { ...(ride || {}) };
            const changedFields = [];
            next.customerFeatures = next.customerFeatures && typeof next.customerFeatures === 'object'
                ? { ...next.customerFeatures }
                : {};

            function markChanged(fieldKey) {
                if (!changedFields.includes(fieldKey)) changedFields.push(fieldKey);
            }

            function assignSimpleField(fieldKey, nextValue, keys = [fieldKey]) {
                if (!allowedSet.has(fieldKey)) return;
                const currentValue = keys.map((key) => next[key]).find((value) => value !== undefined);
                if (JSON.stringify(nextValue) === JSON.stringify(currentValue)) return;
                keys.forEach((key) => {
                    next[key] = nextValue;
                });
                markChanged(fieldKey);
            }

            assignSimpleField('pickup', payload.pickup, ['pickup', 'pickupLocation']);
            assignSimpleField('dropoff', payload.dropoff, ['dropoff', 'dropLocation']);
            assignSimpleField('rideDate', payload.rideDate, ['rideDate']);
            assignSimpleField('rideTime', payload.rideTime, ['rideTime']);
            assignSimpleField('tripPlan', payload.tripPlan, ['tripPlan']);
            assignSimpleField('paymentMethod', payload.paymentMethod, ['paymentMethod']);
            assignSimpleField('vehicleType', payload.vehicleType, ['vehicleType', 'rideType']);
            assignSimpleField('passengers', payload.passengers, ['passengers']);
            assignSimpleField('luggage', payload.luggage, ['luggage']);
            assignSimpleField('notes', payload.notes, ['notes']);

            if (allowedSet.has('returnDate') || allowedSet.has('returnTime')) {
                const previousReturnDate = safeDashboardText(next.returnDate || next.returnTrip?.returnDate || '', 40);
                const previousReturnTime = safeDashboardText(next.returnTime || next.returnTrip?.returnTime || '', 10);
                if (payload.returnDate !== previousReturnDate || payload.returnTime !== previousReturnTime) {
                    next.returnDate = payload.returnDate;
                    next.returnTime = payload.returnTime;
                    next.returnTrip = payload.isReturnTrip
                        ? {
                            ...(next.returnTrip && typeof next.returnTrip === 'object' ? next.returnTrip : {}),
                            returnDate: payload.returnDate,
                            returnTime: payload.returnTime,
                            returnDateTime: payload.returnDate
                                ? toIsoFromDateTime(payload.returnDate, payload.returnTime, null)
                                : null
                        }
                        : { returnDate: '', returnTime: '', returnDateTime: null };
                    markChanged('returnDate');
                    markChanged('returnTime');
                }
            }

            if (allowedSet.has('stop1') || allowedSet.has('stop2')) {
                const previousStops = Array.isArray(next.stops) ? next.stops : [];
                if (JSON.stringify(previousStops) !== JSON.stringify(payload.stops)) {
                    next.stops = payload.stops;
                    markChanged('stop1');
                    markChanged('stop2');
                }
            }

            if (allowedSet.has('specialRequests')) {
                const previousSpecialRequests = next.specialRequests || next.customerFeatures?.specialRequests || {};
                if (JSON.stringify(previousSpecialRequests) !== JSON.stringify(payload.specialRequests)) {
                    next.specialRequests = { ...payload.specialRequests };
                    next.customerFeatures.specialRequests = { ...payload.specialRequests };
                    markChanged('specialRequests');
                }
            }

            if (allowedSet.has('safetyAccessibility')) {
                const previousSafetyAccessibility = next.safetyAccessibility || next.customerFeatures?.safetyAccessibility || {};
                if (JSON.stringify(previousSafetyAccessibility) !== JSON.stringify(payload.safetyAccessibility)) {
                    next.safetyAccessibility = { ...payload.safetyAccessibility };
                    next.customerFeatures.safetyAccessibility = { ...payload.safetyAccessibility };
                    markChanged('safetyAccessibility');
                }
            }

            if (!changedFields.length) {
                return { changed: false, ride: next, changedFields: [] };
            }

            next.outboundDateTime = toIsoFromDateTime(next.rideDate, next.rideTime, next.outboundDateTime || null);
            next.updatedAt = nowIso;
            next.lastEditedAt = nowIso;
            next.editCount = getRideEditCount(next) + 1;
            next.editPolicyVersion = 'customer_dashboard_v3';
            next.editHistory = Array.isArray(next.editHistory) ? next.editHistory : [];
            next.editHistory.push({
                editedAt: nowIso,
                by: 'customer',
                source: 'customer_dashboard',
                windowTier: policy.windowTier,
                hoursUntilRide: Number.isFinite(policy.hoursUntilRide) ? Number(policy.hoursUntilRide.toFixed(2)) : null,
                changedFields
            });

            next.statusHistory = Array.isArray(next.statusHistory) ? next.statusHistory : [];
            next.statusHistory.push({
                status: 'edited',
                at: nowIso,
                source: 'customer_dashboard',
                note: `customer_edit_${policy.windowTier}`
            });

            return { changed: true, ride: next, changedFields };
        }

        async function syncRideEditWithBackend(ride, payload, policy) {
            const token = getDashboardAccessToken();
            const bookingId = safeDashboardText((ride && (ride.bookingId || ride.id)) || '', 120);
            if (!token || !bookingId || !/^BK/i.test(bookingId)) {
                return { ok: false, reason: 'skip_backend_sync' };
            }

            const apiBases = getDashboardAdminEmailApiBases();
            if (!apiBases.length) return { ok: false, reason: 'api_base_missing' };

            const requestPayload = {
                pickup: payload.pickup,
                drop: payload.dropoff,
                rideDate: payload.rideDate,
                rideTime: payload.rideTime,
                returnDate: payload.returnDate,
                returnTime: payload.returnTime,
                tripPlan: payload.tripPlan,
                paymentMethod: payload.paymentMethod,
                vehicleType: payload.vehicleType,
                passengers: payload.passengers,
                luggage: payload.luggage,
                notes: payload.notes,
                stops: payload.stops,
                specialRequests: payload.specialRequests,
                safetyAccessibility: payload.safetyAccessibility,
                policyWindow: {
                    maxEdits: policy.maxEdits,
                    lockHours: CUSTOMER_BOOKING_EDIT_LOCK_HOURS,
                    activeTier: policy.windowTier,
                    windows: CUSTOMER_BOOKING_EDIT_WINDOWS.map((rule) => ({
                        minHours: Number(rule.minHours || 0),
                        tier: safeDashboardText(rule.tier || '', 40),
                        allowedFields: Array.isArray(rule.allowedFields) ? rule.allowedFields.slice(0, 20) : []
                    }))
                }
            };

            let lastReason = 'server_send_failed';
            for (const apiBase of apiBases) {
                try {
                    const response = await dashboardFetchWithTimeout(`${apiBase}/api/bookings/${encodeURIComponent(bookingId)}/edit`, {
                        method: 'POST',
                        headers: {
                            Accept: 'application/json',
                            Authorization: `Bearer ${token}`,
                            'Content-Type': 'application/json'
                        },
                        body: JSON.stringify(requestPayload)
                    }, 15000);

                    const data = await response.json().catch(() => ({}));
                    if (response.ok) {
                        return { ok: true, data };
                    }

                    lastReason = safeDashboardText(data.message || `http_${response.status}`, 180) || 'server_send_failed';
                    if ([400, 403, 404, 409].includes(response.status)) {
                        return { ok: false, reason: lastReason, hardFailure: true };
                    }
                } catch (error) {
                    lastReason = classifyDashboardRequestFailure(apiBase, error);
                }
            }

            return { ok: false, reason: safeDashboardText(lastReason, 180) || 'server_send_failed' };
        }

        async function submitRideEdit() {
            if (!currentRideForEdit) {
                showRideEditFeedback('Please select a booking first.', 'error');
                return;
            }

            const recordState = resolveCustomerRideRecord(currentRideForEdit);
            const rides = Array.isArray(recordState.rides) ? recordState.rides : [];
            const index = Number(recordState.index);
            if (index < 0 || !recordState.ride) {
                showRideEditFeedback('The booking record could not be found. Please refresh the dashboard and try again.', 'error');
                closeRideEditModal();
                return;
            }

            const ride = recordState.ride;
            const latestPolicy = getRideEditPolicy(ride);
            if (!latestPolicy.allowed) {
                showRideEditFeedback(latestPolicy.reason, 'error');
                closeRideEditModal();
                return;
            }

            const payload = collectRideEditPayload();
            const allowedSet = new Set(Array.isArray(latestPolicy.allowedFields) ? latestPolicy.allowedFields : []);
            const missing = [];
            if (allowedSet.has('pickup') && !payload.pickup) missing.push('pickup');
            if (allowedSet.has('dropoff') && !payload.dropoff) missing.push('dropoff');
            if (allowedSet.has('rideDate') && !payload.rideDate) missing.push('ride date');
            if (allowedSet.has('rideTime') && !payload.rideTime) missing.push('ride time');
            if (payload.isReturnTrip && allowedSet.has('returnDate') && !payload.returnDate) missing.push('return date');
            if (payload.isReturnTrip && allowedSet.has('returnTime') && !payload.returnTime) missing.push('return time');

            if (missing.length) {
                showRideEditFeedback(`Please fill required fields: ${missing.join(', ')}.`, 'error');
                return;
            }

            if (payload.isReturnTrip && payload.returnDate) {
                const outboundIso = toIsoFromDateTime(payload.rideDate, payload.rideTime, null);
                const returnIso = toIsoFromDateTime(payload.returnDate, payload.returnTime, null);
                if (outboundIso && returnIso && new Date(returnIso).getTime() <= new Date(outboundIso).getTime()) {
                    showRideEditFeedback('Return trip ka date/time outbound trip ke baad hona chahiye.', 'error');
                    return;
                }
            }

            const localUpdate = applyRideEditToLocalRecord(ride, payload, latestPolicy);
            if (!localUpdate.changed) {
                showRideEditFeedback('Koi change detect nahi hua. Details update karke save karein.', 'info');
                return;
            }

            const backendSync = await syncRideEditWithBackend(ride, payload, latestPolicy);
            if (backendSync.hardFailure) {
                showRideEditFeedback(`Live edit reject hua: ${backendSync.reason}`, 'error');
                return;
            }

            if (!backendSync.ok && backendSync.reason !== 'skip_backend_sync') {
                localUpdate.ride.editSyncStatus = 'pending';
                localUpdate.ride.editSyncReason = safeDashboardText(backendSync.reason || 'server_send_failed', 140);
            } else {
                localUpdate.ride.editSyncStatus = 'synced';
                localUpdate.ride.editSyncReason = '';
                if (backendSync.ok && backendSync.data && backendSync.data.booking) {
                    const booking = backendSync.data.booking;
                    localUpdate.ride.bookingId = safeDashboardText(booking.bookingId || localUpdate.ride.bookingId || '', 120);
                    localUpdate.ride.pickup = safeDashboardText(booking.pickupLocation || localUpdate.ride.pickup || '', 180);
                    localUpdate.ride.dropoff = safeDashboardText(booking.dropLocation || localUpdate.ride.dropoff || '', 180);
                    localUpdate.ride.rideDate = safeDashboardText(booking.rideDate || localUpdate.ride.rideDate || '', 40);
                    localUpdate.ride.rideTime = safeDashboardText(booking.rideTime || localUpdate.ride.rideTime || '', 10);
                    localUpdate.ride.returnDate = safeDashboardText(booking.returnDate || localUpdate.ride.returnDate || '', 40);
                    localUpdate.ride.returnTime = safeDashboardText(booking.returnTime || localUpdate.ride.returnTime || '', 10);
                    localUpdate.ride.tripPlan = safeDashboardText(booking.tripPlan || localUpdate.ride.tripPlan || '', 40);
                    localUpdate.ride.paymentMethod = safeDashboardText(booking.paymentMethod || localUpdate.ride.paymentMethod || '', 40);
                    localUpdate.ride.vehicleType = safeDashboardText(booking.vehicleType || localUpdate.ride.vehicleType || '', 40);
                    localUpdate.ride.rideType = safeDashboardText(booking.vehicleType || localUpdate.ride.rideType || '', 40);
                    localUpdate.ride.passengers = toFiniteNumber(booking.passengers, localUpdate.ride.passengers || 1);
                    localUpdate.ride.luggage = safeDashboardText(booking.luggage || localUpdate.ride.luggage || '', 30);
                    localUpdate.ride.notes = safeDashboardText(booking.notes || localUpdate.ride.notes || '', 600);
                    localUpdate.ride.stops = Array.isArray(booking.stops) ? booking.stops.map((item) => safeDashboardText(item, 160)).filter(Boolean) : (localUpdate.ride.stops || []);
                    localUpdate.ride.specialRequests = booking.specialRequests && typeof booking.specialRequests === 'object'
                        ? { ...booking.specialRequests }
                        : (localUpdate.ride.specialRequests || {});
                    localUpdate.ride.safetyAccessibility = booking.safetyAccessibility && typeof booking.safetyAccessibility === 'object'
                        ? { ...booking.safetyAccessibility }
                        : (localUpdate.ride.safetyAccessibility || {});
                    localUpdate.ride.totalFare = toFiniteNumber(booking.amount, localUpdate.ride.totalFare || localUpdate.ride.amount || 0);
                    localUpdate.ride.amount = toFiniteNumber(booking.amount, localUpdate.ride.amount || localUpdate.ride.totalFare || 0);
                    localUpdate.ride.distance = toFiniteNumber(booking.distanceKm, localUpdate.ride.distance || localUpdate.ride.distanceKm || 0);
                    localUpdate.ride.distanceKm = toFiniteNumber(booking.distanceKm, localUpdate.ride.distanceKm || localUpdate.ride.distance || 0);
                    localUpdate.ride.distanceSource = safeDashboardText(booking.distanceSource || localUpdate.ride.distanceSource || '', 80);
                    localUpdate.ride.fareBreakdown = booking.fareBreakdown && typeof booking.fareBreakdown === 'object'
                        ? { ...booking.fareBreakdown }
                        : (localUpdate.ride.fareBreakdown || {});
                    localUpdate.ride.fareQuote = booking.fareQuote && typeof booking.fareQuote === 'object'
                        ? { ...booking.fareQuote }
                        : (localUpdate.ride.fareQuote || {});
                    localUpdate.ride.fareHash = safeDashboardText(booking.fareHash || localUpdate.ride.fareHash || '', 240);
                    localUpdate.ride.customerFeatures = localUpdate.ride.customerFeatures && typeof localUpdate.ride.customerFeatures === 'object'
                        ? { ...localUpdate.ride.customerFeatures }
                        : {};
                    localUpdate.ride.customerFeatures.specialRequests = { ...(localUpdate.ride.specialRequests || {}) };
                    localUpdate.ride.customerFeatures.safetyAccessibility = { ...(localUpdate.ride.safetyAccessibility || {}) };
                    localUpdate.ride.returnTrip = localUpdate.ride.returnDate || localUpdate.ride.returnTime
                        ? {
                            ...(localUpdate.ride.returnTrip && typeof localUpdate.ride.returnTrip === 'object' ? localUpdate.ride.returnTrip : {}),
                            returnDate: localUpdate.ride.returnDate,
                            returnTime: localUpdate.ride.returnTime
                        }
                        : { returnDate: '', returnTime: '', returnDateTime: null };
                    localUpdate.ride.editCount = toFiniteNumber(booking.editCount, getRideEditCount(localUpdate.ride));
                    localUpdate.ride.lastEditedAt = booking.lastEditedAt || localUpdate.ride.lastEditedAt || '';
                    localUpdate.ride.outboundDateTime = booking.outboundDateTime || localUpdate.ride.outboundDateTime || '';
                }
            }

            rides[index] = localUpdate.ride;
            localStorage.setItem('bookings', JSON.stringify(rides));
            loadRides();
            loadDashboard();
            closeRideEditModal();

            if (backendSync.ok) {
                showRideEditFeedback('Booking edit saved and synced successfully.', 'success');
            } else if (backendSync.reason === 'skip_backend_sync') {
                showRideEditFeedback('Booking edit saved locally. Live sync token available hote hi backend sync hoga.', 'success');
            } else {
                showRideEditFeedback(`Booking edit saved locally. Backend sync pending (${backendSync.reason}).`, 'info');
            }
        }

        function loadRides() {
            const customerBookings = getCustomerBookingsFromStore();

            const activeRides = customerBookings.filter(b =>
                b.status !== 'completed' && b.status !== 'cancelled'
            );
            const completedRides = customerBookings.filter(b => b.status === 'completed');

            // Active Rides
            const activeList = document.getElementById('activeRidesList');
            if (activeRides.length === 0) {
                activeList.innerHTML = `
                    <div class="empty-state">
                        <i class="fas fa-inbox"></i>
                        <p>No active rides. <a href="./booking.html" style="color: #667eea; cursor: pointer;">Book a ride!</a></p>
                    </div>
                `;
            } else {
                activeList.innerHTML = activeRides.map((ride) => {
                    const policy = getRideEditPolicy(ride);
                    const editClass = policy.buttonEnabled ? 'ride-btn edit' : 'ride-btn limited';
                    const editDisabled = policy.buttonEnabled ? '' : 'disabled';
                    const editLabel = getRideEditButtonLabel(policy);
                    const safePickup = safeDashboardText(ride.pickup || ride.pickupLocation || '-', 180);
                    const safeDropoff = safeDashboardText(ride.dropoff || ride.dropLocation || '-', 180);
                    const safeRideType = safeDashboardText(ride.rideType || ride.vehicleType || '-', 60);
                    const safeRideDate = safeDashboardText(ride.rideDate || '', 40) || new Date(ride.createdAt || Date.now()).toLocaleDateString();
                    const safeFare = toFiniteNumber(ride.totalFare || ride.amount || 0, 0);
                    const safeRideId = getRideReferenceId(ride);
                    const safeRideIdForJs = String(safeRideId || '').replace(/\\/g, '\\\\').replace(/'/g, "\\'");
                    const disableTitle = policy.buttonEnabled ? '' : `title="${escapeHtmlAttr(policy.reason)}"`;
                    const policyBadge = getRideEditPolicyBadge(policy);
                    const policyText = getRidePolicyInlineText(policy);
                    return `
                        <div class="ride-card">
                            <div class="ride-info">
                                <div class="ride-route">
                                    <i class="fas fa-location-dot"></i> ${safePickup} → ${safeDropoff}
                                </div>
                                <div class="ride-details">
                                    <span><i class="fas fa-calendar"></i> ${safeRideDate}</span>
                                    <span><i class="fas fa-tag"></i> ${safeRideType}</span>
                                    <span><i class="fas fa-money-bill"></i> ₹${safeFare}</span>
                                </div>
                                ${policyBadge}
                                <div class="ride-policy-inline">${policyText}</div>
                            </div>
                            <div class="ride-actions">
                                <button class="${editClass}" onclick="openRideEditModal('${safeRideIdForJs}')" ${editDisabled} ${disableTitle}>
                                    <i class="fas fa-pen-to-square"></i> ${editLabel}
                                </button>
                                <button class="ride-btn primary" onclick="trackRide('${safeRideIdForJs}')">
                                    <i class="fas fa-location-arrow"></i> Track
                                </button>
                            </div>
                        </div>
                    `;
                }).join('');
            }

            // Completed Rides
            const historyList = document.getElementById('rideHistoryList');
            if (completedRides.length === 0) {
                historyList.innerHTML = `
                    <div class="empty-state">
                        <i class="fas fa-inbox"></i>
                        <p>No ride history yet</p>
                    </div>
                `;
            } else {
                historyList.innerHTML = completedRides.map(ride => `
                    <div class="ride-card completed">
                        <div class="ride-info">
                            <div class="ride-route">
                                <i class="fas fa-location-dot"></i> ${ride.pickup} → ${ride.dropoff}
                            </div>
                            <div class="ride-details">
                                <span><i class="fas fa-calendar"></i> ${new Date(ride.createdAt).toLocaleDateString()}</span>
                                <span><i class="fas fa-clock"></i> ${ride.duration || '30 mins'}</span>
                                <span><i class="fas fa-money-bill"></i> ₹${ride.totalFare}</span>
                            </div>
                        </div>
                        <div class="ride-actions">
                            <button class="ride-btn primary" onclick="viewReceipt('${ride.id}')">
                                <i class="fas fa-receipt"></i> Receipt
                            </button>
                            <button class="ride-btn" onclick="rateRide('${ride.id}')">
                                <i class="fas fa-star"></i> Rate
                            </button>
                        </div>
                    </div>
                `).join('');
            }
        }

        // ----------------------------------------====
