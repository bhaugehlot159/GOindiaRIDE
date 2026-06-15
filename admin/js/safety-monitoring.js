// ===== Safety & Monitoring Features + Management Features =====

// This file contains all 8 Safety & Monitoring features plus 8 Management features
// Total: 16 additional features for the admin portal

// SAFETY & MONITORING FEATURES (Functions 1-8)

const SAFETY_LIVE_TRACKING_KEYS = [
    'goindiaride_driver_live_locations_v1',
    'goindiaride_customer_live_locations_v1',
    'goindiaride_admin_live_tracking_cache_v1',
    'goindiaride_driver_locations',
    'driver_live_locations'
];
const ADMIN_SERVICE_ALERTS_KEY = 'goindiaride_admin_service_alerts_v1';
const ADMIN_PROMO_OFFERS_KEY = 'goindiaride_admin_promotional_offers_v1';
const ADMIN_SYSTEM_CONFIG_KEY = 'goindiaride_admin_system_config_v1';

function createHealthMonitorContent() {
    return `<div class="section-header"><h2>Driver Health Monitor</h2><p>Track driver working hours, fatigue alerts, and health check reminders</p></div><div class="stats-grid"><div class="stat-card"><div class="stat-icon" style="background: #ff6b6b;"><i class="fas fa-exclamation-triangle"></i></div><div class="stat-content"><div class="stat-label">Fatigue Alerts</div><div class="stat-value">5</div></div></div></div><div class="card mt-20"><h3>Driver Working Hours</h3><table class="data-table"><thead><tr><th>Driver</th><th>Hours</th><th>Status</th></tr></thead><tbody><tr><td>Ravi Kumar</td><td>9.5 hrs</td><td><span class="status-badge status-blocked">Fatigue Alert</span></td></tr></tbody></table></div>`;
}

function createLiveTrackingContent() {
    const rows = getSafetyLiveTrackingRows();
    const stats = getSafetyLiveTrackingStats(rows);
    window.setTimeout(function () {
        if (typeof refreshLiveTrackingSection === 'function') refreshLiveTrackingSection();
    }, 200);
    return `
        <div class="section-header">
            <h2>Live Map Tracking</h2>
            <p>Real-time GPS stream from driver and customer portals</p>
        </div>
        <div class="stats-grid">
            <div class="stat-card">
                <div class="stat-icon" style="background:#00b894;"><i class="fas fa-location-crosshairs"></i></div>
                <div class="stat-content"><div class="stat-label">Active GPS</div><div class="stat-value" id="liveTrackingActiveCount">${stats.active}</div></div>
            </div>
            <div class="stat-card">
                <div class="stat-icon" style="background:#0984e3;"><i class="fas fa-satellite-dish"></i></div>
                <div class="stat-content"><div class="stat-label">Backend Rows</div><div class="stat-value" id="liveTrackingBackendCount">${stats.backend}</div></div>
            </div>
            <div class="stat-card">
                <div class="stat-icon" style="background:#feca57;"><i class="fas fa-clock"></i></div>
                <div class="stat-content"><div class="stat-label">Stale</div><div class="stat-value" id="liveTrackingStaleCount">${stats.stale}</div></div>
            </div>
        </div>
        <div class="card mt-20">
            <div class="flex-between mb-20">
                <h3>Live GPS Locations</h3>
                <button class="btn btn-secondary" type="button" onclick="refreshLiveTrackingSection()"><i class="fas fa-sync"></i> Refresh</button>
            </div>
            <div id="liveTrackingStatus" style="margin-bottom:12px;color:#475569;font-size:13px;">Showing local GPS cache while backend sync runs.</div>
            <table class="data-table">
                <thead>
                    <tr>
                        <th>Portal</th>
                        <th>Subject</th>
                        <th>Booking</th>
                        <th>Coordinates</th>
                        <th>Accuracy</th>
                        <th>Status</th>
                        <th>Updated</th>
                    </tr>
                </thead>
                <tbody id="liveTrackingRowsBody">${renderSafetyLiveTrackingRows(rows)}</tbody>
            </table>
        </div>
    `;
}

function createSOSAlertsContent() {
    return `<div class="section-header"><h2>SOS Alerts Dashboard</h2><p>Emergency alerts management</p></div><div class="stats-grid"><div class="stat-card"><div class="stat-icon" style="background: #ff6b6b;"><i class="fas fa-exclamation-circle"></i></div><div class="stat-content"><div class="stat-label">Active SOS</div><div class="stat-value">2</div></div></div></div><div class="card mt-20"><h3>Active Alerts</h3><p>No active SOS alerts at the moment</p></div>`;
}

const ADMIN_DOCUMENT_QUEUE_KEY = 'goindiaride_admin_document_queue_v1';
const REQUIRED_DRIVER_DOC_TYPES = [
    'DRIVING_LICENSE',
    'AADHAAR',
    'PAN',
    'POLICE_VERIFICATION',
    'RC',
    'INSURANCE',
    'PUC',
    'FITNESS',
    'VEHICLE_PERMIT',
    'ROAD_TAX',
    'VEHICLE_PHOTOS'
];

function getAdminDocumentQueue() {
    try {
        const rows = JSON.parse(localStorage.getItem(ADMIN_DOCUMENT_QUEUE_KEY) || '[]');
        return Array.isArray(rows) ? rows : [];
    } catch (error) {
        return [];
    }
}

function saveAdminDocumentQueue(queue) {
    localStorage.setItem(ADMIN_DOCUMENT_QUEUE_KEY, JSON.stringify(queue));
}

function notifyAllPortals(payload) {
    if (!window.PortalConnector) return;

    if (typeof PortalConnector.broadcastToAll === 'function') {
        PortalConnector.broadcastToAll(payload);
        return;
    }

    PortalConnector.createNotification({
        ...(payload || {}),
        targetPortals: ['customer', 'driver', 'admin']
    });
}

function readAdminRows(key) {
    try {
        const parsed = JSON.parse(localStorage.getItem(key) || '[]');
        return Array.isArray(parsed) ? parsed : [];
    } catch (_error) {
        return [];
    }
}

function writeAdminRows(key, rows) {
    localStorage.setItem(key, JSON.stringify(Array.isArray(rows) ? rows : []));
}

function readAdminObject(key, fallback) {
    try {
        const parsed = JSON.parse(localStorage.getItem(key) || '');
        return parsed && typeof parsed === 'object' ? parsed : fallback;
    } catch (_error) {
        return fallback;
    }
}

function writeAdminObject(key, value) {
    localStorage.setItem(key, JSON.stringify(value && typeof value === 'object' ? value : {}));
}

function getCurrentAdminName() {
    try {
        const currentAdmin = JSON.parse(localStorage.getItem('currentAdmin') || '{}');
        return currentAdmin.name || currentAdmin.email || 'Admin User';
    } catch (_error) {
        return 'Admin User';
    }
}

function normalizeAlertTargets(recipient) {
    const value = String(recipient || 'all').toLowerCase();
    if (value === 'drivers') return ['driver'];
    if (value === 'customers') return ['customer'];
    return ['customer', 'driver', 'admin'];
}

function getServiceAlerts() {
    return readAdminRows(ADMIN_SERVICE_ALERTS_KEY)
        .sort((left, right) => new Date(right.createdAt || 0).getTime() - new Date(left.createdAt || 0).getTime());
}

