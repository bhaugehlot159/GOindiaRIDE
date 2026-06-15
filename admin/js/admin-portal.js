// ===== Admin Portal Core Functionality =====

// Theme Management
const themeToggle = document.getElementById('themeToggle');
const currentTheme = localStorage.getItem('adminTheme') || 'light';
const BACKEND_BOOKING_ALERT_POLL_MS = 5000;
const ADMIN_BOOKING_ALARM_PREF_KEY = 'goindiaride_admin_booking_alarm_enabled';
const ADMIN_BOOKING_ALARM_BTN_ID = 'goiEnableAdminBookingAlarm';
let backendBookingAlertTimer = null;
let backendBookingAlarmContext = null;
let backendBookingAlarmLastAt = 0;
const backendSeenNotificationIds = new Set();
const ADMIN_LIVE_ONLY_MODE = true;
const adminLiveCache = {
    Users: [],
    Drivers: [],
    Bookings: []
};
const ADMIN_LIVE_BOOKING_KEYS = [
    'bookings',
    'goride_bookings',
    'goindiaride_admin_review_inbox_v1',
    'goindiaride_active_bookings',
    'goindiaride_scheduled_rides',
    'goindiaride_ride_history',
    'customerBookings',
    'customer_bookings',
    'goindiaride_live_customer_booking_queue_v1'
];
const ADMIN_LIVE_USER_KEYS = ['users', 'goride_users'];
const ADMIN_LIVE_DRIVER_KEYS = ['drivers', 'goride_drivers'];
const ADMIN_CUSTOMER_LIVE_SECTION_IDS = new Set([
    'dashboard',
    'service-alerts',
    'support-dashboard',
    'promo-offers',
    'system-config',
    'audit-logs'
]);

// Set initial theme
if (currentTheme === 'dark') {
    document.documentElement.setAttribute('data-theme', 'dark');
    themeToggle.innerHTML = '<i class="fas fa-sun"></i>';
}

themeToggle.addEventListener('click', () => {
    const theme = document.documentElement.getAttribute('data-theme');
    if (theme === 'dark') {
        document.documentElement.setAttribute('data-theme', 'light');
        themeToggle.innerHTML = '<i class="fas fa-moon"></i>';
        localStorage.setItem('adminTheme', 'light');
    } else {
        document.documentElement.setAttribute('data-theme', 'dark');
        themeToggle.innerHTML = '<i class="fas fa-sun"></i>';
        localStorage.setItem('adminTheme', 'dark');
    }
});

// Navigation Management
const menuItems = document.querySelectorAll('.menu-item');
const contentSections = document.querySelectorAll('.content-section');
const pageTitle = document.getElementById('pageTitle');

menuItems.forEach(item => {
    item.addEventListener('click', (e) => {
        e.preventDefault();
        const sectionId = item.getAttribute('data-section');
        
        // Update active menu item
        menuItems.forEach(mi => mi.classList.remove('active'));
        item.classList.add('active');
        
        // Update active content section
        contentSections.forEach(section => section.classList.remove('active'));
        const targetSection = document.getElementById(`section-${sectionId}`);
        if (targetSection) {
            targetSection.classList.add('active');
            
            // Update page title
            const sectionTitle = item.querySelector('span').textContent;
            pageTitle.textContent = sectionTitle;
            
            // Load section content if empty
            loadSectionContent(sectionId, targetSection);
            
            // Close mobile sidebar
            if (window.innerWidth <= 768) {
                document.getElementById('sidebar').classList.remove('mobile-open');
            }
        }
    });
});

// Mobile Menu Toggle
const menuToggle = document.getElementById('menuToggle');
const sidebar = document.getElementById('sidebar');
const sidebarClose = document.getElementById('sidebarClose');

if (menuToggle) {
    menuToggle.addEventListener('click', () => {
        sidebar.classList.add('mobile-open');
    });
}

if (sidebarClose) {
    sidebarClose.addEventListener('click', () => {
        sidebar.classList.remove('mobile-open');
    });
}

// Sidebar Search
const sidebarSearch = document.getElementById('sidebarSearch');
sidebarSearch.addEventListener('input', (e) => {
    const searchTerm = e.target.value.toLowerCase();
    menuItems.forEach(item => {
        const text = item.querySelector('span').textContent.toLowerCase();
        const section = item.closest('.menu-section');
        if (text.includes(searchTerm)) {
            item.style.display = 'flex';
            if (section) section.style.display = 'block';
        } else {
            item.style.display = 'none';
        }
    });
    
    // Hide empty sections
    document.querySelectorAll('.menu-section').forEach(section => {
        const visibleItems = section.querySelectorAll('.menu-item[style="display: flex;"]');
        if (visibleItems.length === 0 && searchTerm) {
            section.style.display = 'none';
        } else {
            section.style.display = 'block';
        }
    });
});

