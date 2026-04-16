// Driver Portal - Main JavaScript
// LocalStorage keys
const STORAGE_KEYS = {
    DRIVER_DATA: 'driver_data',
    ONLINE_STATUS: 'online_status',
    EARNINGS: 'earnings_data',
    TRIPS: 'trips_data',
    DRIVING_HOURS: 'driving_hours',
    PREFERENCES: 'driver_preferences'
};

// Driver State
let driverState = {
    isOnline: false,
    currentRide: null,
    todayEarnings: 0,
    todayTrips: 0,
    rating: 4.8,
    onlineHours: 0,
    drivingHours: 0,
    location: null,
    batteryLevel: 100,
    networkStatus: 'good',
    restRequired: false,
    pendingRequest: null
};
const DRIVER_BACKEND_BOOKING_ALERT_POLL_MS = 5000;
const DRIVER_BOOKING_ALARM_PREF_KEY = 'goindiaride_driver_booking_alarm_enabled';
const DRIVER_BOOKING_ALARM_BTN_ID = 'goiEnableDriverBookingAlarm';
const DRIVER_DEMO_REQUESTS_ENABLED = String(
    window.GOINDIARIDE_ENABLE_DRIVER_DEMO_REQUESTS
    || localStorage.getItem('goindiaride_enable_driver_demo_requests')
    || 'false'
).toLowerCase() === 'true';
let driverBackendBookingAlertTimer = null;
let driverBackendAlarmContext = null;
let driverBackendAlarmLastAt = 0;
const driverSeenNotificationIds = new Set();

// Initialize on page load
document.addEventListener('DOMContentLoaded', function() {
    initializeDriver();
    setupEventListeners();
    checkSystemStatus();
    loadDemoData();
    startStatusMonitoring();
    setupPortalNotifications();
    startDriverBackendBookingAlerts();
});

// Initialize Driver Data
function initializeDriver() {
    // Load saved data
    const savedData = localStorage.getItem(STORAGE_KEYS.DRIVER_DATA);
    if (savedData) {
        const data = JSON.parse(savedData);
        driverState = { ...driverState, ...data };
    }
    
    // Update UI
    updateDashboard();
    
    // Check night mode preference
    const preferences = JSON.parse(localStorage.getItem(STORAGE_KEYS.PREFERENCES) || '{}');
    if (preferences.nightMode) {
        document.body.classList.add('night-mode');
    }
}

// Setup Event Listeners
function setupEventListeners() {
    // Online Toggle
    const onlineToggle = document.getElementById('onlineToggle');
    if (onlineToggle) {
        onlineToggle.addEventListener('change', handleOnlineToggle);
    }
    
    // Night Mode Toggle
    const nightModeToggle = document.getElementById('nightModeToggle');
    if (nightModeToggle) {
        nightModeToggle.addEventListener('click', toggleNightMode);
    }
}

// Handle Online Status Toggle
function handleOnlineToggle(event) {
    const isChecked = event.target.checked;
    
    // Check if rest is required
    if (driverState.restRequired && isChecked) {
        showToast('You must take rest before going online!', 'error');
        event.target.checked = false;
        return;
    }
    
    // Check if KYC is complete
    const kycData = JSON.parse(localStorage.getItem('kyc_data') || '{}');
    if (!kycData.verified && isChecked) {
        showToast('Complete KYC verification first!', 'error');
        event.target.checked = false;
        openKYC();
        return;
    }
    
    driverState.isOnline = isChecked;
    updateOnlineStatus();
    
    if (isChecked) {
        showToast('You are now online!', 'success');
        startGPSTracking();
        checkForRideRequests();
    } else {
        showToast('You are now offline', 'info');
        stopGPSTracking();
    }
    
    saveDriverData();
}

// Update Online Status Display
function updateOnlineStatus() {
    const statusText = document.getElementById('statusText');
    if (statusText) {
        statusText.textContent = driverState.isOnline ? 'Online' : 'Offline';
        statusText.style.color = driverState.isOnline ? 'var(--success-color)' : 'var(--text-secondary)';
    }
}

// Update Dashboard
function updateDashboard() {
    // Today's Earnings
    document.getElementById('todayEarnings').textContent = `₹${driverState.todayEarnings.toFixed(2)}`;
    
    // Today's Trips
    document.getElementById('todayTrips').textContent = driverState.todayTrips;
    
    // Rating
    document.getElementById('driverRating').textContent = driverState.rating.toFixed(1);
    
    // Online Hours
    document.getElementById('onlineHours').textContent = `${driverState.onlineHours}h`;
    
    // Update status
    updateOnlineStatus();
    
    // Update KYC status
    updateKYCStatus();
    
    // Update wallet balance
    updateWalletBalance();
}

