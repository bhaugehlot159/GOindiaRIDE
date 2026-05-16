/**
 * GO India RIDE - Booking System
 * Handles all booking-related functionality
 */

// Initialize booking system
document.addEventListener('DOMContentLoaded', function() {
    initializeBookingSystem();
    setupBookingForm();
    setupScheduleForm();
    setupFareCalculator();
});

let lastEstimatedDistanceKm = 5;
let lastDistanceSource = 'fallback';
let distanceEstimateTimer = null;
let distanceRequestToken = 0;
const LIVE_CUSTOMER_BOOKING_QUEUE_KEY = 'goindiaride_live_customer_booking_queue_v1';
const LIVE_PAYMENT_RECORDS_KEY = 'goindiaride_live_payment_records_v1';

/**
 * Initialize booking system
 */
function initializeBookingSystem() {
    console.log('Booking system initialized');
    
    // Load active bookings
    loadActiveBookings();
    loadScheduledBookings();
    setupBookingLiveRefresh();
    
    // Setup ride preferences
    loadRidePreferences();
}

function setupBookingLiveRefresh() {
    if (window.__goindiarideBookingLiveRefreshReady) return;
    window.__goindiarideBookingLiveRefreshReady = true;

    window.addEventListener('goindiaride:customer-bookings-updated', () => {
        loadActiveBookings({ skipBackendSync: true });
    });

    window.addEventListener('storage', (event) => {
        if (event.key === 'goindiaride_active_bookings') {
            loadActiveBookings({ skipBackendSync: true });
        }
    });
}

/**
 * Setup booking form
 */
function setupBookingForm() {
    const form = document.getElementById('bookingForm');
    
    if (!form) return;
    
    form.addEventListener('submit', function(e) {
        e.preventDefault();
        handleBookingSubmit();
    });
    
    // Auto-calculate fare when inputs change
    const pickup = document.getElementById('pickupLocation');
    const drop = document.getElementById('dropLocation');
    const vehicleType = document.getElementById('vehicleType');
    const bookingMode = document.getElementById('bookingMode');
    const driverOnlyDuration = document.getElementById('driverOnlyDuration');

    [pickup, drop].forEach((input) => {
        if (!input) return;
        input.addEventListener('change', scheduleDistanceEstimate);
        input.addEventListener('blur', scheduleDistanceEstimate);
        input.addEventListener('input', scheduleDistanceEstimate);
    });

    if (vehicleType) {
        vehicleType.addEventListener('change', calculateFarePreview);
    }

    if (bookingMode) {
        bookingMode.addEventListener('change', () => {
            updateBookingModeUI();
            calculateFarePreview();
        });
    }

    if (driverOnlyDuration) {
        driverOnlyDuration.addEventListener('change', calculateFarePreview);
        driverOnlyDuration.addEventListener('input', calculateFarePreview);
    }

    if (typeof initializeAutocomplete === 'function') {
        initializeAutocomplete('pickupLocation');
        initializeAutocomplete('dropLocation');
    }

    updateBookingModeUI();
    estimateDistanceForBooking();
}

function getBookingModeSelection() {
    const modeNode = document.getElementById('bookingMode');
    const durationNode = document.getElementById('driverOnlyDuration');

    const mode = modeNode ? String(modeNode.value || 'standard') : 'standard';
    const duration = durationNode ? Math.max(1, Number(durationNode.value || 1)) : 1;

    return { mode, duration };
}

function updateBookingModeUI() {
    const group = document.getElementById('driverOnlyDurationGroup');
    const label = document.getElementById('driverOnlyDurationLabel');
    const input = document.getElementById('driverOnlyDuration');
    const { mode } = getBookingModeSelection();

    if (!group || !label || !input) return;

    if (mode === 'driver_only_hourly') {
        group.style.display = 'block';
        label.textContent = 'Hours';
        input.min = '1';
        if (!input.value) input.value = '4';
    } else if (mode === 'driver_only_fullday') {
        group.style.display = 'block';
        label.textContent = 'Days';
        input.min = '1';
        if (!input.value) input.value = '1';
    } else if (mode === 'driver_only_multiday') {
        group.style.display = 'block';
        label.textContent = 'Days';
        input.min = '2';
        if (Number(input.value || 0) < 2) input.value = '2';
    } else {
        group.style.display = 'none';
        label.textContent = 'Duration';
    }
}

function getVehicleRate(vehicleType) {
    const rates = {
        mini: 8,
        sedan: 12,
        suv: 18,
        luxury: 25
    };

    return rates[vehicleType] || rates.sedan;
}

function cleanBookingText(value, maxLen = 160) {
    return String(value || '')
        .replace(/[<>]/g, '')
        .replace(/\s+/g, ' ')
        .trim()
        .slice(0, maxLen);
}

function generateLiveBookingId() {
    const stamp = Date.now().toString(36).toUpperCase();
    const suffix = Math.random().toString(36).slice(2, 6).toUpperCase();
    return `RID${stamp}${suffix}`;
}

function getRidePaymentMethod() {
    const node = document.getElementById('ridePaymentMethod');
    return node ? String(node.value || 'upi_intent') : 'upi_intent';
}

function buildFareBreakdown(pickup, drop, vehicleType, distanceKm, bookingMode, bookingModeDuration, isFirstBooking) {
    const distance = Math.max(1, Number(distanceKm) || 5);
    const baseFare = Number(calculateFare(pickup, drop, vehicleType, distance, bookingMode, bookingModeDuration).toFixed(2));
    const routeText = `${pickup} ${drop}`.toLowerCase();
    const tollCharge = distance >= 80 ? Number(Math.max(60, distance * 1.25).toFixed(2)) : 0;
    const parkingCharge = /(airport|railway|station|mall|fort|palace|hotel)/i.test(routeText) ? 40 : 0;
    const hour = new Date().getHours();
    const nightCharge = (hour >= 22 || hour < 5) ? Number((baseFare * 0.15).toFixed(2)) : 0;
    const subtotalBeforeTax = Number((baseFare + tollCharge + parkingCharge + nightCharge).toFixed(2));
    const gst = Number((subtotalBeforeTax * 0.05).toFixed(2));
    const promoDiscount = isFirstBooking ? Number((subtotalBeforeTax * 0.05).toFixed(2)) : 0;
    const totalFare = Number(Math.max(70, subtotalBeforeTax + gst - promoDiscount).toFixed(2));

    return {
        currency: 'INR',
        distanceKm: distance,
        distanceSource: lastDistanceSource,
        vehicleType,
        bookingMode,
        bookingModeDuration,
        baseFare,
        tollCharge,
        parkingCharge,
        nightCharge,
        gst,
        promoDiscount,
        totalFare,
        calculatedAt: new Date().toISOString()
    };
}

