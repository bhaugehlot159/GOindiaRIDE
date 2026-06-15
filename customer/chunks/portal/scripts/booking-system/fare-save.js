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
                <div style="display: flex; justify-content: space-between; margin-bottom: 0.5rem; color: #080c12;">
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

function safePortalBookingText(value, maxLen = 180) {
    return String(value || '')
        .replace(/[<>]/g, '')
        .replace(/\s+/g, ' ')
        .trim()
        .slice(0, maxLen);
}

function getPortalBookingFare(booking) {
    const value = Number(
        booking?.finalFare
        || booking?.totalFare
        || booking?.amount
        || booking?.fare
        || 0
    );
    return Number.isFinite(value) ? value : 0;
}

function getPortalBookingDateLabel(booking) {
    const raw = booking?.timestamp || booking?.createdAt || booking?.updatedAt || Date.now();
    const parsed = new Date(raw);
    if (Number.isNaN(parsed.getTime())) return new Date().toLocaleString();
    return parsed.toLocaleString();
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
            adminBookingScope: booking.adminBookingScope || existing.adminBookingScope || 'customer',
            sourceKey: booking.sourceKey || existing.sourceKey || 'customer_live_booking_flow',
            customerId: booking.customerId || booking.userId || existing.customerId || existing.userId || '',
            backendUserId: booking.backendUserId || existing.backendUserId || '',
            userId: booking.userId || booking.customerId || existing.userId || existing.customerId || '',
            customerName: booking.customerName || existing.customerName || 'Customer',
            customerEmail: booking.customerEmail || existing.customerEmail || '',
            customerPhone: booking.customerPhone || booking.phone || existing.customerPhone || existing.phone || '',
            customerSnapshot: booking.customerSnapshot || existing.customerSnapshot || {},
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
        'goindiaride_active_bookings',
        'customerBookings',
        'customer_bookings',
        LIVE_CUSTOMER_BOOKING_QUEUE_KEY
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

    let bookings = [];
    try {
        const rawBookings = localStorage.getItem('goindiaride_active_bookings') || '[]';
        if (rawBookings.length <= 360000) {
            const parsed = JSON.parse(rawBookings);
            bookings = Array.isArray(parsed) ? parsed.filter((item) => item && typeof item === 'object').slice(0, 80) : [];
        }
    } catch (_error) {
        bookings = [];
    }
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

    container.innerHTML = bookings.map((booking) => {
        const status = safePortalBookingText(booking.status || 'pending_admin_review', 60);
        const pickup = safePortalBookingText(booking.pickup || booking.pickupLocation || '-', 180);
        const drop = safePortalBookingText(booking.drop || booking.dropoff || booking.dropLocation || '-', 180);
        const bookingId = safePortalBookingText(booking.id || booking.bookingId || '', 120).replace(/\\/g, '\\\\').replace(/'/g, "\\'");
        const fare = getPortalBookingFare(booking);
        return `
            <div class="booking-item">
                <div>
                    <strong>${pickup} → ${drop}</strong>
                    <div>
                        <span class="badge badge-${status}">${labelMap[status] || status}</span> •
                        <span>₹${fare.toFixed(0)}</span>
                    </div>
                    <small>${getPortalBookingDateLabel(booking)}</small>
                </div>
                <button class="btn-primary" onclick="viewLiveTrip('${bookingId}')">
                    <i class="fas fa-eye"></i> Track
                </button>
            </div>
        `;
    }).join('');
}

/**
 * Open live trip modal
 */