// Check System Status
function checkSystemStatus() {
    // Battery Status
    if ('getBattery' in navigator) {
        navigator.getBattery().then(function(battery) {
            updateBatteryStatus(battery.level * 100, battery.charging);
            
            battery.addEventListener('levelchange', function() {
                updateBatteryStatus(battery.level * 100, battery.charging);
            });
        });
    } else {
        document.getElementById('batteryStatus').textContent = 'Not available';
    }
    
    // Network Status
    updateNetworkStatus();
    window.addEventListener('online', updateNetworkStatus);
    window.addEventListener('offline', updateNetworkStatus);
    
    // GPS Status
    checkGPSStatus();
}

// Update Battery Status
function updateBatteryStatus(level, charging) {
    const batteryIcon = document.getElementById('batteryIcon');
    const batteryStatus = document.getElementById('batteryStatus');
    const batteryItem = batteryStatus.parentElement;
    
    batteryStatus.textContent = `${Math.round(level)}%`;
    driverState.batteryLevel = level;
    
    // Update icon
    if (charging) {
        batteryIcon.className = 'fas fa-battery-bolt';
    } else if (level > 75) {
        batteryIcon.className = 'fas fa-battery-full';
    } else if (level > 50) {
        batteryIcon.className = 'fas fa-battery-three-quarters';
    } else if (level > 25) {
        batteryIcon.className = 'fas fa-battery-half';
    } else {
        batteryIcon.className = 'fas fa-battery-quarter';
    }
    
    // Update color
    batteryItem.classList.remove('good', 'warning', 'danger');
    if (level > 50) {
        batteryItem.classList.add('good');
    } else if (level > 20) {
        batteryItem.classList.add('warning');
    } else {
        batteryItem.classList.add('danger');
        if (driverState.isOnline) {
            showToast('Battery low! Please charge your phone.', 'warning');
        }
    }
}

// Update Network Status
function updateNetworkStatus() {
    const networkIcon = document.getElementById('networkIcon');
    const networkStatus = document.getElementById('networkStatus');
    const networkItem = networkStatus.parentElement;
    
    const isOnline = navigator.onLine;
    
    if (isOnline) {
        // Check connection type if available
        const connection = navigator.connection || navigator.mozConnection || navigator.webkitConnection;
        if (connection) {
            const effectiveType = connection.effectiveType;
            networkStatus.textContent = effectiveType || 'Connected';
            
            if (effectiveType === '4g' || effectiveType === '5g') {
                networkItem.classList.remove('warning', 'danger');
                networkItem.classList.add('good');
                driverState.networkStatus = 'good';
            } else {
                networkItem.classList.remove('good', 'danger');
                networkItem.classList.add('warning');
                driverState.networkStatus = 'slow';
            }
        } else {
            networkStatus.textContent = 'Connected';
            networkItem.classList.remove('warning', 'danger');
            networkItem.classList.add('good');
            driverState.networkStatus = 'good';
        }
    } else {
        networkStatus.textContent = 'Offline';
        networkItem.classList.remove('good', 'warning');
        networkItem.classList.add('danger');
        driverState.networkStatus = 'offline';
        showToast('Network connection lost!', 'error');
    }
}

// Check GPS Status
function checkGPSStatus() {
    const gpsIcon = document.getElementById('gpsIcon');
    const gpsStatus = document.getElementById('gpsStatus');
    const gpsItem = gpsStatus.parentElement;
    
    if ('geolocation' in navigator) {
        navigator.geolocation.getCurrentPosition(
            function(position) {
                gpsStatus.textContent = 'Active';
                gpsItem.classList.remove('warning', 'danger');
                gpsItem.classList.add('good');
                driverState.location = {
                    lat: position.coords.latitude,
                    lng: position.coords.longitude,
                    accuracy: position.coords.accuracy
                };
            },
            function(error) {
                gpsStatus.textContent = 'Disabled';
                gpsItem.classList.remove('good', 'warning');
                gpsItem.classList.add('danger');
                showToast('Please enable GPS for accurate tracking', 'warning');
            }
        );
    } else {
        gpsStatus.textContent = 'Not supported';
        gpsItem.classList.remove('good', 'warning');
        gpsItem.classList.add('danger');
    }
}

// Start GPS Tracking
function startGPSTracking() {
    if ('geolocation' in navigator) {
        driverState.watchId = navigator.geolocation.watchPosition(
            function(position) {
                driverState.location = {
                    lat: position.coords.latitude,
                    lng: position.coords.longitude,
                    accuracy: position.coords.accuracy,
                    timestamp: position.timestamp
                };
                
                // Update speed monitoring if in ride
                if (driverState.currentRide) {
                    updateSpeedMonitoring(position.coords.speed);
                }
            },
            function(error) {
                console.error('GPS tracking error:', error);
            },
            {
                enableHighAccuracy: true,
                timeout: 5000,
                maximumAge: 0
            }
        );
    }
}