function formatBookingModeLabel(mode, duration) {
    const normalized = String(mode || 'standard');

    if (normalized === 'driver_only_hourly') {
        return `Driver Only - Hourly (${duration} hr)`;
    }

    if (normalized === 'driver_only_fullday') {
        return `Driver Only - Full Day (${duration} day)`;
    }

    if (normalized === 'driver_only_multiday') {
        return `Driver Only - Multi Day (${duration} days)`;
    }

    return 'Standard Ride';
}

function scheduleDistanceEstimate() {
    if (distanceEstimateTimer) {
        clearTimeout(distanceEstimateTimer);
    }

    distanceEstimateTimer = setTimeout(() => {
        estimateDistanceForBooking();
    }, 300);
}

async function estimateDistanceForBooking() {
    const pickup = document.getElementById('pickupLocation')?.value?.trim() || '';
    const drop = document.getElementById('dropLocation')?.value?.trim() || '';

    if (!pickup || !drop) {
        lastEstimatedDistanceKm = 5;
        lastDistanceSource = 'fallback';
        calculateFarePreview();
        return;
    }

    const token = ++distanceRequestToken;

    try {
        if (window.LocationDistanceEstimator && typeof LocationDistanceEstimator.estimateDistanceKm === 'function') {
            const estimate = await LocationDistanceEstimator.estimateDistanceKm(pickup, drop);
            if (token !== distanceRequestToken) return;

            const km = Number(estimate && estimate.km);
            if (Number.isFinite(km) && km > 0) {
                lastEstimatedDistanceKm = Math.max(1, Math.round(km));
                lastDistanceSource = estimate.source || 'fallback';
            } else {
                lastEstimatedDistanceKm = 5;
                lastDistanceSource = 'fallback';
            }
        } else {
            lastEstimatedDistanceKm = 5;
            lastDistanceSource = 'fallback';
        }
    } catch (error) {
        lastEstimatedDistanceKm = 5;
        lastDistanceSource = 'fallback';
    }

    calculateFarePreview();
}

function getBackendApiBase() {
    const fromApiOrigin = String(window.__GOINDIARIDE_API_ORIGIN__ || '').trim();
    const fromWindow = String(window.GOINDIARIDE_API_BASE || '').trim();
    const fromStorage = String(localStorage.getItem('goindiaride_api_base') || '').trim();
    const base = fromApiOrigin || fromWindow || fromStorage;

    if (base) return base.replace(/\/$/, '');

    const host = String(window.location.hostname || '').toLowerCase();
    if (host === 'localhost' || host === '127.0.0.1') {
        return 'http://localhost:5000';
    }

    if (/(^|\.)goindiaride\.in$/i.test(host)) {
        return 'https://api.goindiaride.in';
    }

    return String(window.location.origin || '').replace(/\/$/, '');
}

function getBackendAccessToken() {
    return (
        localStorage.getItem('accessToken') ||
        localStorage.getItem('authToken') ||
        localStorage.getItem('token') ||
        ''
    );
}

function normalizeBookingLifecycleStatus(booking = {}) {
    const adminReviewStatus = String(booking.adminReviewStatus || '').toLowerCase();
    const backendStatus = String(booking.backendStatus || booking.status || '').toLowerCase();

    if (backendStatus === 'cancelled') return 'cancelled';
    if (backendStatus === 'completed') return 'completed';
    if (adminReviewStatus === 'rejected') return 'rejected_by_admin';
    if (adminReviewStatus === 'pending' || backendStatus === 'created') return 'pending_admin_review';

    const hasDriver = Boolean(booking.driverId || booking.driverName);
    if (adminReviewStatus === 'approved' && hasDriver) return 'driver_assigned';
    if (adminReviewStatus === 'approved') return 'approved_waiting_driver';

    return 'pending_admin_review';
}

function mapBackendBookingToLocal(backend = {}) {
    const mapped = {
        id: backend.bookingId || `BOOK${Date.now()}`,
        bookingId: backend.bookingId || `BOOK${Date.now()}`,
        pickup: backend.pickupLocation || '',
        drop: backend.dropLocation || '',
        vehicleType: backend.vehicleType || 'sedan',
        bookingMode: backend.tripPlan || 'standard',
        bookingModeDuration: 1,
        acPreference: false,
        luggageSpace: false,
        timestamp: backend.createdAt || new Date().toISOString(),
        distanceKm: Number(backend.distanceKm || 0),
        fare: Number(backend.amount || 0),
        finalFare: Number(backend.amount || 0),
        otp: '----',
        backendStatus: String(backend.status || 'created'),
        adminReviewStatus: String(backend.adminReviewStatus || 'pending'),
        driverId: backend.driverId || null,
        driverName: backend.driverName || '',
        rideDate: backend.rideDate || '',
        rideTime: backend.rideTime || '',
        returnDate: backend.returnDate || '',
        returnTime: backend.returnTime || '',
        notes: backend.notes || ''
    };

    mapped.status = normalizeBookingLifecycleStatus(mapped);
    return mapped;
}