const ADMIN_LOGOUT_KEYS = [
    'currentAdmin',
    'userRole',
    'role',
    'accountType',
    'accessToken',
    'authToken',
    'token',
    'goindiaride_refresh_token',
    'goindiaride_refresh_token_v1',
    'goindiaride_session_continuity_v1',
    'goindiaride_auth_mode',
    'goindiaride_auth_reason',
    'goindiaride_admin_session',
    'goindiaride_admin_otp_context',
    'admin2FAEmail',
    'admin2FAOTP',
    'admin2FAMethod'
];

function clearAdminLogoutKeys(storage) {
    if (!storage) return;
    ADMIN_LOGOUT_KEYS.forEach((key) => {
        try {
            storage.removeItem(key);
        } catch (_error) {
            // Storage can be blocked in restricted browser modes.
        }
    });
}

// Logout Functionality
document.getElementById('logoutBtn')?.addEventListener('click', () => {
    if (confirm('Are you sure you want to logout?')) {
        clearAdminLogoutKeys(localStorage);
        clearAdminLogoutKeys(sessionStorage);
        window.location.href = './login.html';
    }
});

function limitLegacyPortalToCustomerLiveSections() {
    document.querySelectorAll('.menu-item[data-section]').forEach((item) => {
        const sectionId = item.getAttribute('data-section');
        if (ADMIN_CUSTOMER_LIVE_SECTION_IDS.has(sectionId)) return;
        item.remove();
    });
    document.querySelectorAll('.menu-section').forEach((section) => {
        if (!section.querySelector('.menu-item[data-section]')) {
            section.remove();
        }
    });
}

// Toast Notification System
function showToast(message, type = 'info') {
    const toast = document.getElementById('toast');
    toast.textContent = message;
    toast.className = `toast ${type} show`;
    
    setTimeout(() => {
        toast.classList.remove('show');
    }, 3000);
}

// Loading Overlay
function showLoading() {
    document.getElementById('loadingOverlay').classList.add('active');
}

function hideLoading() {
    document.getElementById('loadingOverlay').classList.remove('active');
}


function upsertAdminBookingFromNotification(booking, fallbackStatus) {
    const incomingBookingId = String((booking && (booking.id || booking.bookingId)) || '').trim();
    if (!booking || !incomingBookingId) return null;

    const adminBookings = getLiveAdminData('Bookings').slice();
    const bookingId = incomingBookingId;
    const idx = adminBookings.findIndex((item) => String(item.id || item.bookingId) === bookingId);
    const existing = idx === -1 ? {} : (adminBookings[idx] || {});
    const customerSnapshot = booking.customerSnapshot && typeof booking.customerSnapshot === 'object'
        ? booking.customerSnapshot
        : {};
    const customer = booking.customer && typeof booking.customer === 'object'
        ? booking.customer
        : {};
    const fare = Number(booking.finalFare || booking.totalFare || booking.amount || booking.fare || booking.fareQuote?.amount || booking.fareBreakdown?.totalFare || 0);

    const normalized = {
        ...existing,
        ...booking,
        id: bookingId,
        bookingId,
        customerId: booking.customerId || 0,
        driverId: booking.driverId || 0,
        customerName: booking.customerName || customerSnapshot.name || customer.name || existing.customerName || '',
        customerPhone: booking.customerPhone || customerSnapshot.phone || customer.phone || existing.customerPhone || '',
        customerEmail: booking.customerEmail || customerSnapshot.email || customer.email || existing.customerEmail || '',
        from: booking.pickup || booking.pickupLocation || booking.from || 'N/A',
        to: booking.dropoff || booking.drop || booking.dropLocation || booking.to || 'N/A',
        pickup: booking.pickup || booking.pickupLocation || booking.from || '',
        pickupLocation: booking.pickupLocation || booking.pickup || booking.from || '',
        dropoff: booking.dropoff || booking.drop || booking.dropLocation || booking.to || '',
        dropLocation: booking.dropLocation || booking.dropoff || booking.drop || booking.to || '',
        fare,
        amount: Number(booking.amount || fare || 0),
        totalFare: Number(booking.totalFare || fare || 0),
        status: booking.status || fallbackStatus || 'new',
        date: (booking.timestamp || booking.createdAt || new Date().toISOString()).slice(0, 10),
        createdAt: booking.createdAt || booking.timestamp || existing.createdAt || new Date().toISOString(),
        updatedAt: new Date().toISOString()
    };

    if (idx === -1) {
        adminBookings.unshift(normalized);
    } else {
        adminBookings[idx] = { ...adminBookings[idx], ...normalized };
    }

    adminLiveCache.Bookings = mergeAdminLiveRows(adminBookings, 'booking').slice(0, 500);
    return normalized;
}

