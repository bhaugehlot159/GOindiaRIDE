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

// Logout Functionality
document.getElementById('logoutBtn').addEventListener('click', () => {
    if (confirm('Are you sure you want to logout?')) {
        localStorage.removeItem('currentAdmin');
        localStorage.removeItem('userRole');
        window.location.href = './login.html';
    }
});

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
    if (!booking || !booking.id) return null;

    const adminBookings = getDemoData('Bookings');
    const bookingId = String(booking.id);
    const idx = adminBookings.findIndex((item) => String(item.id) === bookingId);

    const normalized = {
        id: booking.id,
        customerId: booking.customerId || 0,
        driverId: booking.driverId || 0,
        from: booking.pickup || booking.from || 'N/A',
        to: booking.drop || booking.to || 'N/A',
        fare: Number(booking.finalFare || booking.fare || 0),
        status: booking.status || fallbackStatus || 'new',
        date: (booking.timestamp || booking.createdAt || new Date().toISOString()).slice(0, 10),
        updatedAt: new Date().toISOString()
    };

    if (idx === -1) {
        adminBookings.unshift(normalized);
    } else {
        adminBookings[idx] = { ...adminBookings[idx], ...normalized };
    }

    if (ADMIN_LIVE_ONLY_MODE) {
        adminLiveCache.Bookings = adminBookings.slice(0, 500);
    } else {
        localStorage.setItem('adminDemoBookings', JSON.stringify(adminBookings));
    }
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
    return {
        id: String(row.bookingId || `BK${Date.now()}`),
        customerId: String(customer.id || customer.email || customer.phone || 'customer'),
        driverId: String(row.driverId || ''),
        from: row.pickup || '',
        to: row.drop || '',
        fare: Number(row.amount || 0),
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

function renderAdminBookingAlarmButton() {
    const existing = document.getElementById(ADMIN_BOOKING_ALARM_BTN_ID);

    if (isAdminBookingAlarmEnabled()) {
        if (existing) existing.remove();
        return;
    }

    if (existing) return;

    const btn = document.createElement('button');
    btn.id = ADMIN_BOOKING_ALARM_BTN_ID;
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
        armAdminBookingAlarm({ force: true, testTone: true });
        showToast('Booking alarm enabled', 'success');
    });

    document.body.appendChild(btn);
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
// Initialize Demo Data
function initializeDemoData() {
    if (ADMIN_LIVE_ONLY_MODE) {
        adminLiveCache.Users = [];
        adminLiveCache.Drivers = [];
        adminLiveCache.Bookings = [];
        return;
    }

    // Check if demo data already exists
    if (!localStorage.getItem('adminDemoInitialized')) {
        // Create demo users
        const demoUsers = [
            { id: 1, name: 'Rajesh Kumar', email: 'rajesh@example.com', phone: '9876543210', status: 'active', joinDate: '2024-01-15' },
            { id: 2, name: 'Priya Sharma', email: 'priya@example.com', phone: '9876543211', status: 'active', joinDate: '2024-02-20' },
            { id: 3, name: 'Amit Patel', email: 'amit@example.com', phone: '9876543212', status: 'inactive', joinDate: '2024-03-10' },
            { id: 4, name: 'Sneha Reddy', email: 'sneha@example.com', phone: '9876543213', status: 'active', joinDate: '2024-04-05' },
            { id: 5, name: 'Vikram Singh', email: 'vikram@example.com', phone: '9876543214', status: 'blocked', joinDate: '2024-05-12' }
        ];
        
        // Create demo drivers
        const demoDrivers = [
            { id: 1, name: 'Ravi Kumar', email: 'ravi@example.com', phone: '8765432109', vehicle: 'Sedan - DL 01 AB 1234', rating: 4.8, totalRides: 450, status: 'available', revenue: 125000 },
            { id: 2, name: 'Mohan Lal', email: 'mohan@example.com', phone: '8765432108', vehicle: 'SUV - DL 02 CD 5678', rating: 4.9, totalRides: 380, status: 'on-trip', revenue: 98000 },
            { id: 3, name: 'Suresh Babu', email: 'suresh@example.com', phone: '8765432107', vehicle: 'Hatchback - DL 03 EF 9012', rating: 4.5, totalRides: 290, status: 'offline', revenue: 72000 },
            { id: 4, name: 'Anil Kumar', email: 'anil@example.com', phone: '8765432106', vehicle: 'Sedan - DL 04 GH 3456', rating: 4.7, totalRides: 520, status: 'available', revenue: 145000 },
            { id: 5, name: 'Dinesh Yadav', email: 'dinesh@example.com', phone: '8765432105', vehicle: 'SUV - DL 05 IJ 7890', rating: 4.6, totalRides: 310, status: 'available', revenue: 89000 }
        ];
        
        // Create demo bookings
        const demoBookings = [
            { id: 1, customerId: 1, driverId: 1, from: 'Jaipur Railway Station', to: 'Hawa Mahal', fare: 450, status: 'completed', date: '2024-12-01' },
            { id: 2, customerId: 2, driverId: 2, from: 'Jodhpur Airport', to: 'Mehrangarh Fort', fare: 650, status: 'completed', date: '2024-12-02' },
            { id: 3, customerId: 3, driverId: 1, from: 'Udaipur City Palace', to: 'Lake Pichola', fare: 350, status: 'cancelled', date: '2024-12-03' },
            { id: 4, customerId: 4, driverId: 3, from: 'Jaisalmer Fort', to: 'Sam Sand Dunes', fare: 1200, status: 'completed', date: '2024-12-04' },
            { id: 5, customerId: 1, driverId: 4, from: 'Amber Fort', to: 'Jal Mahal', fare: 550, status: 'completed', date: '2024-12-05' }
        ];
        
        // Store demo data
        localStorage.setItem('adminDemoUsers', JSON.stringify(demoUsers));
        localStorage.setItem('adminDemoDrivers', JSON.stringify(demoDrivers));
        localStorage.setItem('adminDemoBookings', JSON.stringify(demoBookings));
        localStorage.setItem('adminDemoInitialized', 'true');
    }
}

