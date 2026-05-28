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
        // LOAD DONATIONS
        // ----------------------------------------====

        function loadDonations() {
            const donations = readCustomerScopedStorage('customerDonations_', []);

            const donationsList = document.getElementById('donationsList');
            if (donations.length === 0) {
                donationsList.innerHTML = `
                    <div class="empty-state">
                        <i class="fas fa-heart"></i>
                        <p>No donations yet. Help someone in need!</p>
                    </div>
                `;
            } else {
                donationsList.innerHTML = donations.map(d => `
                    <div class="ride-card" style="border-left-color: #ff5722;">
                        <div class="ride-info">
                            <div class="ride-route">
                                <i class="fas fa-heart" style="color: #ff5722;"></i> Donation to ${d.beneficiary}
                            </div>
                            <div class="ride-details">
                                <span><i class="fas fa-calendar"></i> ${new Date(d.createdAt).toLocaleDateString()}</span>
                                <span><strong style="color: #ff5722;">₹${d.amount}</strong></span>
                                <span><i class="fas fa-check-circle" style="color: #4caf50;"></i> Completed</span>
                            </div>
                        </div>
                        <div class="ride-actions">
                            <button class="ride-btn" onclick="viewDonationReceipt('${d.id}')">
                                <i class="fas fa-receipt"></i> Receipt
                            </button>
                        </div>
                    </div>
                `).join('');
            }
        }

        // ----------------------------------------====
        // LOAD PROFILE
        // ----------------------------------------====

        function hydrateProfilePhoneEditor() {
            const safeName = normalizeDashboardNameValue(currentUser?.fullname || currentUser?.name || '');
            const safeEmail = normalizeDashboardEmailValue(currentUser?.email || '');
            const safePhone = normalizeDashboardPhoneValue(currentUser?.phone || '');
            const nameInput = document.getElementById('profileNameInput');
            const emailInput = document.getElementById('profileEmailInput');
            const input = document.getElementById('profilePhoneInput');
            const otpInput = document.getElementById('profilePhoneOtpInput');
            const phoneVerified = Boolean(currentUser?.isPhoneVerified || currentUser?.phoneVerified);
            if (nameInput) nameInput.value = safeName || '';
            if (emailInput) emailInput.value = safeEmail || '';
            if (input) input.value = safePhone || '';
            if (otpInput) otpInput.value = '';
            updateProfilePhoneBadge(safePhone, phoneVerified);
            if (safePhone && phoneVerified) {
                setProfilePhoneUpdateStatus('Verified mobile is ready for booking and admin notifications.');
            } else if (safePhone) {
                setProfilePhoneUpdateStatus('Mobile number saved but unverified. Send OTP and verify before booking.');
            } else {
                setProfilePhoneUpdateStatus('Please enter an active mobile number and verify it with OTP.');
            }
        }

        function handleProfilePhoneInputChange() {
            const otpInput = document.getElementById('profilePhoneOtpInput');
            if (otpInput) otpInput.value = '';
            if (window.GoIndiaPhoneVerification && typeof window.GoIndiaPhoneVerification.clearSession === 'function') {
                window.GoIndiaPhoneVerification.clearSession(PROFILE_PHONE_VERIFICATION_SESSION_KEY);
            }
            setProfilePhoneUpdateStatus('Send OTP to verify this mobile number before booking.');
        }

        function loadProfile() {
            document.getElementById('profileName').textContent = currentUser.fullname || currentUser.name || '-';
            document.getElementById('profileEmail').textContent = currentUser.email || '-';
            document.getElementById('profilePhone').textContent = currentUser.phone || 'Not added yet';
            hydrateProfilePhoneEditor();
        }

        async function saveProfileDetails() {
            const nameInput = document.getElementById('profileNameInput');
            const emailInput = document.getElementById('profileEmailInput');
            const phoneInput = document.getElementById('profilePhoneInput');
            const statusNode = document.getElementById('profileSaveStatus');

            const safeName = normalizeDashboardNameValue(nameInput?.value || '');
            const safeEmail = normalizeDashboardEmailValue(emailInput?.value || '');
            const safePhone = normalizeDashboardPhoneValue(phoneInput?.value || '');
            const currentPhone = normalizeDashboardPhoneValue(currentUser?.phone || '');
            const currentPhoneVerified = Boolean(currentUser?.isPhoneVerified || currentUser?.phoneVerified);
            const nextPhoneVerified = Boolean(safePhone && currentPhone && safePhone === currentPhone && currentPhoneVerified);

            if (!safeName) {
                setProfilePhoneUpdateStatus('Full name is required.', 'error');
                if (statusNode) {
                    statusNode.textContent = 'Full name is required.';
                    statusNode.style.color = '#b91c1c';
                }
                return;
            }

            if (!safeEmail || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(safeEmail)) {
                setProfilePhoneUpdateStatus('A valid email address is required.', 'error');
                if (statusNode) {
                    statusNode.textContent = 'A valid email address is required.';
                    statusNode.style.color = '#b91c1c';
                }
                return;
            }

            if (!safePhone) {
                setProfilePhoneUpdateStatus('An active mobile number is required.', 'error');
                if (statusNode) {
                    statusNode.textContent = 'An active mobile number is required.';
                    statusNode.style.color = '#b91c1c';
                }
                return;
            }

            persistDashboardCurrentUserSession({
                fullname: safeName,
                name: safeName,
                email: safeEmail,
                phone: safePhone,
                mobile: safePhone,
                isPhoneVerified: nextPhoneVerified,
                phoneVerified: nextPhoneVerified
            });
            updateDashboardCustomerAccountStores({
                fullname: safeName,
                name: safeName,
                email: safeEmail,
                phone: safePhone,
                mobile: safePhone,
                isPhoneVerified: nextPhoneVerified,
                phoneVerified: nextPhoneVerified
            });

            document.getElementById('profileName').textContent = safeName;
            document.getElementById('profileEmail').textContent = safeEmail;
            document.getElementById('profilePhone').textContent = safePhone;

            const welcomeNode = document.getElementById('welcomeMsg');
            const userNameNode = document.getElementById('userName');
            const avatarNode = document.getElementById('userAvatar');
            if (welcomeNode) welcomeNode.textContent = `Welcome, ${safeName}!`;
            if (userNameNode) userNameNode.textContent = safeName;
            if (avatarNode) {
                avatarNode.textContent = safeName.split(' ').filter(Boolean).map((part) => part[0]).join('').slice(0, 2).toUpperCase() || 'CU';
            }

            const syncResult = await syncDashboardProfileWithBackend({
                name: safeName,
                fullname: safeName,
                email: safeEmail,
                phone: safePhone,
                verified: nextPhoneVerified
            });

            if (syncResult && syncResult.ok && syncResult.data && syncResult.data.user) {
                const backendUser = syncResult.data.user;
                persistDashboardCurrentUserSession({
                    fullname: backendUser.name || safeName,
                    name: backendUser.name || safeName,
                    email: backendUser.email || safeEmail,
                    phone: backendUser.phone || safePhone,
                    mobile: backendUser.phone || safePhone,
                    isPhoneVerified: Boolean(backendUser.isPhoneVerified),
                    phoneVerified: Boolean(backendUser.isPhoneVerified)
                });
                updateDashboardCustomerAccountStores({
                    fullname: backendUser.name || safeName,
                    name: backendUser.name || safeName,
                    email: backendUser.email || safeEmail,
                    phone: backendUser.phone || safePhone,
                    mobile: backendUser.phone || safePhone,
                    isPhoneVerified: Boolean(backendUser.isPhoneVerified),
                    phoneVerified: Boolean(backendUser.isPhoneVerified)
                });
            }

            hydrateProfilePhoneEditor();
            if (nextPhoneVerified) {
                setProfilePhoneUpdateStatus('Verified mobile is ready for booking and admin notifications.');
            } else {
                setProfilePhoneUpdateStatus('Profile saved. Mobile number needs OTP verification before booking.');
            }
            if (statusNode) {
                if (syncResult && syncResult.ok) {
                    statusNode.textContent = nextPhoneVerified
                        ? 'Profile saved successfully with verified mobile.'
                        : 'Profile saved successfully. Verify mobile with OTP to use booking.';
                    statusNode.style.color = '#15803d';
                } else if (syncResult && syncResult.reason === 'missing_access_token') {
                    statusNode.textContent = 'Profile saved in your current session. It will sync to backend after your next authenticated refresh.';
                    statusNode.style.color = '#15803d';
                } else {
                    statusNode.textContent = 'Profile saved locally. Backend sync is pending, and this mobile will still be used for booking notifications.';
                    statusNode.style.color = '#15803d';
                }
            }
        }

        async function sendProfilePhoneOtp() {
            const input = document.getElementById('profilePhoneInput');
            const normalizedPhone = normalizeDashboardPhoneValue(input?.value || '');
            if (!normalizedPhone) {
                setProfilePhoneUpdateStatus('Please enter a valid mobile number with country code.', 'error');
                showProfilePhoneError('Please enter a valid mobile number with country code.');
                return;
            }
            if (!window.GoIndiaPhoneVerification || typeof window.GoIndiaPhoneVerification.sendOtp !== 'function') {
                setProfilePhoneUpdateStatus('Phone verification service is still loading. Please retry in a moment.', 'error');
                return;
            }

            try {
                setProfilePhoneUpdateStatus('Sending OTP...');
                await window.GoIndiaPhoneVerification.sendOtp(normalizedPhone, {
                    sessionKey: PROFILE_PHONE_VERIFICATION_SESSION_KEY,
                    containerId: 'profilePhoneRecaptchaContainer'
                });
                if (input) input.value = normalizedPhone;
                setProfilePhoneUpdateStatus(`OTP sent to ${normalizedPhone}. Enter the code and tap Verify & Save Mobile.`, 'success');
                if (typeof showSuccessToast === 'function') {
                    showSuccessToast(`OTP sent to ${normalizedPhone}`, 'Phone Verification');
                }
            } catch (error) {
                const message = String(error?.message || 'OTP send failed. Please retry.').trim();
                setProfilePhoneUpdateStatus(message, 'error');
                showProfilePhoneError(message);
            }
        }

        async function verifyAndSaveProfilePhone() {
            const otpValue = sanitizeInput(document.getElementById('profilePhoneOtpInput')?.value || '', 12);
            if (!otpValue) {
                setProfilePhoneUpdateStatus('Please enter the OTP code.', 'error');
                return;
            }
            if (!window.GoIndiaPhoneVerification || typeof window.GoIndiaPhoneVerification.verifyOtp !== 'function') {
                setProfilePhoneUpdateStatus('Phone verification service is still loading. Please retry in a moment.', 'error');
                return;
            }

            try {
                setProfilePhoneUpdateStatus('Verifying OTP...');
                const result = await window.GoIndiaPhoneVerification.verifyOtp(otpValue, {
                    sessionKey: PROFILE_PHONE_VERIFICATION_SESSION_KEY
                });
                const verifiedPhone = normalizeDashboardPhoneValue(result?.phone || document.getElementById('profilePhoneInput')?.value || '');
                if (!verifiedPhone) {
                    throw new Error('Verified phone number missing after OTP confirmation.');
                }

                const safeName = normalizeDashboardNameValue(document.getElementById('profileNameInput')?.value || currentUser?.fullname || currentUser?.name || '');
                const safeEmail = normalizeDashboardEmailValue(document.getElementById('profileEmailInput')?.value || currentUser?.email || '');
                persistDashboardCurrentUserSession({
                    fullname: safeName || currentUser?.fullname || currentUser?.name || '',
                    name: safeName || currentUser?.name || currentUser?.fullname || '',
                    email: safeEmail || currentUser?.email || '',
                    phone: verifiedPhone,
                    mobile: verifiedPhone,
                    isPhoneVerified: true,
                    phoneVerified: true
                });
                updateDashboardCustomerAccountStores({
                    fullname: safeName || currentUser?.fullname || currentUser?.name || '',
                    name: safeName || currentUser?.name || currentUser?.fullname || '',
                    email: safeEmail || currentUser?.email || '',
                    phone: verifiedPhone,
                    mobile: verifiedPhone,
                    isPhoneVerified: true,
                    phoneVerified: true
                }, true);

                const input = document.getElementById('profilePhoneInput');
                if (input) input.value = verifiedPhone;
                document.getElementById('profilePhone').textContent = verifiedPhone;

                const syncResult = await syncDashboardPhoneWithBackend(verifiedPhone);
                if (syncResult?.ok && syncResult.data?.user) {
                    const backendUser = syncResult.data.user;
                    persistDashboardCurrentUserSession({
                        fullname: backendUser.name || currentUser?.fullname || currentUser?.name || '',
                        name: backendUser.name || currentUser?.name || currentUser?.fullname || '',
                        email: backendUser.email || currentUser?.email || '',
                        phone: normalizeDashboardPhoneValue(backendUser.phone || verifiedPhone) || verifiedPhone,
                        mobile: normalizeDashboardPhoneValue(backendUser.phone || verifiedPhone) || verifiedPhone,
                        isPhoneVerified: Boolean(backendUser.isPhoneVerified),
                        phoneVerified: Boolean(backendUser.isPhoneVerified)
                    });
                    updateDashboardCustomerAccountStores({
                        fullname: backendUser.name || currentUser?.fullname || currentUser?.name || '',
                        name: backendUser.name || currentUser?.name || currentUser?.fullname || '',
                        email: backendUser.email || currentUser?.email || '',
                        phone: normalizeDashboardPhoneValue(backendUser.phone || verifiedPhone) || verifiedPhone,
                        mobile: normalizeDashboardPhoneValue(backendUser.phone || verifiedPhone) || verifiedPhone,
                        isPhoneVerified: Boolean(backendUser.isPhoneVerified),
                        phoneVerified: Boolean(backendUser.isPhoneVerified)
                    }, Boolean(backendUser.isPhoneVerified));
                    setProfilePhoneUpdateStatus(`Verified mobile saved to backend: ${verifiedPhone}`, 'success');
                } else if (syncResult?.reason === 'missing_access_token') {
                    setProfilePhoneUpdateStatus(`Verified mobile saved in this session: ${verifiedPhone}. Backend sync will happen after login refresh.`, 'success');
                } else {
                    setProfilePhoneUpdateStatus(`Verified mobile saved locally: ${verifiedPhone}. Backend sync is pending.`, 'success');
                }

                hydrateProfilePhoneEditor();
                const statusNode = document.getElementById('profileSaveStatus');
                if (statusNode) {
                    statusNode.textContent = 'Mobile verified and saved.';
                    statusNode.style.color = '#15803d';
                }
                if (typeof showSuccessToast === 'function') {
                    showSuccessToast(`Mobile verified: ${verifiedPhone}`, 'Phone Verification');
                }
            } catch (error) {
                const message = String(error?.message || 'OTP verification failed. Please retry.').trim();
                setProfilePhoneUpdateStatus(message, 'error');
                showProfilePhoneError(message);
            }
        }

        // ----------------------------------------====
        // PAYMENT SYSTEM
        // ----------------------------------------====

        let currentRideForPayment = null;

        function showPaymentModal(rideId) {
            const rides = JSON.parse(localStorage.getItem('bookings')) || [];
            const ride = rides.find(r => r.id === rideId);

            if (!ride) return;

            currentRideForPayment = rideId;

            document.getElementById('paymentPickup').textContent = ride.pickup;
            document.getElementById('paymentDropoff').textContent = ride.dropoff;
            document.getElementById('paymentDistance').textContent = (ride.distance || 15) + ' km';
            document.getElementById('paymentFare').textContent = '₹' + ride.totalFare;

            document.getElementById('paymentModal').style.display = 'flex';
            document.getElementById('paymentModal').classList.add('active');
        }

        function selectPaymentMethod(method) {
            if (!currentRideForPayment) return;

            const rides = JSON.parse(localStorage.getItem('bookings')) || [];
            const rideIdx = rides.findIndex(r => r.id === currentRideForPayment);

            if (rideIdx !== -1) {
                rides[rideIdx].paymentMethod = method;
                rides[rideIdx].paymentStatus = 'paid';
                rides[rideIdx].paidAt = new Date().toISOString();
                localStorage.setItem('bookings', JSON.stringify(rides));

                // Hide payment modal
                document.getElementById('paymentModal').style.display = 'none';
                document.getElementById('paymentModal').classList.remove('active');

                // Show success toast
                if (typeof showSuccessToast === 'function') {
                    showSuccessToast(`Payment of ₹${rides[rideIdx].totalFare} completed successfully!`, 'Payment Successful');
                }

                // Show optional donation suggestion after 1 second
                setTimeout(() => {
                    // Show donation modal instead of confirm dialog
                    openDonationModal(currentRideForPayment);
                }, 1000);

                // Reload rides to update display
                loadRides();
            }
        }

        function closePaymentModal() {
            document.getElementById('paymentModal').style.display = 'none';
            document.getElementById('paymentModal').classList.remove('active');
        }

        // Check for newly completed rides and show payment
        function checkForCompletedRides() {
            const myRides = getCustomerBookingsFromStore();

            myRides.forEach(ride => {
                // If ride is completed and payment not done, show payment modal
                if (ride.status === 'completed' && !ride.paymentStatus) {
                    showPaymentModal(ride.id);
                }
            });
        }

        // Real-time sync - poll for updates every 30 seconds
        function startRealTimeSync() {
            if (customerRealtimeSyncTimer) return;
            customerRealtimeSyncTimer = setInterval(() => {
                loadRides();
                checkForCompletedRides();
                renderCustomerAlerts();
            }, 30000); // Poll every 30 seconds to keep dashboard responsive.
        }

        function renderCustomerAlerts() {
            const host = document.getElementById('customerAlertsPanel');
            if (!host || typeof PortalAlerts === 'undefined') return;

            const alerts = PortalAlerts.getAlertsForRole('customer').slice(0, 5);
            const panel = host.closest('.portal-alerts-panel');
            if (panel) {
                panel.classList.toggle('portal-alerts-empty', !alerts.length);
            }
            host.innerHTML = alerts.length
                ? alerts.map((a) => `
                    <div class="portal-alert-item">
                        <strong>${a.title}</strong><div>${a.message}</div>
                        <div class="portal-alert-meta">${PortalAlerts.timeAgo(a.createdAt)}${a.rideId ? ` • Ride ${a.rideId}` : ''}</div>
                    </div>
                `).join('')
                : '<div class="portal-alert-item">No customer alerts right now.</div>';
        }

        function ensureCustomerAlertsPanel() {
            if (document.getElementById('customerAlertsPanel')) return;
            const header = document.querySelector('.header-section');
            if (!header) return;

            const panel = document.createElement('div');
            panel.className = 'portal-alerts-panel';
            panel.innerHTML = '<div class="portal-alerts-title">🔔 Live Ride Alerts</div><div id="customerAlertsPanel"></div>';
            header.appendChild(panel);
            renderCustomerAlerts();
        }

        // ----------------------------------------====
        // DONATION SYSTEM
        // ----------------------------------------====

        function openDonations() {
            window.location.href = './donations.html';
        }

        function openDonationModal(rideId) {
            currentRideForDonation = rideId;
            selectedDonationAmount = 50;
            document.getElementById('donationModal').classList.add('active');
        }

        function closeDonationModal() {
            document.getElementById('donationModal').classList.remove('active');
        }

        function selectDonation(amount) {
            selectedDonationAmount = amount;
            document.querySelectorAll('.donation-btn-option').forEach(btn => {
                btn.classList.remove('selected');
            });
            event.target.classList.add('selected');
            document.getElementById('customDonationAmount').value = '';
        }

        document.getElementById('customDonationAmount')?.addEventListener('input', function() {
            if (this.value) {
                selectedDonationAmount = parseInt(this.value);
                document.querySelectorAll('.donation-btn-option').forEach(btn => {
                    btn.classList.remove('selected');
                });
            }
        });

        async function submitDonation() {
            const customAmount = document.getElementById('customDonationAmount').value;
            const amount = customAmount ? parseInt(customAmount) : selectedDonationAmount;

            if (!amount || amount < 1) {
                alert('Please select a valid amount');
                return;
            }

            // Create donation record
            const donation = {
                id: 'DON' + Date.now(),
                rideId: currentRideForDonation,
                amount: amount,
                beneficiary: 'Underprivileged Driver Fund',
                createdAt: new Date().toISOString()
            };

            let donations = readCustomerScopedStorage('customerDonations_', []);
            donations.push(donation);
            writeCustomerScopedStorage('customerDonations_', donations);

            // Deduct from wallet
            let wallet = readCustomerScopedStorage('wallet_', { balance: 0, transactions: [] });
            wallet.balance -= amount;
            wallet.transactions = wallet.transactions || [];
            wallet.transactions.unshift({
                type: 'donation',
                amount: amount,
                description: 'Donation to help drivers',
                date: new Date().toISOString()
            });
            writeCustomerScopedStorage('wallet_', wallet);

            // Get ride details for receipt
            if (typeof isSecureWalletMode === 'function' && isSecureWalletMode()) {
                await refreshSecureWalletSnapshot(false);
            }

            const bookings = JSON.parse(localStorage.getItem('bookings')) || [];
            const ride = bookings.find(b => b.id === currentRideForDonation);

            // Show receipt
            showDonationReceipt(ride, amount, donation.id);
        }

        function showDonationReceipt(ride, donationAmount, donationId) {
            if (!ride) {
                alert('❌ Ride not found');
                return;
            }

            const totalAmount = ride.totalFare + donationAmount;

            document.getElementById('receiptPickup').textContent = ride.pickup;
            document.getElementById('receiptDropoff').textContent = ride.dropoff;
            document.getElementById('receiptFare').textContent = `₹${ride.totalFare}`;
            document.getElementById('receiptDonation').textContent = `₹${donationAmount}`;
            document.getElementById('receiptRefId').textContent = donationId;
            document.getElementById('receiptRideAmount').textContent = `₹${ride.totalFare}`;
            document.getElementById('receiptDonationAmount').textContent = `₹${donationAmount}`;
            document.getElementById('receiptTotal').textContent = `₹${totalAmount}`;
            document.getElementById('receiptImpact').textContent = `provide meals/help to one person for a day`;

            closeDonationModal();
            document.getElementById('receiptModal').classList.add('active');

            // Reload data
            loadDashboard();
            loadDonations();
        }

        function closeReceiptModal() {
            document.getElementById('receiptModal').classList.remove('active');
        }

        function downloadReceipt() {
            const receiptText = `
GO INDIA RIDE - DONATION RECEIPT

------------------------
RIDE DETAILS
------------------------
Pickup: ${document.getElementById('receiptPickup').textContent}
Dropoff: ${document.getElementById('receiptDropoff').textContent}
Ride Fare: ${document.getElementById('receiptFare').textContent}

------------------------
DONATION DETAILS
------------------------
Donation Amount: ${document.getElementById('receiptDonation').textContent}
Beneficiary: ${document.getElementById('receiptBeneficiary').textContent}
Reference ID: ${document.getElementById('receiptRefId').textContent}
Date: ${new Date().toLocaleString()}

------------------------
SUMMARY
------------------------
Ride Amount: ${document.getElementById('receiptRideAmount').textContent}
+ Donation: ${document.getElementById('receiptDonationAmount').textContent}
Total Paid: ${document.getElementById('receiptTotal').textContent}

Thank you for your generosity! ❤️
            `;

            const element = document.createElement('a');
            element.setAttribute('href', 'data:text/plain;charset=utf-8,' + encodeURIComponent(receiptText));
            element.setAttribute('download', 'donation_receipt_' + new Date().getTime() + '.txt');
            element.style.display = 'none';
            document.body.appendChild(element);
            element.click();
            document.body.removeChild(element);

            alert('✅ Receipt downloaded!');
        }

        function shareReceipt() {
            const receiptText = `I just donated ₹${document.getElementById('receiptDonation').textContent} through GO India RIDE to help underprivileged drivers! 🙏❤️ #GoIndiaRide #HelpingDrivers`;

            if (navigator.share) {
                navigator.share({
                    title: 'GO India RIDE Donation',
                    text: receiptText,
                    url: window.location.href
                });
            } else {
                alert('Share: ' + receiptText);
            }
        }

        function viewDonationReceipt(donationId) {
            const donations = readCustomerScopedStorage('customerDonations_', []);
            const donation = donations.find(d => d.id === donationId);
            if (donation) {
                alert(`
Donation Receipt
----------------
Amount: ₹${donation.amount}
Beneficiary: ${donation.beneficiary}
Date: ${new Date(donation.createdAt).toLocaleString()}
Reference: ${donation.id}

Thank you for helping! ❤️
                `);
            }
        }

        // ----------------------------------------====
        // TAB SWITCHING
        // ----------------------------------------====

        function switchTab(tabName) {
            document.querySelectorAll('.tab-content').forEach(tab => {
                tab.classList.remove('active');
            });

            document.querySelectorAll('.tab-button').forEach(btn => {
                btn.classList.remove('active');
            });

            const tabPanel = document.getElementById(tabName + 'Tab');
            if (tabPanel) {
                tabPanel.classList.add('active');
            }

            const activeButton = document.querySelector('.tab-button[data-tab="' + tabName + '"]');
            if (activeButton) {
                activeButton.classList.add('active');
            }

            if (tabName === 'messages') {
                loadMessages();
            }

            if (tabName === 'wallet') {
                renderWalletMethodOptions()
                    .then(() => renderWalletPanel({ forceSync: true }))
                    .catch((error) => console.warn('Wallet render failed:', error));
            }
        }

        function resolveDashboardTabFromNavigation() {
            const query = new URLSearchParams(window.location.search || '');
            const hashValue = String(window.location.hash || '').replace(/^#/, '').trim().toLowerCase();
            const requested = String(query.get('tab') || query.get('view') || hashValue || '').trim().toLowerCase();
            const tabAliases = {
                active: 'active',
                rides: 'active',
                history: 'history',
                'ride-history': 'history',
                'booking-history': 'history',
                ride_history: 'history',
                booking_history: 'history',
                wallet: 'wallet',
                messages: 'messages',
                donations: 'donations',
                profile: 'profile'
            };
            return tabAliases[requested] || '';
        }

        function openRequestedCustomerTabFromUrl() {
            const requestedTab = resolveDashboardTabFromNavigation();
            if (!requestedTab) return;
            switchTab(requestedTab);
        }

        // ============================================
        // OTHER FUNCTIONS
        // ============================================

        function notifyEmergencyAction(message, title = 'Emergency') {
            if (typeof showWarningToast === 'function') {
                showWarningToast(message, title);
            } else {
                alert(message);
            }
        }

        function triggerEmergencyHelp(kind) {
            const emergencyMap = {
                police: { number: '112', label: 'Police', dialable: true },
                ambulance: { number: '108', label: 'Ambulance', dialable: true },
                sos: { number: null, label: 'SOS Alert', dialable: false }
            };

            const info = emergencyMap[kind] || emergencyMap.sos;
            const who = (currentUser && currentUser.fullname) ? currentUser.fullname : 'Customer';

            if (typeof PortalAlerts !== 'undefined') {
                PortalAlerts.pushAlert({
                    title: `Emergency: ${info.label}`,
                    message: `${who} triggered emergency support from customer dashboard.`,
                    type: 'danger',
                    roles: ['admin', 'driver', 'customer']
                });
                renderCustomerAlerts();
            }

            if (info.dialable && info.number) {
                notifyEmergencyAction(`${info.label} help requested. Dialing ${info.number}...`);
                window.location.href = `tel:${info.number}`;
                return;
            }

            notifyEmergencyAction('SOS alert sent to Admin & Driver network.', 'SOS Triggered');
        }

        function goToBooking() {
            window.location.href = './booking.html';
        }

        function trackRide(rideId) {
            alert('📍 Live tracking coming soon!');
        }

        async function viewReceipt(rideId) {
            if (typeof isSecureWalletMode === 'function' && isSecureWalletMode()) {
                await refreshSecureWalletSnapshot(false);
            }

            const bookings = JSON.parse(localStorage.getItem('bookings')) || [];
            const ride = bookings.find(b => b.id === rideId);
            if (ride) {
                alert(`
Ride Receipt
------------
From: ${ride.pickup}
To: ${ride.dropoff}
Type: ${ride.rideType}
Distance: ${ride.distance}km
Fare: ₹${ride.totalFare}
Date: ${new Date(ride.createdAt).toLocaleString()}

Thank you for riding with us! 🚗
                `);
            }
        }

        function rateRide(rideId) {
            const rating = prompt('Rate this ride (1-5 stars):');
            if (rating && rating >= 1 && rating <= 5) {
                alert(`✅ Thanks for rating! You gave ${rating} stars.`);
            }
        }

        // ----------------------------------------====
        // MESSAGES/CHAT FUNCTIONALITY
        // ----------------------------------------====

        let currentChatUser = null;
        let demoResponseTimeout = null;

        // Demo response configuration
        const DEMO_RESPONSES = [
            "I'll be there in 5 minutes!",
            "On my way to pick you up!",
            "Thanks for choosing GO India RIDE!",
            "Have a safe journey!",
            "Sure, I can help with that.",
        ];

        // Helper function to get chat initialization key
        function getChatInitKey(userId) {
            return `goride_chat_initialized_${userId}`;
        }

        function loadMessages() {
            if (typeof MessageDB === 'undefined') {
                console.error('MessageDB not loaded');
                return;
            }

            const currentUserId = getCustomerWalletOwnerId();
            const conversations = MessageDB.getUserConversations(currentUserId);
            const conversationsList = document.getElementById('conversationsList');

            // Update unread badge
            const unreadCount = MessageDB.getUnreadCount(currentUserId);
            const badge = document.getElementById('unreadBadge');
            if (unreadCount > 0) {
                badge.textContent = unreadCount;
                badge.style.display = 'inline';
            } else {
                badge.style.display = 'none';
            }

            if (conversations.length === 0) {
                conversationsList.innerHTML = `
                    <div class="empty-state">
                        <i class="fas fa-comments" style="font-size: 3rem; margin-bottom: 1rem;"></i>
                        <h3 style="color: #333; margin-bottom: 0.5rem;">Abhi koi purani chat nahi hai</h3>
                        <p style="color: #666; margin-bottom: 1rem;">No previous chats yet. Book a ride to start messaging with drivers!</p>
                        <a href="booking.html" style="color: #667eea; text-decoration: none; font-weight: bold;">
                            📱 Book Your First Ride
                        </a>
                    </div>
                `;
                return;
            }

            conversationsList.innerHTML = conversations.map(conv => {
                // Get user info (driver)
                const drivers = JSON.parse(localStorage.getItem('goride_drivers')) || [];
                const driver = drivers.find(d => d.id === conv.userId);
                const driverName = driver ? driver.name : 'Unknown Driver';
                const driverAvatar = driver ? driver.photo : '👤';

                return `
                    <div class="conversation-item" onclick="openChat('${conv.userId}')">
                        <div class="user-avatar">${driverAvatar}</div>
                        <div class="conversation-info">
                            <div class="conversation-name">${driverName}</div>
                            <div class="conversation-last-message">${conv.lastMessage}</div>
                        </div>
                        <div>
                            <div class="conversation-time">${formatTimestamp(conv.timestamp)}</div>
                            ${conv.unread ? '<span class="badge">New</span>' : ''}
                        </div>
                    </div>
                `;
            }).join('');
        }

        function openChat(driverId) {
            currentChatUser = driverId;

            // Get driver info
            const drivers = JSON.parse(localStorage.getItem('goride_drivers')) || [];
            const driver = drivers.find(d => d.id === driverId);

            if (!driver) {
                alert('Driver not found');
                return;
            }

            // Update chat header
            document.getElementById('chatUserAvatar').textContent = driver.photo;
            document.getElementById('chatUserName').textContent = driver.name;
            document.getElementById('chatUserStatus').textContent = driver.status === 'available' ? 'Available' : 'Busy';

            // Show chat window
            document.getElementById('conversationsList').style.display = 'none';
            document.getElementById('chatWindow').style.display = 'flex';

            // Mark messages as read
            MessageDB.markConversationAsRead(getCustomerWalletOwnerId(), driverId);

            // Load messages
            loadChatMessages(driverId);

            // Update unread badge
            const unreadCount = MessageDB.getUnreadCount(getCustomerWalletOwnerId());
            const badge = document.getElementById('unreadBadge');
            if (unreadCount > 0) {
                badge.textContent = unreadCount;
                badge.style.display = 'inline';
            } else {
                badge.style.display = 'none';
            }
        }

        function loadChatMessages(driverId) {
            const currentUserId = getCustomerWalletOwnerId();
            const messages = MessageDB.getConversation(currentUserId, driverId);
            const chatMessages = document.getElementById('chatMessages');

            if (messages.length === 0) {
                chatMessages.innerHTML = `
                    <div class="empty-state">
                        <i class="fas fa-comment" style="font-size: 3rem; margin-bottom: 1rem;"></i>
                        <h3 style="color: #333; margin-bottom: 0.5rem;">Abhi koi message nahi hai</h3>
                        <p style="color: #666;">No messages yet. Say hi! 👋</p>
                        <p style="color: #999; font-size: 0.9rem; margin-top: 0.5rem;">
                            💡 Type a message below to start the conversation
                        </p>
                    </div>
                `;
                return;
            }

            chatMessages.innerHTML = messages.map(msg => {
                const isSent = msg.senderId === currentUserId;
                return `
                    <div class="message ${isSent ? 'sent' : 'received'}">
                        <div class="message-content">
                            ${msg.content}
                            <div class="message-time">${formatTimestamp(msg.timestamp)}</div>
                        </div>
                    </div>
                `;
            }).join('');

            // Scroll to bottom
            chatMessages.scrollTop = chatMessages.scrollHeight;
        }

        function closeChat() {
            // Clear any pending demo response timeouts
            if (demoResponseTimeout) {
                clearTimeout(demoResponseTimeout);
                demoResponseTimeout = null;
            }

            document.getElementById('conversationsList').style.display = 'block';
            document.getElementById('chatWindow').style.display = 'none';
            currentChatUser = null;
            loadMessages(); // Refresh conversations list
        }

        function sendMessage() {
            const input = document.getElementById('messageInput');
            const content = input.value.trim();

            if (!content || !currentChatUser) return;

            // Create message
            MessageDB.create({
                senderId: getCustomerWalletOwnerId(),
                receiverId: currentChatUser,
                content: content,
                read: false
            });

            // Clear input
            input.value = '';

            // Reload chat
            loadChatMessages(currentChatUser);

            // Simulate driver response (for demo purposes)
            // Clear any existing timeout first
            if (demoResponseTimeout) {
                clearTimeout(demoResponseTimeout);
            }

            const chatUserAtSendTime = currentChatUser; // Capture current user
            demoResponseTimeout = setTimeout(() => {
                const randomResponse = DEMO_RESPONSES[Math.floor(Math.random() * DEMO_RESPONSES.length)];

                MessageDB.create({
                    senderId: chatUserAtSendTime,
                    receiverId: getCustomerWalletOwnerId(),
                    content: randomResponse,
                    read: false
                });

                // Only reload if still viewing the same chat
                if (currentChatUser === chatUserAtSendTime) {
                    loadChatMessages(currentChatUser);
                }
                demoResponseTimeout = null;
            }, 2000);
        }

        function handleMessageKeyPress(event) {
            if (event.key === 'Enter') {
                sendMessage();
            }
        }

        function formatTimestamp(timestamp) {
            const date = new Date(timestamp);
            const now = new Date();
            const diff = now - date;
            const minutes = Math.floor(diff / 60000);
            const hours = Math.floor(diff / 3600000);
            const days = Math.floor(diff / 86400000);

            if (minutes < 1) return 'Just now';
            if (minutes < 60) return `${minutes}m ago`;
            if (hours < 24) return `${hours}h ago`;
            if (days < 7) return `${days}d ago`;
            return date.toLocaleDateString();
        }

        function startDemoChat() {
            // Add a demo message for testing
            const drivers = JSON.parse(localStorage.getItem('goride_drivers')) || [];
            if (drivers.length > 0) {
                const demoDriver = drivers[0];
                MessageDB.create({
                    senderId: demoDriver.id,
                    receiverId: getCustomerWalletOwnerId(),
                    content: "Hello! I'm your driver. Looking forward to serving you! 🚗",
                    read: false
                });
            }
        }

        function goHome() {
            window.location.href = '../index.html';
        }

        function logout() {
            if (confirm('Are you sure you want to logout?')) {
                if (window.GoIndiaSessionContinuity && typeof window.GoIndiaSessionContinuity.clearAuthArtifacts === 'function') {
                    window.GoIndiaSessionContinuity.clearAuthArtifacts();
                }
                localStorage.removeItem('currentUser');
                localStorage.removeItem('userRole');
                localStorage.removeItem('accessToken');
                localStorage.removeItem('authToken');
                localStorage.removeItem('token');
                localStorage.removeItem('goindiaride_refresh_token');
                localStorage.removeItem('goindiaride_refresh_token_v1');
                window.location.href = './login.html';
            }
        }

        console.log('🚀 Customer Dashboard loaded');
