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
        stopOne: document.getElementById('stopOneInput'),
        stopTwo: document.getElementById('stopTwoInput'),
        serviceMode: document.getElementById('serviceModeInput'),
        vehicleModel: document.getElementById('vehicleModelInput'),
        name: document.getElementById('nameInput'),
        phone: document.getElementById('phoneInput'),
        email: document.getElementById('emailInput'),
        passengers: document.getElementById('passengerInput'),
        luggage: document.getElementById('luggageInput'),
        payment: document.getElementById('paymentInput'),
        budget: document.getElementById('budgetInput'),
        promo: document.getElementById('promoInput'),
        notes: document.getElementById('notesInput'),
        terminal: document.getElementById('terminalInput'),
        flight: document.getElementById('flightInput'),
        fuelPreference: document.getElementById('fuelPreferenceInput'),
        gstCompany: document.getElementById('gstCompanyInput'),
        gstNumber: document.getElementById('gstNumberInput'),
        editReason: document.getElementById('editReasonInput'),
        manageBooking: document.getElementById('manageBookingInput')
    };

    const fareAmount = document.getElementById('fareAmount');
    const distanceAmount = document.getElementById('distanceAmount');
    const syncStatus = document.getElementById('syncStatus');
    const formMessage = document.getElementById('formMessage');
    const submitBtn = document.getElementById('submitBookingBtn');
    const whatsAppBookingLink = document.getElementById('whatsAppBookingLink');
    const loadBookingBtn = document.getElementById('loadBookingBtn');
    const newBookingBtn = document.getElementById('newBookingBtn');

    const state = {
        tripPlan: 'airport',
        journey: 'one_way',
        vehicleType: 'economy',
        lastFare: null,
        editingBookingId: '',
        editOriginal: null
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

    function normalizeEmail(value) {
        const email = cleanText(value, 180).toLowerCase();
        return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ? email : '';
    }

    function readStops() {
        return [fields.stopOne, fields.stopTwo]
            .map((input) => cleanText(input && input.value, 160))
            .filter(Boolean);
    }

    function readBooleanMap(selector) {
        const result = {};
        document.querySelectorAll(selector).forEach((input) => {
            const key = cleanText(input.dataset.addon || input.dataset.safety || '', 60);
            if (key) result[key] = Boolean(input.checked);
        });
        return result;
    }

    function readBookingAddOns() {
        return readBooleanMap('[data-addon]');
    }

    function readSafetyAccessibility() {
        return readBooleanMap('[data-safety]');
    }

    function readSpecialRequests() {
        const addOns = readBookingAddOns();
        return {
            aircondition: true,
            meetassist: Boolean(addOns.meetAssist),
            waterbottle: Boolean(addOns.waterBottle),
            charger: Boolean(addOns.phoneCharger),
            wifi: Boolean(addOns.wifi),
            gstinvoice: Boolean(cleanText(fields.gstCompany && fields.gstCompany.value, 140) || cleanText(fields.gstNumber && fields.gstNumber.value, 40))
        };
    }

    function readTravelAssurance() {
        return {
            flightDetails: {
                flightNumber: cleanText(fields.flight && fields.flight.value, 80),
                terminal: cleanText(fields.terminal && fields.terminal.value, 120),
                pickupPoint: cleanText(fields.terminal && fields.terminal.value, 120)
            },
            policyPreferences: {
                flexibleCancellation: true,
                adminReviewBeforeDispatch: true,
                customerEditRequested: Boolean(state.editingBookingId),
                liveTripShare: Boolean(readSafetyAccessibility().livetripshare)
            },
            billingDetails: {
                gstInvoiceRequired: Boolean(cleanText(fields.gstCompany && fields.gstCompany.value, 140) || cleanText(fields.gstNumber && fields.gstNumber.value, 40)),
                gstCompanyName: cleanText(fields.gstCompany && fields.gstCompany.value, 140),
                gstNumber: cleanText(fields.gstNumber && fields.gstNumber.value, 40)
            },
            addOns: readBookingAddOns()
        };
    }

    function buildLocationPins(pickup, drop, stops) {
        const currentMatch = /^current location \((-?\d+(?:\.\d+)?),\s*(-?\d+(?:\.\d+)?)\)$/i.exec(pickup || '');
        const pickupCoordinates = currentMatch
            ? { lat: Number(currentMatch[1]), lng: Number(currentMatch[2]), source: 'browser_geolocation' }
            : null;
        return {
            pickup: {
                label: pickup,
                coordinates: pickupCoordinates,
                googleMapsUrl: pickupCoordinates ? `https://www.google.com/maps?q=${pickupCoordinates.lat},${pickupCoordinates.lng}` : ''
            },
            dropoff: {
                label: drop,
                coordinates: null,
                googleMapsUrl: ''
            },
            stops: stops.map((label) => ({ label, coordinates: null, googleMapsUrl: '' }))
        };
    }

    function buildFullDetailNotes(baseNotes, details = {}) {
        const lines = [
            cleanText(baseNotes, 300),
            details.serviceMode ? `Service mode: ${details.serviceMode}` : '',
            details.journey ? `Journey: ${details.journey}` : '',
            details.terminal ? `Terminal/Gate: ${details.terminal}` : '',
            details.flight ? `Flight/Train: ${details.flight}` : '',
            details.stops && details.stops.length ? `Stops: ${details.stops.join(' | ')}` : '',
            details.luggage ? `Luggage: ${details.luggage}` : '',
            details.vehicleModel ? `Cab model: ${details.vehicleModel}` : '',
            details.fuelPreference ? `Fuel preference: ${details.fuelPreference}` : '',
            details.budgetAmount ? `Customer budget: INR ${details.budgetAmount}` : '',
            details.promoCode ? `Promo: ${details.promoCode}` : '',
            details.gstCompany || details.gstNumber ? `GST: ${details.gstCompany || 'Company not set'} ${details.gstNumber || ''}` : '',
            details.editReason ? `Customer edit note: ${details.editReason}` : ''
        ].filter(Boolean);
        return cleanText(lines.join(' | '), 600);
    }

    function computeChangedFields(previous = {}, next = {}) {
        if (!previous || !previous.bookingId) return [];
        const pairs = [
            ['pickup', previous.pickup || previous.pickupLocation, next.pickup],
            ['dropoff', previous.dropoff || previous.drop || previous.dropLocation, next.dropoff],
            ['rideDate', previous.rideDate, next.rideDate],
            ['rideTime', previous.rideTime, next.rideTime],
            ['returnDate', previous.returnDate || previous.returnTrip?.returnDate, next.returnDate],
            ['returnTime', previous.returnTime || previous.returnTrip?.returnTime, next.returnTime],
            ['tripPlan', previous.tripPlan, next.tripPlan],
            ['tripServiceType', previous.tripServiceType || previous.serviceType, next.tripServiceType],
            ['vehicleType', previous.vehicleType || previous.rideType, next.vehicleType],
            ['vehicleModel', previous.vehicleModel, next.vehicleModel],
            ['passengers', previous.passengers, next.passengers],
            ['luggage', previous.luggage, next.luggage],
            ['paymentMethod', previous.paymentMethod || previous.payment?.method, next.paymentMethod],
            ['notes', previous.notes, next.notes],
            ['budgetAmount', previous.budgetAmount || previous.customerBidAmount, next.budgetAmount],
            ['stops', JSON.stringify(previous.stops || []), JSON.stringify(next.stops || [])],
            ['specialRequests', JSON.stringify(previous.specialRequests || previous.customerFeatures?.specialRequests || {}), JSON.stringify(next.specialRequests || {})],
            ['safetyAccessibility', JSON.stringify(previous.safetyAccessibility || previous.customerFeatures?.safetyAccessibility || {}), JSON.stringify(next.safetyAccessibility || {})]
        ];
        return pairs
            .filter(([, before, after]) => cleanText(before, 1000) !== cleanText(after, 1000))
            .map(([field]) => field);
    }

    function activeBookingId() {
        return cleanText(state.editingBookingId || '', 120).toUpperCase();
    }

    function normalizeTripServiceType() {
        const serviceMode = cleanText(fields.serviceMode && fields.serviceMode.value, 80);
        if (serviceMode) return serviceMode;
        if (state.tripPlan === 'airport') return 'airport_pickup_drop';
        if (state.tripPlan === 'rental') return 'hourly_rental';
        if (state.journey === 'multi_city') return 'multi_city';
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
        if (state.journey === 'multi_city') return 45;
        return 12;
    }

    function buildFareInput() {
        const pickup = cleanText(fields.pickup.value, 180);
        const drop = cleanText(fields.drop.value, 180);
        const stops = readStops();
        const fallbackDistance = estimateFallbackDistance(pickup, drop);
        return {
            pickup,
            drop,
            tripPlan: state.tripPlan,
            tripServiceType: normalizeTripServiceType(),
            vehicleType: state.vehicleType,
            vehicleModel: cleanText(fields.vehicleModel && fields.vehicleModel.value, 80),
            vehicleFuelPreference: cleanText(fields.fuelPreference && fields.fuelPreference.value, 80),
            passengers: toNumber(fields.passengers.value, 1),
            luggage: cleanText(fields.luggage && fields.luggage.value, 80),
            paymentMethod: fields.payment.value || 'cash',
            rideDate: fields.rideDate.value,
            rideTime: fields.rideTime.value,
            returnDate: state.journey === 'round_trip' ? fields.returnDate.value : '',
            returnTime: state.journey === 'round_trip' ? fields.returnTime.value : '',
            isReturnTrip: state.journey === 'round_trip',
            stops,
            specialRequests: readSpecialRequests(),
            safetyAccessibility: readSafetyAccessibility(),
            budgetAmount: toNumber(fields.budget && fields.budget.value, 0),
            promoCode: cleanText(fields.promo && fields.promo.value, 40).toUpperCase(),
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

    function makeIdempotencyKey(body, endpointPath) {
        const bookingPart = cleanText(body && (body.bookingId || body.id), 80)
            .replace(/[^A-Za-z0-9_-]/g, '')
            .slice(0, 48) || Date.now().toString(36);
        const endpointPart = cleanText(endpointPath, 90)
            .replace(/[^A-Za-z0-9:_-]/g, '_')
            .replace(/^_+|_+$/g, '')
            .slice(0, 52) || 'booking';
        const randomPart = Math.random().toString(36).slice(2, 10);
        return `gir-shortcut_${bookingPart}_${endpointPart}_${randomPart}`.slice(0, 128);
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
                        'x-idempotency-key': makeIdempotencyKey(body, path)
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
        const bookingId = (existingId || activeBookingId() || makeBookingId()).toUpperCase();
        const phone = normalizePhone(fields.phone.value);
        const pickup = cleanText(fields.pickup.value, 180);
        const drop = cleanText(fields.drop.value, 180);
        const customerName = cleanText(fields.name.value, 140) || 'Public booking customer';
        const customerEmail = normalizeEmail(fields.email && fields.email.value);
        const totalFare = Math.round(toNumber(fare.totalFare || fare.amount || fare.finalFare, 0));
        const now = new Date().toISOString();
        const stops = readStops();
        const specialRequests = readSpecialRequests();
        const safetyAccessibility = readSafetyAccessibility();
        const travelAssurance = readTravelAssurance();
        const terminal = cleanText(fields.terminal && fields.terminal.value, 120);
        const flightNumber = cleanText(fields.flight && fields.flight.value, 80);
        const serviceMode = normalizeTripServiceType();
        const vehicleModel = cleanText(fields.vehicleModel && fields.vehicleModel.value, 80);
        const fuelPreference = cleanText(fields.fuelPreference && fields.fuelPreference.value, 80);
        const luggage = cleanText(fields.luggage && fields.luggage.value, 80);
        const budgetAmount = toNumber(fields.budget && fields.budget.value, 0);
        const promoCode = cleanText(fields.promo && fields.promo.value, 40).toUpperCase();
        const editReason = cleanText(fields.editReason && fields.editReason.value, 180);
        const locationPins = buildLocationPins(pickup, drop, stops);
        const fullNotes = buildFullDetailNotes(fields.notes.value, {
            serviceMode,
            journey: state.journey,
            terminal,
            flight: flightNumber,
            stops,
            luggage,
            vehicleModel,
            fuelPreference,
            budgetAmount,
            promoCode,
            gstCompany: cleanText(fields.gstCompany && fields.gstCompany.value, 140),
            gstNumber: cleanText(fields.gstNumber && fields.gstNumber.value, 40),
            editReason
        });
        const existing = state.editOriginal && state.editOriginal.bookingId === bookingId ? state.editOriginal : {};
        const editHistory = Array.isArray(existing.editHistory) ? existing.editHistory.slice(-49) : [];
        if (existing.bookingId) {
            editHistory.push({
                editedAt: now,
                by: 'customer',
                source: 'public_shortcut_booking',
                reason: editReason || 'Updated by customer from shortcut booking page.',
                changedFields: []
            });
        }
        const returnTrip = {
            enabled: state.journey === 'round_trip',
            returnDate: state.journey === 'round_trip' ? fields.returnDate.value : '',
            returnTime: state.journey === 'round_trip' ? fields.returnTime.value : '',
            returnDateTime: state.journey === 'round_trip' && fields.returnDate.value && fields.returnTime.value
                ? `${fields.returnDate.value}T${fields.returnTime.value}:00`
                : null
        };
        const customerFeatures = {
            specialRequests,
            safetyAccessibility,
            hasStops: stops.length > 0,
            hasReturnTrip: returnTrip.enabled,
            airportTerminalNote: terminal,
            vehicleFuelPreference: fuelPreference,
            locationPins,
            pickupCoordinates: locationPins.pickup.coordinates,
            dropoffCoordinates: locationPins.dropoff.coordinates,
            routeStopLocations: locationPins.stops,
            travelAssurance,
            flightDetails: travelAssurance.flightDetails,
            policyPreferences: travelAssurance.policyPreferences,
            billingDetails: travelAssurance.billingDetails,
            addOns: travelAssurance.addOns,
            publicShortcutEditEnabled: true
        };
        const payload = {
            ...existing,
            id: bookingId,
            bookingId,
            customerId: '',
            customerName,
            customerPhone: phone,
            customerEmail,
            customerSnapshot: {
                name: customerName,
                phone,
                email: customerEmail
            },
            phoneVerification: {
                status: 'contact_only',
                source: 'public_shortcut_required_contact',
                fallbackReason: ''
            },
            pickup,
            pickupLocation: pickup,
            pickupCoordinates: locationPins.pickup.coordinates,
            pickupGoogleMapsUrl: locationPins.pickup.googleMapsUrl,
            drop,
            dropoff: drop,
            dropLocation: drop,
            dropoffCoordinates: locationPins.dropoff.coordinates,
            dropoffGoogleMapsUrl: locationPins.dropoff.googleMapsUrl,
            locationPins,
            stops,
            routeStopLocations: locationPins.stops,
            rideDate: fields.rideDate.value,
            rideTime: fields.rideTime.value,
            returnDate: returnTrip.returnDate,
            returnTime: returnTrip.returnTime,
            returnTrip,
            journeyType: state.journey,
            tripPlan: state.tripPlan,
            tripServiceType: serviceMode,
            serviceType: serviceMode,
            airportServiceMode: serviceMode,
            airportServiceLabel: serviceMode.replace(/_/g, ' '),
            airportTerminalNote: terminal,
            travelAssurance,
            flightDetails: travelAssurance.flightDetails,
            policyPreferences: travelAssurance.policyPreferences,
            billingDetails: travelAssurance.billingDetails,
            bookingAddOns: travelAssurance.addOns,
            vehicleType: state.vehicleType,
            rideType: state.vehicleType,
            vehicleModel,
            vehicleFuelPreference: fuelPreference,
            fuelPreference,
            passengers: toNumber(fields.passengers.value, 1),
            luggage,
            paymentMethod: fields.payment.value || 'cash',
            notes: fullNotes,
            distanceKm: toNumber(fare.distanceKm, 0),
            distance: toNumber(fare.distanceKm, 0),
            distanceSource: cleanText(fare.distanceSource || 'shortcut_estimate', 80),
            budgetAmount,
            customerBidAmount: budgetAmount,
            amount: totalFare,
            totalFare,
            finalFare: totalFare,
            fareBreakdown: {
                ...fare,
                totalFare,
                amount: totalFare,
                finalFare: totalFare,
                budgetAmount,
                customerBidAmount: budgetAmount
            },
            fareQuote: {
                amount: totalFare,
                currency: 'INR',
                distanceKm: toNumber(fare.distanceKm, 0),
                source: cleanText(fare.distanceSource || 'shortcut_estimate', 80),
                routeCategory: fare.routeCategory || '',
                estimatedAt: now
            },
            fareHash: cleanText(fare.fareHash || '', 240),
            payment: {
                method: fields.payment.value || 'cash',
                status: 'pending',
                mode: fields.payment.value === 'card' ? 'india_card' : 'india',
                currency: 'INR'
            },
            promo: {
                code: promoCode || null,
                discount: toNumber(fare.promoDiscount, 0)
            },
            referralCode: promoCode,
            promoCode,
            specialRequests,
            safetyAccessibility,
            customerFeatures,
            currency: 'INR',
            status: 'pending_admin_review',
            adminReviewStatus: 'pending',
            adminBookingScope: 'customer',
            sourceKey: existing.bookingId ? 'shortcut_customer_edit' : 'shortcut_public_booking',
            mode: existing.bookingId ? 'public_no_login_customer_edit' : 'public_no_login_shortcut',
            backendStatus: existing.bookingId ? 'public_shortcut_edit_local_saved' : 'public_shortcut_local_saved',
            bookingChannel: 'google_direct_shortcut',
            editCount: existing.bookingId ? Math.max(toNumber(existing.editCount, 0) + 1, editHistory.length) : toNumber(existing.editCount, 0),
            editHistory,
            lastEditedAt: existing.bookingId ? now : (existing.lastEditedAt || null),
            customerLastEditedAt: existing.bookingId ? now : (existing.customerLastEditedAt || null),
            customerEditReason: existing.bookingId ? (editReason || 'Updated by customer from shortcut booking page.') : '',
            statusHistory: [
                ...(Array.isArray(existing.statusHistory) ? existing.statusHistory.slice(-25) : []),
                {
                    status: existing.bookingId ? 'customer_edited' : 'pending_admin_review',
                    at: now,
                    source: 'public_shortcut_booking',
                    note: existing.bookingId ? (editReason || 'Customer edited booking details.') : 'Public shortcut booking submitted.'
                }
            ],
            createdAt: existing.createdAt || now,
            updatedAt: now
        };
        if (existing.bookingId) {
            const changedFields = computeChangedFields(existing, payload);
            payload.changedFields = changedFields;
            if (payload.editHistory.length) {
                payload.editHistory[payload.editHistory.length - 1].changedFields = changedFields;
            }
        }
        return payload;
    }

    function setMessage(message, type) {
        formMessage.textContent = message || '';
        formMessage.classList.toggle('is-success', type === 'success');
        formMessage.classList.toggle('is-error', type === 'error');
    }

    function setBusy(isBusy) {
        submitBtn.disabled = Boolean(isBusy);
        const idleLabel = activeBookingId() ? 'Update booking request' : 'Send booking request';
        submitBtn.querySelector('span').textContent = isBusy ? (activeBookingId() ? 'Updating request' : 'Sending request') : idleLabel;
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
        if (fields.email && fields.email.value && !normalizeEmail(fields.email.value)) {
            errors.push('Valid email is required');
            markError(fields.email);
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

    function findBookingById(bookingId) {
        const safeId = cleanText(bookingId, 120).toUpperCase();
        if (!safeId) return null;
        for (const key of [ADMIN_REVIEW_KEY, ...STORE_KEYS]) {
            const found = readArray(key).find((item) => cleanText(item.bookingId || item.id, 120).toUpperCase() === safeId);
            if (found) return found;
        }
        return null;
    }

    function defaultServiceModeForTripPlan(plan) {
        if (plan === 'airport') return 'airport_drop';
        if (plan === 'outstation') return state.journey === 'round_trip' ? 'outstation_round_trip' : 'outstation_one_way';
        if (plan === 'rental') return 'rental_full_day';
        return 'local_point';
    }

    function setTripPlan(plan, keepServiceMode = false) {
        state.tripPlan = cleanText(plan, 40) || 'city';
        document.querySelectorAll('.service-tab').forEach((tab) => {
            const active = tab.dataset.tripPlan === state.tripPlan;
            tab.classList.toggle('is-active', active);
            tab.setAttribute('aria-selected', active ? 'true' : 'false');
        });
        if (!keepServiceMode && fields.serviceMode) {
            fields.serviceMode.value = defaultServiceModeForTripPlan(state.tripPlan);
        }
    }

    function setJourney(journey) {
        state.journey = cleanText(journey, 40) || 'one_way';
        document.querySelectorAll('.journey-btn').forEach((tab) => tab.classList.toggle('is-active', tab.dataset.journey === state.journey));
        form.classList.toggle('is-round-trip', state.journey === 'round_trip');
        form.classList.toggle('is-multi-city', state.journey === 'multi_city');
        if (fields.serviceMode && state.tripPlan === 'outstation') {
            fields.serviceMode.value = defaultServiceModeForTripPlan(state.tripPlan);
        }
    }

    function setVehicle(vehicleType) {
        state.vehicleType = cleanText(vehicleType, 40) || 'economy';
        document.querySelectorAll('.vehicle-card').forEach((card) => card.classList.toggle('is-active', card.dataset.vehicle === state.vehicleType));
    }

    function hasSelectOption(input, value) {
        if (!input || input.tagName !== 'SELECT') return true;
        return Array.from(input.options || []).some((option) => option.value === value);
    }

    function setFieldValue(input, value, maxLen) {
        if (!input) return false;
        const clean = cleanText(value, maxLen || 220);
        if (!clean) return false;
        if (!hasSelectOption(input, clean)) return false;
        input.value = clean;
        return true;
    }

    function applyHomepagePrefillFromUrl() {
        const params = new URLSearchParams(window.location.search || '');
        const prefillKeys = [
            'source',
            'tripPlan',
            'journey',
            'serviceMode',
            'vehicleType',
            'vehicleModel',
            'pickup',
            'drop',
            'phone',
            'customerPhone',
            'name',
            'customerName',
            'email',
            'customerEmail',
            'rideDate',
            'rideTime',
            'returnDate',
            'returnTime',
            'passengers',
            'luggage',
            'paymentMethod',
            'budget',
            'promo',
            'notes'
        ];
        if (!prefillKeys.some((key) => params.has(key))) return false;

        const tripPlan = cleanText(params.get('tripPlan'), 40);
        const journey = cleanText(params.get('journey'), 40);
        const vehicleType = cleanText(params.get('vehicleType'), 40);
        if (tripPlan) setTripPlan(tripPlan, true);
        if (journey) setJourney(journey);
        if (vehicleType) setVehicle(vehicleType);

        setFieldValue(fields.serviceMode, params.get('serviceMode'), 80);
        setFieldValue(fields.vehicleModel, params.get('vehicleModel'), 80);
        setFieldValue(fields.pickup, params.get('pickup'), 180);
        setFieldValue(fields.drop, params.get('drop'), 180);
        setFieldValue(fields.phone, params.get('phone') || params.get('customerPhone'), 40);
        setFieldValue(fields.name, params.get('name') || params.get('customerName'), 140);
        setFieldValue(fields.email, params.get('email') || params.get('customerEmail'), 180);
        setFieldValue(fields.rideDate, params.get('rideDate'), 40);
        setFieldValue(fields.rideTime, params.get('rideTime'), 40);
        setFieldValue(fields.returnDate, params.get('returnDate'), 40);
        setFieldValue(fields.returnTime, params.get('returnTime'), 40);
        setFieldValue(fields.passengers, params.get('passengers'), 20);
        setFieldValue(fields.luggage, params.get('luggage'), 80);
        setFieldValue(fields.payment, params.get('paymentMethod'), 80);
        setFieldValue(fields.budget, params.get('budget'), 40);
        setFieldValue(fields.promo, params.get('promo'), 40);
        setFieldValue(fields.notes, params.get('notes'), 300);

        if (state.journey === 'round_trip' && !fields.returnDate.value) {
            fields.returnDate.value = fields.rideDate.value || todayValue();
        }

        estimateFare();
        syncStatus.textContent = 'Prefilled';
        setMessage('Trip details prefilled from homepage. Add remaining details and send booking request.', 'success');
        return true;
    }

    function writeCheckboxMap(selector, values = {}) {
        document.querySelectorAll(selector).forEach((input) => {
            const key = cleanText(input.dataset.addon || input.dataset.safety || '', 60);
            if (!key) return;
            input.checked = values[key] === true;
        });
    }

    function setEditMode(booking) {
        const bookingId = cleanText(booking && (booking.bookingId || booking.id), 120).toUpperCase();
        state.editingBookingId = bookingId;
        state.editOriginal = bookingId ? { ...booking, bookingId } : null;
        form.classList.toggle('is-editing', Boolean(bookingId));
        if (fields.manageBooking && bookingId) fields.manageBooking.value = bookingId;
        setBusy(false);
    }

    function clearEditMode() {
        state.editingBookingId = '';
        state.editOriginal = null;
        form.classList.remove('is-editing');
        if (fields.manageBooking) fields.manageBooking.value = '';
        if (fields.editReason) fields.editReason.value = '';
        setBusy(false);
        syncStatus.textContent = 'Ready';
    }

    function populateFormFromBooking(booking) {
        if (!booking) return false;
        const pickup = cleanText(booking.pickup || booking.pickupLocation || booking.from, 180);
        const drop = cleanText(booking.dropoff || booking.drop || booking.dropLocation || booking.to, 180);
        const returnEnabled = Boolean(booking.returnTrip?.enabled || booking.returnDate || booking.returnTime);
        const stops = Array.isArray(booking.stops) && booking.stops.length
            ? booking.stops
            : (Array.isArray(booking.routeStopLocations) ? booking.routeStopLocations.map((item) => item.label || item.name || item).filter(Boolean) : []);
        const customer = booking.customerSnapshot || {};
        const features = booking.customerFeatures || {};
        const travel = booking.travelAssurance || features.travelAssurance || {};
        fields.pickup.value = pickup;
        fields.drop.value = drop;
        fields.rideDate.value = cleanText(booking.rideDate, 40) || fields.rideDate.value;
        fields.rideTime.value = cleanText(booking.rideTime, 40) || fields.rideTime.value;
        fields.returnDate.value = cleanText(booking.returnDate || booking.returnTrip?.returnDate, 40);
        fields.returnTime.value = cleanText(booking.returnTime || booking.returnTrip?.returnTime, 40);
        fields.stopOne.value = cleanText(stops[0], 160);
        fields.stopTwo.value = cleanText(stops[1], 160);
        fields.name.value = cleanText(booking.customerName || customer.name, 140);
        fields.phone.value = cleanText(booking.customerPhone || customer.phone, 40);
        fields.email.value = cleanText(booking.customerEmail || customer.email, 180);
        fields.passengers.value = String(Math.max(1, Math.min(6, toNumber(booking.passengers, 1))));
        fields.luggage.value = cleanText(booking.luggage, 80) || 'none';
        fields.payment.value = cleanText(booking.paymentMethod || booking.payment?.method, 80) || 'cash';
        fields.budget.value = cleanText(booking.budgetAmount || booking.customerBidAmount || '', 40);
        fields.promo.value = cleanText(booking.promoCode || booking.referralCode || booking.promo?.code || '', 40);
        fields.notes.value = cleanText(booking.notes, 300);
        fields.terminal.value = cleanText(booking.airportTerminalNote || booking.flightDetails?.terminal || travel.flightDetails?.terminal || features.airportTerminalNote, 120);
        fields.flight.value = cleanText(booking.flightDetails?.flightNumber || travel.flightDetails?.flightNumber, 80);
        fields.fuelPreference.value = cleanText(booking.vehicleFuelPreference || booking.fuelPreference || features.vehicleFuelPreference, 80);
        fields.vehicleModel.value = cleanText(booking.vehicleModel, 80);
        fields.serviceMode.value = cleanText(booking.tripServiceType || booking.serviceType || booking.airportServiceMode, 80) || fields.serviceMode.value;
        fields.gstCompany.value = cleanText(booking.billingDetails?.gstCompanyName || travel.billingDetails?.gstCompanyName, 140);
        fields.gstNumber.value = cleanText(booking.billingDetails?.gstNumber || travel.billingDetails?.gstNumber, 40);
        writeCheckboxMap('[data-addon]', booking.bookingAddOns || travel.addOns || features.addOns || {});
        writeCheckboxMap('[data-safety]', booking.safetyAccessibility || features.safetyAccessibility || {});
        setTripPlan(cleanText(booking.tripPlan, 40) || 'city', true);
        setJourney(cleanText(booking.journeyType, 40) || (stops.length ? 'multi_city' : (returnEnabled ? 'round_trip' : 'one_way')));
        setVehicle(cleanText(booking.vehicleType || booking.rideType, 40) || 'economy');
        setEditMode(booking);
        estimateFare();
        return true;
    }

    function loadBookingForEdit() {
        const requestedId = cleanText(fields.manageBooking && fields.manageBooking.value, 120).toUpperCase();
        const booking = findBookingById(requestedId);
        if (!booking) {
            setMessage('Booking reference not found on this device. Use the same browser or submit a fresh request.', 'error');
            return;
        }
        populateFormFromBooking(booking);
        setMessage(`Booking ${requestedId} loaded for customer edit.`, 'success');
    }

    function resetForNewBooking() {
        form.reset();
        clearEditMode();
        setTripPlan('airport');
        setJourney('one_way');
        setVehicle('economy');
        const today = todayValue();
        fields.rideDate.min = today;
        fields.returnDate.min = today;
        fields.rideDate.value = today;
        fields.rideTime.value = defaultTimeValue();
        setMessage('', '');
        estimateFare();
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
        const isEdit = Boolean(activeBookingId());
        const booking = buildBookingPayload(activeBookingId());
        persistBooking(booking);
        updateWhatsAppLink(booking);

        const queueBody = {
            source: isEdit ? 'shortcut_customer_edit' : 'shortcut_public_booking',
            reason: isEdit ? (booking.customerEditReason || 'public_no_login_customer_edit') : 'public_no_login_shortcut',
            mode: booking.mode,
            changedFields: booking.changedFields || [],
            bookings: [booking]
        };
        const queueResult = await postJsonAcrossBases('/api/bookings/fallback/admin-review-queue', queueBody, 12000);

        let emailResult = { ok: false, reason: 'not_attempted' };
        if (queueResult.ok) {
            syncStatus.textContent = 'Queued';
        }
        emailResult = await postJsonAcrossBases('/api/bookings/fallback/admin-alert-email', booking, 18000);

        const backendStatus = emailResult.ok
            ? (isEdit ? 'admin_alert_sent_after_customer_edit' : 'admin_alert_sent')
            : queueResult.ok
                ? (isEdit ? 'admin_queue_synced_customer_edit_email_pending' : 'admin_queue_synced_email_pending')
                : (isEdit ? 'customer_edit_local_saved_sync_pending' : 'local_saved_sync_pending');
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
            fields.manageBooking.value = booking.bookingId;
            setEditMode(booking);
            setMessage(
                isEdit
                    ? `Booking ${booking.bookingId} updated. Admin portal will show the latest details.`
                    : `Booking ${booking.bookingId} received. GO India RIDE will confirm on your mobile.`,
                'success'
            );
            return;
        }

        syncStatus.textContent = 'Saved';
        fields.manageBooking.value = booking.bookingId;
        setEditMode(booking);
        setMessage(
            isEdit
                ? `Booking ${booking.bookingId} edit is saved on this device. Use WhatsApp or call for instant confirmation.`
                : `Booking ${booking.bookingId} is saved on this device. Use WhatsApp or call for instant confirmation.`,
            'success'
        );
    }

    function wireTabs() {
        document.querySelectorAll('.service-tab').forEach((button) => {
            button.addEventListener('click', () => {
                setTripPlan(button.dataset.tripPlan || 'city');
                estimateFare();
            });
        });

        document.querySelectorAll('.journey-btn').forEach((button) => {
            button.addEventListener('click', () => {
                setJourney(button.dataset.journey || 'one_way');
                if (state.journey === 'round_trip' && !fields.returnDate.value) {
                    fields.returnDate.value = fields.rideDate.value || todayValue();
                }
                estimateFare();
            });
        });

        document.querySelectorAll('.vehicle-card').forEach((button) => {
            button.addEventListener('click', () => {
                setVehicle(button.dataset.vehicle || 'economy');
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

    function wireManageButtons() {
        if (loadBookingBtn) loadBookingBtn.addEventListener('click', loadBookingForEdit);
        if (newBookingBtn) newBookingBtn.addEventListener('click', resetForNewBooking);
        document.querySelectorAll('[data-addon], [data-safety]').forEach((input) => {
            input.addEventListener('change', estimateFare);
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
    wireManageButtons();
    wireLocationButton();
    initDefaults();
    applyHomepagePrefillFromUrl();
    form.addEventListener('submit', submitBooking);
})();