function saveServiceAlertFromForm() {
    const recipient = String(document.getElementById('serviceAlertRecipient')?.value || 'all').trim();
    const priority = String(document.getElementById('serviceAlertPriority')?.value || 'normal').trim();
    const message = String(document.getElementById('serviceAlertMessage')?.value || '').trim();

    if (!message) {
        if (typeof showToast === 'function') showToast('Alert message is required', 'error');
        return;
    }

    const alert = {
        id: 'alert_' + Date.now(),
        recipient,
        priority,
        message,
        createdAt: new Date().toISOString(),
        createdBy: getCurrentAdminName(),
        status: 'sent'
    };
    const rows = getServiceAlerts();
    rows.unshift(alert);
    writeAdminRows(ADMIN_SERVICE_ALERTS_KEY, rows.slice(0, 200));

    notifyAllPortals({
        type: 'service_alert',
        title: 'Service Alert',
        message,
        priority,
        sourcePortal: 'admin',
        targetPortals: normalizeAlertTargets(recipient),
        metadata: { alertId: alert.id, recipient }
    });

    if (typeof logAdminAction === 'function') {
        logAdminAction('SERVICE_ALERT_SENT', `${recipient} - ${message}`);
    }
    if (typeof showToast === 'function') showToast('Service alert sent and saved', 'success');
    refreshServiceAlertsSection();
}

function renderServiceAlertRows(rows) {
    if (!rows.length) return '<tr><td colspan="5">No service alerts sent yet.</td></tr>';
    return rows.slice(0, 30).map((alert) => `
        <tr>
            <td>${escapeSafetyHtml(new Date(alert.createdAt || Date.now()).toLocaleString())}</td>
            <td>${escapeSafetyHtml(alert.recipient || 'all')}</td>
            <td><span class="status-badge status-active">${escapeSafetyHtml(alert.priority || 'normal')}</span></td>
            <td>${escapeSafetyHtml(alert.message || '')}</td>
            <td>${escapeSafetyHtml(alert.status || 'sent')}</td>
        </tr>
    `).join('');
}

function refreshServiceAlertsSection() {
    const section = document.getElementById('section-service-alerts');
    if (!section || !section.classList.contains('active')) return;
    section.innerHTML = createServiceAlertsContent();
    initializeServiceAlertsSection();
}

function initializeServiceAlertsSection() {
    document.getElementById('sendServiceAlertBtn')?.addEventListener('click', saveServiceAlertFromForm);
}

function getPromoOffers() {
    return readAdminRows(ADMIN_PROMO_OFFERS_KEY)
        .sort((left, right) => new Date(right.updatedAt || right.createdAt || 0).getTime() - new Date(left.updatedAt || left.createdAt || 0).getTime());
}

function isPromoActive(offer) {
    const status = String(offer.status || 'active').toLowerCase();
    const expiry = offer.expiresAt ? new Date(offer.expiresAt).getTime() : 0;
    return status === 'active' && (!expiry || expiry >= Date.now());
}

function savePromoOfferFromForm() {
    const code = String(document.getElementById('promoOfferCode')?.value || '').trim().toUpperCase();
    const discount = String(document.getElementById('promoOfferDiscount')?.value || '').trim();
    const audience = String(document.getElementById('promoOfferAudience')?.value || 'customers').trim();
    const expiresAt = String(document.getElementById('promoOfferExpiry')?.value || '').trim();

    if (!code || !discount) {
        if (typeof showToast === 'function') showToast('Offer code and discount are required', 'error');
        return;
    }

    const rows = getPromoOffers();
    const existingIndex = rows.findIndex((offer) => String(offer.code || '').toUpperCase() === code);
    const offer = {
        ...(existingIndex >= 0 ? rows[existingIndex] : {}),
        id: existingIndex >= 0 ? rows[existingIndex].id : 'offer_' + Date.now(),
        code,
        discount,
        audience,
        expiresAt,
        status: 'active',
        updatedAt: new Date().toISOString(),
        createdAt: existingIndex >= 0 ? rows[existingIndex].createdAt : new Date().toISOString(),
        updatedBy: getCurrentAdminName()
    };
    if (existingIndex >= 0) rows[existingIndex] = offer;
    else rows.unshift(offer);
    writeAdminRows(ADMIN_PROMO_OFFERS_KEY, rows.slice(0, 200));

    notifyAllPortals({
        type: 'promo_offer_updated',
        title: 'Promotional Offer Updated',
        message: `${code} offer is active`,
        sourcePortal: 'admin',
        targetPortals: audience === 'drivers' ? ['driver'] : ['customer'],
        metadata: { offerId: offer.id, code, discount, audience, expiresAt }
    });

    if (typeof logAdminAction === 'function') {
        logAdminAction('PROMO_OFFER_SAVED', `${code} - ${discount}`);
    }
    if (typeof showToast === 'function') showToast('Promotional offer saved and connected', 'success');
    refreshPromoOffersSection();
}

function pausePromoOffer(offerId) {
    const rows = getPromoOffers();
    const idx = rows.findIndex((offer) => String(offer.id) === String(offerId));
    if (idx === -1) return;
    rows[idx] = { ...rows[idx], status: 'paused', updatedAt: new Date().toISOString(), updatedBy: getCurrentAdminName() };
    writeAdminRows(ADMIN_PROMO_OFFERS_KEY, rows);
    if (typeof logAdminAction === 'function') logAdminAction('PROMO_OFFER_PAUSED', rows[idx].code || offerId);
    refreshPromoOffersSection();
}

function renderPromoOfferRows(rows) {
    if (!rows.length) return '<tr><td colspan="6">No live promotional offers created yet.</td></tr>';
    return rows.slice(0, 40).map((offer) => `
        <tr>
            <td>${escapeSafetyHtml(offer.code || '-')}</td>
            <td>${escapeSafetyHtml(offer.discount || '-')}</td>
            <td>${escapeSafetyHtml(offer.audience || 'customers')}</td>
            <td>${escapeSafetyHtml(offer.expiresAt || 'No expiry')}</td>
            <td><span class="status-badge ${isPromoActive(offer) ? 'status-active' : 'status-pending'}">${escapeSafetyHtml(offer.status || 'active')}</span></td>
            <td><button class="btn btn-secondary" type="button" onclick="pausePromoOffer('${escapeSafetyHtml(offer.id)}')">Pause</button></td>
        </tr>
    `).join('');
}

function refreshPromoOffersSection() {
    const section = document.getElementById('section-promo-offers');
    if (!section || !section.classList.contains('active')) return;
    section.innerHTML = createPromoOffersContent();
    initializePromoOffersSection();
}

function initializePromoOffersSection() {
    document.getElementById('savePromoOfferBtn')?.addEventListener('click', savePromoOfferFromForm);
}

function getSystemConfig() {
    return readAdminObject(ADMIN_SYSTEM_CONFIG_KEY, {
        bookingIntake: true,
        surgePricing: false,
        customerPortalControl: true,
        bookingAlarm: false,
        updatedAt: ''
    });
}

