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

    if (!drivers.length) {
        const fallback = getDemoData('Drivers');
        if (Array.isArray(fallback)) {
            drivers = fallback.map((driver) => ({
                ...driver,
                id: driver.id || ('demo_driver_' + Math.floor(Math.random() * 100000)),
                phone: driver.phone || '',
                approvalStatus: driver.status === 'blocked' ? 'rejected' : 'approved'
            }));
        }
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
    return `<div class="section-header"><h2>Promotional Offers</h2><p>Manage discount codes and campaigns</p></div><div class="stats-grid"><div class="stat-card"><div class="stat-icon" style="background: #667eea;"><i class="fas fa-tags"></i></div><div class="stat-content"><div class="stat-label">Active Offers</div><div class="stat-value">8</div></div></div></div><div class="card mt-20"><button class="btn btn-primary"><i class="fas fa-plus"></i> Create Offer</button></div>`;
}

function createSystemConfigContent() {
    return `<div class="section-header"><h2>System Configuration</h2><p>Manage app settings</p></div><div class="card"><h3>Feature Toggles</h3><div class="form-group"><label class="flex"><label class="switch"><input type="checkbox" checked><span class="slider"></span></label><span>Enable New Bookings</span></label></div><div class="form-group"><label class="flex"><label class="switch"><input type="checkbox" checked><span class="slider"></span></label><span>Enable Surge Pricing</span></label></div><button class="btn btn-primary">Save Configuration</button></div>`;
}

function createAuditLogsContent() {
    return `<div class="section-header"><h2>Audit Logs</h2><p>Track all admin actions</p></div><div class="card"><h3>Activity Logs</h3><table class="data-table"><thead><tr><th>Timestamp</th><th>Admin</th><th>Action</th><th>Details</th></tr></thead><tbody id="auditLogsList"><tr><td>Loading...</td><td>-</td><td>-</td><td>-</td></tr></tbody></table></div>`;
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