async function createSecureBackendBooking({
    pickup,
    drop,
    vehicleType,
    bookingMode,
    bookingModeDuration,
    distanceKm,
    referralCode,
    paymentMethod,
    fareBreakdown
}) {
    const token = String(getBackendAccessToken() || '').trim();
    if (!token) {
        return createFallbackAdminReviewBooking({
            pickup,
            drop,
            vehicleType,
            bookingMode,
            bookingModeDuration,
            distanceKm,
            paymentMethod,
            fareBreakdown,
            referralCode,
            reason: 'browser_session_missing'
        });
    }

    const apiBase = getBackendApiBase();
    const normalizedDistance = Math.max(1, Number(distanceKm) || 5);

    const quoteResponse = await fetch(`${apiBase}/api/bookings/quote?distanceKm=${encodeURIComponent(normalizedDistance)}`, {
        method: 'GET',
        headers: {
            Authorization: `Bearer ${token}`
        },
        credentials: 'include'
    });

    const quoteData = await quoteResponse.json().catch(() => ({}));
    if (!quoteResponse.ok) {
        throw new Error(quoteData.message || 'Booking quote service unavailable');
    }

    const bookingPayload = {
        cardToken: `secure_card_${Date.now()}_${Math.floor(Math.random() * 10000)}`,
        distanceKm: quoteData.distanceKm,
        amount: quoteData.amount,
        fareHash: quoteData.fareHash,
        referralCode: String(referralCode || '').trim(),
        pickup,
        drop,
        vehicleType,
        bookingMode,
        bookingModeDuration,
        paymentMethod,
        fareBreakdown
    };

    const bookingResponse = await fetch(`${apiBase}/api/bookings`, {
        method: 'POST',
        headers: {
            Authorization: `Bearer ${token}`,
            'Content-Type': 'application/json',
            'x-booking-client': 'goindiaride-web',
            'x-idempotency-key': `gir-booking-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`
        },
        credentials: 'include',
        body: JSON.stringify(bookingPayload)
    });

    const bookingData = await bookingResponse.json().catch(() => ({}));
    if (!bookingResponse.ok) {
        return createFallbackAdminReviewBooking({
            pickup,
            drop,
            vehicleType,
            bookingMode,
            bookingModeDuration,
            distanceKm,
            paymentMethod,
            fareBreakdown,
            referralCode,
            reason: bookingData.message || 'secure_booking_failed'
        });
    }

    return bookingData;
}

async function createFallbackAdminReviewBooking({
    pickup,
    drop,
    vehicleType,
    bookingMode,
    bookingModeDuration,
    distanceKm,
    paymentMethod,
    fareBreakdown,
    referralCode,
    reason
}) {
    const bookingId = generateLiveBookingId();
    const now = new Date().toISOString();
    const amount = Number(fareBreakdown?.totalFare || calculateFare(pickup, drop, vehicleType, distanceKm, bookingMode, bookingModeDuration));
    const booking = {
        id: bookingId,
        bookingId,
        pickup: cleanBookingText(pickup),
        drop: cleanBookingText(drop),
        pickupLocation: cleanBookingText(pickup),
        dropLocation: cleanBookingText(drop),
        vehicleType,
        tripPlan: bookingMode,
        bookingMode,
        bookingModeDuration,
        distanceKm: Number(distanceKm || 0),
        paymentMethod,
        fareBreakdown,
        amount,
        totalFare: amount,
        finalFare: amount,
        status: 'created',
        adminReviewStatus: 'pending',
        source: 'customer_live_booking_flow',
        sourceKey: 'customer_live_booking_flow',
        syncStatus: 'queued_for_admin_review',
        fallbackReason: cleanBookingText(reason, 120),
        referralCode: cleanBookingText(referralCode, 40),
        createdAt: now,
        updatedAt: now
    };

    const apiBase = getBackendApiBase();
    try {
        const response = await fetch(`${apiBase}/api/bookings/fallback/admin-review-queue`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'x-booking-client': 'goindiaride-web'
            },
            credentials: 'include',
            body: JSON.stringify({
                source: 'customer_live_booking_flow',
                mode: 'customer_live_booking',
                bookings: [booking]
            })
        });
        const data = await response.json().catch(() => ({}));
        if (response.ok && data && data.ok !== false) {
            booking.syncStatus = 'admin_review_queue_synced';
            booking.backendStatus = 'created';
            booking.fallbackQueued = true;
            recordLivePayment(booking, paymentMethod, 'payment_selected');
            queueLiveCustomerBooking(booking);
            return {
                ok: true,
                bookingId,
                status: 'created',
                adminReviewStatus: 'pending',
                fallbackQueue: data,
                source: 'fallback_admin_review_queue'
            };
        }
        booking.syncStatus = 'local_live_queue_pending';
        booking.syncError = cleanBookingText(data.message || 'admin_review_queue_unavailable', 160);
    } catch (error) {
        booking.syncStatus = 'local_live_queue_pending';
        booking.syncError = cleanBookingText(error.message || 'admin_review_queue_unavailable', 160);
    }

    recordLivePayment(booking, paymentMethod, 'payment_selected');
    queueLiveCustomerBooking(booking);
    return {
        ok: true,
        bookingId,
        status: 'created',
        adminReviewStatus: 'pending',
        localLiveQueued: true,
        source: 'local_live_admin_review_queue'
    };
}

function queueLiveCustomerBooking(booking) {
    const rows = JSON.parse(localStorage.getItem(LIVE_CUSTOMER_BOOKING_QUEUE_KEY) || '[]');
    const bookingId = String(booking.bookingId || booking.id || '');
    const idx = rows.findIndex((item) => String(item.bookingId || item.id || '') === bookingId);
    if (idx >= 0) rows[idx] = { ...rows[idx], ...booking };
    else rows.unshift(booking);
    localStorage.setItem(LIVE_CUSTOMER_BOOKING_QUEUE_KEY, JSON.stringify(rows.slice(0, 250)));
}

function recordLivePayment(booking, paymentMethod, status) {
    const rows = JSON.parse(localStorage.getItem(LIVE_PAYMENT_RECORDS_KEY) || '[]');
    const bookingId = String(booking.bookingId || booking.id || generateLiveBookingId());
    const amount = Number(booking.finalFare || booking.totalFare || booking.amount || booking.fare || 0);
    const record = {
        id: `PAY-${bookingId}`,
        bookingId,
        amount,
        currency: 'INR',
        method: paymentMethod || 'upi_intent',
        status: status || 'payment_selected',
        gatewayState: paymentMethod === 'cash' ? 'collect_after_ride' : 'ready_for_collection',
        createdAt: new Date().toISOString()
    };
    const idx = rows.findIndex((item) => item.id === record.id);
    if (idx >= 0) rows[idx] = { ...rows[idx], ...record };
    else rows.unshift(record);
    localStorage.setItem(LIVE_PAYMENT_RECORDS_KEY, JSON.stringify(rows.slice(0, 250)));
}
/**
 * Handle booking submission
 */