// Stop GPS Tracking
function stopGPSTracking() {
    if (driverState.watchId) {
        navigator.geolocation.clearWatch(driverState.watchId);
        driverState.watchId = null;
    }
}

// Toggle Night Mode
function toggleNightMode() {
    document.body.classList.toggle('night-mode');
    
    const preferences = JSON.parse(localStorage.getItem(STORAGE_KEYS.PREFERENCES) || '{}');
    preferences.nightMode = document.body.classList.contains('night-mode');
    localStorage.setItem(STORAGE_KEYS.PREFERENCES, JSON.stringify(preferences));
    
    showToast(preferences.nightMode ? 'Night mode enabled' : 'Night mode disabled', 'info');
}


const SHARED_BOOKING_KEYS = ['goindiaride_active_bookings', 'bookings', 'goride_bookings'];

function getDriverDisplayName() {
    const savedData = JSON.parse(localStorage.getItem(STORAGE_KEYS.DRIVER_DATA) || '{}');
    return savedData.name || savedData.fullName || savedData.driverName || 'Driver';
}

function broadcastPortalNotification(payload) {
    if (!window.PortalConnector) return;

    if (typeof PortalConnector.broadcastToAll === 'function') {
        PortalConnector.broadcastToAll(payload);
        return;
    }

    PortalConnector.createNotification({
        ...payload,
        targetPortals: ['customer', 'driver', 'admin']
    });
}

function updateSharedBookingStatus(bookingId, updates) {
    if (!bookingId || !updates || typeof updates !== 'object') return false;

    let updated = false;

    SHARED_BOOKING_KEYS.forEach((key) => {
        try {
            const bookings = JSON.parse(localStorage.getItem(key) || '[]');
            if (!Array.isArray(bookings) || bookings.length === 0) return;

            const index = bookings.findIndex((item) => String(item.id) === String(bookingId));
            if (index === -1) return;

            bookings[index] = { ...bookings[index], ...updates };
            localStorage.setItem(key, JSON.stringify(bookings));
            updated = true;
        } catch (error) {
            // ignore
        }
    });

    return updated;
}

// Setup cross-portal notifications
function setupPortalNotifications() {
    if (!window.PortalConnector) return;

    PortalConnector.setActivePortal('driver');
    PortalConnector.listen('driver', (notification) => {
        if (!notification) return;

        if (notification.sourcePortal === 'driver') {
            return;
        }

        if (notification.type === 'new_booking' && notification.booking) {
            showToast(`New booking: ${notification.booking.pickup} → ${notification.booking.drop}`, 'info');

            if (driverState.isOnline && !driverState.currentRide) {
                showRideRequest(notification.booking);
            }
            return;
        }

        if (notification.type === 'driver_assigned' && notification.booking) {
            showToast(`Booking ${notification.booking.id} assigned to a driver`, 'success');
            return;
        }

        if (notification.type === 'ride_completed' && notification.booking) {
            showToast(`Ride ${notification.booking.id} completed`, 'success');
            return;
        }

        if (notification.type === 'driver_document_approved' || notification.type === 'driver_document_rejected') {
            const currentDriver = JSON.parse(localStorage.getItem('currentDriver') || '{}');
            const targetDriverId = notification.metadata && notification.metadata.driverId ? String(notification.metadata.driverId) : '';

            if (!targetDriverId || String(currentDriver.id || '') === targetDriverId) {
                showToast(notification.message || 'Document status updated by admin', notification.type === 'driver_document_approved' ? 'success' : 'warning');
                if (typeof refreshKycSummaryWidgets === 'function') {
                    refreshKycSummaryWidgets();
                }
            }
            return;
        }

        if (notification.type === 'driver_approval_update') {
            const currentDriver = JSON.parse(localStorage.getItem('currentDriver') || '{}');
            const targetDriverId = notification.metadata && notification.metadata.driverId ? String(notification.metadata.driverId) : '';

            if (!targetDriverId || String(currentDriver.id || '') === targetDriverId) {
                showToast(notification.message || 'Driver approval status updated', 'info');
            }
            return;
        }

        showToast(notification.message || 'New notification received', 'info');
    });
}

