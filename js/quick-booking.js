(function initQuickBooking() {
    const ADMIN_PHONE = '918426891471';
    const API_RENDER_BASE = 'https://goindiaride.onrender.com';
    const STORE_KEYS = [
        'bookings',
        'goride_bookings',
        'goindiaride_active_bookings',
        'customerBookings',
        'customer_bookings',
        'goindiaride_customer_bookings_v1',
        'goindiaride_live_customer_booking_queue_v1'
    ];
    const ADMIN_REVIEW_KEY = 'goindiaride_admin_review_inbox_v1';
    const LAST_BOOKING_KEY = 'goindiaride_last_public_shortcut_booking_v1';

    const form = document.getElementById('quickBookingForm');
    if (!form) return;

    const fields = {
        pickup: document.getElementById('pickupInput'),
        drop: document.getElementById('dropInput'),
        rideDate: document.getElementById('rideDateInput'),
        rideTime: document.getElementById('rideTimeInput'),
        returnDate: document.getElementById('returnDateInput'),
        returnTime: document.getElementById('returnTimeInput'),
        name: document.getElementById('nameInput'),
        phone: document.getElementById('phoneInput'),
        passengers: document.getElementById('passengerInput'),
        payment: document.getElementById('paymentInput'),
        notes: document.getElementById('notesInput')
    };

    const fareAmount = document.getElementById('fareAmount');
    const distanceAmount = document.getElementById('distanceAmount');
    const syncStatus = document.getElementById('syncStatus');
    const formMessage = document.getElementById('formMessage');
    const submitBtn = document.getElementById('submitBookingBtn');
    const whatsAppBookingLink = document.getElementById('whatsAppBookingLink');

    const state = {
        tripPlan: 'airport',
        journey: 'one_way',
        vehicleType: 'economy',
        lastFare: null
    };

    function cleanText(value, maxLen) {
        return String(value || '')
            .replace(/[<>]/g, '')
            .replace(/\s+/g, ' ')
            .trim()
            .slice(0, maxLen || 220);
    }

    function toNumber(value, fallback) {
        const number = Number(value);
        return Number.isFinite(number) ? number : (fallback || 0);
    }

    function formatMoney(value) {
        const amount = Math.max(0, Math.round(toNumber(value, 0)));
        return `INR ${amount.toLocaleString('en-IN')}`;
    }

    function formatDistance(value) {
        const km = Math.max(0, toNumber(value, 0));
        return `${km.toLocaleString('en-IN', { maximumFractionDigits: 1 })} km`;
    }

    function todayValue() {
        const now = new Date();
        const yyyy = now.getFullYear();
        const mm = String(now.getMonth() + 1).padStart(2, '0');
        const dd = String(now.getDate()).padStart(2, '0');
        return `${yyyy}-${mm}-${dd}`;
    }

    function defaultTimeValue() {
        const next = new Date(Date.now() + 45 * 60 * 1000);
        const hh = String(next.getHours()).padStart(2, '0');
        const mm = String(Math.ceil(next.getMinutes() / 5) * 5).padStart(2, '0');
        return `${hh}:${mm === '60' ? '55' : mm}`;
    }

    function normalizePhone(value) {
        const raw = cleanText(value, 40).replace(/\s+/g, '');
        if (!raw) return '';
        if (raw.startsWith('+')) {
            const digits = raw.slice(1).replace(/\D/g, '');
            return digits.length >= 8 && digits.length <= 15 ? `+${digits}` : '';
        }
        const digits = raw.replace(/\D/g, '');
        if (/^[6-9]\d{9}$/.test(digits)) return `+91${digits}`;
        if (digits.length >= 8 && digits.length <= 15) return `+${digits}`;
        return '';
    }

    function normalizeTripServiceType() {
        if (state.tripPlan === 'airport') return 'airport_pickup_drop';
        if (state.tripPlan === 'rental') return 'hourly_rental';
        if (state.tripPlan === 'outstation') return state.journey === 'round_trip' ? 'outstation_round_trip' : 'outstation_one_way';
        return 'local_city';
    }

    function routeKey(left, right) {
        return `${cleanText(left, 90).toLowerCase()}|${cleanText(right, 90).toLowerCase()}`;
    }

    function estimateFallbackDistance(pickup, drop) {
        const routes = new Map([
            [routeKey('jaipur airport', 'jaipur city'), 13],
            [routeKey('delhi airport', 'jaipur'), 280],
            [routeKey('jaipur', 'agra taj mahal'), 240],
            [routeKey('jaipur', 'agra'), 240],
            [routeKey('jaipur', 'udaipur'), 395],
            [routeKey('jaipur', 'jodhpur'), 335],
            [routeKey('udaipur airport', 'udaipur city'), 22],
            [routeKey('delhi', 'agra'), 230]
        ]);
        const direct = routes.get(routeKey(pickup, drop));
        const reverse = routes.get(routeKey(drop, pickup));
        if (direct || reverse) return direct || reverse;
        if (state.tripPlan === 'airport') return 22;
        if (state.tripPlan === 'outstation') return state.journey === 'round_trip' ? 260 : 160;
        if (state.tripPlan === 'rental') return 80;
        return 12;
    }

    function buildFareInput() {
        const pickup = cleanText(fields.pickup.value, 180);
        const drop = cleanText(fields.drop.value, 180);
        const fallbackDistance = estimateFallbackDistance(pickup, drop);
        return {
            pickup,
            drop,
            tripPlan: state.tripPlan,
            tripServiceType: normalizeTripServiceType(),
            vehicleType: state.vehicleType,
            passengers: toNumber(fields.passengers.value, 1),
            paymentMethod: fields.payment.value || 'cash',
            rideDate: fields.rideDate.value,
            rideTime: fields.rideTime.value,
            returnDate: state.journey === 'round_trip' ? fields.returnDate.value : '',
            returnTime: state.journey === 'round_trip' ? fields.returnTime.value : '',
            isReturnTrip: state.journey === 'round_trip',
            distanceKm: fallbackDistance,
            distanceSource: pickup && drop ? 'shortcut_estimate' : 'shortcut_default'
        };
    }

    function estimateFare() {
        const input = buildFareInput();
        let fare = null;
        if (
            window.GoIndiaRideFareCalculator &&
            typeof window.GoIndiaRideFareCalculator.estimateBookingFare === 'function'
        ) {
            try {
                fare = window.GoIndiaRideFareCalculator.estimateBookingFare(input);
            } catch (_error) {
                fare = null;
            }
        }
        if (!fare) {
            const perKm = state.vehicleType === 'suv' ? 18 : state.vehicleType === 'sedan' ? 13 : 10;
            const base = state.tripPlan === 'airport' ? 180 : state.tripPlan === 'outstation' ? 260 : state.tripPlan === 'rental' ? 900 : 99;
            const returnBoost = state.journey === 'round_trip' ? 1.58 : 1;
            const totalFare = Math.max(99, Math.round((base + input.distanceKm * perKm) * returnBoost));
            fare = {
                ...input,
                totalFare,
                amount: totalFare,
                finalFare: totalFare,
                distanceKm: input.distanceKm,
                distanceSource: input.distanceSource,
                calculatedAt: new Date().toISOString()
            };
        }
        state.lastFare = fare;
        fareAmount.textContent = formatMoney(fare.totalFare || fare.amount || fare.finalFare || 0);
        distanceAmount.textContent = formatDistance(fare.distanceKm || 0);
        updateWhatsAppLink();
        return fare;
    }

    function makeBookingId() {
        const timePart = Date.now().toString(36).toUpperCase();
        const randomPart = Math.random().toString(36).slice(2, 8).toUpperCase();
        return `RID${timePart}${randomPart}`;
    }

    function readArray(key) {
        try {
            const parsed = JSON.parse(localStorage.getItem(key) || '[]');
            return Array.isArray(parsed) ? parsed.filter((item) => item && typeof item === 'object') : [];
        } catch (_error) {
            return [];
        }
    }

    function writeMergedArray(key, booking) {
        const bookingId = cleanText(booking.bookingId || booking.id, 120);
        if (!bookingId) return;
        const rows = readArray(key);
        const index = rows.findIndex((item) => cleanText(item.bookingId || item.id, 120) === bookingId);
        if (index >= 0) rows[index] = { ...rows[index], ...booking, id: bookingId, bookingId };
        else rows.unshift({ ...booking, id: bookingId, bookingId });
        localStorage.setItem(key, JSON.stringify(rows.slice(0, 250)));
    }

    function persistBooking(booking) {
        STORE_KEYS.forEach((key) => writeMergedArray(key, booking));
        writeMergedArray(ADMIN_REVIEW_KEY, {
            ...booking,
            adminReviewStatus: 'pending',
            status: 'pending_admin_review',
            sourceKey: booking.sourceKey || 'shortcut_public_booking'
        });
        localStorage.setItem(LAST_BOOKING_KEY, JSON.stringify({
            bookingId: booking.bookingId,
            pickup: booking.pickup,
            drop: booking.drop,
            totalFare: booking.totalFare,
            savedAt: new Date().toISOString()
        }));
    }

    function getApiBaseCandidates() {
        const host = String(window.location.hostname || '').toLowerCase();
        const origin = String(window.location.origin || '').replace(/\/$/, '');
        const candidates = [];
        const push = (value) => {
            const base = String(value || '').trim().replace(/\/$/, '');
            if (!base || !/^https?:\/\//i.test(base)) return;
            if (!candidates.includes(base)) candidates.push(base);
        };
        const runtimeBase = window.__GOINDIARIDE_RUNTIME_API_ORIGIN__ || window.__GOINDIARIDE_API_ORIGIN__ || window.GOINDIARIDE_API_BASE || '';
        if (host === 'goindiaride.in' || host === 'www.goindiaride.in' || host.endsWith('.goindiaride.in') || host.endsWith('.github.io')) {
            push(API_RENDER_BASE);
        }
        push(runtimeBase);
        try {
            push(localStorage.getItem('goindiaride_api_base') || '');
        } catch (_error) {
            // Storage can be disabled in strict browser modes.
        }
        if (host === 'localhost' || host === '127.0.0.1') {
            push('http://localhost:5000');
            push(API_RENDER_BASE);
        }
        if (!host.endsWith('.github.io') && host !== 'goindiaride.in' && host !== 'www.goindiaride.in') {
            push(origin);
        }
        return candidates;
    }

    async function postJsonAcrossBases(path, body, timeoutMs) {
        const attempts = [];
        for (const base of getApiBaseCandidates()) {
            const controller = new AbortController();
            const timeout = window.setTimeout(() => controller.abort(), timeoutMs || 12000);
            try {
                const response = await fetch(`${base}${path}`, {
                    method: 'POST',
                    cache: 'no-store',
                    headers: {
                        Accept: 'application/json',
                        'Content-Type': 'application/json',
                        'x-booking-client': 'goindiaride-web',
                        'x-request-id': `gir-shortcut-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
                        'x-timestamp': String(Date.now()),
                        'x-idempotency-key': `gir-shortcut:${body.bookingId || body.id || Date.now()}:${path}`
                    },
                    body: JSON.stringify(body),
                    signal: controller.signal
                });
                window.clearTimeout(timeout);
                let data = {};
                try {
                    data = await response.json();
                } catch (_error) {
                    data = {};
                }
                if (response.ok && data.ok !== false) {
                    return { ok: true, base, status: response.status, data };
                }
                attempts.push({ base, status: response.status, reason: cleanText(data.message || data.reason || 'request_failed', 160) });
            } catch (error) {
                window.clearTimeout(timeout);
                attempts.push({ base, status: 0, reason: cleanText(error && error.name === 'AbortError' ? 'request_timeout' : error.message, 160) });
            }
        }
        return { ok: false, attempts, reason: attempts.length ? attempts[attempts.length - 1].reason : 'api_unavailable' };
    }

    function buildBookingPayload(existingId) {
        const fare = estimateFare();
        const bookingId = existingId || makeBookingId();
        const phone = normalizePhone(fields.phone.value);
        const pickup = cleanText(fields.pickup.value, 180);
        const drop = cleanText(fields.drop.value, 180);
        const customerName = cleanText(fields.name.value, 140) || 'Public booking customer';
        const totalFare = Math.round(toNumber(fare.totalFare || fare.amount || fare.finalFare, 0));
        const now = new Date().toISOString();
        return {
            id: bookingId,
            bookingId,
            customerId: '',
            customerName,
            customerPhone: phone,
            customerEmail: '',
            customerSnapshot: {
                name: customerName,
                phone,
                email: ''
            },
            pickup,
            pickupLocation: pickup,
            drop,
            dropoff: drop,
            dropLocation: drop,
            rideDate: fields.rideDate.value,
            rideTime: fields.rideTime.value,
            returnDate: state.journey === 'round_trip' ? fields.returnDate.value : '',
            returnTime: state.journey === 'round_trip' ? fields.returnTime.value : '',
            returnTrip: {
                enabled: state.journey === 'round_trip',
                returnDate: state.journey === 'round_trip' ? fields.returnDate.value : '',
                returnTime: state.journey === 'round_trip' ? fields.returnTime.value : ''
            },
            journeyType: state.journey,
            tripPlan: state.tripPlan,
            tripServiceType: normalizeTripServiceType(),
            serviceType: normalizeTripServiceType(),
            vehicleType: state.vehicleType,
            rideType: state.vehicleType,
            passengers: toNumber(fields.passengers.value, 1),
            luggage: '',
            paymentMethod: fields.payment.value || 'cash',
            notes: cleanText(fields.notes.value, 300),
            distanceKm: toNumber(fare.distanceKm, 0),
            distanceSource: cleanText(fare.distanceSource || 'shortcut_estimate', 80),
            amount: totalFare,
            totalFare,
            finalFare: totalFare,
            fareBreakdown: fare,
            fareQuote: {
                amount: totalFare,
                currency: 'INR',
                distanceKm: toNumber(fare.distanceKm, 0),
                estimatedAt: now
            },
            currency: 'INR',
            status: 'pending_admin_review',
            adminReviewStatus: 'pending',
            adminBookingScope: 'customer',
            sourceKey: 'shortcut_public_booking',
            mode: 'public_no_login_shortcut',
            backendStatus: 'public_shortcut_local_saved',
            bookingChannel: 'google_direct_shortcut',
            createdAt: now,
            updatedAt: now
        };
    }

    function setMessage(message, type) {
        formMessage.textContent = message || '';
        formMessage.classList.toggle('is-success', type === 'success');
        formMessage.classList.toggle('is-error', type === 'error');
    }

    function setBusy(isBusy) {
        submitBtn.disabled = Boolean(isBusy);
        submitBtn.querySelector('span').textContent = isBusy ? 'Sending request' : 'Send booking request';
        syncStatus.textContent = isBusy ? 'Sending' : 'Ready';
    }

    function clearFieldErrors() {
        form.querySelectorAll('.field-shell.has-error').forEach((field) => field.classList.remove('has-error'));
    }

    function markError(input) {
        const shell = input && input.closest('.field-shell');
        if (shell) shell.classList.add('has-error');
    }

    function validate() {
        clearFieldErrors();
        const errors = [];
        if (!cleanText(fields.pickup.value, 180)) {
            errors.push('Pickup is required');
            markError(fields.pickup);
        }
        if (!cleanText(fields.drop.value, 180)) {
            errors.push('Drop is required');
            markError(fields.drop);
        }
        if (!fields.rideDate.value) {
            errors.push('Date is required');
            markError(fields.rideDate);
        }
        if (!fields.rideTime.value) {
            errors.push('Time is required');
            markError(fields.rideTime);
        }
        if (!normalizePhone(fields.phone.value)) {
            errors.push('Valid mobile number is required');
            markError(fields.phone);
        }
        if (state.journey === 'round_trip' && !fields.returnDate.value) {
            errors.push('Return date is required');
            markError(fields.returnDate);
        }
        return errors;
    }

    function updateWhatsAppLink(booking) {
        const pickup = booking ? booking.pickup : cleanText(fields.pickup.value, 120);
        const drop = booking ? booking.drop : cleanText(fields.drop.value, 120);
        const fare = booking ? booking.totalFare : (state.lastFare && state.lastFare.totalFare);
        const text = [
            'I want to book a GO India RIDE cab.',
            pickup ? `Pickup: ${pickup}` : '',
            drop ? `Drop: ${drop}` : '',
            fields.rideDate.value ? `Date: ${fields.rideDate.value}` : '',
            fields.rideTime.value ? `Time: ${fields.rideTime.value}` : '',
            fare ? `Estimated fare: ${formatMoney(fare)}` : ''
        ].filter(Boolean).join('\n');
        whatsAppBookingLink.href = `https://wa.me/${ADMIN_PHONE}?text=${encodeURIComponent(text)}`;
    }

    async function submitBooking(event) {
        event.preventDefault();
        const errors = validate();
        if (errors.length) {
            setMessage(errors[0], 'error');
            syncStatus.textContent = 'Check form';
            return;
        }

        setBusy(true);
        setMessage('', '');
        const booking = buildBookingPayload();
        persistBooking(booking);
        updateWhatsAppLink(booking);

        const queueBody = {
            source: 'shortcut_public_booking',
            reason: 'public_no_login_shortcut',
            bookings: [booking]
        };
        const queueResult = await postJsonAcrossBases('/api/bookings/fallback/admin-review-queue', queueBody, 12000);

        let emailResult = { ok: false, reason: 'not_attempted' };
        if (queueResult.ok) {
            syncStatus.textContent = 'Queued';
        }
        emailResult = await postJsonAcrossBases('/api/bookings/fallback/admin-alert-email', booking, 18000);

        const backendStatus = emailResult.ok
            ? 'admin_alert_sent'
            : queueResult.ok
                ? 'admin_queue_synced_email_pending'
                : 'local_saved_sync_pending';
        const updated = {
            ...booking,
            backendStatus,
            adminQueueSyncStatus: queueResult.ok ? 'queued' : 'pending',
            adminQueueSyncReason: queueResult.ok ? '' : cleanText(queueResult.reason || 'api_unavailable', 120),
            adminEmailDispatch: {
                state: emailResult.ok ? 'sent' : 'pending',
                reason: emailResult.ok ? '' : cleanText(emailResult.reason || 'api_unavailable', 120),
                updatedAt: new Date().toISOString()
            },
            updatedAt: new Date().toISOString()
        };
        persistBooking(updated);
        setBusy(false);

        if (emailResult.ok || queueResult.ok) {
            syncStatus.textContent = emailResult.ok ? 'Sent' : 'Queued';
            setMessage(`Booking ${booking.bookingId} received. GO India RIDE will confirm on your mobile.`, 'success');
            return;
        }

        syncStatus.textContent = 'Saved';
        setMessage(`Booking ${booking.bookingId} is saved on this device. Use WhatsApp or call for instant confirmation.`, 'success');
    }

    function wireTabs() {
        document.querySelectorAll('.service-tab').forEach((button) => {
            button.addEventListener('click', () => {
                state.tripPlan = button.dataset.tripPlan || 'city';
                document.querySelectorAll('.service-tab').forEach((tab) => {
                    const active = tab === button;
                    tab.classList.toggle('is-active', active);
                    tab.setAttribute('aria-selected', active ? 'true' : 'false');
                });
                estimateFare();
            });
        });

        document.querySelectorAll('.journey-btn').forEach((button) => {
            button.addEventListener('click', () => {
                state.journey = button.dataset.journey || 'one_way';
                document.querySelectorAll('.journey-btn').forEach((tab) => tab.classList.toggle('is-active', tab === button));
                form.classList.toggle('is-round-trip', state.journey === 'round_trip');
                if (state.journey === 'round_trip' && !fields.returnDate.value) {
                    fields.returnDate.value = fields.rideDate.value || todayValue();
                }
                estimateFare();
            });
        });

        document.querySelectorAll('.vehicle-card').forEach((button) => {
            button.addEventListener('click', () => {
                state.vehicleType = button.dataset.vehicle || 'economy';
                document.querySelectorAll('.vehicle-card').forEach((card) => card.classList.toggle('is-active', card === button));
                estimateFare();
            });
        });

        document.querySelectorAll('.route-suggestions button').forEach((button) => {
            button.addEventListener('click', () => {
                fields.pickup.value = button.dataset.pickup || '';
                fields.drop.value = button.dataset.drop || '';
                estimateFare();
            });
        });
    }

    function wireLocationButton() {
        const button = document.getElementById('useLocationBtn');
        if (!button) return;
        button.addEventListener('click', () => {
            if (!navigator.geolocation) {
                setMessage('Current location is not available in this browser.', 'error');
                return;
            }
            button.disabled = true;
            navigator.geolocation.getCurrentPosition((position) => {
                const lat = Number(position.coords.latitude || 0).toFixed(5);
                const lng = Number(position.coords.longitude || 0).toFixed(5);
                fields.pickup.value = `Current location (${lat}, ${lng})`;
                button.disabled = false;
                estimateFare();
            }, () => {
                button.disabled = false;
                setMessage('Location permission was not allowed.', 'error');
            }, {
                enableHighAccuracy: true,
                timeout: 9000,
                maximumAge: 120000
            });
        });
    }

    function initDefaults() {
        const today = todayValue();
        fields.rideDate.min = today;
        fields.returnDate.min = today;
        fields.rideDate.value = fields.rideDate.value || today;
        fields.rideTime.value = fields.rideTime.value || defaultTimeValue();
        Object.values(fields).forEach((input) => {
            if (input) input.addEventListener('input', estimateFare);
            if (input && input.tagName === 'SELECT') input.addEventListener('change', estimateFare);
        });
        estimateFare();
    }

    wireTabs();
    wireLocationButton();
    initDefaults();
    form.addEventListener('submit', submitBooking);
})();