async function handleBookingSubmit() {
    const pickup = document.getElementById('pickupLocation').value;
    const drop = document.getElementById('dropLocation').value;
    const vehicleType = document.getElementById('vehicleType').value;
    const paymentMethod = getRidePaymentMethod();
    const { mode: bookingMode, duration: bookingModeDuration } = getBookingModeSelection();
    const acPreference = document.getElementById('acPreference').checked;
    const luggageSpace = document.getElementById('luggageSpace').checked;
    
    if (!pickup || !drop) {
        CustomerPortal.showToast('Please enter pickup and drop locations', 'error');
        return;
    }
    
    // Check if first booking
    const isFirstBooking = localStorage.getItem('goindiaride_user_type') === 'new';
    const fareBreakdown = buildFareBreakdown(pickup, drop, vehicleType, lastEstimatedDistanceKm, bookingMode, bookingModeDuration, isFirstBooking);
    
    CustomerPortal.showLoading();

    try {
        const bookingResponse = await createSecureBackendBooking({
            pickup,
            drop,
            vehicleType,
            bookingMode,
            bookingModeDuration,
            distanceKm: lastEstimatedDistanceKm,
            paymentMethod,
            fareBreakdown,
            referralCode: ''
        });

        const booking = {
            id: bookingResponse.bookingId || ('BOOK' + Date.now()),
            pickup,
            drop,
            vehicleType,
            bookingMode,
            bookingModeDuration,
            paymentMethod,
            acPreference,
            luggageSpace,
            status: 'pending_admin_review',
            timestamp: new Date().toISOString(),
            distanceKm: lastEstimatedDistanceKm,
            fare: fareBreakdown.baseFare,
            fareBreakdown,
            discount: fareBreakdown.promoDiscount,
            totalFare: fareBreakdown.totalFare,
            amount: fareBreakdown.totalFare,
            otp: '----',
            backendStatus: String(bookingResponse.status || 'created'),
            adminReviewStatus: String(bookingResponse.adminReviewStatus || 'pending'),
            driverId: null,
            driverName: ''
        };
        
        booking.finalFare = fareBreakdown.totalFare;
        if (isFirstBooking) localStorage.setItem('goindiaride_user_type', 'existing');
        recordLivePayment(booking, paymentMethod, 'payment_selected');
        
        // Save booking
        saveBooking(booking);
        
        CustomerPortal.hideLoading();
        CustomerPortal.closeModal('bookingModal');
        
        // Show success message
        const notifiedAdminCount = Number(
            bookingResponse?.notifications?.adminReview?.count
            || bookingResponse?.notifications?.admin?.count
            || 0
        );
        const adminEmailSent = Boolean(bookingResponse?.adminEmail?.sent);
        const notifiedText = notifiedAdminCount > 0
            ? ` Admin alerted (${notifiedAdminCount}).`
            : '';

        const message = isFirstBooking
            ? `Booking submitted! First ride discount applied: ₹${fareBreakdown.promoDiscount.toFixed(0)} saved. Waiting for admin approval.`
            : 'Booking submitted! Waiting for admin approval.';
        const emailText = adminEmailSent ? ' Admin email sent instantly.' : '';
        
        CustomerPortal.showToast(`${message}${notifiedText}${emailText}`, 'success');
        
        // Show live status modal (admin review state, no fake driver assignment)
        setTimeout(() => {
            openLiveTripModal(booking);
        }, 1000);
        
        // Update ride history
        addToRideHistory(booking);
    } catch (error) {
        CustomerPortal.hideLoading();
        CustomerPortal.showToast(error.message || 'Could not create secure booking', 'error');
    }
}

/**
 * Calculate fare preview
 */
function calculateFarePreview() {
    const pickup = document.getElementById('pickupLocation').value;
    const drop = document.getElementById('dropLocation').value;
    const vehicleType = document.getElementById('vehicleType').value;
    const { mode: bookingMode, duration: bookingModeDuration } = getBookingModeSelection();

    if (!pickup || !drop) return;

    const fare = calculateFare(pickup, drop, vehicleType, lastEstimatedDistanceKm, bookingMode, bookingModeDuration);
    const isFirstBooking = localStorage.getItem('goindiaride_user_type') === 'new';
    const breakdown = buildFareBreakdown(pickup, drop, vehicleType, lastEstimatedDistanceKm, bookingMode, bookingModeDuration, isFirstBooking);
    const perKmRate = getVehicleRate(vehicleType);
    const distanceValue = Number(lastEstimatedDistanceKm || 0);

    const preview = document.getElementById('farePreview');
    preview.innerHTML = `
        <h4>Fare Estimate</h4>
        <div style="margin: 1rem 0;">
            <div style="display: flex; justify-content: space-between; margin-bottom: 0.5rem;">
                <span>Distance:</span>
                <span>${distanceValue.toFixed(1)} km (${String(lastDistanceSource || 'fallback').replace(/_/g, ' ')})</span>
            </div>
            <div style="display: flex; justify-content: space-between; margin-bottom: 0.5rem;">
                <span>Vehicle Rate:</span>
                <span>₹${perKmRate}/km</span>
            </div>
            <div style="display: flex; justify-content: space-between; margin-bottom: 0.5rem;">
                <span>Booking Mode:</span>
                <span>${formatBookingModeLabel(bookingMode, bookingModeDuration)}</span>
            </div>
            <div style="display: flex; justify-content: space-between; margin-bottom: 0.5rem;">
                <span>Base Fare:</span>
                <span>₹${fare.toFixed(0)}</span>
            </div>
            <div style="display: flex; justify-content: space-between; margin-bottom: 0.5rem;">
                <span>Toll / route charges:</span>
                <span>₹${breakdown.tollCharge.toFixed(0)}</span>
            </div>
            <div style="display: flex; justify-content: space-between; margin-bottom: 0.5rem;">
                <span>Parking / pickup charge:</span>
                <span>₹${breakdown.parkingCharge.toFixed(0)}</span>
            </div>
            <div style="display: flex; justify-content: space-between; margin-bottom: 0.5rem;">
                <span>Night charge:</span>
                <span>₹${breakdown.nightCharge.toFixed(0)}</span>
            </div>
            <div style="display: flex; justify-content: space-between; margin-bottom: 0.5rem;">
                <span>GST:</span>
                <span>₹${breakdown.gst.toFixed(0)}</span>
            </div>
            ${breakdown.promoDiscount ? `
                <div style="display: flex; justify-content: space-between; margin-bottom: 0.5rem; color: #06A77D;">
                    <span>First Ride Discount (5%):</span>
                    <span>-₹${breakdown.promoDiscount.toFixed(0)}</span>
                </div>
            ` : ''}
            <div style="display: flex; justify-content: space-between; font-weight: bold; border-top: 2px solid var(--border-color); padding-top: 0.5rem;">
                <span>Total:</span>
                <span>₹${breakdown.totalFare.toFixed(0)}</span>
            </div>
        </div>
        <small style="color: var(--text-light);">*Distance-based estimate. Final fare depends on route + traffic.</small>
    `;
}