function saveSystemConfigFromForm() {
    const config = {
        bookingIntake: Boolean(document.getElementById('configBookingIntake')?.checked),
        surgePricing: Boolean(document.getElementById('configSurgePricing')?.checked),
        customerPortalControl: Boolean(document.getElementById('configCustomerPortalControl')?.checked),
        bookingAlarm: Boolean(document.getElementById('configBookingAlarm')?.checked),
        updatedAt: new Date().toISOString(),
        updatedBy: getCurrentAdminName()
    };
    writeAdminObject(ADMIN_SYSTEM_CONFIG_KEY, config);

    try {
        localStorage.setItem('goindiaride_admin_booking_alarm_enabled', config.bookingAlarm ? '1' : '0');
    } catch (_error) {}

    notifyAllPortals({
        type: 'admin_system_config_updated',
        title: 'Admin Configuration Updated',
        message: 'System configuration was updated by admin',
        sourcePortal: 'admin',
        targetPortals: ['customer', 'driver', 'admin'],
        metadata: config
    });

    if (typeof logAdminAction === 'function') {
        logAdminAction('SYSTEM_CONFIG_SAVED', JSON.stringify({
            bookingIntake: config.bookingIntake,
            surgePricing: config.surgePricing,
            customerPortalControl: config.customerPortalControl,
            bookingAlarm: config.bookingAlarm
        }));
    }
    if (typeof showToast === 'function') showToast('System configuration saved', 'success');
    refreshSystemConfigSection();
}

function refreshSystemConfigSection() {
    const section = document.getElementById('section-system-config');
    if (!section || !section.classList.contains('active')) return;
    section.innerHTML = createSystemConfigContent();
    initializeSystemConfigSection();
}

function initializeSystemConfigSection() {
    document.getElementById('saveSystemConfigBtn')?.addEventListener('click', saveSystemConfigFromForm);
}
function getDriverKycStorageKey(driverId) {
    return 'kyc_data_' + String(driverId || 'default');
}

function loadDriverKyc(driverId) {
    try {
        const payload = JSON.parse(localStorage.getItem(getDriverKycStorageKey(driverId)) || '{}');
        return payload && typeof payload === 'object' ? payload : {};
    } catch (error) {
        return {};
    }
}

function saveDriverKyc(driverId, kycData) {
    localStorage.setItem(getDriverKycStorageKey(driverId), JSON.stringify(kycData));

    const currentDriver = JSON.parse(localStorage.getItem('currentDriver') || '{}');
    if (String(currentDriver.id || '') === String(driverId)) {
        localStorage.setItem('kyc_data', JSON.stringify(kycData));
    }
}

function recomputeDriverKycStatus(kycData) {
    const documents = kycData.documents || {};
    const verifiedRequired = REQUIRED_DRIVER_DOC_TYPES.filter((docType) => documents[docType] && documents[docType].status === 'verified');

    kycData.requiredVerifiedCount = verifiedRequired.length;
    kycData.requiredTotalCount = REQUIRED_DRIVER_DOC_TYPES.length;
    kycData.verified = verifiedRequired.length === REQUIRED_DRIVER_DOC_TYPES.length;
    kycData.trustScore = kycData.verified ? 98 : Math.min(95, 45 + verifiedRequired.length * 4);

    return kycData;
}

function syncDriverKycFlags(driverId, kycData) {
    try {
        const drivers = JSON.parse(localStorage.getItem('drivers') || '[]');
        const idx = drivers.findIndex((item) => String(item.id) === String(driverId));

        if (idx !== -1) {
            drivers[idx] = {
                ...drivers[idx],
                kycVerified: Boolean(kycData.verified),
                trustScore: Number(kycData.trustScore || 0),
                documentsVerifiedCount: Number(kycData.requiredVerifiedCount || 0),
                documentsRequiredCount: Number(kycData.requiredTotalCount || REQUIRED_DRIVER_DOC_TYPES.length)
            };
            localStorage.setItem('drivers', JSON.stringify(drivers));
        }
    } catch (error) {
        // ignore sync failure
    }
}

function createDocumentVerificationContent() {
    const queue = getAdminDocumentQueue();
    const pending = queue.filter((item) => item.status === 'pending_admin');
    const approved = queue.filter((item) => item.status === 'approved').length;
    const rejected = queue.filter((item) => item.status === 'rejected').length;

    const rows = pending.map((item) => `
        <tr>
            <td>${item.driverName || 'Driver'}</td>
            <td>${item.docName || item.docType}</td>
            <td>${item.fileName || '-'}</td>
            <td>${Number(item.aiScore || 0)}</td>
            <td>${item.aiDecision || 'review'}</td>
            <td>
                <button class="btn btn-success" onclick="adminApproveDocument('${item.id}')">Approve</button>
                <button class="btn btn-danger" onclick="adminRejectDocument('${item.id}')">Reject</button>
            </td>
        </tr>
    `).join('');

    return `
        <div class="section-header">
            <h2>Document Verification System</h2>
            <p>AI pre-screened documents with admin final control</p>
        </div>

        <div class="stats-grid">
            <div class="stat-card">
                <div class="stat-icon" style="background: #feca57;"><i class="fas fa-clock"></i></div>
                <div class="stat-content">
                    <div class="stat-label">Pending Verification</div>
                    <div class="stat-value">${pending.length}</div>
                </div>
            </div>
            <div class="stat-card">
                <div class="stat-icon" style="background: #43e97b;"><i class="fas fa-check-circle"></i></div>
                <div class="stat-content">
                    <div class="stat-label">Approved</div>
                    <div class="stat-value">${approved}</div>
                </div>
            </div>
            <div class="stat-card">
                <div class="stat-icon" style="background: #ff6b6b;"><i class="fas fa-ban"></i></div>
                <div class="stat-content">
                    <div class="stat-label">Rejected</div>
                    <div class="stat-value">${rejected}</div>
                </div>
            </div>
        </div>

        <div class="card mt-20">
            <div class="flex-between mb-20">
                <h3>Pending Documents</h3>
                <button class="btn btn-secondary" onclick="refreshDocumentVerificationSection()"><i class="fas fa-sync"></i> Refresh</button>
            </div>
            <table class="data-table">
                <thead>
                    <tr>
                        <th>Driver</th>
                        <th>Document</th>
                        <th>File</th>
                        <th>AI Score</th>
                        <th>AI Status</th>
                        <th>Actions</th>
                    </tr>
                </thead>
                <tbody>
                    ${rows || '<tr><td colspan="6">No pending documents</td></tr>'}
                </tbody>
            </table>
        </div>
    `;
}

function adminApproveDocument(queueId) {
    const queue = getAdminDocumentQueue();
    const idx = queue.findIndex((item) => item.id === queueId);

    if (idx === -1) {
        showToast('Document queue entry not found', 'error');
        return;
    }

    const entry = queue[idx];
    queue[idx] = {
        ...entry,
        status: 'approved',
        reviewedAt: new Date().toISOString(),
        reviewedBy: 'admin'
    };

    const kycData = loadDriverKyc(entry.driverId);
    if (!kycData.documents) kycData.documents = {};
    if (!kycData.documents[entry.docType]) kycData.documents[entry.docType] = {};

    kycData.documents[entry.docType] = {
        ...kycData.documents[entry.docType],
        status: 'verified',
        rejectionReason: '',
        verifiedAt: Date.now(),
        adminDecisionAt: Date.now(),
        adminDecision: 'approved'
    };

    recomputeDriverKycStatus(kycData);
    saveDriverKyc(entry.driverId, kycData);
    syncDriverKycFlags(entry.driverId, kycData);

    saveAdminDocumentQueue(queue);
    showToast('Document approved', 'success');

    notifyAllPortals({
        type: 'driver_document_approved',
        title: 'Driver Document Approved',
        message: (entry.driverName || 'Driver') + ' document approved: ' + (entry.docName || entry.docType),
        sourcePortal: 'admin',
        metadata: {
            driverId: entry.driverId,
            docType: entry.docType,
            status: 'approved'
        }
    });

    if (typeof logAdminAction === 'function') {
        logAdminAction('DOC_APPROVED', (entry.driverName || 'Driver') + ' - ' + (entry.docName || entry.docType));
    }

    refreshDocumentVerificationSection();
    refreshDriverApprovalSection();
}