// Get demo data
function getDemoData(type) {
    if (ADMIN_LIVE_ONLY_MODE && Object.prototype.hasOwnProperty.call(adminLiveCache, type)) {
        return Array.isArray(adminLiveCache[type]) ? adminLiveCache[type] : [];
    }

    const data = localStorage.getItem(`adminDemo${type}`);
    return data ? JSON.parse(data) : [];
}

// Update dashboard statistics
async function updateDashboardStats() {
    if (ADMIN_LIVE_ONLY_MODE) {
        try {
            const pendingBookings = await fetchLivePendingAdminBookings(240);
            adminLiveCache.Bookings = pendingBookings;

            const uniqueCustomers = new Set(
                pendingBookings
                    .map((item) => String(item.customerId || '').trim())
                    .filter(Boolean)
            );
            const uniqueDrivers = new Set(
                pendingBookings
                    .map((item) => String(item.driverId || '').trim())
                    .filter(Boolean)
            );

            const pendingCount = pendingBookings.filter((item) => item.status === 'pending_admin_review').length;
            const fareSum = pendingBookings.reduce((sum, item) => sum + Number(item.fare || 0), 0);

            document.getElementById('stat-users').textContent = String(uniqueCustomers.size);
            document.getElementById('stat-drivers').textContent = `${uniqueDrivers.size} active refs`;
            document.getElementById('stat-bookings').textContent = `${pendingCount} pending`;
            document.getElementById('stat-revenue').textContent = '₹' + Number(fareSum || 0).toLocaleString();
            return;
        } catch (error) {
            // Fall back to existing local render if backend is temporarily unavailable.
        }
    }

    const users = getDemoData('Users');
    const drivers = getDemoData('Drivers');
    const bookings = getDemoData('Bookings');

    const activeDrivers = drivers.filter(d => d.status === 'available' || d.status === 'on-trip').length;
    const totalRevenue = bookings.filter(b => b.status === 'completed').reduce((sum, b) => sum + b.fare, 0);

    document.getElementById('stat-users').textContent = users.length;
    document.getElementById('stat-drivers').textContent = activeDrivers + ' / ' + drivers.length;
    document.getElementById('stat-bookings').textContent = bookings.length;
    document.getElementById('stat-revenue').textContent = '₹' + totalRevenue.toLocaleString();
}