/**
 * Calculate fare based on distance and vehicle type
 */
function calculateFare(pickup, drop, vehicleType, distanceKm = lastEstimatedDistanceKm, bookingMode = 'standard', bookingModeDuration = 1) {
    const distance = Number(distanceKm) > 0 ? Number(distanceKm) : 5;
    const duration = Math.max(1, Number(bookingModeDuration) || 1);
    const rate = getVehicleRate(vehicleType);

    if (bookingMode === 'driver_only_hourly') {
        const hourlyRates = { mini: 180, sedan: 240, suv: 340, luxury: 520 };
        return duration * (hourlyRates[vehicleType] || hourlyRates.sedan);
    }

    if (bookingMode === 'driver_only_fullday') {
        const dailyRates = { mini: 1600, sedan: 2200, suv: 3200, luxury: 5200 };
        return duration * (dailyRates[vehicleType] || dailyRates.sedan);
    }

    if (bookingMode === 'driver_only_multiday') {
        const multiDayRates = { mini: 1500, sedan: 2100, suv: 3000, luxury: 4900 };
        return duration * (multiDayRates[vehicleType] || multiDayRates.sedan);
    }

    const distanceFare = distance * rate;
    const baseCharge = 50;
    return Math.max(70, distanceFare + baseCharge);
}

/**
 * Save booking
 */
function mergeBookingRowsForAdmin(keys, booking) {
    const bookingId = String(booking && (booking.bookingId || booking.id) || '').trim();
    if (!bookingId) return;

    keys.forEach((key) => {
        let rows = [];
        try {
            const parsed = JSON.parse(localStorage.getItem(key) || '[]');
            rows = Array.isArray(parsed) ? parsed : [];
        } catch (_error) {
            rows = [];
        }

        const idx = rows.findIndex((item) => String(item && (item.bookingId || item.id) || '').trim() === bookingId);
        const existing = idx >= 0 ? rows[idx] : {};
        const updated = {
            ...existing,
            ...booking,
            id: bookingId,
            bookingId,
            status: booking.status || existing.status || 'pending_admin_review',
            adminReviewStatus: booking.adminReviewStatus || existing.adminReviewStatus || 'pending',
            pickupLocation: booking.pickupLocation || booking.pickup || existing.pickupLocation || existing.pickup || '',
            dropLocation: booking.dropLocation || booking.drop || booking.dropoff || existing.dropLocation || existing.drop || existing.dropoff || '',
            totalFare: Number(booking.totalFare || booking.finalFare || booking.fare || booking.amount || existing.totalFare || existing.fare || 0),
            amount: Number(booking.amount || booking.finalFare || booking.fare || booking.totalFare || existing.amount || existing.fare || 0),
            updatedAt: new Date().toISOString()
        };

        if (idx >= 0) rows[idx] = updated;
        else rows.unshift(updated);
        localStorage.setItem(key, JSON.stringify(rows));
    });
}

function saveBooking(booking) {
    const bookings = JSON.parse(localStorage.getItem('goindiaride_active_bookings') || '[]');
    const key = String(booking.id || booking.bookingId || '');
    const idx = bookings.findIndex((item) => String(item.id || item.bookingId || '') === key);

    if (idx === -1) {
        bookings.unshift(booking);
    } else {
        bookings[idx] = { ...bookings[idx], ...booking };
    }

    localStorage.setItem('goindiaride_active_bookings', JSON.stringify(bookings));
    mergeBookingRowsForAdmin([
        'bookings',
        'goride_bookings',
        'goindiaride_admin_review_inbox_v1',
        'goindiaride_active_bookings'
    ], booking);
    window.dispatchEvent(new CustomEvent('goindiaride:customer-bookings-updated', {
        detail: { bookingId: key, booking }
    }));
    
    loadActiveBookings();
}

async function syncActiveBookingsFromBackend() {
    const token = String(getBackendAccessToken() || '').trim();
    if (!token) return [];

    const response = await fetch(`${getBackendApiBase()}/api/bookings/my?limit=120`, {
        method: 'GET',
        headers: {
            Authorization: `Bearer ${token}`,
            Accept: 'application/json'
        },
        credentials: 'include'
    });

    if (!response.ok) {
        return [];
    }

    const payload = await response.json().catch(() => ({}));
    const rows = Array.isArray(payload.items) ? payload.items : [];
    const mapped = rows.map((row) => mapBackendBookingToLocal(row));

    let existing = [];
    try {
        const parsed = JSON.parse(localStorage.getItem('goindiaride_active_bookings') || '[]');
        existing = Array.isArray(parsed) ? parsed : [];
    } catch (_error) {
        existing = [];
    }
    const byId = new Map();
    existing.forEach((booking) => {
        const id = String(booking && (booking.bookingId || booking.id) || '').trim();
        if (id) byId.set(id, booking);
    });
    mapped.forEach((booking) => {
        const id = String(booking && (booking.bookingId || booking.id) || '').trim();
        if (!id) return;
        byId.set(id, { ...(byId.get(id) || {}), ...booking, id, bookingId: id });
        mergeBookingRowsForAdmin([
            'bookings',
            'goride_bookings',
            'goindiaride_admin_review_inbox_v1',
            'goindiaride_active_bookings'
        ], booking);
    });

    const merged = Array.from(byId.values());
    localStorage.setItem('goindiaride_active_bookings', JSON.stringify(merged));
    return merged;
}