function adminRejectDocument(queueId) {
    const queue = getAdminDocumentQueue();
    const idx = queue.findIndex((item) => item.id === queueId);

    if (idx === -1) {
        showToast('Document queue entry not found', 'error');
        return;
    }

    const reason = prompt('Rejection reason:', 'Document mismatch');
    if (!reason) return;

    const entry = queue[idx];
    queue[idx] = {
        ...entry,
        status: 'rejected',
        reviewedAt: new Date().toISOString(),
        reviewedBy: 'admin',
        rejectionReason: reason
    };

    const kycData = loadDriverKyc(entry.driverId);
    if (!kycData.documents) kycData.documents = {};
    if (!kycData.documents[entry.docType]) kycData.documents[entry.docType] = {};

    kycData.documents[entry.docType] = {
        ...kycData.documents[entry.docType],
        status: 'rejected',
        rejectionReason: reason,
        adminDecisionAt: Date.now(),
        adminDecision: 'rejected'
    };

    recomputeDriverKycStatus(kycData);
    saveDriverKyc(entry.driverId, kycData);
    syncDriverKycFlags(entry.driverId, kycData);

    saveAdminDocumentQueue(queue);
    showToast('Document rejected', 'warning');

    notifyAllPortals({
        type: 'driver_document_rejected',
        title: 'Driver Document Rejected',
        message: (entry.driverName || 'Driver') + ' document rejected: ' + (entry.docName || entry.docType),
        sourcePortal: 'admin',
        metadata: {
            driverId: entry.driverId,
            docType: entry.docType,
            status: 'rejected',
            reason: reason
        }
    });

    if (typeof logAdminAction === 'function') {
        logAdminAction('DOC_REJECTED', (entry.driverName || 'Driver') + ' - ' + (entry.docName || entry.docType) + ' - ' + reason);
    }

    refreshDocumentVerificationSection();
    refreshDriverApprovalSection();
}

function refreshDocumentVerificationSection() {
    const section = document.getElementById('section-document-verification');
    if (!section || !section.classList.contains('active')) return;

    section.innerHTML = createDocumentVerificationContent();
}

function createDemandHeatmapContent() {
    return `<div class="section-header"><h2>Demand Heat Map</h2><p>Visual demand representation</p></div><div class="card"><h3>Heat Map</h3><div style="height: 400px; background: linear-gradient(135deg, #080c12, #2a2117); border-radius: 12px; display: flex; align-items: center; justify-content: center; color: white;"><i class="fas fa-fire fa-3x"></i></div></div>`;
}

function createVirtualEscortContent() {
    return `<div class="section-header"><h2>Virtual Escort Control</h2><p>Manage virtual escort feature</p></div><div class="card"><h3>Settings</h3><div class="form-group"><label class="flex"><label class="switch"><input type="checkbox" checked><span class="slider"></span></label><span>Enable Virtual Escort</span></label></div></div>`;
}

function createBackgroundCheckContent() {
    return `<div class="section-header"><h2>Background Check Status</h2><p>Driver verification tracking</p></div><div class="stats-grid"><div class="stat-card"><div class="stat-icon" style="background: #43e97b;"><i class="fas fa-check-circle"></i></div><div class="stat-content"><div class="stat-label">Verified</div><div class="stat-value">142</div></div></div></div>`;
}

function createIncidentReportsContent() {
    return `<div class="section-header"><h2>Incident Reports</h2><p>Log and track incidents</p></div><div class="stats-grid"><div class="stat-card"><div class="stat-icon" style="background: #ff6b6b;"><i class="fas fa-exclamation-circle"></i></div><div class="stat-content"><div class="stat-label">Open Incidents</div><div class="stat-value">3</div></div></div></div><div class="card mt-20"><button class="btn btn-primary"><i class="fas fa-plus"></i> Log New Incident</button></div>`;
}

// MANAGEMENT FEATURES (Functions 9-16)

function createLeaderboardContent() {
    return `<div class="section-header"><h2>Driver Leaderboard</h2><p>Top performing drivers</p></div><div class="card"><h3>Top Drivers</h3><table class="data-table"><thead><tr><th>Rank</th><th>Driver</th><th>Rides</th><th>Rating</th></tr></thead><tbody><tr><td>🥇 #1</td><td>Anil Kumar</td><td>520</td><td>⭐ 4.9</td></tr><tr><td>🥈 #2</td><td>Ravi Kumar</td><td>450</td><td>⭐ 4.8</td></tr></tbody></table></div>`;
}

function createVendorManagementContent() {
    return `<div class="section-header"><h2>Vendor Management</h2><p>Manage vehicle vendors</p></div><div class="stats-grid"><div class="stat-card"><div class="stat-icon" style="background: #080c12;"><i class="fas fa-handshake"></i></div><div class="stat-content"><div class="stat-label">Active Vendors</div><div class="stat-value">12</div></div></div></div><div class="card mt-20"><button class="btn btn-primary"><i class="fas fa-plus"></i> Add Vendor</button></div>`;
}

function createServiceAlertsContent() {
    const alerts = getServiceAlerts();
    const activeAlerts = alerts.filter((alert) => String(alert.status || 'sent').toLowerCase() === 'sent');
    return `
        <div class="section-header">
            <h2>Service Alerts System</h2>
            <p>Send live service notices to customer and driver portals</p>
        </div>
        <div class="stats-grid">
            <div class="stat-card">
                <div class="stat-icon" style="background:#080c12;"><i class="fas fa-bullhorn"></i></div>
                <div class="stat-content"><div class="stat-label">Sent Alerts</div><div class="stat-value">${activeAlerts.length}</div></div>
            </div>
            <div class="stat-card">
                <div class="stat-icon" style="background:#43e97b;"><i class="fas fa-link"></i></div>
                <div class="stat-content"><div class="stat-label">Portal Bridge</div><div class="stat-value">${window.PortalConnector ? 'Live' : 'Ready'}</div></div>
            </div>
        </div>
        <div class="card mt-20">
            <h3>Create Live Alert</h3>
            <div class="form-grid">
                <div class="form-group">
                    <label class="form-label" for="serviceAlertRecipient">Recipient</label>
                    <select class="form-select" id="serviceAlertRecipient">
                        <option value="all">Customers + Drivers</option>
                        <option value="customers">Customers only</option>
                        <option value="drivers">Drivers only</option>
                    </select>
                </div>
                <div class="form-group">
                    <label class="form-label" for="serviceAlertPriority">Priority</label>
                    <select class="form-select" id="serviceAlertPriority">
                        <option value="normal">Normal</option>
                        <option value="high">High</option>
                        <option value="critical">Critical</option>
                    </select>
                </div>
            </div>
            <div class="form-group">
                <label class="form-label" for="serviceAlertMessage">Message</label>
                <textarea class="form-textarea" id="serviceAlertMessage" rows="4" placeholder="Type the live service message"></textarea>
            </div>
            <button class="btn btn-primary" id="sendServiceAlertBtn" type="button"><i class="fas fa-paper-plane"></i> Send live alert</button>
        </div>
        <div class="card mt-20">
            <h3>Recent Live Alerts</h3>
            <div class="table-container">
                <table class="data-table">
                    <thead><tr><th>Time</th><th>Recipient</th><th>Priority</th><th>Message</th><th>Status</th></tr></thead>
                    <tbody>${renderServiceAlertRows(alerts)}</tbody>
                </table>
            </div>
        </div>
    `;
}

