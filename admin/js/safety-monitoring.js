// ===== Safety & Monitoring Features + Management Features =====

// This file contains all 8 Safety & Monitoring features plus 8 Management features
// Total: 16 additional features for the admin portal

// SAFETY & MONITORING FEATURES (Functions 1-8)

function createHealthMonitorContent() {
    return `<div class="section-header"><h2>Driver Health Monitor</h2><p>Track driver working hours, fatigue alerts, and health check reminders</p></div><div class="stats-grid"><div class="stat-card"><div class="stat-icon" style="background: #ff6b6b;"><i class="fas fa-exclamation-triangle"></i></div><div class="stat-content"><div class="stat-label">Fatigue Alerts</div><div class="stat-value">5</div></div></div></div><div class="card mt-20"><h3>Driver Working Hours</h3><table class="data-table"><thead><tr><th>Driver</th><th>Hours</th><th>Status</th></tr></thead><tbody><tr><td>Ravi Kumar</td><td>9.5 hrs</td><td><span class="status-badge status-blocked">Fatigue Alert</span></td></tr></tbody></table></div>`;
}

function createLiveTrackingContent() {
    return `<div class="section-header"><h2>Live Map Tracking</h2><p>Real-time location of all active drivers</p></div><div class="card"><h3>Live Map</h3><div style="height: 400px; background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); border-radius: 12px; display: flex; align-items: center; justify-content: center; color: white;"><div class="text-center"><i class="fas fa-map fa-3x mb-20"></i><p>Live Tracking Integration</p></div></div></div>`;
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

    if (typeof logAdminAction === 'function') {
        logAdminAction('DOC_APPROVED', (entry.driverName || 'Driver') + ' - ' + (entry.docName || entry.docType));
    }

    refreshDocumentVerificationSection();
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

    if (typeof logAdminAction === 'function') {
        logAdminAction('DOC_REJECTED', (entry.driverName || 'Driver') + ' - ' + (entry.docName || entry.docType) + ' - ' + reason);
    }

    refreshDocumentVerificationSection();
}

function refreshDocumentVerificationSection() {
    const section = document.getElementById('section-document-verification');
    if (!section || !section.classList.contains('active')) return;

    section.innerHTML = createDocumentVerificationContent();
}

function createDemandHeatmapContent() {
    return `<div class="section-header"><h2>Demand Heat Map</h2><p>Visual demand representation</p></div><div class="card"><h3>Heat Map</h3><div style="height: 400px; background: linear-gradient(135deg, #667eea, #764ba2); border-radius: 12px; display: flex; align-items: center; justify-content: center; color: white;"><i class="fas fa-fire fa-3x"></i></div></div>`;
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
    return `<div class="section-header"><h2>Vendor Management</h2><p>Manage vehicle vendors</p></div><div class="stats-grid"><div class="stat-card"><div class="stat-icon" style="background: #667eea;"><i class="fas fa-handshake"></i></div><div class="stat-content"><div class="stat-label">Active Vendors</div><div class="stat-value">12</div></div></div></div><div class="card mt-20"><button class="btn btn-primary"><i class="fas fa-plus"></i> Add Vendor</button></div>`;
}

function createServiceAlertsContent() {
    return `<div class="section-header"><h2>Service Alerts System</h2><p>Send notifications to users</p></div><div class="card"><h3>Send Alert</h3><div class="form-group"><label class="form-label">Recipient</label><select class="form-select"><option>All Drivers</option><option>All Customers</option></select></div><div class="form-group"><label class="form-label">Message</label><textarea class="form-textarea" placeholder="Enter message..."></textarea></div><button class="btn btn-primary"><i class="fas fa-paper-plane"></i> Send</button></div>`;
}

function createSupportDashboardContent() {
    return `<div class="section-header"><h2>Customer Support Dashboard</h2><p>Manage support tickets</p></div><div class="stats-grid"><div class="stat-card"><div class="stat-icon" style="background: #feca57;"><i class="fas fa-ticket-alt"></i></div><div class="stat-content"><div class="stat-label">Open Tickets</div><div class="stat-value">23</div></div></div></div><div class="card mt-20"><h3>Recent Tickets</h3><table class="data-table"><thead><tr><th>ID</th><th>Customer</th><th>Issue</th><th>Status</th></tr></thead><tbody><tr><td>#TKT001</td><td>Rajesh Kumar</td><td>Payment Issue</td><td><span class="status-badge status-pending">Open</span></td></tr></tbody></table></div>`;
}

function createDriverApprovalContent() {
    return `<div class="section-header"><h2>Driver Approval Workflow</h2><p>Review new driver applications</p></div><div class="stats-grid"><div class="stat-card"><div class="stat-icon" style="background: #feca57;"><i class="fas fa-user-clock"></i></div><div class="stat-content"><div class="stat-label">Pending</div><div class="stat-value">12</div></div></div></div><div class="card mt-20"><h3>Applications</h3><table class="data-table"><thead><tr><th>Name</th><th>Phone</th><th>Actions</th></tr></thead><tbody><tr><td>Vikram Singh</td><td>+91 98765-12345</td><td><button class="btn btn-success">Approve</button></td></tr></tbody></table></div>`;
}

function createPromoOffersContent() {
    return `<div class="section-header"><h2>Promotional Offers</h2><p>Manage discount codes and campaigns</p></div><div class="stats-grid"><div class="stat-card"><div class="stat-icon" style="background: #667eea;"><i class="fas fa-tags"></i></div><div class="stat-content"><div class="stat-label">Active Offers</div><div class="stat-value">8</div></div></div></div><div class="card mt-20"><button class="btn btn-primary"><i class="fas fa-plus"></i> Create Offer</button></div>`;
}

function createSystemConfigContent() {
    return `<div class="section-header"><h2>System Configuration</h2><p>Manage app settings</p></div><div class="card"><h3>Feature Toggles</h3><div class="form-group"><label class="flex"><label class="switch"><input type="checkbox" checked><span class="slider"></span></label><span>Enable New Bookings</span></label></div><div class="form-group"><label class="flex"><label class="switch"><input type="checkbox" checked><span class="slider"></span></label><span>Enable Surge Pricing</span></label></div><button class="btn btn-primary">Save Configuration</button></div>`;
}

function createAuditLogsContent() {
    return `<div class="section-header"><h2>Audit Logs</h2><p>Track all admin actions</p></div><div class="card"><h3>Activity Logs</h3><table class="data-table"><thead><tr><th>Timestamp</th><th>Admin</th><th>Action</th><th>Details</th></tr></thead><tbody id="auditLogsList"><tr><td>Loading...</td><td>-</td><td>-</td><td>-</td></tr></tbody></table></div>`;
}

// Initialize Safety & Management Features
function initializeSafetyFeatures(sectionId) {
    if (sectionId === 'audit-logs') {
        setTimeout(loadAuditLogs, 100);
    }
}

function loadAuditLogs() {
    const logs = JSON.parse(localStorage.getItem('adminAuditLogs') || '[]');
    const tbody = document.getElementById('auditLogsList');
    if (tbody && logs.length > 0) {
        tbody.innerHTML = logs.slice(0, 50).map(log => `
            <tr>
                <td>${new Date(log.timestamp).toLocaleString()}</td>
                <td>${log.admin}</td>
                <td><span class="status-badge status-active">${log.action}</span></td>
                <td>${log.details}</td>
            </tr>
        `).join('');
    }
}