/**
 * Load active bookings
 */
async function loadActiveBookings(options = {}) {
    if (!options.skipBackendSync) {
        try {
            await syncActiveBookingsFromBackend();
        } catch (error) {
            // Keep local snapshot if backend sync is temporarily unavailable.
        }
    }

    const bookings = JSON.parse(localStorage.getItem('goindiaride_active_bookings') || '[]');
    const container = document.getElementById('activeBookingsList');
    
    if (!container) return;
    
    if (bookings.length === 0) {
        container.innerHTML = '<p style="color: var(--text-light); text-align: center; padding: 2rem;">No active bookings</p>';
        return;
    }
    
    const labelMap = {
        pending_admin_review: 'Pending Admin Review',
        approved_waiting_driver: 'Approved - Driver Queue',
        driver_assigned: 'Driver Assigned',
        rejected_by_admin: 'Rejected by Admin',
        cancelled: 'Cancelled',
        completed: 'Completed'
    };

    container.innerHTML = bookings.map(booking => `
        <div class="booking-item">
            <div>
                <strong>${booking.pickup} → ${booking.drop}</strong>
                <div>
                    <span class="badge badge-${booking.status}">${labelMap[booking.status] || booking.status}</span> •
                    <span>₹${booking.finalFare.toFixed(0)}</span>
                </div>
                <small>${new Date(booking.timestamp).toLocaleString()}</small>
            </div>
            <button class="btn-primary" onclick="viewLiveTrip('${booking.id}')">
                <i class="fas fa-eye"></i> Track
            </button>
        </div>
    `).join('');
}

/**
 * Open live trip modal
 */
function openLiveTripModal(booking) {
    const status = normalizeBookingLifecycleStatus(booking);
    const hasAssignedDriver = status === 'driver_assigned' && Boolean(booking.driverName || booking.driverId);
    const isPendingAdmin = status === 'pending_admin_review';

    let driver = {
        name: 'Pending Admin Approval',
        vehicle: 'Booking is in live admin review queue',
        rating: '--',
        phone: ''
    };

    if (hasAssignedDriver) {
        const registeredDrivers = JSON.parse(localStorage.getItem('drivers') || '[]');
        const matchedDriver = registeredDrivers.find((item) => String(item.id || '') === String(booking.driverId || ''));
        driver = {
            name: booking.driverName || matchedDriver?.name || 'Assigned Driver',
            vehicle: matchedDriver
                ? ((matchedDriver.vehicleModel || 'Vehicle') + ' - ' + (matchedDriver.vehicleNumber || 'Pending'))
                : (booking.vehicleType || 'Vehicle details pending'),
            rating: matchedDriver ? Number(matchedDriver.rating || 4.7).toFixed(1) : '4.7',
            phone: matchedDriver?.phone || '+91 **********'
        };
    } else if (status === 'approved_waiting_driver') {
        driver = {
            name: 'Approved by Admin',
            vehicle: 'Driver will be assigned shortly',
            rating: '--',
            phone: ''
        };
    } else if (status === 'rejected_by_admin') {
        driver = {
            name: 'Booking Rejected',
            vehicle: 'Please create a new booking or contact support',
            rating: '--',
            phone: ''
        };
    }

    document.getElementById('driverName').textContent = driver.name;
    document.getElementById('vehicleDetails').textContent = driver.vehicle;
    document.getElementById('driverRating').textContent = driver.rating;
    document.getElementById('rideOTP').textContent = hasAssignedDriver ? (booking.otp || '----') : 'N/A';

    const chatBtn = document.getElementById('chatWithDriver');
    const callBtn = document.getElementById('callDriver');
    const shareBtn = document.getElementById('shareTrip');

    if (chatBtn) {
        chatBtn.disabled = !hasAssignedDriver;
        chatBtn.style.opacity = hasAssignedDriver ? '1' : '0.5';
        chatBtn.onclick = hasAssignedDriver ? () => {
            CustomerPortal.closeModal('liveTripModal');
            openChatModal(driver);
        } : null;
    }

    if (callBtn) {
        callBtn.disabled = !hasAssignedDriver;
        callBtn.style.opacity = hasAssignedDriver ? '1' : '0.5';
        callBtn.onclick = hasAssignedDriver ? () => {
            initiateCallMasking(driver);
        } : null;
    }

    if (shareBtn) {
        shareBtn.onclick = () => {
            shareTrip(booking, driver);
        };
    }
    
    CustomerPortal.openModal('liveTripModal');

    if (isPendingAdmin) {
        CustomerPortal.showToast('Booking is in admin review queue. Driver assignment is paused until admin approval.', 'info');
    }
}

/**
 * View live trip
 */
function viewLiveTrip(bookingId) {
    const bookings = JSON.parse(localStorage.getItem('goindiaride_active_bookings') || '[]');
    const booking = bookings.find(b => b.id === bookingId);
    
    if (booking) {
        openLiveTripModal(booking);
    }
}

/**
 * Generate OTP
 */
function generateOTP() {
    return Math.floor(1000 + Math.random() * 9000).toString();
}

/**
 * Open chat modal
 */