function createSupportDashboardContent() {
    const tickets = getCustomerSupportTickets();
    const openTickets = tickets.filter((ticket) => !['closed', 'resolved', 'done'].includes(String(ticket.status || '').toLowerCase()));
    const rows = tickets.slice(0, 8).map((ticket) => `
        <tr>
            <td>${escapeSafetyHtml(ticket.ticketCode || ticket.id || 'N/A')}</td>
            <td>${escapeSafetyHtml(ticket.customerName || ticket.name || ticket.userKey || 'Customer')}</td>
            <td>${escapeSafetyHtml(ticket.category || ticket.issue || ticket.subject || 'Support request')}</td>
            <td><span class="status-badge status-pending">${escapeSafetyHtml(ticket.status || 'open')}</span></td>
        </tr>
    `).join('');
    const emptyRow = `<tr><td colspan="4">No live customer support tickets found.</td></tr>`;
    return `<div class="section-header"><h2>Customer Support Dashboard</h2><p>Manage live customer support tickets</p></div><div class="stats-grid"><div class="stat-card"><div class="stat-icon" style="background: #feca57;"><i class="fas fa-ticket-alt"></i></div><div class="stat-content"><div class="stat-label">Open Tickets</div><div class="stat-value">${openTickets.length}</div></div></div></div><div class="card mt-20"><h3>Recent Tickets</h3><table class="data-table"><thead><tr><th>ID</th><th>Customer</th><th>Issue</th><th>Status</th></tr></thead><tbody>${rows || emptyRow}</tbody></table></div>`;
}

