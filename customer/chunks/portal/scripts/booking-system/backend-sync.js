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

function readBookingStoredObject(key) {
    try {
        const parsed = JSON.parse(localStorage.getItem(key) || 'null');
        return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {};
    } catch (_error) {
        return {};
    }
}

function getBookingCustomerSnapshot() {
    const user = (
        (window.currentUser && typeof window.currentUser === 'object' ? window.currentUser : null) ||
        readBookingStoredObject('currentUser') ||
        readBookingStoredObject('goindiaride_user') ||
        readBookingStoredObject('goindiaride.profile.runtime')
    );

    const name = cleanBookingText(user.fullname || user.name || user.customerName || 'Customer', 140);
    const email = cleanBookingText(user.email || user.userEmail || user.customerEmail || '', 180).toLowerCase();
    const phone = cleanBookingText(user.phone || user.mobile || user.contact || user.customerPhone || '', 40);
    const id = cleanBookingText(user.id || user.userId || user.customerId || user.backendUserId || user._id || email || phone || '', 120);

    return {
        id,
        name,
        email,
        phone,
        user
    };
}

function applyBookingCustomerSnapshot(booking, snapshot = getBookingCustomerSnapshot()) {
    if (!booking || typeof booking !== 'object') return booking;
    const customerName = cleanBookingText(booking.customerName || snapshot.name || 'Customer', 140);
    const customerEmail = cleanBookingText(booking.customerEmail || snapshot.email || '', 180).toLowerCase();
    const customerPhone = cleanBookingText(booking.customerPhone || booking.phone || snapshot.phone || '', 40);
    const customerId = cleanBookingText(booking.customerId || booking.userId || snapshot.id || customerEmail || customerPhone || '', 120);

    return {
        ...booking,
        customerId,
        backendUserId: cleanBookingText(booking.backendUserId || snapshot.user?.backendUserId || snapshot.user?._id || '', 120),
        userId: cleanBookingText(booking.userId || customerId, 120),
        customerName,
        customerEmail,
        customerPhone,
        phone: cleanBookingText(booking.phone || customerPhone, 40),
        customerSnapshot: {
            ...(booking.customerSnapshot && typeof booking.customerSnapshot === 'object' ? booking.customerSnapshot : {}),
            id: customerId,
            name: customerName,
            email: customerEmail,
            phone: customerPhone
        },
        adminBookingScope: booking.adminBookingScope || 'customer',
        sourceKey: booking.sourceKey || 'customer_live_booking_flow'
    };
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
    const customerSnapshot = getBookingCustomerSnapshot();
    const booking = applyBookingCustomerSnapshot({
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
    }, customerSnapshot);

    const apiBase = getBackendApiBase();
    try {
        const response = await fetch(`${apiBase}/api/bookings/fallback/admin-review-queue`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'x-booking-client': 'goindiaride-web',
                'x-idempotency-key': createBookingIdempotencyKey('gir-booking-fallback-admin-queue', bookingId)
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

        const customerSnapshot = getBookingCustomerSnapshot();
        const localBookingId = bookingResponse.bookingId || ('BOOK' + Date.now());
        const booking = applyBookingCustomerSnapshot({
            id: localBookingId,
            bookingId: localBookingId,
            pickup,
            drop,
            pickupLocation: pickup,
            dropLocation: drop,
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
            source: bookingResponse.source || 'customer_live_booking_flow',
            sourceKey: bookingResponse.source || 'customer_live_booking_flow',
            fallbackQueued: Boolean(bookingResponse.fallbackQueue || bookingResponse.localLiveQueued),
            adminQueueSyncStatus: bookingResponse.fallbackQueue ? 'queued' : '',
            adminQueueSyncedAt: bookingResponse.fallbackQueue ? new Date().toISOString() : '',
            driverId: null,
            driverName: ''
        }, customerSnapshot);
        
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