function openChatModal(driver) {
    CustomerPortal.openModal('chatModal');
    
    // Load chat messages
    loadChatMessages(driver);
    
    // Setup send message
    document.getElementById('sendMessage')?.addEventListener('click', sendChatMessage);
    
    // Setup quick messages
    const quickMsgBtns = document.querySelectorAll('.quick-msg-btn');
    quickMsgBtns.forEach(btn => {
        btn.addEventListener('click', function() {
            const message = this.getAttribute('data-msg');
            sendQuickMessage(message);
        });
    });
    
    // Enter key to send
    document.getElementById('chatInput')?.addEventListener('keypress', function(e) {
        if (e.key === 'Enter') {
            sendChatMessage();
        }
    });
}

/**
 * Load chat messages
 */
function loadChatMessages(driver) {
    const chatMessages = document.getElementById('chatMessages');
    
    // Seeded chat messages
    const messages = [
        { type: 'received', text: `Hello! I'm ${driver.name}, your driver for today.`, time: '10:30 AM' },
        { type: 'received', text: 'I will reach in 5 minutes.', time: '10:31 AM' }
    ];
    
    chatMessages.innerHTML = messages.map(msg => `
        <div class="message ${msg.type}">
            ${msg.text}
            <small style="display: block; margin-top: 0.25rem; opacity: 0.7; font-size: 0.75rem;">${msg.time}</small>
        </div>
    `).join('');
}

/**
 * Send chat message
 */
function sendChatMessage() {
    const input = document.getElementById('chatInput');
    const message = input.value.trim();
    
    if (!message) return;
    
    const chatMessages = document.getElementById('chatMessages');
    const time = new Date().toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });
    
    const messageHTML = `
        <div class="message sent">
            ${message}
            <small style="display: block; margin-top: 0.25rem; opacity: 0.7; font-size: 0.75rem;">${time}</small>
        </div>
    `;
    
    chatMessages.insertAdjacentHTML('beforeend', messageHTML);
    input.value = '';
    
    // Auto-scroll to bottom
    chatMessages.scrollTop = chatMessages.scrollHeight;
    
    // Simulate driver response
    setTimeout(() => {
        const response = `
            <div class="message received">
                Okay, noted!
                <small style="display: block; margin-top: 0.25rem; opacity: 0.7; font-size: 0.75rem;">${time}</small>
            </div>
        `;
        chatMessages.insertAdjacentHTML('beforeend', response);
        chatMessages.scrollTop = chatMessages.scrollHeight;
    }, 2000);
}

/**
 * Send quick message
 */
function sendQuickMessage(message) {
    const input = document.getElementById('chatInput');
    input.value = message;
    sendChatMessage();
}

/**
 * Initiate call masking
 */
function initiateCallMasking(driver) {
    // In production, this would use a call masking service
    const maskedNumber = '+91 80XXX XXXXX';
    
    if (confirm(`Call driver via masked number?\n\nYour number will not be revealed to the driver.\n\nMasked Number: ${maskedNumber}`)) {
        CustomerPortal.showToast('Connecting call via masked number...', 'success');
        
        // Simulate call
        setTimeout(() => {
            CustomerPortal.showToast('Call connected', 'success');
        }, 2000);
    }
}

/**
 * Share trip
 */
function shareTrip(booking, driver) {
    const message = `
🚗 I'm on a ride with GO India RIDE

Driver: ${driver.name}
Vehicle: ${driver.vehicle}
OTP: ${booking.otp}

Track my ride: https://goindiaride.com/track/${booking.id}
    `.trim();
    
    const whatsappUrl = `https://wa.me/?text=${encodeURIComponent(message)}`;
    window.open(whatsappUrl, '_blank');
    
    CustomerPortal.showToast('Sharing trip details...', 'success');
}

/**
 * Setup schedule form
 */
function setupScheduleForm() {
    const form = document.getElementById('scheduleForm');
    
    if (!form) return;
    
    // Set minimum date to today
    const dateInput = document.getElementById('scheduleDate');
    if (dateInput) {
        const today = new Date().toISOString().split('T')[0];
        dateInput.min = today;
    }
    
    form.addEventListener('submit', function(e) {
        e.preventDefault();
        handleScheduleSubmit();
    });
}

/**
 * Handle schedule submission
 */
function handleScheduleSubmit() {
    const date = document.getElementById('scheduleDate').value;
    const time = document.getElementById('scheduleTime').value;
    const recurring = document.getElementById('recurringRide').checked;
    
    if (!date || !time) {
        CustomerPortal.showToast('Please select date and time', 'error');
        return;
    }
    
    const scheduledRide = {
        id: 'SCHED' + Date.now(),
        date,
        time,
        recurring,
        status: 'scheduled',
        timestamp: new Date().toISOString()
    };
    
    // Save scheduled ride
    const scheduled = JSON.parse(localStorage.getItem('goindiaride_scheduled_rides') || '[]');
    scheduled.push(scheduledRide);
    localStorage.setItem('goindiaride_scheduled_rides', JSON.stringify(scheduled));
    
    CustomerPortal.closeModal('scheduleModal');
    CustomerPortal.showToast('Ride scheduled successfully!', 'success');
    
    loadScheduledBookings();
}

/**
 * Load scheduled bookings
 */
function loadScheduledBookings() {
    const scheduled = JSON.parse(localStorage.getItem('goindiaride_scheduled_rides') || '[]');
    const container = document.getElementById('scheduledBookingsList');
    
    if (!container) return;
    
    if (scheduled.length === 0) {
        container.innerHTML = '<p style="color: var(--text-light); text-align: center; padding: 2rem;">No scheduled rides</p>';
        return;
    }
    
    container.innerHTML = scheduled.map(ride => `
        <div class="booking-item">
            <div>
                <strong>Scheduled Ride</strong>
                <div>
                    ${ride.date} at ${ride.time}
                    ${ride.recurring ? ' • <span class="badge badge-info">Recurring</span>' : ''}
                </div>
            </div>
            <div>
                <button class="btn-secondary" onclick="editScheduledRide('${ride.id}')">
                    <i class="fas fa-edit"></i>
                </button>
                <button class="btn-secondary" onclick="cancelScheduledRide('${ride.id}')">
                    <i class="fas fa-times"></i>
                </button>
            </div>
        </div>
    `).join('');
}

/**
 * Cancel scheduled ride
 */