function updateAdminBookingStatusFromNotification(notification, nextStatus) {
    if (!notification || !notification.booking) return null;

    return upsertAdminBookingFromNotification({
        ...notification.booking,
        status: nextStatus
    }, nextStatus);
}

// Setup cross-portal notifications
function setupPortalNotifications() {
    if (!window.PortalConnector) return;

    PortalConnector.setActivePortal('admin');
    PortalConnector.listen('admin', (notification) => {
        if (!notification) return;

        const normalizedType = String(notification.type || '').toLowerCase();
        if ((normalizedType === 'new_booking' || normalizedType === 'booking_admin_pending_review') && notification.booking) {
            upsertAdminBookingFromNotification(notification.booking, 'new');
            showToast(`New booking: ${notification.booking.pickup} → ${notification.booking.drop}`, 'info');
            logAdminAction('NEW_BOOKING_ALERT', `Booking ${notification.booking.id} from ${notification.sourcePortal || 'portal'}`);
            updateDashboardStats();
            return;
        }

        if (notification.type === 'driver_assigned' && notification.booking) {
            updateAdminBookingStatusFromNotification(notification, 'driver_assigned');
            showToast(`Driver assigned for booking ${notification.booking.id}`, 'success');
            logAdminAction('BOOKING_DRIVER_ASSIGNED', `Booking ${notification.booking.id} accepted by driver`);
            updateDashboardStats();
            return;
        }

        if (notification.type === 'booking_rejected' && notification.booking) {
            updateAdminBookingStatusFromNotification(notification, 'pending_reassignment');
            showToast(`Booking ${notification.booking.id} moved to reassignment queue`, 'warning');
            logAdminAction('BOOKING_REASSIGNED', `Booking ${notification.booking.id} rejected by driver`);
            updateDashboardStats();
            return;
        }

        if (notification.type === 'ride_completed' && notification.booking) {
            updateAdminBookingStatusFromNotification(notification, 'completed');
            showToast(`Ride ${notification.booking.id} completed`, 'success');
            logAdminAction('RIDE_COMPLETED', `Ride ${notification.booking.id} completed`);
            updateDashboardStats();
            return;
        }

        if (notification.type === 'driver_document_submitted') {
            showToast(notification.message || 'New driver document submitted for review', 'info');
            logAdminAction('DOC_SUBMITTED', notification.message || 'Driver document submitted');
            if (typeof refreshDocumentVerificationSection === 'function') {
                refreshDocumentVerificationSection();
            }
            return;
        }

        if (notification.type === 'driver_document_approved' || notification.type === 'driver_document_rejected') {
            showToast(notification.message || 'Driver document decision updated', notification.type === 'driver_document_approved' ? 'success' : 'warning');
            if (typeof refreshDocumentVerificationSection === 'function') {
                refreshDocumentVerificationSection();
            }
            if (typeof refreshDriverApprovalSection === 'function') {
                refreshDriverApprovalSection();
            }
            return;
        }

        if (notification.type === 'driver_approval_update') {
            showToast(notification.message || 'Driver approval updated', 'info');
            if (typeof refreshDriverApprovalSection === 'function') {
                refreshDriverApprovalSection();
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

function normalizePendingBookingForAdminPortal(row) {
    const customer = row && typeof row.customer === 'object' ? row.customer : {};
    const customerSnapshot = row && typeof row.customerSnapshot === 'object' ? row.customerSnapshot : {};
    const bookingId = String(row.bookingId || row.id || `BK${Date.now()}`);
    const pickup = row.pickup || row.pickupLocation || row.from || '';
    const drop = row.dropoff || row.drop || row.dropLocation || row.to || '';
    const fare = Number(row.amount || row.totalFare || row.finalFare || row.fare || row.fareQuote?.amount || row.fareBreakdown?.totalFare || 0);
    return {
        ...row,
        id: bookingId,
        bookingId,
        customerId: String(customer.id || customer.email || customer.phone || 'customer'),
        customerName: row.customerName || customerSnapshot.name || customer.name || '',
        customerPhone: row.customerPhone || customerSnapshot.phone || customer.phone || '',
        customerEmail: row.customerEmail || customerSnapshot.email || customer.email || '',
        driverId: String(row.driverId || ''),
        from: pickup,
        to: drop,
        pickup,
        pickupLocation: row.pickupLocation || pickup,
        dropoff: drop,
        drop: row.drop || drop,
        dropLocation: row.dropLocation || drop,
        fare,
        amount: Number(row.amount || fare || 0),
        totalFare: Number(row.totalFare || fare || 0),
        status: String(row.adminReviewStatus || 'pending').toLowerCase() === 'approved'
            ? (row.driverId ? 'driver_assigned' : 'approved')
            : String(row.adminReviewStatus || 'pending').toLowerCase() === 'rejected'
                ? 'rejected'
                : 'pending_admin_review',
        date: String((row.createdAt || '').slice(0, 10) || new Date().toISOString().slice(0, 10)),
        updatedAt: new Date().toISOString(),
        createdAt: row.createdAt || new Date().toISOString(),
        adminReviewStatus: String(row.adminReviewStatus || 'pending').toLowerCase()
    };
}

async function fetchLivePendingAdminBookings(limit = 120) {
    const token = String(getBackendAccessToken() || '').trim();
    if (!token) return [];

    const response = await fetch(`${getBackendApiBase()}/api/bookings/admin/pending?limit=${encodeURIComponent(limit)}`, {
        method: 'GET',
        headers: {
            Authorization: `Bearer ${token}`,
            Accept: 'application/json'
        },
        credentials: 'include'
    });

    if (!response.ok) return [];
    const payload = await response.json().catch(() => ({}));
    const rows = Array.isArray(payload.items) ? payload.items : [];
    return rows.map(normalizePendingBookingForAdminPortal);
}

function getAdminLoginPath() {
    return './login.html';
}

function hasLocalAdminSession() {
    const role = String(localStorage.getItem('userRole') || localStorage.getItem('role') || '').toLowerCase();
    const accountType = String(localStorage.getItem('accountType') || '').toLowerCase();
    const currentAdminRaw = localStorage.getItem('currentAdmin');

    let currentAdmin = null;
    try {
        currentAdmin = currentAdminRaw ? JSON.parse(currentAdminRaw) : null;
    } catch (error) {
        currentAdmin = null;
    }

    const hasAdminIdentity = Boolean(currentAdmin && (currentAdmin.email || currentAdmin.id));
    const roleAllowsAdmin = role === 'admin' || accountType === 'admin';

    return roleAllowsAdmin && hasAdminIdentity;
}

async function enforceAdminPortalAccess() {
    const token = String(getBackendAccessToken() || '').trim();
    if (!token) {
        if (hasLocalAdminSession()) return true;
        window.location.replace(getAdminLoginPath());
        return false;
    }

    try {
        const response = await fetch(`${getBackendApiBase()}/api/users/profile`, {
            method: 'GET',
            headers: {
                Authorization: `Bearer ${token}`,
                Accept: 'application/json'
            }
        });

        if (!response.ok) {
            if (hasLocalAdminSession()) return true;
            window.location.replace(getAdminLoginPath());
            return false;
        }

        const data = await response.json().catch(() => ({}));
        const user = data && typeof data.user === 'object' ? data.user : {};
        const role = String(user.role || '').toLowerCase();
        const accountType = String(user.accountType || '').toLowerCase();
        const isAdmin = role === 'admin' || accountType === 'admin';

        if (!isAdmin) {
            window.location.replace('../index.html');
            return false;
        }

        localStorage.setItem('userRole', 'admin');
        return true;
    } catch (error) {
        if (hasLocalAdminSession()) return true;
        window.location.replace(getAdminLoginPath());
        return false;
    }
}

function isAdminBookingAlarmEnabled() {
    try {
        return localStorage.getItem(ADMIN_BOOKING_ALARM_PREF_KEY) === '1';
    } catch (error) {
        return false;
    }
}

function setAdminBookingAlarmEnabled(enabled) {
    try {
        localStorage.setItem(ADMIN_BOOKING_ALARM_PREF_KEY, enabled ? '1' : '0');
    } catch (error) {
        // ignore storage failures
    }
}

function getAdminBookingAlarmHost() {
    return document.querySelector('[data-admin-control-panel="legacy-portal"] .topbar-actions')
        || document.querySelector('.topbar-actions');
}

function renderAdminBookingAlarmButton() {
    const existing = document.getElementById(ADMIN_BOOKING_ALARM_BTN_ID);

    if (isAdminBookingAlarmEnabled()) {
        if (existing) existing.remove();
        return;
    }

    const host = getAdminBookingAlarmHost();
    if (existing) {
        if (host && existing.parentElement !== host) host.appendChild(existing);
        return;
    }

    const btn = document.createElement('button');
    btn.id = ADMIN_BOOKING_ALARM_BTN_ID;
    btn.type = 'button';
    btn.className = 'btn-booking-alarm';
    btn.title = 'Enable booking sound alerts';
    btn.innerHTML = '<i class="fas fa-volume-high" aria-hidden="true"></i><span>Booking Alarm</span>';

    btn.addEventListener('click', () => {
        armAdminBookingAlarm({ force: true, testTone: true });
        showToast('Booking alarm enabled', 'success');
    });

    (host || document.body).appendChild(btn);
}

function ensureBackendAlarmContext() {
    const Ctx = window.AudioContext || window.webkitAudioContext;
    if (!Ctx) return null;

    if (!backendBookingAlarmContext) {
        backendBookingAlarmContext = new Ctx();
    }

    return backendBookingAlarmContext;
}

function armAdminBookingAlarm({ force = false, testTone = false } = {}) {
    const ctx = ensureBackendAlarmContext();
    if (!ctx) return false;

    const shouldArm = force || isAdminBookingAlarmEnabled();
    if (!shouldArm) {
        renderAdminBookingAlarmButton();
        return false;
    }

    const finalize = () => {
        setAdminBookingAlarmEnabled(true);
        renderAdminBookingAlarmButton();

        if (testTone) {
            backendBookingAlarmLastAt = 0;
            playBackendBookingAlarm();
        }
    };

    if (ctx.state === 'suspended') {
        ctx.resume()
            .then(finalize)
            .catch(() => renderAdminBookingAlarmButton());
    } else {
        finalize();
    }

    return true;
}

function playBackendBookingAlarm() {
    const nowMs = Date.now();
    if (nowMs - backendBookingAlarmLastAt < 2500) return;
    backendBookingAlarmLastAt = nowMs;

    const ctx = ensureBackendAlarmContext();
    if (!ctx) return;

    if (ctx.state === 'suspended') {
        if (!isAdminBookingAlarmEnabled()) {
            renderAdminBookingAlarmButton();
            return;
        }

        ctx.resume().catch(() => renderAdminBookingAlarmButton());
        if (ctx.state === 'suspended') return;
    }

    const start = ctx.currentTime + 0.02;
    [0, 0.22, 0.44].forEach((offset) => {
        const oscillator = ctx.createOscillator();
        const gain = ctx.createGain();
        oscillator.type = 'sine';
        oscillator.frequency.setValueAtTime(900, start + offset);
        gain.gain.setValueAtTime(0.0001, start + offset);
        gain.gain.exponentialRampToValueAtTime(0.18, start + offset + 0.02);
        gain.gain.exponentialRampToValueAtTime(0.0001, start + offset + 0.16);
        oscillator.connect(gain);
        gain.connect(ctx.destination);
        oscillator.start(start + offset);
        oscillator.stop(start + offset + 0.18);
    });
}

function buildBookingPayloadFromNotification(notification) {
    const metadata = (notification && typeof notification.metadata === 'object' && notification.metadata) || {};
    return {
        id: notification.bookingId || metadata.bookingId || (`BK${Date.now()}`),
        pickup: metadata.pickup || metadata.pickupLocation || 'Pickup pending',
        drop: metadata.drop || metadata.dropLocation || 'Drop pending',
        finalFare: Number(metadata.amount || 0),
        fare: Number(metadata.amount || 0),
        status: 'new',
        timestamp: notification.createdAt || new Date().toISOString()
    };
}

function formatBookingAlertMessage(notification) {
    const metadata = (notification && typeof notification.metadata === 'object' && notification.metadata) || {};
    const pickup = String(metadata.pickup || metadata.pickupLocation || '').trim();
    const drop = String(metadata.drop || metadata.dropLocation || '').trim();

    if (pickup && drop) {
        return `New booking: ${pickup} -> ${drop}`;
    }

    return notification.message || `New booking ${notification.bookingId || ''}`.trim();
}

async function fetchBackendUnreadNotifications() {
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

async function pollBackendBookingAlerts({ seedOnly = false } = {}) {
    try {
        const items = await fetchBackendUnreadNotifications();
        if (!items.length) return;

        const freshBookingItems = [];
        items.forEach((item) => {
            const id = String(item && item._id ? item._id : '');
            if (!id) return;

            const alreadySeen = backendSeenNotificationIds.has(id);
            backendSeenNotificationIds.add(id);

            if (seedOnly || alreadySeen) return;

            const type = String(item.type || '').toLowerCase();
            if (type === 'booking_created' || type === 'new_booking' || type === 'booking_admin_pending_review') {
                freshBookingItems.push(item);
            }
        });

        if (!freshBookingItems.length) return;

        const latest = freshBookingItems[0];
        upsertAdminBookingFromNotification(buildBookingPayloadFromNotification(latest), 'new');
        updateDashboardStats();
        showToast(formatBookingAlertMessage(latest), 'info');
        logAdminAction('BACKEND_BOOKING_ALERT', `Booking ${latest.bookingId || 'N/A'} arrived from backend queue`);
        playBackendBookingAlarm();
    } catch (error) {
        // Keep polling silently; UI should not break on transient network failures.
    }
}

function startBackendBookingAlerts() {
    if (backendBookingAlertTimer) {
        clearInterval(backendBookingAlertTimer);
    }

    const unlockAudio = () => {
        armAdminBookingAlarm();
    };

    document.addEventListener('pointerdown', unlockAudio, { passive: true });
    document.addEventListener('keydown', unlockAudio);

    renderAdminBookingAlarmButton();
    armAdminBookingAlarm();
    pollBackendBookingAlerts({ seedOnly: true });
    backendBookingAlertTimer = setInterval(() => {
        pollBackendBookingAlerts({ seedOnly: false });
    }, BACKEND_BOOKING_ALERT_POLL_MS);
}
function safeAdminJson(raw, fallback) {
    try {
        const parsed = JSON.parse(raw || '');
        return parsed === null || parsed === undefined ? fallback : parsed;
    } catch (_error) {
        return fallback;
    }
}

function readAdminArrayFromStorageKey(key) {
    const parsed = safeAdminJson(localStorage.getItem(key), []);
    if (Array.isArray(parsed)) return parsed.filter((item) => item && typeof item === 'object');
    if (parsed && typeof parsed === 'object') {
        const nested = parsed.items || parsed.rows || parsed.bookings || parsed.users || parsed.drivers || [];
        return Array.isArray(nested) ? nested.filter((item) => item && typeof item === 'object') : [];
    }
    return [];
}

function readAdminRowsFromStorage(keys) {
    return keys.reduce((rows, key) => rows.concat(readAdminArrayFromStorageKey(key)), []);
}

function adminLiveRowKey(row, prefix, index) {
    return String(
        row.id ||
        row.bookingId ||
        row._id ||
        row.customerId ||
        row.userId ||
        row.driverId ||
        row.phone ||
        row.email ||
        `${prefix}_${index}`
    ).trim();
}

function adminLiveRowTime(row) {
    const raw = row.updatedAt || row.createdAt || row.timestamp || row.date || row.joinDate || 0;
    const time = new Date(raw).getTime();
    return Number.isFinite(time) ? time : 0;
}

function mergeAdminLiveRows(rows, prefix) {
    const byKey = new Map();
    rows.forEach((row, index) => {
        if (!row || typeof row !== 'object') return;
        const key = adminLiveRowKey(row, prefix, index);
        if (!key) return;
        const existing = byKey.get(key);
        byKey.set(key, existing ? { ...existing, ...row } : row);
    });
    return Array.from(byKey.values()).sort((a, b) => adminLiveRowTime(b) - adminLiveRowTime(a));
}

function normalizeAdminBookingRow(row) {
    const customerSnapshot = row.customerSnapshot && typeof row.customerSnapshot === 'object'
        ? row.customerSnapshot
        : {};
    const customer = row.customer && typeof row.customer === 'object' ? row.customer : {};
    const fare = Number(row.finalFare || row.totalFare || row.amount || row.fare || row.fareQuote?.amount || row.fareBreakdown?.totalFare || 0);
    const id = String(row.id || row.bookingId || row._id || '').trim();
    return {
        ...row,
        id: id || row.id,
        bookingId: row.bookingId || id || row._id || '',
        customerId: row.customerId || customerSnapshot.id || customer.id || '',
        driverId: row.driverId || row.assignedDriverId || '',
        customerName: row.customerName || customerSnapshot.name || customer.name || '',
        customerPhone: row.customerPhone || customerSnapshot.phone || customer.phone || '',
        customerEmail: row.customerEmail || customerSnapshot.email || customer.email || '',
        from: row.pickup || row.pickupLocation || row.from || '',
        to: row.dropoff || row.drop || row.dropLocation || row.to || '',
        fare,
        status: String(row.status || row.adminReviewStatus || 'pending').toLowerCase(),
        createdAt: row.createdAt || row.timestamp || row.date || new Date().toISOString(),
        updatedAt: row.updatedAt || row.createdAt || row.timestamp || row.date || ''
    };
}

function refreshAdminLiveCacheFromStorage() {
    adminLiveCache.Users = mergeAdminLiveRows([
        ...readAdminRowsFromStorage(ADMIN_LIVE_USER_KEYS),
        ...adminLiveCache.Users
    ], 'user').slice(0, 500);
    adminLiveCache.Drivers = mergeAdminLiveRows([
        ...readAdminRowsFromStorage(ADMIN_LIVE_DRIVER_KEYS),
        ...adminLiveCache.Drivers
    ], 'driver').slice(0, 500);
    adminLiveCache.Bookings = mergeAdminLiveRows([
        ...readAdminRowsFromStorage(ADMIN_LIVE_BOOKING_KEYS).map(normalizeAdminBookingRow),
        ...adminLiveCache.Bookings
    ], 'booking').slice(0, 500);
}

function initializeLiveAdminData() {
    refreshAdminLiveCacheFromStorage();
}

function getLiveAdminData(type) {
    if (!Object.prototype.hasOwnProperty.call(adminLiveCache, type)) return [];
    refreshAdminLiveCacheFromStorage();
    return Array.isArray(adminLiveCache[type]) ? adminLiveCache[type] : [];
}

function renderLiveDashboardStats(bookings, users, drivers) {
    const customerRefs = new Set(
        bookings
            .map((item) => String(item.customerId || item.customerPhone || item.customerEmail || '').trim())
            .filter(Boolean)
    );
    const driverRefs = new Set(
        bookings
            .map((item) => String(item.driverId || '').trim())
            .filter(Boolean)
    );
    const activeDrivers = drivers.filter((driver) => {
        const status = String(driver.status || driver.availability || '').toLowerCase();
        return ['available', 'on-trip', 'online', 'active', 'verified'].includes(status);
    }).length;
    const liveRevenue = bookings
        .filter((booking) => !['cancelled', 'rejected', 'blocked_by_admin', 'deleted_by_admin'].includes(String(booking.status || '').toLowerCase()))
        .reduce((sum, booking) => sum + Number(booking.fare || booking.totalFare || booking.amount || 0), 0);

    document.getElementById('stat-users').textContent = String(Math.max(users.length, customerRefs.size));
    document.getElementById('stat-drivers').textContent = drivers.length
        ? `${activeDrivers} / ${drivers.length}`
        : `${driverRefs.size} active refs`;
    document.getElementById('stat-bookings').textContent = String(bookings.length);
    document.getElementById('stat-revenue').textContent = '₹' + Number(liveRevenue || 0).toLocaleString();
}

// Update dashboard statistics
async function updateDashboardStats() {
    if (ADMIN_LIVE_ONLY_MODE) {
        try {
            const pendingBookings = await fetchLivePendingAdminBookings(240);
            adminLiveCache.Bookings = mergeAdminLiveRows([
                ...pendingBookings.map(normalizeAdminBookingRow),
                ...getLiveAdminData('Bookings')
            ], 'booking').slice(0, 500);
            renderLiveDashboardStats(adminLiveCache.Bookings, getLiveAdminData('Users'), getLiveAdminData('Drivers'));
            return;
        } catch (error) {
            renderLiveDashboardStats(getLiveAdminData('Bookings'), getLiveAdminData('Users'), getLiveAdminData('Drivers'));
            return;
        }
    }
}

// Load section content dynamically
function loadSectionContent(sectionId, targetSection) {
    // Skip if content already loaded
    if (targetSection.innerHTML.trim() !== '') return;
    
    showLoading();
    
    setTimeout(() => {
        let content = '';
        
        switch(sectionId) {
            case 'service-alerts':
                content = createServiceAlertsContent();
                break;
            case 'support-dashboard':
                content = createSupportDashboardContent();
                break;
            case 'promo-offers':
                content = createPromoOffersContent();
                break;
            case 'system-config':
                content = createSystemConfigContent();
                break;
            case 'audit-logs':
                content = createAuditLogsContent();
                break;
            default:
                content = '<div class="section-header"><h2>Section Not Available</h2><p>This legacy portal only loads live customer operations sections.</p></div>';
        }
        
        targetSection.innerHTML = content;
        hideLoading();
        
        // Initialize any charts or special functionality for the section
        initializeSectionFeatures(sectionId);
    }, 300);
}

// Initialize section-specific features
function initializeSectionFeatures(sectionId) {
    if (typeof initializeSafetyFeatures === 'function' && 
        ['service-alerts', 'support-dashboard', 'promo-offers', 'system-config', 'audit-logs'].includes(sectionId)) {
        initializeSafetyFeatures(sectionId);
    }
}

function buildRevenueChartSeries(bookings) {
    const formatter = new Intl.DateTimeFormat('en-IN', { month: 'short', day: '2-digit' });
    const buckets = [];
    for (let index = 6; index >= 0; index -= 1) {
        const date = new Date();
        date.setHours(0, 0, 0, 0);
        date.setDate(date.getDate() - index);
        buckets.push({
            key: date.toISOString().slice(0, 10),
            label: formatter.format(date),
            value: 0
        });
    }
    const byKey = new Map(buckets.map((bucket) => [bucket.key, bucket]));
    bookings.forEach((booking) => {
        const date = new Date(booking.createdAt || booking.updatedAt || booking.date || '');
        if (!Number.isFinite(date.getTime())) return;
        const key = date.toISOString().slice(0, 10);
        if (!byKey.has(key)) return;
        byKey.get(key).value += Number(booking.fare || booking.totalFare || booking.amount || 0);
    });
    return {
        labels: buckets.map((bucket) => bucket.label),
        values: buckets.map((bucket) => bucket.value)
    };
}

function buildBookingStatusSeries(bookings) {
    const counters = {
        completed: 0,
        active: 0,
        cancelled: 0,
        pending: 0
    };
    bookings.forEach((booking) => {
        const status = String(booking.status || booking.adminReviewStatus || '').toLowerCase();
        if (['completed', 'closed', 'paid'].includes(status)) {
            counters.completed += 1;
        } else if (['cancelled', 'rejected', 'blocked_by_admin', 'deleted_by_admin'].includes(status)) {
            counters.cancelled += 1;
        } else if (['active', 'approved', 'confirmed', 'driver_assigned', 'on_trip', 'in_progress'].includes(status)) {
            counters.active += 1;
        } else {
            counters.pending += 1;
        }
    });
    return [counters.completed, counters.active, counters.cancelled, counters.pending];
}

// Initialize charts on dashboard
function initializeDashboardCharts() {
    if (typeof Chart === 'undefined') {
        return;
    }

    const liveBookings = getLiveAdminData('Bookings');
    const revenueSeries = buildRevenueChartSeries(liveBookings);
    const bookingStatusSeries = buildBookingStatusSeries(liveBookings);

    // Revenue Chart
    const revenueCtx = document.getElementById('revenueChart');
    if (revenueCtx) {
        new Chart(revenueCtx, {
            type: 'line',
            data: {
                labels: revenueSeries.labels,
                datasets: [{
                    label: 'Revenue (₹)',
                    data: revenueSeries.values,
                    borderColor: '#667eea',
                    backgroundColor: 'rgba(102, 126, 234, 0.1)',
                    tension: 0.4,
                    fill: true
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: true,
                plugins: {
                    legend: {
                        display: false
                    }
                },
                scales: {
                    y: {
                        beginAtZero: true,
                        ticks: {
                            callback: function(value) {
                                return '₹' + value.toLocaleString();
                            }
                        }
                    }
                }
            }
        });
    }
    
    // Booking Status Chart
    const bookingCtx = document.getElementById('bookingChart');
    if (bookingCtx) {
        new Chart(bookingCtx, {
            type: 'doughnut',
            data: {
                labels: ['Completed', 'In Progress', 'Cancelled', 'Pending'],
                datasets: [{
                    data: bookingStatusSeries,
                    backgroundColor: ['#43e97b', '#4facfe', '#ff6b6b', '#feca57']
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: true,
                plugins: {
                    legend: {
                        position: 'bottom'
                    }
                }
            }
        });
    }
}

// Load recent activity
function loadRecentActivity() {
    const activityList = document.getElementById('activityList');
    if (!activityList) return;

    const liveRows = getLiveAdminData('Bookings')
        .slice(0, 5)
        .map((item) => {
            const ageMinutes = Math.max(
                1,
                Math.floor((Date.now() - new Date(item.createdAt || item.updatedAt || Date.now()).getTime()) / 60000)
            );
            return {
                icon: 'fas fa-taxi',
                bg: '#0b3d91',
                title: `Booking ${item.id || item.bookingId || 'N/A'} ${String(item.status || 'pending').replace(/_/g, ' ')}`,
                time: `${ageMinutes} minute${ageMinutes > 1 ? 's' : ''} ago`
            };
        });

    const activities = liveRows.length
        ? liveRows
        : [{ icon: 'fas fa-shield-alt', bg: '#4facfe', title: 'No live customer activity yet', time: 'Live stores connected' }];
    
    activityList.innerHTML = activities.map(activity => `
        <div class="activity-item">
            <div class="activity-icon" style="background: ${activity.bg};">
                <i class="${activity.icon}"></i>
            </div>
            <div class="activity-content">
                <div class="activity-title">${activity.title}</div>
                <div class="activity-time">${activity.time}</div>
            </div>
        </div>
    `).join('');
}

// Log admin action
function logAdminAction(action, details) {
    const logs = JSON.parse(localStorage.getItem('adminAuditLogs') || '[]');
    logs.unshift({
        timestamp: new Date().toISOString(),
        action: action,
        details: details,
        admin: 'Admin User'
    });
    // Keep only last 1000 logs
    if (logs.length > 1000) logs.pop();
    localStorage.setItem('adminAuditLogs', JSON.stringify(logs));
}

// Initialize on page load
window.addEventListener('DOMContentLoaded', async () => {
    const accessAllowed = await enforceAdminPortalAccess();
    if (!accessAllowed) return;

    limitLegacyPortalToCustomerLiveSections();
    
    // Connect live customer/admin stores without creating placeholder rows.
    initializeLiveAdminData();
    
    // Update dashboard stats
    updateDashboardStats();
    
    // Initialize dashboard charts
    initializeDashboardCharts();
    
    // Load recent activity
    loadRecentActivity();

    // Listen for customer/driver/admin shared notifications
    setupPortalNotifications();
    startBackendBookingAlerts();
    
    // Log admin login
    logAdminAction('LOGIN', 'Admin logged into portal');
});

// Auto-refresh dashboard every 60 seconds
setInterval(() => {
    if (document.getElementById('section-dashboard').classList.contains('active')) {
        updateDashboardStats();
        loadRecentActivity();
    }
}, 60000);
