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

function createBookingIdempotencyKey(prefix, bookingId = '') {
    const safePrefix = cleanBookingText(prefix || 'gir-booking', 80).replace(/[^A-Za-z0-9:_-]/g, '_') || 'gir-booking';
    const safeBookingId = cleanBookingText(bookingId || '', 120).replace(/[^A-Za-z0-9:_-]/g, '_');
    return `${safePrefix}:${safeBookingId || Date.now().toString(36)}:${Date.now()}:${Math.random().toString(36).slice(2, 12)}`;
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