function cancelScheduledRide(rideId) {
    if (confirm('Are you sure you want to cancel this scheduled ride?')) {
        let scheduled = JSON.parse(localStorage.getItem('goindiaride_scheduled_rides') || '[]');
        scheduled = scheduled.filter(r => r.id !== rideId);
        localStorage.setItem('goindiaride_scheduled_rides', JSON.stringify(scheduled));
        
        CustomerPortal.showToast('Scheduled ride cancelled', 'success');
        loadScheduledBookings();
    }
}

/**
 * Edit scheduled ride
 */
function editScheduledRide(rideId) {
    CustomerPortal.showToast('Edit feature coming soon!', 'info');
}

/**
 * Setup fare calculator
 */
function setupFareCalculator() {
    const calcBtn = document.getElementById('openFareCalc');
    
    if (calcBtn) {
        calcBtn.addEventListener('click', function() {
            showFareCalculatorModal();
        });
    }
}

/**
 * Show fare calculator modal
 */
function showFareCalculatorModal() {
    const modal = document.createElement('div');
    modal.className = 'modal active';
    modal.innerHTML = `
        <div class="modal-content">
            <span class="close">&times;</span>
            <h2>Fare Calculator</h2>
            <div class="form-group">
                <label>From</label>
                <input type="text" id="calcFrom" placeholder="Enter pickup location">
            </div>
            <div class="form-group">
                <label>To</label>
                <input type="text" id="calcTo" placeholder="Enter drop location">
            </div>
            <div class="form-group">
                <label>Vehicle Type</label>
                <select id="calcVehicle">
                    <option value="mini">Mini (₹8/km)</option>
                    <option value="sedan">Sedan (₹12/km)</option>
                    <option value="suv">SUV (₹18/km)</option>
                    <option value="luxury">Luxury (₹25/km)</option>
                </select>
            </div>
            <button class="btn-primary" id="calculateFare">Calculate Fare</button>
            <div id="fareResult" style="margin-top: 1rem;"></div>
        </div>
    `;

    document.body.appendChild(modal);

    if (typeof initializeAutocomplete === 'function') {
        initializeAutocomplete('calcFrom');
        initializeAutocomplete('calcTo');
    }

    modal.querySelector('.close').addEventListener('click', () => modal.remove());
    modal.addEventListener('click', (e) => {
        if (e.target === modal) modal.remove();
    });

    modal.querySelector('#calculateFare').addEventListener('click', async function() {
        const from = document.getElementById('calcFrom').value;
        const to = document.getElementById('calcTo').value;
        const vehicle = document.getElementById('calcVehicle').value;

        if (!from || !to) {
            CustomerPortal.showToast('Please enter both locations', 'error');
            return;
        }

        let estimate = { km: 5, source: 'fallback' };
        try {
            if (window.LocationDistanceEstimator && typeof LocationDistanceEstimator.estimateDistanceKm === 'function') {
                estimate = await LocationDistanceEstimator.estimateDistanceKm(from, to);
            }
        } catch (error) {
            estimate = { km: 5, source: 'fallback' };
        }

        const km = Number(estimate.km || 5);
        const fare = calculateFare(from, to, vehicle, km, 'standard', 1);
        const result = document.getElementById('fareResult');

        result.innerHTML = `
            <div style="background: var(--bg-light); padding: 1.5rem; border-radius: 12px; text-align: center;">
                <h3>Estimated Fare</h3>
                <p style="font-size: 2rem; font-weight: bold; color: var(--primary-color); margin: 1rem 0;">
                    ₹${fare.toFixed(0)}
                </p>
                <p style="margin: 0.25rem 0; color: var(--text-dark);">Distance: <strong>${km.toFixed(1)} km</strong></p>
                <p style="margin: 0.25rem 0; color: var(--text-dark);">Rate: <strong>₹${getVehicleRate(vehicle)}/km</strong></p>
                <small style="color: var(--text-light);">Source: ${String(estimate.source || 'fallback').replace(/_/g, ' ')}</small>
            </div>
        `;
    });
}

/**
 * Add to ride history
 */
function addToRideHistory(booking) {
    const history = JSON.parse(localStorage.getItem('goindiaride_ride_history') || '[]');
    
    // Convert booking to history format
    const historyItem = {
        id: booking.id,
        from: booking.pickup,
        to: booking.drop,
        date: new Date(booking.timestamp).toLocaleDateString(),
        fare: booking.finalFare,
        status: 'completed',
        driver: booking.driverName || 'Assigned Driver',
        rating: 0
    };
    
    history.unshift(historyItem); // Add to beginning
    localStorage.setItem('goindiaride_ride_history', JSON.stringify(history));
}

/**
 * Load ride preferences
 */
function loadRidePreferences() {
    const preferences = JSON.parse(localStorage.getItem('goindiaride_ride_preferences') || '{}');
    
    // Set default preferences if empty
    if (Object.keys(preferences).length === 0) {
        preferences.ac = 'any';
        preferences.driverGender = 'any';
        preferences.music = 'any';
        localStorage.setItem('goindiaride_ride_preferences', JSON.stringify(preferences));
    }
    
    // Load preferences into modal if it exists
    if (document.getElementById('acPref')) {
        document.getElementById('acPref').value = preferences.ac || 'any';
    }
    if (document.getElementById('driverGenderPref')) {
        document.getElementById('driverGenderPref').value = preferences.driverGender || 'any';
    }
    if (document.getElementById('musicPref')) {
        document.getElementById('musicPref').value = preferences.music || 'any';
    }
}

/**
 * Save ride preferences
 */
document.getElementById('savePreferences')?.addEventListener('click', function() {
    const preferences = {
        ac: document.getElementById('acPref').value,
        driverGender: document.getElementById('driverGenderPref').value,
        music: document.getElementById('musicPref').value
    };
    
    localStorage.setItem('goindiaride_ride_preferences', JSON.stringify(preferences));
    CustomerPortal.closeModal('preferencesModal');
    CustomerPortal.showToast('Preferences saved successfully!', 'success');
});

// Export functions
window.BookingSystem = {
    viewLiveTrip,
    cancelScheduledRide,
    editScheduledRide
};