function escapeSafetyHtml(value) {
    return String(value ?? '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

function readSafetyJson(key, fallback) {
    try {
        const parsed = JSON.parse(localStorage.getItem(key) || '');
        return parsed === null || parsed === undefined ? fallback : parsed;
    } catch (_error) {
        return fallback;
    }
}

function getSafetyBackendAccessToken() {
    return String(
        localStorage.getItem('accessToken') ||
        localStorage.getItem('authToken') ||
        localStorage.getItem('token') ||
        ''
    ).trim();
}

function getSafetyBackendApiBase() {
    const fromWindow = String(window.GOINDIARIDE_API_BASE || window.__GOINDIARIDE_RUNTIME_API_ORIGIN__ || window.__GOINDIARIDE_API_ORIGIN__ || '').trim();
    const fromStorage = String(localStorage.getItem('goindiaride_admin_api_base') || localStorage.getItem('goindiaride_api_base') || '').trim();
    const host = String(window.location && window.location.hostname || '').toLowerCase();
    const sameOrigin = String(window.location && window.location.origin || '').replace(/\/$/, '');
    if (fromWindow) return fromWindow.replace(/\/$/, '');
    if (fromStorage) return fromStorage.replace(/\/$/, '');
    if (host === 'localhost' || host === '127.0.0.1') return 'http://localhost:5000';
    if (host === 'goindiaride.in' || host === 'www.goindiaride.in') return 'https://goindiaride.onrender.com';
    return sameOrigin || 'https://goindiaride.onrender.com';
}

function normalizeSafetyLiveRow(item, sourceKey) {
    if (!item || typeof item !== 'object') return null;
    const lat = Number(item.lat ?? item.latitude ?? item.coordinates?.lat);
    const lng = Number(item.lng ?? item.lon ?? item.longitude ?? item.coordinates?.lng);
    if (!Number.isFinite(lat) || !Number.isFinite(lng) || Math.abs(lat) > 90 || Math.abs(lng) > 180) return null;
    const subjectType = String(item.subjectType || item.portal || item.accountType || (sourceKey.includes('customer') ? 'customer' : 'driver')).toLowerCase();
    const subjectId = String(item.userId || item.driverId || item.customerId || item.id || '').trim();
    return {
        ...item,
        id: subjectId || `${subjectType}:${lat.toFixed(5)}:${lng.toFixed(5)}`,
        subjectType,
        subjectLabel: item.driverName || item.customerName || item.name || item.userId || item.driverId || item.customerId || subjectType,
        bookingId: item.bookingId || item.rideId || item.tripId || '',
        lat,
        lng,
        accuracy: Number.isFinite(Number(item.accuracy)) ? Math.round(Number(item.accuracy)) : null,
        status: item.status || (item.isOnline === false ? 'stopped' : 'tracking'),
        sourceKey,
        updatedAt: item.updatedAt || item.lastReportedAt || item.capturedAt || item.timestamp || ''
    };
}

function getSafetyLiveTrackingRows() {
    const rows = [];
    SAFETY_LIVE_TRACKING_KEYS.forEach((key) => {
        const parsed = readSafetyJson(key, []);
        const values = Array.isArray(parsed) ? parsed : Object.values(parsed && typeof parsed === 'object' ? parsed : {});
        values.forEach((item) => {
            const row = normalizeSafetyLiveRow(item, key);
            if (row) rows.push(row);
        });
    });

    const merged = {};
    rows.forEach((row) => {
        const key = `${row.subjectType}:${row.id}`;
        const existing = merged[key];
        if (!existing || new Date(row.updatedAt || 0).getTime() >= new Date(existing.updatedAt || 0).getTime()) {
            merged[key] = row;
        }
    });
    return Object.values(merged).sort((left, right) => new Date(right.updatedAt || 0).getTime() - new Date(left.updatedAt || 0).getTime());
}

function isSafetyLiveRowActive(row) {
    const ageMs = Date.now() - new Date(row.updatedAt || row.capturedAt || 0).getTime();
    return String(row.status || '').toLowerCase() === 'tracking' && ageMs >= 0 && ageMs <= 2 * 60 * 1000;
}

function getSafetyLiveTrackingStats(rows) {
    return {
        active: rows.filter(isSafetyLiveRowActive).length,
        backend: rows.filter((row) => String(row.sourceKey || '').includes('backend') || String(row.syncStatus || '').includes('backend')).length,
        stale: rows.filter((row) => !isSafetyLiveRowActive(row)).length
    };
}

function formatSafetyLiveAge(value) {
    const time = new Date(value || 0).getTime();
    if (!time) return 'Unknown';
    const seconds = Math.max(0, Math.round((Date.now() - time) / 1000));
    if (seconds < 60) return `${seconds}s ago`;
    const minutes = Math.round(seconds / 60);
    if (minutes < 60) return `${minutes}m ago`;
    return `${Math.round(minutes / 60)}h ago`;
}

function renderSafetyLiveTrackingRows(rows) {
    if (!rows.length) {
        return '<tr><td colspan="7">No live GPS rows yet. Ask a driver/customer to start tracking, then refresh.</td></tr>';
    }
    return rows.slice(0, 80).map((row) => {
        const active = isSafetyLiveRowActive(row);
        const mapsUrl = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${row.lat},${row.lng}`)}`;
        return `
            <tr>
                <td>${escapeSafetyHtml(row.subjectType)}</td>
                <td>${escapeSafetyHtml(row.subjectLabel || row.id)}<br><small>${escapeSafetyHtml(row.sourceKey || '')}</small></td>
                <td>${escapeSafetyHtml(row.bookingId || '-')}</td>
                <td><a href="${mapsUrl}" target="_blank" rel="noopener noreferrer">${escapeSafetyHtml(row.lat.toFixed(5))}, ${escapeSafetyHtml(row.lng.toFixed(5))}</a></td>
                <td>${row.accuracy === null ? '-' : `${escapeSafetyHtml(row.accuracy)}m`}</td>
                <td><span class="status-badge ${active ? 'status-approved' : 'status-pending'}">${escapeSafetyHtml(row.status || 'tracking')}</span></td>
                <td>${escapeSafetyHtml(formatSafetyLiveAge(row.updatedAt || row.capturedAt))}</td>
            </tr>
        `;
    }).join('');
}

function updateLiveTrackingSection(rows, note) {
    const body = document.getElementById('liveTrackingRowsBody');
    const status = document.getElementById('liveTrackingStatus');
    const activeCount = document.getElementById('liveTrackingActiveCount');
    const backendCount = document.getElementById('liveTrackingBackendCount');
    const staleCount = document.getElementById('liveTrackingStaleCount');
    const stats = getSafetyLiveTrackingStats(rows);
    if (body) body.innerHTML = renderSafetyLiveTrackingRows(rows);
    if (status) status.textContent = note || `Showing ${rows.length} live GPS row(s).`;
    if (activeCount) activeCount.textContent = String(stats.active);
    if (backendCount) backendCount.textContent = String(stats.backend);
    if (staleCount) staleCount.textContent = String(stats.stale);
}

async function refreshLiveTrackingSection() {
    const token = getSafetyBackendAccessToken();
    let note = 'Showing local GPS cache. Backend auth token not found.';
    if (token) {
        try {
            const response = await fetch(`${getSafetyBackendApiBase()}/api/live-tracking/locations?limit=120`, {
                method: 'GET',
                headers: {
                    Accept: 'application/json',
                    Authorization: `Bearer ${token}`,
                    'X-GoindiaRide-Live-Tracking': 'admin-safety'
                },
                credentials: 'omit'
            });
            const data = await response.json().catch(() => ({}));
            if (response.ok && data && Array.isArray(data.items)) {
                localStorage.setItem('goindiaride_admin_live_tracking_cache_v1', JSON.stringify(data.items.map((item) => ({
                    ...item,
                    sourceKey: 'backend_live_tracking'
                }))));
                note = `Backend synced ${data.items.length} GPS row(s).`;
            } else {
                note = `Backend live tracking returned ${response.status}. Showing local cache.`;
            }
        } catch (_error) {
            note = 'Backend live tracking is unreachable. Showing local cache.';
        }
    }
    updateLiveTrackingSection(getSafetyLiveTrackingRows(), note);
}

function getCustomerSupportTickets() {
    const directStores = [
        'goindiaride_customer_support_tickets_v1',
        'goindiaride_support_tickets_v1',
        'supportTickets'
    ];
    const directTickets = directStores.flatMap((key) => {
        const parsed = readSafetyJson(key, []);
        if (Array.isArray(parsed)) return parsed;
        if (parsed && typeof parsed === 'object' && Array.isArray(parsed.items)) return parsed.items;
        if (parsed && typeof parsed === 'object' && Array.isArray(parsed.supportTickets)) return parsed.supportTickets;
        return [];
    });
    const businessStore = readSafetyJson('goindiaride.runtime.business-store.v1', {});
    const businessTickets = businessStore && Array.isArray(businessStore.supportTickets)
        ? businessStore.supportTickets
        : [];
    return [...directTickets, ...businessTickets]
        .filter((ticket) => ticket && typeof ticket === 'object')
        .sort((a, b) => new Date(b.updatedAt || b.createdAt || 0).getTime() - new Date(a.updatedAt || a.createdAt || 0).getTime());
}

function normalizeDriverApprovalStatus(driver) {
    const raw = String(driver && (driver.approvalStatus || driver.status) || '').toLowerCase();

    if (['approved', 'active', 'verified', 'available', 'on-trip', 'online'].includes(raw)) return 'approved';
    if (['rejected', 'blocked'].includes(raw)) return 'rejected';
    if (['suspended'].includes(raw)) return 'suspended';

    return 'pending';
}

function getDriverApplications() {
    let drivers = [];

    try {
        const rows = JSON.parse(localStorage.getItem('drivers') || '[]');
        if (Array.isArray(rows) && rows.length) {
            drivers = rows;
        }
    } catch (error) {
        drivers = [];
    }

    return drivers.map((driver) => {
        const kyc = loadDriverKyc(driver.id);
        const requiredTotal = Number(kyc.requiredTotalCount || REQUIRED_DRIVER_DOC_TYPES.length);
        const verifiedCount = Number(kyc.requiredVerifiedCount || 0);

        return {
            ...driver,
            approvalStatus: normalizeDriverApprovalStatus(driver),
            docsVerified: verifiedCount,
            docsRequired: requiredTotal,
            trustScore: Number(driver.trustScore || kyc.trustScore || 0),
            kycVerified: Boolean(driver.kycVerified || kyc.verified)
        };
    });
}

function saveDriverApplications(drivers) {
    localStorage.setItem('drivers', JSON.stringify(drivers));
}

function updateDriverApprovalStatus(driverId, nextStatus, reason) {
    const drivers = getDriverApplications();
    const idx = drivers.findIndex((item) => String(item.id) === String(driverId));

    if (idx === -1) {
        showToast('Driver not found', 'error');
        return;
    }

    const nowIso = new Date().toISOString();

    drivers[idx] = {
        ...drivers[idx],
        approvalStatus: nextStatus,
        status: nextStatus === 'approved' ? 'available' : (nextStatus === 'suspended' ? 'offline' : 'blocked'),
        approvalUpdatedAt: nowIso,
        approvalReason: reason || ''
    };

    saveDriverApplications(drivers);

    notifyAllPortals({
        type: 'driver_approval_update',
        title: 'Driver Approval Updated',
        message: 'Driver ' + (drivers[idx].name || 'Driver') + ' status changed to ' + nextStatus,
        sourcePortal: 'admin',
        metadata: {
            driverId: drivers[idx].id,
            status: nextStatus,
            reason: reason || ''
        }
    });

    if (typeof logAdminAction === 'function') {
        logAdminAction('DRIVER_APPROVAL_' + nextStatus.toUpperCase(), (drivers[idx].name || 'Driver') + (reason ? ' - ' + reason : ''));
    }

    refreshDriverApprovalSection();
}

function approveDriverApplication(driverId) {
    updateDriverApprovalStatus(driverId, 'approved', 'Approved by admin');
    showToast('Driver approved successfully', 'success');
}

function rejectDriverApplication(driverId) {
    const reason = prompt('Reason for rejection:', 'Document mismatch or verification failed');
    if (!reason) return;

    updateDriverApprovalStatus(driverId, 'rejected', reason);
    showToast('Driver rejected', 'warning');
}

function suspendDriverAccount(driverId) {
    const reason = prompt('Reason for suspension:', 'Policy violation');
    if (!reason) return;

    updateDriverApprovalStatus(driverId, 'suspended', reason);
    showToast('Driver suspended', 'warning');
}

function createDriverApprovalContent() {
    const drivers = getDriverApplications();
    const pending = drivers.filter((driver) => driver.approvalStatus === 'pending');
    const approved = drivers.filter((driver) => driver.approvalStatus === 'approved');
    const rejected = drivers.filter((driver) => driver.approvalStatus === 'rejected');
    const suspended = drivers.filter((driver) => driver.approvalStatus === 'suspended');

    const rows = drivers.map((driver) => {
        const status = driver.approvalStatus;
        const statusClass = status === 'approved' ? 'status-active' : status === 'pending' ? 'status-pending' : 'status-blocked';
        const kycText = `${driver.docsVerified}/${driver.docsRequired}`;

        return `
            <tr>
                <td>${driver.name || 'Driver'}</td>
                <td>${driver.phone || '-'}</td>
                <td>${kycText}</td>
                <td>${driver.trustScore || 0}</td>
                <td><span class="status-badge ${statusClass}">${status}</span></td>
                <td>
                    <button class="btn btn-success" onclick="approveDriverApplication('${driver.id}')">Approve</button>
                    <button class="btn btn-danger" onclick="rejectDriverApplication('${driver.id}')">Reject</button>
                    <button class="btn btn-secondary" onclick="suspendDriverAccount('${driver.id}')">Suspend</button>
                </td>
            </tr>
        `;
    }).join('');

    return `
        <div class="section-header">
            <h2>Driver Approval Workflow</h2>
            <p>KYC + document verification, approval, rejection and suspension controls</p>
        </div>

        <div class="stats-grid">
            <div class="stat-card">
                <div class="stat-icon" style="background: #feca57;"><i class="fas fa-user-clock"></i></div>
                <div class="stat-content"><div class="stat-label">Pending</div><div class="stat-value">${pending.length}</div></div>
            </div>
            <div class="stat-card">
                <div class="stat-icon" style="background: #43e97b;"><i class="fas fa-user-check"></i></div>
                <div class="stat-content"><div class="stat-label">Approved</div><div class="stat-value">${approved.length}</div></div>
            </div>
            <div class="stat-card">
                <div class="stat-icon" style="background: #ff6b6b;"><i class="fas fa-user-times"></i></div>
                <div class="stat-content"><div class="stat-label">Rejected</div><div class="stat-value">${rejected.length}</div></div>
            </div>
            <div class="stat-card">
                <div class="stat-icon" style="background: #6366f1;"><i class="fas fa-user-slash"></i></div>
                <div class="stat-content"><div class="stat-label">Suspended</div><div class="stat-value">${suspended.length}</div></div>
            </div>
        </div>

        <div class="card mt-20">
            <div class="flex-between mb-20">
                <h3>Driver Applications</h3>
                <button class="btn btn-secondary" onclick="refreshDriverApprovalSection()"><i class="fas fa-sync"></i> Refresh</button>
            </div>
            <table class="data-table">
                <thead>
                    <tr>
                        <th>Name</th>
                        <th>Phone</th>
                        <th>KYC Docs</th>
                        <th>Trust</th>
                        <th>Status</th>
                        <th>Actions</th>
                    </tr>
                </thead>
                <tbody>
                    ${rows || '<tr><td colspan="6">No driver applications found</td></tr>'}
                </tbody>
            </table>
        </div>
    `;
}

function refreshDriverApprovalSection() {
    const section = document.getElementById('section-driver-approval');
    if (!section || !section.classList.contains('active')) return;

    section.innerHTML = createDriverApprovalContent();
}

function createPromoOffersContent() {
    const offers = getPromoOffers();
    const activeCount = offers.filter(isPromoActive).length;
    return `
        <div class="section-header">
            <h2>Promotional Offers</h2>
            <p>Create and control live offer records for connected portals</p>
        </div>
        <div class="stats-grid">
            <div class="stat-card">
                <div class="stat-icon" style="background:#080c12;"><i class="fas fa-tags"></i></div>
                <div class="stat-content"><div class="stat-label">Active Offers</div><div class="stat-value">${activeCount}</div></div>
            </div>
            <div class="stat-card">
                <div class="stat-icon" style="background:#4facfe;"><i class="fas fa-database"></i></div>
                <div class="stat-content"><div class="stat-label">Stored Offers</div><div class="stat-value">${offers.length}</div></div>
            </div>
        </div>
        <div class="card mt-20">
            <h3>Create / Update Offer</h3>
            <div class="form-grid">
                <div class="form-group">
                    <label class="form-label" for="promoOfferCode">Code</label>
                    <input id="promoOfferCode" class="form-input" type="text" placeholder="LIVE10">
                </div>
                <div class="form-group">
                    <label class="form-label" for="promoOfferDiscount">Discount</label>
                    <input id="promoOfferDiscount" class="form-input" type="text" placeholder="10% or INR 100">
                </div>
                <div class="form-group">
                    <label class="form-label" for="promoOfferAudience">Audience</label>
                    <select id="promoOfferAudience" class="form-select">
                        <option value="customers">Customers</option>
                        <option value="drivers">Drivers</option>
                    </select>
                </div>
                <div class="form-group">
                    <label class="form-label" for="promoOfferExpiry">Expiry</label>
                    <input id="promoOfferExpiry" class="form-input" type="date">
                </div>
            </div>
            <button class="btn btn-primary" id="savePromoOfferBtn" type="button"><i class="fas fa-link"></i> Save live offer</button>
        </div>
        <div class="card mt-20">
            <h3>Live Offer Records</h3>
            <div class="table-container">
                <table class="data-table">
                    <thead><tr><th>Code</th><th>Discount</th><th>Audience</th><th>Expiry</th><th>Status</th><th>Action</th></tr></thead>
                    <tbody>${renderPromoOfferRows(offers)}</tbody>
                </table>
            </div>
        </div>
    `;
}

function createSystemConfigContent() {
    const config = getSystemConfig();
    const updatedAt = config.updatedAt ? new Date(config.updatedAt).toLocaleString() : 'Not saved yet';
    return `
        <div class="section-header">
            <h2>System Configuration</h2>
            <p>Connected runtime settings for booking intake, pricing and portal control</p>
        </div>
        <div class="card">
            <div class="flex-between mb-20">
                <h3>Live Feature Toggles</h3>
                <span class="status-badge status-active">Updated: ${escapeSafetyHtml(updatedAt)}</span>
            </div>
            <div class="form-group">
                <label class="flex">
                    <label class="switch"><input id="configBookingIntake" type="checkbox" ${config.bookingIntake ? 'checked' : ''}><span class="slider"></span></label>
                    <span>Enable customer booking intake</span>
                </label>
            </div>
            <div class="form-group">
                <label class="flex">
                    <label class="switch"><input id="configSurgePricing" type="checkbox" ${config.surgePricing ? 'checked' : ''}><span class="slider"></span></label>
                    <span>Enable surge pricing control</span>
                </label>
            </div>
            <div class="form-group">
                <label class="flex">
                    <label class="switch"><input id="configCustomerPortalControl" type="checkbox" ${config.customerPortalControl ? 'checked' : ''}><span class="slider"></span></label>
                    <span>Keep customer portal features under admin control</span>
                </label>
            </div>
            <div class="form-group">
                <label class="flex">
                    <label class="switch"><input id="configBookingAlarm" type="checkbox" ${config.bookingAlarm ? 'checked' : ''}><span class="slider"></span></label>
                    <span>Enable booking alarm after admin interaction</span>
                </label>
            </div>
            <button class="btn btn-primary" id="saveSystemConfigBtn" type="button"><i class="fas fa-save"></i> Save live configuration</button>
        </div>
    `;
}

function createAuditLogsContent() {
    return `<div class="section-header"><h2>Audit Logs</h2><p>Track real admin actions and live portal updates</p></div><div class="card"><h3>Activity Logs</h3><div class="table-container"><table class="data-table"><thead><tr><th>Timestamp</th><th>Admin</th><th>Action</th><th>Details</th></tr></thead><tbody id="auditLogsList"><tr><td colspan="4">No admin audit logs yet.</td></tr></tbody></table></div></div>`;
}


const COMPLIANCE_DOCS_STORAGE_KEY = 'goindiaride_compliance_docs_v1';

function getComplianceDocuments() {
    try {
        const docs = JSON.parse(localStorage.getItem(COMPLIANCE_DOCS_STORAGE_KEY) || '[]');
        return Array.isArray(docs) ? docs : [];
    } catch (error) {
        return [];
    }
}

function saveComplianceDocuments(docs) {
    localStorage.setItem(COMPLIANCE_DOCS_STORAGE_KEY, JSON.stringify(docs));
}

function uploadComplianceDocument() {
    const categoryNode = document.getElementById('complianceDocCategory');
    const titleNode = document.getElementById('complianceDocTitle');
    const fileNode = document.getElementById('complianceDocFile');

    if (!categoryNode || !titleNode || !fileNode) return;

    const category = String(categoryNode.value || '').trim();
    const title = String(titleNode.value || '').trim();
    const file = fileNode.files && fileNode.files[0] ? fileNode.files[0] : null;

    if (!category || !title || !file) {
        showToast('Category, title, and file are required', 'error');
        return;
    }

    const docs = getComplianceDocuments();
    docs.unshift({
        id: 'cmp_' + Date.now(),
        category,
        title,
        fileName: file.name,
        fileSizeKb: Math.max(1, Math.round(file.size / 1024)),
        uploadedAt: new Date().toISOString(),
        uploadedBy: 'admin'
    });

    saveComplianceDocuments(docs);

    titleNode.value = '';
    fileNode.value = '';
    showToast('Compliance document metadata saved', 'success');

    if (typeof logAdminAction === 'function') {
        logAdminAction('COMPLIANCE_DOC_UPLOADED', category + ' - ' + title);
    }

    refreshComplianceCenterSection();
}

function removeComplianceDocument(docId) {
    const docs = getComplianceDocuments();
    const filtered = docs.filter((item) => item.id !== docId);

    if (filtered.length === docs.length) return;

    saveComplianceDocuments(filtered);
    showToast('Compliance document removed', 'warning');

    if (typeof logAdminAction === 'function') {
        logAdminAction('COMPLIANCE_DOC_REMOVED', docId);
    }

    refreshComplianceCenterSection();
}

function createComplianceCenterContent() {
    const docs = getComplianceDocuments();

    const rows = docs.map((doc) => `
        <tr>
            <td>${doc.category}</td>
            <td>${doc.title}</td>
            <td>${doc.fileName}</td>
            <td>${doc.fileSizeKb} KB</td>
            <td>${new Date(doc.uploadedAt).toLocaleString()}</td>
            <td>
                <button class="btn btn-danger" onclick="removeComplianceDocument('${doc.id}')">Remove</button>
            </td>
        </tr>
    `).join('');

    return `
        <div class="section-header">
            <h2>Compliance Center</h2>
            <p>ISO 27001 + SOC 2 + GDPR documentation control and audit evidence register</p>
        </div>

        <div class="stats-grid">
            <div class="stat-card">
                <div class="stat-icon" style="background: #4facfe;"><i class="fas fa-file-shield"></i></div>
                <div class="stat-content">
                    <div class="stat-label">Compliance Docs</div>
                    <div class="stat-value">${docs.length}</div>
                </div>
            </div>
            <div class="stat-card">
                <div class="stat-icon" style="background: #43e97b;"><i class="fas fa-certificate"></i></div>
                <div class="stat-content">
                    <div class="stat-label">Standards</div>
                    <div class="stat-value">ISO/SOC/GDPR</div>
                </div>
            </div>
            <div class="stat-card">
                <div class="stat-icon" style="background: #feca57;"><i class="fas fa-road"></i></div>
                <div class="stat-content">
                    <div class="stat-label">Roadmap</div>
                    <div class="stat-value">4 Phases</div>
                </div>
            </div>
        </div>

        <div class="card mt-20">
            <h3>Upload Compliance Document</h3>
            <div class="form-group">
                <label class="form-label">Category</label>
                <select id="complianceDocCategory" class="form-select">
                    <option value="ISO27001">ISO 27001</option>
                    <option value="SOC2">SOC 2</option>
                    <option value="GDPR">GDPR</option>
                    <option value="Investor">Investor Compliance</option>
                    <option value="Security">Security Evidence</option>
                </select>
            </div>
            <div class="form-group">
                <label class="form-label">Title</label>
                <input id="complianceDocTitle" class="form-input" type="text" placeholder="Policy or report title">
            </div>
            <div class="form-group">
                <label class="form-label">File</label>
                <input id="complianceDocFile" class="form-input" type="file" accept=".pdf,.doc,.docx,.txt,.md">
            </div>
            <button class="btn btn-primary" onclick="uploadComplianceDocument()"><i class="fas fa-upload"></i> Save Document</button>
        </div>

        <div class="card mt-20">
            <h3>Uploaded Compliance Documents</h3>
            <table class="data-table">
                <thead>
                    <tr>
                        <th>Category</th>
                        <th>Title</th>
                        <th>File</th>
                        <th>Size</th>
                        <th>Uploaded At</th>
                        <th>Actions</th>
                    </tr>
                </thead>
                <tbody>
                    ${rows || '<tr><td colspan="6">No compliance docs uploaded yet</td></tr>'}
                </tbody>
            </table>
        </div>

        <div class="card mt-20">
            <h3>Control Coverage Checklist</h3>
            <ul>
                <li>ISO 27001: ISMS scope, risk register, access control, incident response, backup, vendor security</li>
                <li>SOC 2: Security, availability, processing integrity, confidentiality, privacy</li>
                <li>GDPR: Privacy notice, DPA, DSR workflow, cookie policy, 72-hour breach SOP</li>
                <li>Investor section: ISO/SOC/GDPR roadmap with milestone dates</li>
            </ul>
        </div>
    `;
}

function refreshComplianceCenterSection() {
    const section = document.getElementById('section-compliance-center');
    if (!section || !section.classList.contains('active')) return;

    section.innerHTML = createComplianceCenterContent();
}
// Initialize Safety & Management Features
function initializeSafetyFeatures(sectionId) {
    if (sectionId === 'service-alerts') {
        setTimeout(initializeServiceAlertsSection, 50);
    }
    if (sectionId === 'promo-offers') {
        setTimeout(initializePromoOffersSection, 50);
    }
    if (sectionId === 'system-config') {
        setTimeout(initializeSystemConfigSection, 50);
    }
    if (sectionId === 'audit-logs') {
        setTimeout(loadAuditLogs, 100);
    }
    if (sectionId === 'compliance-center') {
        setTimeout(refreshComplianceCenterSection, 100);
    }
    if (sectionId === 'driver-approval') {
        setTimeout(refreshDriverApprovalSection, 100);
    }
}

function loadAuditLogs() {
    const logs = JSON.parse(localStorage.getItem('adminAuditLogs') || '[]');
    const tbody = document.getElementById('auditLogsList');
    if (!tbody) return;
    if (!logs.length) {
        tbody.innerHTML = '<tr><td colspan="4">No admin audit logs yet.</td></tr>';
        return;
    }
    tbody.innerHTML = logs.slice(0, 50).map(log => `
        <tr>
            <td>${escapeSafetyHtml(new Date(log.timestamp || Date.now()).toLocaleString())}</td>
            <td>${escapeSafetyHtml(log.admin || 'Admin User')}</td>
            <td><span class="status-badge status-active">${escapeSafetyHtml(log.action || 'ACTION')}</span></td>
            <td>${escapeSafetyHtml(log.details || '')}</td>
        </tr>
    `).join('');
}