// Load section content dynamically
function loadSectionContent(sectionId, targetSection) {
    // Skip if content already loaded
    if (targetSection.innerHTML.trim() !== '') return;
    
    showLoading();
    
    setTimeout(() => {
        let content = '';
        
        switch(sectionId) {
            case 'affiliate-tracking':
                content = createAffiliateTrackingContent();
                break;
            case 'donation-reports':
                content = createDonationReportsContent();
                break;
            case 'cancellation-earnings':
                content = createCancellationEarningsContent();
                break;
            case 'tax-reports':
                content = createTaxReportsContent();
                break;
            case 'insurance-fund':
                content = createInsuranceFundContent();
                break;
            case 'revenue-analytics':
                content = createRevenueAnalyticsContent();
                break;
            case 'driver-payout':
                content = createDriverPayoutContent();
                break;
            case 'expense-tracking':
                content = createExpenseTrackingContent();
                break;
            case 'health-monitor':
                content = createHealthMonitorContent();
                break;
            case 'live-tracking':
                content = createLiveTrackingContent();
                break;
            case 'sos-alerts':
                content = createSOSAlertsContent();
                break;
            case 'document-verification':
                content = createDocumentVerificationContent();
                break;
            case 'demand-heatmap':
                content = createDemandHeatmapContent();
                break;
            case 'virtual-escort':
                content = createVirtualEscortContent();
                break;
            case 'background-check':
                content = createBackgroundCheckContent();
                break;
            case 'incident-reports':
                content = createIncidentReportsContent();
                break;
            case 'leaderboard':
                content = createLeaderboardContent();
                break;
            case 'vendor-management':
                content = createVendorManagementContent();
                break;
            case 'service-alerts':
                content = createServiceAlertsContent();
                break;
            case 'support-dashboard':
                content = createSupportDashboardContent();
                break;
            case 'driver-approval':
                content = createDriverApprovalContent();
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
            case 'compliance-center':
                content = createComplianceCenterContent();
                break;
            default:
                content = '<div class="section-header"><h2>Section Not Found</h2></div>';
        }
        
        targetSection.innerHTML = content;
        hideLoading();
        
        // Initialize any charts or special functionality for the section
        initializeSectionFeatures(sectionId);
    }, 300);
}

// Initialize section-specific features
function initializeSectionFeatures(sectionId) {
    // This function will be extended by other JS files
    if (typeof initializeFinancialFeatures === 'function' && 
        ['affiliate-tracking', 'donation-reports', 'cancellation-earnings', 'tax-reports', 
         'insurance-fund', 'revenue-analytics', 'driver-payout', 'expense-tracking'].includes(sectionId)) {
        initializeFinancialFeatures(sectionId);
    }
    if (typeof initializeSafetyFeatures === 'function' && 
        ['health-monitor', 'live-tracking', 'sos-alerts', 'document-verification', 
         'demand-heatmap', 'virtual-escort', 'background-check', 'incident-reports', 'compliance-center'].includes(sectionId)) {
        initializeSafetyFeatures(sectionId);
    }
}

// Initialize charts on dashboard
function initializeDashboardCharts() {
    // Revenue Chart
    const revenueCtx = document.getElementById('revenueChart');
    if (revenueCtx) {
        new Chart(revenueCtx, {
            type: 'line',
            data: {
                labels: ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'],
                datasets: [{
                    label: 'Revenue (₹)',
                    data: [12000, 19000, 15000, 25000, 22000, 30000, 28000, 35000, 32000, 38000, 42000, 45000],
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
                    data: [450, 85, 35, 60],
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

    if (ADMIN_LIVE_ONLY_MODE) {
        const liveRows = (Array.isArray(adminLiveCache.Bookings) ? adminLiveCache.Bookings : [])
            .slice(0, 5)
            .map((item) => {
                const ageMinutes = Math.max(
                    1,
                    Math.floor((Date.now() - new Date(item.createdAt || Date.now()).getTime()) / 60000)
                );
                return {
                    icon: 'fas fa-taxi',
                    bg: '#0b3d91',
                    title: `Booking ${item.id} pending admin review`,
                    time: `${ageMinutes} minute${ageMinutes > 1 ? 's' : ''} ago`
                };
            });

        const activities = liveRows.length
            ? liveRows
            : [{ icon: 'fas fa-shield-alt', bg: '#4facfe', title: 'No pending live bookings right now', time: 'Live queue synced' }];

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
        return;
    }

    const activities = [
        { icon: 'fas fa-user-plus', bg: '#667eea', title: 'New user registered', time: '5 minutes ago' },
        { icon: 'fas fa-car', bg: '#f093fb', title: 'Driver Ravi Kumar completed a ride', time: '12 minutes ago' },
        { icon: 'fas fa-money-bill', bg: '#43e97b', title: 'Payment of ₹650 received', time: '25 minutes ago' },
        { icon: 'fas fa-exclamation-triangle', bg: '#feca57', title: 'SOS alert resolved', time: '1 hour ago' },
        { icon: 'fas fa-file-alt', bg: '#4facfe', title: 'New document submitted for verification', time: '2 hours ago' }
    ];
    
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
    
    // Initialize demo data
    initializeDemoData();
    
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