function getBackendApiBase() {
    const fromWindow = String(window.GOINDIARIDE_API_BASE || '').trim();
    const fromStorage = String(localStorage.getItem('goindiaride_api_base') || '').trim();
    const base = fromWindow || fromStorage;

    if (base) return base.replace(/\/$/, '');

    const host = String(window.location.hostname || '').toLowerCase();
    if (host === 'localhost' || host === '127.0.0.1') {
        return 'http://localhost:5000';
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

function isDriverBookingAlarmEnabled() {
    try {
        return localStorage.getItem(DRIVER_BOOKING_ALARM_PREF_KEY) === '1';
    } catch (error) {
        return false;
    }
}

function setDriverBookingAlarmEnabled(enabled) {
    try {
        localStorage.setItem(DRIVER_BOOKING_ALARM_PREF_KEY, enabled ? '1' : '0');
    } catch (error) {
        // ignore storage errors
    }
}

function renderDriverBookingAlarmButton() {
    const existing = document.getElementById(DRIVER_BOOKING_ALARM_BTN_ID);

    if (isDriverBookingAlarmEnabled()) {
        if (existing) existing.remove();
        return;
    }

    if (existing) return;

    const btn = document.createElement('button');
    btn.id = DRIVER_BOOKING_ALARM_BTN_ID;
    btn.type = 'button';
    btn.textContent = 'Enable Booking Alarm';
    btn.style.cssText = [
        'position:fixed',
        'right:18px',
        'bottom:18px',
        'z-index:12000',
        'padding:10px 14px',
        'border:none',
        'border-radius:999px',
        'font-weight:700',
        'cursor:pointer',
        'background:#0B1F3A',
        'color:#fff',
        'box-shadow:0 8px 22px rgba(11,31,58,0.28)'
    ].join(';');

    btn.addEventListener('click', () => {
        armDriverBookingAlarm({ force: true, testTone: true });
        showToast('Booking alarm enabled', 'success');
    });

    document.body.appendChild(btn);
}

function ensureDriverAlarmContext() {
    const Ctx = window.AudioContext || window.webkitAudioContext;
    if (!Ctx) return null;

    if (!driverBackendAlarmContext) {
        driverBackendAlarmContext = new Ctx();
    }

    return driverBackendAlarmContext;
}

function armDriverBookingAlarm({ force = false, testTone = false } = {}) {
    const ctx = ensureDriverAlarmContext();
    if (!ctx) return false;

    const shouldArm = force || isDriverBookingAlarmEnabled();
    if (!shouldArm) {
        renderDriverBookingAlarmButton();
        return false;
    }

    const finalize = () => {
        setDriverBookingAlarmEnabled(true);
        renderDriverBookingAlarmButton();

        if (testTone) {
            driverBackendAlarmLastAt = 0;
            playDriverBookingAlarm();
        }
    };

    if (ctx.state === 'suspended') {
        ctx.resume()
            .then(finalize)
            .catch(() => renderDriverBookingAlarmButton());
    } else {
        finalize();
    }

    return true;
}

function playDriverBookingAlarm() {
    const nowMs = Date.now();
    if (nowMs - driverBackendAlarmLastAt < 2500) return;
    driverBackendAlarmLastAt = nowMs;

    const ctx = ensureDriverAlarmContext();
    if (!ctx) return;

    if (ctx.state === 'suspended') {
        if (!isDriverBookingAlarmEnabled()) {
            renderDriverBookingAlarmButton();
            return;
        }

        ctx.resume().catch(() => renderDriverBookingAlarmButton());
        if (ctx.state === 'suspended') return;
    }

    const start = ctx.currentTime + 0.02;
    [0, 0.2, 0.4].forEach((offset) => {
        const oscillator = ctx.createOscillator();
        const gain = ctx.createGain();
        oscillator.type = 'sine';
        oscillator.frequency.setValueAtTime(920, start + offset);
        gain.gain.setValueAtTime(0.0001, start + offset);
        gain.gain.exponentialRampToValueAtTime(0.18, start + offset + 0.02);
        gain.gain.exponentialRampToValueAtTime(0.0001, start + offset + 0.16);
        oscillator.connect(gain);
        gain.connect(ctx.destination);
        oscillator.start(start + offset);
        oscillator.stop(start + offset + 0.18);
    });
}

function buildDriverBookingFromNotification(notification) {
    const metadata = (notification && typeof notification.metadata === 'object' && notification.metadata) || {};
    const fare = Number(metadata.amount || 0);

    return {
        id: notification.bookingId || metadata.bookingId || (`BK${Date.now()}`),
        pickup: metadata.pickup || metadata.pickupLocation || 'Pickup pending',
        drop: metadata.drop || metadata.dropLocation || 'Drop pending',
        fare: Number.isFinite(fare) ? fare : 0,
        finalFare: Number.isFinite(fare) ? fare : 0,
        distanceKm: Number(metadata.distanceKm || 0),
        status: 'searching',
        timestamp: notification.createdAt || new Date().toISOString()
    };
}

function formatDriverBookingAlert(notification) {
    const metadata = (notification && typeof notification.metadata === 'object' && notification.metadata) || {};
    const pickup = String(metadata.pickup || metadata.pickupLocation || '').trim();
    const drop = String(metadata.drop || metadata.dropLocation || '').trim();

    if (pickup && drop) {
        return `New booking: ${pickup} -> ${drop}`;
    }

    return notification.message || `New booking ${notification.bookingId || ''}`.trim();
}

async function fetchDriverUnreadNotifications() {
    const token = String(getBackendAccessToken() || '').trim();
    if (!token) return [];

    const response = await fetch(`${getBackendApiBase()}/api/notifications?limit=25&unreadOnly=true`, {
        method: 'GET',
        headers: {
            Authorization: `Bearer ${token}`
        },
        credentials: 'include'
    });

    if (!response.ok) return [];
    const data = await response.json().catch(() => ({}));
    return Array.isArray(data.items) ? data.items : [];
}

async function pollDriverBackendBookingAlerts({ seedOnly = false } = {}) {
    try {
        const items = await fetchDriverUnreadNotifications();
        if (!items.length) return;

        const freshBookingItems = [];
        items.forEach((item) => {
            const id = String(item && item._id ? item._id : '');
            if (!id) return;

            const alreadySeen = driverSeenNotificationIds.has(id);
            driverSeenNotificationIds.add(id);

            if (seedOnly || alreadySeen) return;

            const type = String(item.type || '').toLowerCase();
            if (type === 'booking_created' || type === 'new_booking') {
                freshBookingItems.push(item);
            }
        });

        if (!freshBookingItems.length) return;

        const latest = freshBookingItems[0];
        const booking = buildDriverBookingFromNotification(latest);
        showToast(formatDriverBookingAlert(latest), 'info');
        playDriverBookingAlarm();

        if (driverState.isOnline && !driverState.currentRide) {
            showRideRequest(booking);
        }
    } catch (error) {
        // Keep polling silently; transient failures should not break portal flow.
    }
}

function startDriverBackendBookingAlerts() {
    if (driverBackendBookingAlertTimer) {
        clearInterval(driverBackendBookingAlertTimer);
    }

    const unlockAudio = () => {
        armDriverBookingAlarm();
    };

    document.addEventListener('pointerdown', unlockAudio, { passive: true });
    document.addEventListener('keydown', unlockAudio);

    renderDriverBookingAlarmButton();
    armDriverBookingAlarm();
    pollDriverBackendBookingAlerts({ seedOnly: true });
    driverBackendBookingAlertTimer = setInterval(() => {
        pollDriverBackendBookingAlerts({ seedOnly: false });
    }, DRIVER_BACKEND_BOOKING_ALERT_POLL_MS);
}
// Check for Ride Requests (Demo)
function checkForRideRequests() {
    if (!driverState.isOnline) return;

    // If secure backend session exists, live ride requests come from backend notifications.
    if (String(getBackendAccessToken() || '').trim()) {
        return;
    }

    // Live mode default: do not generate synthetic demo ride requests.
    if (!DRIVER_DEMO_REQUESTS_ENABLED) {
        return;
    }
    
    // Simulate ride request after random delay (demo)
    const delay = Math.random() * 30000 + 10000; // 10-40 seconds
    setTimeout(() => {
        if (driverState.isOnline && !driverState.currentRide) {
            showRideRequest();
        }
    }, delay);
}

// Show Ride Request
function showRideRequest(bookingData = null) {
    if (!bookingData && !DRIVER_DEMO_REQUESTS_ENABLED) {
        return;
    }

    const modal = document.getElementById('rideRequestModal');
    modal.style.display = 'flex';

    if (bookingData) {
        driverState.pendingRequest = bookingData;
        document.getElementById('requestPickup').textContent = bookingData.pickup;
        document.getElementById('requestDrop').textContent = bookingData.drop;
        document.getElementById('requestFare').textContent = `₹${Number(bookingData.finalFare || bookingData.fare || 0).toFixed(0)}`;
    } else {
        // Demo data
        const pickups = ['Jaipur Railway Station', 'Airport', 'Hawa Mahal', 'City Palace', 'Amber Fort'];
        const drops = ['Hotel Taj', 'Airport', 'Pink City', 'Bus Stand', 'Mall Road'];

        driverState.pendingRequest = null;
        document.getElementById('requestPickup').textContent = pickups[Math.floor(Math.random() * pickups.length)];
        document.getElementById('requestDrop').textContent = drops[Math.floor(Math.random() * drops.length)];
        document.getElementById('requestFare').textContent = `₹${(Math.random() * 500 + 100).toFixed(0)}`;
    }
    
    // Start countdown
    let timeLeft = 30;
    const timer = setInterval(() => {
        timeLeft--;
        document.getElementById('requestTimer').textContent = `${timeLeft}s`;
        
        if (timeLeft <= 0) {
            clearInterval(timer);
            rejectRequest();
        }
    }, 1000);
    
    // Store timer to clear later
    driverState.requestTimer = timer;
}

// Accept Ride Request
function acceptRequest() {
    const acceptedBooking = driverState.pendingRequest ? { ...driverState.pendingRequest } : null;

    // Clear timer
    if (driverState.requestTimer) {
        clearInterval(driverState.requestTimer);
    }

    // Hide modal
    document.getElementById('rideRequestModal').style.display = 'none';

    // Create ride
    driverState.currentRide = {
        id: acceptedBooking && acceptedBooking.id ? acceptedBooking.id : ('#' + Math.floor(Math.random() * 100000)),
        pickup: document.getElementById('requestPickup').textContent,
        drop: document.getElementById('requestDrop').textContent,
        fare: document.getElementById('requestFare').textContent,
        status: 'Accepted',
        startTime: Date.now()
    };

    // Show current ride section
    const rideSection = document.getElementById('currentRideSection');
    rideSection.style.display = 'block';

    document.getElementById('currentRideId').textContent = driverState.currentRide.id;
    document.getElementById('currentRideStatus').textContent = 'Going to Pickup';
    document.getElementById('pickupLocation').textContent = driverState.currentRide.pickup;
    document.getElementById('dropLocation').textContent = driverState.currentRide.drop;

    if (acceptedBooking && acceptedBooking.id) {
        const assignedAt = new Date().toISOString();
        const driverName = getDriverDisplayName();

        updateSharedBookingStatus(acceptedBooking.id, {
            status: 'driver_assigned',
            driverName,
            assignedAt,
            driverAcceptedAt: assignedAt
        });

        broadcastPortalNotification({
            type: 'driver_assigned',
            title: 'Driver Assigned',
            message: `Driver accepted booking ${acceptedBooking.id}: ${driverState.currentRide.pickup} → ${driverState.currentRide.drop}`,
            booking: { ...acceptedBooking, status: 'driver_assigned', driverName, assignedAt },
            sourcePortal: 'driver',
            metadata: {
                stage: 'driver_assigned',
                bookingId: acceptedBooking.id,
                driverName
            }
        });
    }

    showToast('Ride accepted! Navigate to pickup location.', 'success');
    driverState.pendingRequest = null;
    saveDriverData();
}
// Reject Ride Request
function rejectRequest() {
    const rejectedBooking = driverState.pendingRequest ? { ...driverState.pendingRequest } : null;

    if (driverState.requestTimer) {
        clearInterval(driverState.requestTimer);
    }

    document.getElementById('rideRequestModal').style.display = 'none';
    driverState.pendingRequest = null;
    showToast('Ride request rejected', 'info');

    if (rejectedBooking && rejectedBooking.id) {
        const rejectedAt = new Date().toISOString();

        updateSharedBookingStatus(rejectedBooking.id, {
            status: 'pending_reassignment',
            driverRejectedAt: rejectedAt
        });

        broadcastPortalNotification({
            type: 'booking_rejected',
            title: 'Booking Reassigned',
            message: `Booking ${rejectedBooking.id} was rejected by a driver and moved for reassignment`,
            booking: { ...rejectedBooking, status: 'pending_reassignment', driverRejectedAt: rejectedAt },
            sourcePortal: 'driver',
            metadata: {
                stage: 'driver_rejected',
                bookingId: rejectedBooking.id
            }
        });
    }

    // Check for next request
    checkForRideRequests();
}
// Navigate Route
function navigateRoute() {
    if (!driverState.location) {
        showToast('GPS location not available', 'error');
        return;
    }
    
    const destination = driverState.currentRide.drop;
    
    // Open Google Maps
    const url = `https://www.google.com/maps/dir/?api=1&origin=${driverState.location.lat},${driverState.location.lng}&destination=${encodeURIComponent(destination)}`;
    window.open(url, '_blank');
    
    showToast('Opening navigation...', 'info');
}

// Complete Ride
function completeRide() {
    if (!driverState.currentRide) return;

    const completedRide = { ...driverState.currentRide };

    // Calculate earnings
    const fareAmount = parseFloat(driverState.currentRide.fare.replace('₹', ''));
    driverState.todayEarnings += fareAmount;
    driverState.todayTrips++;

    // Update driving hours
    const drivingTime = (Date.now() - driverState.currentRide.startTime) / (1000 * 60 * 60);
    driverState.drivingHours += drivingTime;
    driverState.onlineHours += drivingTime;

    // Check fatigue
    checkFatigue();

    // Save fare before clearing ride
    const completedFare = driverState.currentRide.fare;

    // Save trip
    saveTrip(driverState.currentRide);

    if (completedRide.id) {
        const completedAt = new Date().toISOString();

        updateSharedBookingStatus(completedRide.id, {
            status: 'completed',
            completedAt
        });

        broadcastPortalNotification({
            type: 'ride_completed',
            title: 'Ride Completed',
            message: `Ride ${completedRide.id} completed successfully`,
            booking: { ...completedRide, status: 'completed', completedAt },
            sourcePortal: 'driver',
            metadata: {
                stage: 'ride_completed',
                bookingId: completedRide.id
            }
        });
    }

    // Clear current ride
    driverState.currentRide = null;
    document.getElementById('currentRideSection').style.display = 'none';

    // Update dashboard
    updateDashboard();

    showToast(`Ride completed! Earned ${completedFare}`, 'success');

    // Check for next request
    checkForRideRequests();

    saveDriverData();
}
// Check Fatigue
function checkFatigue() {
    if (driverState.drivingHours >= 8) {
        driverState.restRequired = true;
        driverState.isOnline = false;
        
        // Update toggle
        const onlineToggle = document.getElementById('onlineToggle');
        if (onlineToggle) {
            onlineToggle.checked = false;
        }
        
        // Show fatigue alert
        const fatigueAlert = document.getElementById('fatigueAlert');
        fatigueAlert.style.display = 'flex';
        
        document.getElementById('drivingHours').textContent = driverState.drivingHours.toFixed(1);
        
        // Start rest timer (30 minutes demo)
        startRestTimer(30);
        
        showToast('Mandatory rest period started. You must rest for 30 minutes.', 'warning');
        
        stopGPSTracking();
        updateOnlineStatus();
    }
}

// Start Rest Timer
function startRestTimer(minutes) {
    let timeLeft = minutes * 60; // in seconds
    
    const timer = setInterval(() => {
        timeLeft--;
        
        const mins = Math.floor(timeLeft / 60);
        const secs = timeLeft % 60;
        
        document.getElementById('restTimer').textContent = `${mins}:${secs.toString().padStart(2, '0')}`;
        
        if (timeLeft <= 0) {
            clearInterval(timer);
            driverState.restRequired = false;
            driverState.drivingHours = 0;
            document.getElementById('fatigueAlert').style.display = 'none';
            showToast('Rest period complete! You can go online now.', 'success');
            saveDriverData();
        }
    }, 1000);
}

// Save Trip
function saveTrip(trip) {
    const trips = JSON.parse(localStorage.getItem(STORAGE_KEYS.TRIPS) || '[]');
    trips.unshift({
        ...trip,
        completedAt: Date.now()
    });
    localStorage.setItem(STORAGE_KEYS.TRIPS, JSON.stringify(trips.slice(0, 100))); // Keep last 100 trips
}

// Save Driver Data
function saveDriverData() {
    localStorage.setItem(STORAGE_KEYS.DRIVER_DATA, JSON.stringify(driverState));
}

// Start Status Monitoring
function startStatusMonitoring() {
    // Update online hours every minute
    setInterval(() => {
        if (driverState.isOnline && !driverState.currentRide) {
            driverState.onlineHours += 1/60; // 1 minute
            document.getElementById('onlineHours').textContent = `${Math.floor(driverState.onlineHours)}h`;
        }
        
        if (driverState.currentRide) {
            driverState.drivingHours += 1/60;
        }
    }, 60000);
    
    // Save data every 5 minutes
    setInterval(saveDriverData, 300000);
}

// Load Demo Data
function loadDemoData() {
    if (!DRIVER_DEMO_REQUESTS_ENABLED) {
        return;
    }

    // Initialize with demo data if first time
    if (!localStorage.getItem(STORAGE_KEYS.DRIVER_DATA)) {
        driverState.rating = 4.8;
        driverState.todayEarnings = 850.50;
        driverState.todayTrips = 12;
        driverState.onlineHours = 6;
        saveDriverData();
        updateDashboard();
    }
}

// Update KYC Status
function updateKYCStatus() {
    const kycData = JSON.parse(localStorage.getItem('kyc_data') || '{}');
    const statusElement = document.getElementById('kycStatus');
    
    if (kycData.verified) {
        statusElement.textContent = 'Verified ✓';
        statusElement.style.color = 'var(--success-color)';
    } else {
        statusElement.textContent = 'Pending';
        statusElement.style.color = 'var(--warning-color)';
    }
}

// Update Wallet Balance
function updateWalletBalance() {
    const walletData = JSON.parse(localStorage.getItem('wallet_data') || '{"balance": 0}');
    document.getElementById('walletBalance').textContent = `₹${walletData.balance.toFixed(2)}`;
}

// Show Toast Notification
function showToast(message, type = 'info') {
    const toast = document.createElement('div');
    toast.className = 'toast toast-' + type;
    toast.textContent = message;
    toast.style.cssText = `
        position: fixed;
        top: 80px;
        left: 50%;
        transform: translateX(-50%);
        background: ${type === 'success' ? 'var(--success-color)' : type === 'error' ? 'var(--danger-color)' : type === 'warning' ? 'var(--warning-color)' : 'var(--info-color)'};
        color: white;
        padding: 1rem 2rem;
        border-radius: 8px;
        box-shadow: var(--shadow-lg);
        z-index: 10000;
        animation: slideDown 0.3s ease-out;
    `;
    
    document.body.appendChild(toast);
    
    setTimeout(() => {
        toast.style.animation = 'slideUp 0.3s ease-out';
        setTimeout(() => toast.remove(), 300);
    }, 3000);
}

// Navigation Functions
function showHome() {
    // Already on home
    document.querySelectorAll('.nav-item').forEach(item => item.classList.remove('active'));
    document.querySelectorAll('.nav-item')[0].classList.add('active');
}

function showProfile() {
    openProfile();
}


function openDriverOnlyBooking() {
    if (typeof createModal !== 'function') {
        showToast('Driver only booking panel loading...', 'info');
        return;
    }

    const content = `
        <div class="driver-only-booking-panel">
            <p style="margin-bottom: 12px;">Manage driver-only package availability for customer requests.</p>
            <div class="stats-grid" style="display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:12px;">
                <div class="stat-card" style="padding:12px;border:1px solid #e5e7eb;border-radius:10px;">
                    <h4 style="margin:0 0 8px 0;">Hourly</h4>
                    <p style="margin:0;">Recommended for city trips</p>
                </div>
                <div class="stat-card" style="padding:12px;border:1px solid #e5e7eb;border-radius:10px;">
                    <h4 style="margin:0 0 8px 0;">Full Day</h4>
                    <p style="margin:0;">Ideal for business and tourism</p>
                </div>
                <div class="stat-card" style="padding:12px;border:1px solid #e5e7eb;border-radius:10px;">
                    <h4 style="margin:0 0 8px 0;">Multi Day</h4>
                    <p style="margin:0;">Outstation and extended bookings</p>
                </div>
                <div class="stat-card" style="padding:12px;border:1px solid #e5e7eb;border-radius:10px;">
                    <h4 style="margin:0 0 8px 0;">Outstation</h4>
                    <p style="margin:0;">Long route and city transfer</p>
                </div>
            </div>
            <div style="margin-top:16px;display:flex;gap:8px;flex-wrap:wrap;">
                <button class="btn-primary" onclick="enableDriverOnlyPackages()">Enable Packages</button>
                <button class="btn-secondary" onclick="disableDriverOnlyPackages()">Disable Packages</button>
            </div>
        </div>
    `;

    const modal = createModal('Driver Only Booking Option', content);
    const container = document.getElementById('modalsContainer');
    if (container && modal) {
        container.appendChild(modal);
    }
}

function enableDriverOnlyPackages() {
    localStorage.setItem('driver_only_packages_enabled', 'true');
    showToast('Driver-only booking packages enabled', 'success');

    if (window.PortalConnector && typeof PortalConnector.broadcastToAll === 'function') {
        PortalConnector.broadcastToAll({
            type: 'driver_package_status',
            title: 'Driver Package Availability',
            message: 'Driver-only package availability enabled',
            sourcePortal: 'driver'
        });
    }
}

function disableDriverOnlyPackages() {
    localStorage.setItem('driver_only_packages_enabled', 'false');
    showToast('Driver-only booking packages disabled', 'warning');

    if (window.PortalConnector && typeof PortalConnector.broadcastToAll === 'function') {
        PortalConnector.broadcastToAll({
            type: 'driver_package_status',
            title: 'Driver Package Availability',
            message: 'Driver-only package availability disabled',
            sourcePortal: 'driver'
        });
    }
}
// Add animation keyframes
const style = document.createElement('style');
style.textContent = `
    @keyframes slideDown {
        from {
            transform: translateX(-50%) translateY(-100%);
            opacity: 0;
        }
        to {
            transform: translateX(-50%) translateY(0);
            opacity: 1;
        }
    }
    
    @keyframes slideUp {
        from {
            transform: translateX(-50%) translateY(0);
            opacity: 1;
        }
        to {
            transform: translateX(-50%) translateY(-100%);
            opacity: 0;
        }
    }
`;
document.head.appendChild(style);
